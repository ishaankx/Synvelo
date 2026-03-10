import openai
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any
from app.services.embeddings import embed_single
from app.config import settings

client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

# ─── Retrieval ────────────────────────────────────────────

async def retrieve_chunks(
    query: str,
    db: AsyncSession,
    deal_id: str = None,
    top_k: int = 8
) -> List[Dict]:
    """Retrieve most relevant chunks for a query using cosine similarity."""
    query_embedding = await embed_single(query)
    
    # Convert embedding list to postgres vector string format
    embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

    if deal_id:
        sql = text("""
            SELECT
                id, text, source_type, filename, chunk_index,
                1 - (embedding <=> CAST(:embedding AS vector)) AS similarity
            FROM chunks
            WHERE deal_id = CAST(:deal_id AS uuid)
            ORDER BY embedding <=> CAST(:embedding AS vector)
            LIMIT :limit
        """)
        params = {"embedding": embedding_str, "deal_id": deal_id, "limit": top_k}
    else:
        sql = text("""
            SELECT
                id, text, source_type, filename, chunk_index,
                1 - (embedding <=> CAST(:embedding AS vector)) AS similarity
            FROM chunks
            ORDER BY embedding <=> CAST(:embedding AS vector)
            LIMIT :limit
        """)
        params = {"embedding": embedding_str, "limit": top_k}

    result = await db.execute(sql, params)
    rows = result.fetchall()
    return [
        {
            "id": str(row.id),
            "text": row.text,
            "source_type": row.source_type,
            "filename": row.filename,
            "chunk_index": row.chunk_index,
            "similarity": float(row.similarity)
        }
        for row in rows
    ]

# ─── Generation ───────────────────────────────────────────

async def rag_answer(
    query: str,
    db: AsyncSession,
    deal_id: str = None,
    system_context: str = ""
) -> Dict[str, Any]:
    """Full RAG: retrieve context then generate answer with evidence."""
    chunks = await retrieve_chunks(query, db, deal_id=deal_id, top_k=6)

    if not chunks:
        return {
            "answer": "No relevant documents found. Please upload deal documents first.",
            "evidence": [],
            "chunks_used": 0
        }

    # Build context from retrieved chunks
    context_parts = []
    for i, chunk in enumerate(chunks):
        context_parts.append(
            f"[Source {i+1}: {chunk['filename']} | {chunk['source_type']}]\n{chunk['text']}"
        )
    context = "\n\n---\n\n".join(context_parts)

    system_prompt = f"""You are Synvelo, an AI revenue intelligence assistant.
Answer questions about sales deals using ONLY the provided context.
Always cite which source you're drawing from.
Be specific and actionable.
{system_context}"""

    user_prompt = f"""Context from deal documents:
{context}

Question: {query}

Provide a clear, evidence-backed answer. Reference specific sources."""

    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.2
    )

    answer = response.choices[0].message.content

    return {
        "answer": answer,
        "evidence": chunks[:4],  # Top 4 as evidence
        "chunks_used": len(chunks)
    }