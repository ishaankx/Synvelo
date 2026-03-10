import json
from pathlib import Path
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.config import settings

client = AsyncOpenAI(api_key=settings.openai_api_key)

CHUNK_SIZE = 400
CHUNK_OVERLAP = 80


def chunk_text(content: str) -> list[str]:
    words = content.split()
    chunks, i = [], 0
    while i < len(words):
        chunk = " ".join(words[i:i + CHUNK_SIZE])
        if chunk.strip():
            chunks.append(chunk)
        i += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


async def embed_texts(texts: list[str]) -> list[list[float]]:
    embeddings = []
    for i in range(0, len(texts), 20):
        batch = texts[i:i + 20]
        response = await client.embeddings.create(
            model="text-embedding-3-small",
            input=[t[:8000] for t in batch]
        )
        embeddings.extend([d.embedding for d in response.data])
    return embeddings


async def embed_single(text: str) -> list[float]:
    """Single-text embedding wrapper used by rag.py"""
    results = await embed_texts([text])
    return results[0]


async def analyze_sentiment(content: str) -> tuple[float, str]:
    """Returns (score -1.0..1.0, label: positive|neutral|negative)"""
    try:
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Analyze buyer sentiment in this B2B sales document. "
                        "Return ONLY valid JSON, no other text: "
                        '{"score": <float -1.0 to 1.0>, "label": "positive|neutral|negative"}'
                    )
                },
                {"role": "user", "content": content[:3000]}
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=60
        )
        r = json.loads(resp.choices[0].message.content)
        return float(r.get("score", 0.0)), r.get("label", "neutral")
    except Exception:
        return 0.0, "neutral"


def extract_text_from_pdf(file_path: str) -> str:
    import fitz
    doc = fitz.open(file_path)
    text = "".join(page.get_text() for page in doc)
    doc.close()
    return text


async def transcribe_audio(file_path: str) -> str:
    with open(file_path, "rb") as f:
        response = await client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            response_format="text"
        )
    return response


async def ingest_file(
    file_path: str,
    filename: str,
    source_type: str,
    deal_id: str,
    document_id: str,
    db: AsyncSession,
) -> int:
    # 1. Extract text
    if source_type in ("audio", "video"):
        raw_text = await transcribe_audio(file_path)
    elif source_type == "pdf":
        raw_text = extract_text_from_pdf(file_path)
    else:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            raw_text = f.read()

    if not raw_text.strip():
        return 0

    # 2. Sentiment
    sentiment_score, sentiment_label = await analyze_sentiment(raw_text)

    # 3. Save content + sentiment to document
    await db.execute(text("""
        UPDATE documents
        SET content         = :content,
            sentiment_score = :score,
            sentiment_label = :label,
            status          = 'processing'
        WHERE id = CAST(:doc_id AS uuid)
    """), {
        "content": raw_text[:50000],
        "score":   sentiment_score,
        "label":   sentiment_label,
        "doc_id":  document_id,
    })

    # 4. Chunk & embed
    chunks = chunk_text(raw_text)
    if not chunks:
        return 0

    embeddings = await embed_texts(chunks)

    for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        emb_str = "[" + ",".join(str(x) for x in embedding) + "]"
        await db.execute(text("""
            INSERT INTO chunks
                (id, deal_id, document_id, text, source_type, filename, chunk_index, embedding)
            VALUES (
                gen_random_uuid(),
                CAST(:deal_id AS uuid),
                CAST(:doc_id  AS uuid),
                :text, :source_type, :filename, :idx,
                CAST(:embedding AS vector)
            )
        """), {
            "deal_id":     deal_id,
            "doc_id":      document_id,
            "text":        chunk,
            "source_type": source_type,
            "filename":    filename,
            "idx":         idx,
            "embedding":   emb_str,
        })

    # 5. Mark document done
    await db.execute(text("""
        UPDATE documents SET status = 'done' WHERE id = CAST(:doc_id AS uuid)
    """), {"doc_id": document_id})

    # 6. Append sentiment point to score_history if deal already scored
    existing = await db.execute(text("""
        SELECT win_probability, probability_low, probability_high
        FROM deals WHERE id = CAST(:id AS uuid)
    """), {"id": deal_id})
    row = existing.fetchone()
    if row and row.win_probability is not None:
        await db.execute(text("""
            INSERT INTO score_history
                (deal_id, win_probability, probability_low, probability_high,
                 sentiment_avg, trigger_type, trigger_document)
            VALUES
                (CAST(:id AS uuid), :prob, :low, :high, :sent,
                 'document_ingested', :doc)
        """), {
            "id":   deal_id,
            "prob": row.win_probability,
            "low":  row.probability_low,
            "high": row.probability_high,
            "sent": sentiment_score,
            "doc":  filename,
        })

    await db.commit()
    return len(chunks)