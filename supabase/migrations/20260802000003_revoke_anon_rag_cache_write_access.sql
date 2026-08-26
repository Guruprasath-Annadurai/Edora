-- set_rag_cache lets an anon caller write arbitrary content into the shared
-- RAG response cache keyed by cache_key — cache poisoning against every
-- student who later hits that key. purge_rag_cache is a trivial DoS-cost
-- surface for the same reason (unauthenticated repeated calls). Neither
-- needs anon access; the app always calls these from an authenticated
-- session or a service-role edge function.
REVOKE EXECUTE ON FUNCTION public.set_rag_cache(text, text, text, uuid[], text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.purge_rag_cache() FROM anon;
