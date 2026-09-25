# Database Schema Reference Guard Specification

**Classification:** Static Analysis & CI Pipeline Guard  
**Purpose:** Prevents client and serverless calls to non-existent database tables, functions, or unmigrated column fields (such as the F17 `score_pct` defect).  
**Source of Truth:** Checked-in migration manifest (`scripts/schema/schema-manifest.json`) generated from `supabase/migrations/*.sql`.

---

## 1. Architecture & Execution Flow

```
[supabase/migrations/*.sql]
           │
           │ (generate_schema_manifest.js --check-stale)
           ▼
[scripts/schema/schema-manifest.json] ──+── [schema-exceptions.json]
                                        │
                                        ▼
                       [check_schema_references.js]
                                        │
                                        ▼
                  Scans client source (`src/`) & functions
                                        │
                     ┌──────────────────┴──────────────────┐
                     ▼                                     ▼
             Missing Table/Column                  Unverified RPC
               (Fatal Error: 1)                  (Documented Warning: 0)
```

---

## 2. Regression Cases Enforced by CI

* **CASE 1 (Missing Column):** Code references `score_pct` on `quiz_sessions`, but migrations do NOT yet define it $\implies$ **FAIL (Fatal CI Error)**.
* **CASE 2 (Migrated Column):** Migration adds `score_pct` to `quiz_sessions` $\implies$ Manifest records `score_pct` $\implies$ **PASS**.
* **CASE 3 (Nonexistent Table):** Code references `.from('nonexistent_table')` $\implies$ **FAIL (Fatal CI Error)**.
* **CASE 4 (Unverified RPC):** Code references `.rpc('unverified_rpc')` $\implies$ **Documented Schema Warning (Non-Fatal)**.

---

## 3. Real Limitations & Scope Boundaries

1. **Static AST-Lite Pattern Extraction:** The guard scans string literals in `.from('table_name')`, `.rpc('function_name')`, and explicit column property assignments. Dynamic variable tables (e.g. `.from(someVariable)`) cannot be statically resolved without runtime evaluation.
2. **Column Validation Scope:** The guard enforces exact column existence on targeted mutation tables (such as `quiz_sessions`). Arbitrary deep TypeScript type inference on multi-table polymorphic joins is not evaluated.
3. **Documented Exceptions Registry:** Legacy tables awaiting V5 product cleanup (`user_moods`, `xp_history`, `quiz_user_answers`) are explicitly registered with rationale in `scripts/schema/schema-exceptions.json`.
