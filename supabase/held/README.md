# supabase/held

SQL that is intentionally **not** in `supabase/migrations/` so that no
`supabase db push` / CI step can apply it. Each file states why it is held and
what must be true before it may be released.
