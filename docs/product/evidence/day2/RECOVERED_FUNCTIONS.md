# Recovered edge-function sources (V5 Day 2, finding F13)

Six functions were deployed to production (`mlkzabspcwfockbmkmzl`) with no source in git. Their entrypoint source was
read from production with the Supabase MCP `get_edge_function` (read-only) and written to the repo **verbatim**:

| Function | Deployed version | verify_jwt | Bundle sha256 (ezbr) | Repo path |
|---|---|---|---|---|
| question-explain | v5 | false | 59e7d112eba530b9f14cd7e28af2542a22c2985a5d4e9c00720594607a5dbd16 | supabase/functions/question-explain/index.ts |
| mistake-clustering | v7 | true | 73524d281b937f9012ad0ecb283ff667befca712ca5ee9d50205b614142661dd | supabase/functions/mistake-clustering/index.ts |
| mock-paper-composer | v6 | false | db0c8247faa464c3b12eae3943914410eb048d3de195e21aeae591eab49b8732 | supabase/functions/mock-paper-composer/index.ts |
| nova-insights | v26 | false | 52f9282d6d2e1993b5674aa20457526d431298cf5eb7af2dd024a34004adaf7b | supabase/functions/nova-insights/index.ts |
| pyq-bulk-ingest | v5 | false | 2ae0ec9ecc06f253cd63ac063d0ed7f103b5ffdb4a954ede39aaf0ccd77f346e | supabase/functions/pyq-bulk-ingest/index.ts |
| pyq-embed-ingest | v5 | false | cce6d7527fcda66a2f4e5bfed16653d3151961d19d1290bcb781520077f9627b | supabase/functions/pyq-embed-ingest/index.ts |

Only each function's own `index.ts` is committed. The deployed bundles also contained older copies of `_shared/*`
(cors, sentry, rateLimit, cronHealth); the repo's current `_shared` versions are the maintained ones and were not replaced.

## Verification status (honest)
- Contents were transcribed exactly from the MCP output. **NOT independently byte-verified**: the platform exposes only an
  eszip-bundle hash (`ezbr_sha256`), which cannot be recomputed from the source file, so a bit-for-bit hash comparison is not
  possible with the tools available. A later `supabase functions download <fn>` diff would close this.
- An attempt to run `deno check` on the six files in the same command as other read-only checks was blocked by the session's
  auto-mode permission classifier; it was not retried. Type-checking of these six is therefore **NOT VERIFIED** yet.

## Findings from reading them (not fixed in Day 2 — recovery only)
1. **Dead model:** `question-explain`, `mistake-clustering`, `mock-paper-composer` and `nova-insights` call `gemini-1.5-flash`
   (decommissioned) — their Gemini fallback path cannot work. Their primary path is NVIDIA Nemotron (question-explain,
   mistake-clustering, mock-paper-composer). `nova-insights` calls Gemini only.
2. **`nova-insights` has effectively no authentication.** `verify_jwt=false` and the handler only checks that the
   `Authorization` header *starts with* `Bearer `; any string passes. It then uses the service role to read every active
   user's data and call Gemini for up to 200 users (cost + optional FCM push). Needs a real secret/JWT check.
3. None of the six route AI calls through `callAI()` (no kill switch / cost ceiling / `ai_gateway_requests` logging).
4. `pyq-bulk-ingest` / `pyq-embed-ingest` comments record that the original `pyq-ingest` function was overwritten earlier and is
   unrecoverable; do not deploy under that slug.
5. `pyq-embed-ingest` writes `pyq_content.embedding` / `content_hash` (Day 3 schema-truth to confirm those columns exist).
