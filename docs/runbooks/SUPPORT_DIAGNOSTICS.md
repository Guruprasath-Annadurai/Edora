# Support Diagnostic Foundation & Opaque Identifier Specification

**Classification:** Security Architecture & Support Tooling  
**Applies to:** Customer Support, Incident Diagnostics, and Error Reporting  
**Status:** Identifier Ready; Diagnostic Stored Procedure DEFERRED TO V5.1  

---

## 1. Opaque Support Identifier Design

To prevent raw database UUIDs (`profiles.id`) from leaking into customer support tickets, email threads, chat logs, or user screenshots:

### Mathematical Derivation:
$$\text{Opaque Hash} = \text{HMAC-SHA256}(\text{user\_id},\; \text{SUPPORT\_HMAC\_KEY})$$

* The 256-bit HMAC digest is truncated to 64 bits (16 hexadecimal characters).
* Formatted in 4 blocks of 4 alphanumeric characters:
  $$\mathbf{ED-XXXX-XXXX-XXXX-XXXX}$$
* **Non-Enumerable & Non-Reversible:** External actors cannot derive the user's UUID, email, or profile from the support token without knowledge of `SUPPORT_HMAC_KEY`.
* Implemented in: `scripts/infra/support_identifier.js`.

---

## 2. Deferred Stored Procedure Blueprint: `get_support_diagnostics()`

> [!WARNING]
> **DEPLOYMENT STATUS: DEFERRED TO V5.1**  
> Per pre-flight security audit, staff role authorization infrastructure (`user_roles`, `is_staff()` checks) is undergoing comprehensive review and consolidation during V5. Deploying a `SECURITY DEFINER` diagnostic function before RBAC hardening is complete presents privilege escalation risks.

### V5.1 Implementation Requirements:
When deployed in V5.1, the diagnostic routine must adhere to the following contract:

1. **Security & Context:**
   - Explicit `SECURITY DEFINER` with fixed `SET search_path = public, pg_temp;`.
   - Strictly verifies caller has `staff` or `admin` role via trustworthy session claims:
     ```sql
     IF NOT (SELECT EXISTS (
       SELECT 1 FROM public.user_roles 
       WHERE user_id = auth.uid() AND role IN ('staff', 'admin')
     )) THEN
       RAISE EXCEPTION 'Access denied: insufficient support diagnostic privileges.';
     END IF;
     ```
2. **Audit Logging:**
   - Every lookup must write an immutable record to `admin_action_audit` recording `staff_user_id`, `target_opaque_id`, timestamp, and query reason.
3. **Data Minimization:**
   - Returns ONLY:
     - Profile creation date
     - Active grade and target exam
     - Last 5 quiz completion timestamps (status and score only)
     - Device OS and app version
   - Strictly EXCLUDES:
     - Full payment / credit card metadata
     - Raw chat conversation histories
     - Raw passwords or auth tokens
