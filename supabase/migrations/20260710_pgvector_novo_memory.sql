-- ─────────────────────────────────────────────────────────────────────────────
-- pgvector semantic memory for Novo
-- Adds 768-dim embeddings (Gemini text-embedding-004) to novo_memories so
-- get_context can do cosine-similarity search against the current topic.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable pgvector (no-op if already enabled)
create extension if not exists vector;

-- Add embedding column (nullable — backfilled async when memories are saved)
alter table novo_memories
  add column if not exists embedding vector(768);

-- IVFFlat index for fast approximate nearest-neighbour search
-- lists = 100 is a good default for tables up to ~1M rows
create index if not exists novo_memories_embedding_idx
  on novo_memories
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ── Semantic search function ──────────────────────────────────────────────────
-- Returns the top-k memories for a user ordered by cosine similarity to a
-- query embedding.  Only returns rows where embedding IS NOT NULL.
create or replace function search_novo_memories(
  p_user_id  uuid,
  p_embedding vector(768),
  p_limit    int     default 6,
  p_min_sim  float8  default 0.65
)
returns table (
  id           uuid,
  content      text,
  memory_type  text,
  subject      text,
  topic        text,
  importance   int,
  similarity   float8
)
language sql
stable
as $$
  select
    id,
    content,
    memory_type,
    subject,
    topic,
    importance,
    1 - (embedding <=> p_embedding) as similarity
  from novo_memories
  where user_id   = p_user_id
    and embedding is not null
    and (expires_at is null or expires_at > now())
    and 1 - (embedding <=> p_embedding) >= p_min_sim
  order by embedding <=> p_embedding
  limit p_limit;
$$;
