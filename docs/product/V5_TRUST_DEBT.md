# V5 Trust Debt Register

## TD-1 — Client-supplied score is the XP authority (learner-spine integrity)
Registered at Day 1 closeout (founder decision).

`complete_quiz_session` derives XP (`p_score * 10`) and topic stats from the client-supplied `p_score` / `p_user_answers`. The RPC enforces range (0..count) and idempotency per session id, so it prevents duplicates and absurd values, but a modified client can still claim a perfect score on any quiz.

**Rule: a client-supplied score must not become the long-term trust authority for XP.**
Do NOT claim XP is tamper-proof today.

Owner / when: V5 learner-spine / practice work. Determine the smallest server-verifiable approach (e.g. server holds the answer key for server-issued sessions and scores `p_user_answers` itself, or the RPC recomputes score from stored `questions` correct-answer fields). Not expanded into an anti-cheat project.

## Carried findings (not trust debt, tracked elsewhere)
See `V5_DAY1_EVIDENCE.md` "Unresolved / blockers".
