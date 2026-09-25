# DAY 5 + DAY 6 FINAL TRANSPORT CLOSURE REPORT

Starting SHA `45f91b1314a828eb45aba52150e8e50586398652` · final SHA: see `git log -1` · Production changes: NONE · Day 7 not started.

## Bypass closed
`useGeminiStream.streamMessage` (Novo's normal conversation) did a direct `fetch(.../functions/v1/gemini-chat)` and so skipped `guardFunctionsInvoke`. Fixed at both levels using the existing `isAiGenerationEnabled` / `AiGenerationPausedError` / `AI_PAUSED_MESSAGE` (no new flag system):
- **UI:** `ChatPage.sendMessage` returns with the calm paused reply as its first action after the empty check — before the free-limit check, user-message persistence, usage increment, prompt building, translation, retrieval or stream. The typed text stays in the composer.
- **Transport:** `streamMessage` throws `AiGenerationPausedError` before touching state or `fetch`.
`novo_enabled` semantics unchanged: with novo on and generation off the screen stays open, saved history stays visible, and no generation request is sent.

## Direct Edge Function fetch audit (`grep /functions/v1/` in src)
| Site | Function | Class | Action |
|---|---|---|---|
| `lib/useGeminiStream.ts` | gemini-chat | STREAMING SPECIAL CASE (AI generation) | fixed (transport guard + ChatPage guard) |
| `hooks/useNovoTTS.ts` | elevenlabs-tts | NON-GENERATION (speaks given text) | none |
| `hooks/useVoiceStudy.ts` | elevenlabs-tts | NON-GENERATION | none |
(`lib/gemini.ts`, `lib/iap.ts` matches are comments.) `directFunctionFetch.test.ts` fails if a new direct call appears unclassified, or a generation fetch is not preceded by the guard.

## Tests (real paths, not static)
- `ChatPage.send.test.tsx` (real ChatPage, typed message + Enter): flag off -> `streamMessage` 0 calls, `fetch` 0 calls, no gemini-chat/vision/proactive invoke, calm paused reply shown, daily AI usage key not written, user turn not added to the thread, text kept in composer; flag on -> streams and counts exactly one use. Verified to FAIL with the guard removed.
- `useGeminiStream.test.tsx`: disabled -> `AiGenerationPausedError`, 0 fetches, no streaming state; enabled -> normal SSE fetch to `/functions/v1/gemini-chat`.
- Kept and passing: Flashcards, quiz-intent/snap-solve wiring, invoke-guard tests.

## Onboarding cutoff
Unchanged. **`2026-09-27T00:00:00Z` is PROVISIONAL**: it MUST be reconciled with the actual V5 rollout date before the Day-17 release freeze and must never be later than the first V5 production availability (noted in code and here).

## Gates
type-check pass · lint 0 errors (7 old warnings) · `npm test` 41 files / 307 tests pass (was 38 / 299) · build OK · schema guard PASSED · targeted flag tests 5 files / 15 tests pass.
