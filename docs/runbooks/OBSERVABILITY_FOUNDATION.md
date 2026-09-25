# Zero-Budget Observability Foundation Runbook

**Classification:** Operational Runbook  
**Applies to:** Edora Production & Staging Telemetry  
**Budget Cost:** ₹0 / $0 (Uses Native Postgres Views, Free-tier Sentry, Free-tier PostHog, Google Play Console)  

---

## 1. Zero-Cost Observability Stack Architecture

```
  [Client Layer]                     [Edge & Database Layer]
  • PostHog Free Tier (Events/DAU)    • Supabase Edge Function Metrics
  • Sentry Free Tier (JS Exceptions)  • Postgres Operational Diagnostic Views
  • Google Play Vitals (ANR / Crash)  • `ai_gateway_requests` Table
```

### Constraints & Invariants
* **Zero Paid APM:** No Datadog, New Relic, Grafana Cloud, or self-hosted Prometheus/Loki instances.
* **Storage Protection:** High-volume logging is strictly prohibited from accumulating unpruned in primary transactional PostgreSQL tables.

---

## 2. In-Database Operational Views

Created via `supabase/migrations/20260925150000_infra_observability_views.sql`:

### 2.1 AI Gateway Hourly Performance (`v_ai_gateway_hourly_metrics`)
Monitors hourly request volume, latency, error percentages, token counts, and estimated cost across Groq, Claude, and Gemini tiers.
```sql
SELECT time_bucket, provider, model, total_requests, error_rate_pct, avg_latency_ms
FROM public.v_ai_gateway_hourly_metrics
LIMIT 10;
```

### 2.2 AI Provider Fallbacks (`v_ai_provider_fallback_summary`)
Identifies which providers are returning errors (e.g. rate limits, 500s) causing requests to cascade down to fallback models.
```sql
SELECT provider, model, error_prefix, occurrence_count, last_seen
FROM public.v_ai_provider_fallback_summary;
```

### 2.3 Quiz Session Persistence Health (`v_quiz_session_health`)
Specifically monitors quiz completion rates and detects missing scores or broken progress updates (F17 defense).
```sql
SELECT time_bucket, total_sessions_started, completed_sessions, null_score_completed
FROM public.v_quiz_session_health;
```

### 2.4 Database Footprint Monitor (`v_database_table_sizes`)
Tracks table and index disk consumption to ensure the database remains comfortably beneath the 500 MB free-tier storage limit.
```sql
SELECT table_name, total_size, estimated_row_count
FROM public.v_database_table_sizes
LIMIT 15;
```

---

## 3. External Free-Tier Monitoring Dashboards

1. **Sentry Dashboard:**
   - Filters: `environment:production`, `handled:no`
   - Primary alert threshold: $> 10$ unhandled exceptions per hour.
2. **PostHog Dashboard:**
   - Funnel: App Launch $\to$ Home View $\to$ Quiz/Practice Start $\to$ Answer Submit.
3. **Google Play Console Vitals:**
   - Crash rate threshold: $< 1.09\%$ (Google Play bad behavior threshold).
   - ANR rate threshold: $< 0.47\%$.
