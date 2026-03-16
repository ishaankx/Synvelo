import json
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.config import settings
from app.services.rag import retrieve_chunks

client = AsyncOpenAI(api_key=settings.openai_api_key)


async def generate_brief(deal_id: str, db: AsyncSession) -> dict:
    deal_res = await db.execute(text("""
        SELECT name, company, stage, value, owner,
               win_probability, probability_low, probability_high,
               time_to_close_days, score_summary, risk_flags, signals, meddic
        FROM deals WHERE id = CAST(:id AS uuid)
    """), {"id": deal_id})
    deal = deal_res.fetchone()
    if not deal:
        return {"error": "Deal not found"}

    chunks = await retrieve_chunks(
        "status contacts decisions timeline next steps last interaction",
        db,
        deal_id=deal_id,
        top_k=10,
    )
    context = "\n\n---\n\n".join([f"[{c['filename']}]\n{c['text']}" for c in chunks])

    risk_flags = deal.risk_flags or []
    if isinstance(risk_flags, str):
        try:
            risk_flags = json.loads(risk_flags)
        except Exception:
            risk_flags = []

    deal_info = (
        f"Deal: {deal.name} | Company: {deal.company}\n"
        f"Stage: {deal.stage} | Value: ${(deal.value or 0):,.0f} | Owner: {deal.owner}\n"
        f"Win Probability: {round((deal.win_probability or 0)*100)}% "
        f"(CI: {round((deal.probability_low or 0)*100)}%–{round((deal.probability_high or 0)*100)}%)\n"
        f"Days to Close: {deal.time_to_close_days or 'Unknown'}\n"
        f"AI Summary: {deal.score_summary or 'Not yet scored'}\n"
        f"Known Risks: {json.dumps(risk_flags[:3])}"
    )

    prompt = f"""{deal_info}

Document excerpts:
{context}

Generate a concise executive deal brief as JSON. No other text.
{{
  "deal_status":               "<one sentence on where this deal stands right now>",
  "key_contacts":              [{{"name": "<n>", "role": "<title>", "authority": "<decision maker|champion|influencer|unknown>"}}],
  "last_interaction_summary":  "<most recent documented interaction summary>",
  "win_probability_assessment":"<brief interpretation of the score and why>",
  "top_3_risks": [
    {{"risk": "<specific>", "severity": "<high|medium|low>", "mitigation": "<recommended action>"}}
  ],
  "next_best_action": "<single most important thing to do right now>",
  "deal_velocity":    "<fast|slow|stalled and brief explanation>",
  "executive_summary":"<3-4 sentence summary a CRO reads in a pipeline review>"
}}"""

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.2,
        max_tokens=2000,
    )

    brief_data = json.loads(response.choices[0].message.content)

    await db.execute(text("""
        UPDATE deals SET brief = :brief, brief_generated_at = NOW()
        WHERE id = CAST(:id AS uuid)
    """), {"brief": json.dumps(brief_data), "id": deal_id})
    await db.commit()

    return brief_data


async def generate_followup(deal_id: str, db: AsyncSession) -> dict:
    deal_res = await db.execute(text("""
        SELECT name, company, stage, value, win_probability, score_summary
        FROM deals WHERE id = CAST(:id AS uuid)
    """), {"id": deal_id})
    deal = deal_res.fetchone()
    if not deal:
        return {"error": "Deal not found"}

    chunks = await retrieve_chunks(
        "most recent interaction follow up action items next steps commitments",
        db,
        deal_id=deal_id,
        top_k=8,
    )

    pulse_res = await db.execute(text("""
        SELECT query, raw_answer FROM pulse_actions
        WHERE deal_id = CAST(:id AS uuid) AND status = 'pending'
        ORDER BY created_at DESC LIMIT 2
    """), {"id": deal_id})
    pending = pulse_res.fetchall()

    context   = "\n\n---\n\n".join([f"[{c['filename']}]\n{c['text']}" for c in chunks])
    pulse_ctx = ""
    if pending:
        pulse_ctx = "\n\nPending ERP/Inventory Proposals:\n" + "\n".join([
            f"- {p.query}: {p.raw_answer or ''}" for p in pending
        ])

    prompt = f"""You are a senior B2B sales rep. Write a professional follow-up email after the most recent interaction.

Deal: {deal.name} at {deal.company} | Stage: {deal.stage} | Value: ${(deal.value or 0):,.0f}
Recent document content: {context[:3000]}
{pulse_ctx}

Return JSON only — no other text:
{{
  "subject": "<email subject line>",
  "body":    "<full professional email body. Reference specific things discussed. Include ERP/inventory data if proposals exist. Sign off as the AE.>",
  "key_points_referenced": ["<specific item from documents>"],
  "tone": "<consultative|urgent|relationship-building>"
}}"""

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.3,
        max_tokens=1500,
    )
    return json.loads(response.choices[0].message.content)
