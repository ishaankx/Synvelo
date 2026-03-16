import json
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.config import settings
from app.services.rag import retrieve_chunks

client = AsyncOpenAI(api_key=settings.openai_api_key)

SYSTEM_PROMPT = """You are an expert B2B enterprise sales analyst with 20+ years experience.
Analyze the provided deal documents and return ONLY valid JSON — no markdown, no other text.

{
  "win_probability": <float 0.0–1.0>,
  "probability_low": <float, lower bound of 80% CI>,
  "probability_high": <float, upper bound of 80% CI>,
  "time_to_close_days": <integer>,
  "score_summary": "<2-3 sentence CRO-level assessment>",
  "top_reasons": [
    {
      "excerpt":     "<exact verbatim quote from the document>",
      "source_type": "<pdf|audio|email|text>",
      "filename":    "<exact filename>",
      "impact":      <float -0.3 to +0.3>,
      "type":        "<positive|negative>"
    }
  ],
  "risk_flags": ["<specific, non-generic risk statement>"],
  "recommended_actions": ["<specific actionable next step>"],
  "signals": [
    {
      "type":     "<competitor_mentioned|budget_concern|timeline_risk|multi_stakeholder|champion_identified|urgency_signal|technical_fit|negotiation_opening>",
      "severity": "<high|medium|low>",
      "label":    "<human-readable label e.g. 'Competitor: Salesforce'>",
      "excerpt":  "<exact quote that triggered this signal>",
      "filename": "<source filename>",
      "color":    "<red|yellow|green>"
    }
  ],
  "meddic": {
    "metrics":           {"value": "<string or null>", "confidence": <0.0–1.0>, "excerpt": "<quote or null>"},
    "economic_buyer":    {"value": "<string or null>", "confidence": <0.0–1.0>, "excerpt": "<quote or null>"},
    "decision_criteria": {"value": "<string or null>", "confidence": <0.0–1.0>, "excerpt": "<quote or null>"},
    "decision_process":  {"value": "<string or null>", "confidence": <0.0–1.0>, "excerpt": "<quote or null>"},
    "identify_pain":     {"value": "<string or null>", "confidence": <0.0–1.0>, "excerpt": "<quote or null>"},
    "champion":          {"value": "<string or null>", "confidence": <0.0–1.0>, "excerpt": "<quote or null>"}
  }
}

Rules:
- Only reference content present in the supplied documents
- top_reasons: 3-5 quotes, mix positive and negative
- signals: only include when clear evidence exists in the text
- meddic: set confidence=0 and value=null if not found
- risk_flags: specific, not generic ("Legal review takes 2 weeks" not "timeline risk")
- recommended_actions: concrete and actionable"""


async def score_deal(deal_id: str, db: AsyncSession) -> dict:
    chunks = await retrieve_chunks(
        "deal status buyer concerns objections budget timeline decision process champion stakeholders",
        db,
        deal_id=deal_id,
        top_k=15,
    )
    if not chunks:
        return {"error": "No documents found for this deal. Upload documents first."}

    context = "\n\n---\n\n".join([
        f"[Source: {c['filename']} | Type: {c['source_type']}]\n{c['text']}"
        for c in chunks
    ])

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": f"Documents to analyze:\n\n{context}"},
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
        max_tokens=4000,
    )

    result = json.loads(response.choices[0].message.content)

    # Average sentiment across all documents for this deal
    sent_row = await db.execute(text("""
        SELECT AVG(sentiment_score)
        FROM documents
        WHERE deal_id = CAST(:id AS uuid) AND sentiment_score IS NOT NULL
    """), {"id": deal_id})
    sentiment_avg = sent_row.scalar()

    # Persist to deals table
    await db.execute(text("""
        UPDATE deals SET
            win_probability    = :prob,
            probability_low    = :low,
            probability_high   = :high,
            time_to_close_days = :ttc,
            score_summary      = :summary,
            risk_flags         = CAST(:risks    AS jsonb),
            signals            = CAST(:signals  AS jsonb),
            meddic             = CAST(:meddic   AS jsonb),
            last_scored_at     = NOW()
        WHERE id = CAST(:id AS uuid)
    """), {
        "prob":    result.get("win_probability"),
        "low":     result.get("probability_low"),
        "high":    result.get("probability_high"),
        "ttc":     result.get("time_to_close_days"),
        "summary": result.get("score_summary"),
        "risks":   json.dumps(result.get("risk_flags", [])),
        "signals": json.dumps(result.get("signals", [])),
        "meddic":  json.dumps(result.get("meddic", {})),
        "id":      deal_id,
    })

    # Append to score_history
    await db.execute(text("""
        INSERT INTO score_history
            (id, deal_id, win_probability, probability_low, probability_high,
             sentiment_avg, trigger_type, scored_at)
        VALUES
            (gen_random_uuid(), CAST(:id AS uuid), :prob, :low, :high, :sent, 'manual_score', NOW())
    """), {
        "id":   deal_id,
        "prob": result.get("win_probability"),
        "low":  result.get("probability_low"),
        "high": result.get("probability_high"),
        "sent": sentiment_avg,
    })

    await db.commit()
    return result
