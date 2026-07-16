-- Original pyq-ingest function calls upsert(..., {onConflict:'content_hash'}),
-- which requires a unique constraint on that column to work at all. It never
-- existed -- this function would have errored on every real ingest attempt.
-- Restoring the original function's intended behavior.
alter table pyq_content add constraint pyq_content_content_hash_key unique (content_hash);
