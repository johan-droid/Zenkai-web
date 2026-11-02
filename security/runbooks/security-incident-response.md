# Security Incident Response Runbook

This operational runbook provides step-by-step procedures for detecting, triaging, containing, mitigating, and recovering from security incidents affecting the Zenkai web application and its deployment infrastructure.

---

## 1. Incident Severity Classification Matrix

| Level | Classification | Impact Definition | Response Target | Incident Lead |
|---|---|---|---|---|
| **SEV-1** | **Critical** | Active database breach, secret compromise in public domain, wide-scale authentication bypass, complete service unavailability. | < 15 minutes | Lead Security Engineer & Core Architect |
| **SEV-2** | **High** | Rate-limit circumvention causing provider throttling, localized data access anomaly, SSRF attempt bypassing filters, broken authentication in one flow. | < 1 hour | Senior AppSec Engineer |
| **SEV-3** | **Medium** | Upstream provider quarantine storm, degraded playback resolution, unauthenticated abuse of public discovery routes, CSP violation surge. | < 4 hours | Backend On-Call Engineer |
| **SEV-4** | **Low** | Non-exploitable informational disclosure, minor dependency vulnerability without known active exploit, malformed client payload errors. | Next Business Day | Developer Team |

---

## 2. Emergency Contacts & Escalation Roster

- **Security Operations**: `security@zenkai.io`
- **Infrastructure Lead**: Core DevOps / Platform Engineer
- **Deployment Platform**: Vercel Incident Response Console (`vercel.com/help`)
- **Database Provider**: Neon / Supabase Support Console

---

## 3. Incident Playbooks

### Playbook A: Credential / Secret Exposure
*Trigger*: Secret detected in public commits, client logs, error reporting tools, or third-party reports.

1. **Identification & Scoping**:
   - Identify the leaked credential type: `SESSION_SECRET`, `SETTINGS_ENCRYPTION_PASSPHRASE`, `DATABASE_URL`, or provider tokens.
   - Determine whether the secret was published to Git history or only in temporary deployment logs.
2. **Immediate Containment**:
   - In **Vercel Dashboard > Project Settings > Environment Variables**:
     - Generate a new replacement secret:
       ```bash
       openssl rand -base64 48
       ```
     - Save the new value and trigger an immediate redeploy (`vercel --prod`).
3. **Database Credentials Rotation** (if `DATABASE_URL` was exposed):
   - Access the PostgreSQL host (Neon / Supabase / AWS RDS).
   - Create a new database user role with identical permissions.
   - Update `DATABASE_URL` in Vercel to use the new user.
   - Verify application connectivity via `curl -I https://api.zenkai.io/health`.
   - Revoke and drop the compromised database role.
4. **Session Invalidation** (if `SESSION_SECRET` was exposed):
   - Execute session invalidation query on database:
     ```sql
     DELETE FROM user_sessions WHERE expires_at > NOW();
     ```
   - All active user sessions will be logged out safely and forced to re-authenticate.
5. **Git History Scrubbing** (if committed to Git):
   - Use `git-filter-repo` or BFG Repo-Cleaner to expunge the secret from repository history:
     ```bash
     git filter-repo --invert-paths --path <file-containing-secret>
     ```
   - Force push cleaned branches to GitHub and notify all developers to re-clone.

---

### Playbook B: Volumetric Abuse / Rate Limit Bypass / DDoS
*Trigger*: Surge in HTTP 429 errors, spike in serverless invocation costs, or elevated response latencies.

1. **Traffic Analysis**:
   - Inspect Vercel Edge logs or server logs for originating IP subnets, User-Agent patterns, or target endpoints.
   - Check if traffic is concentrated on expensive routes:
     - `/api/v1/proxy` (Image/chapter proxying)
     - `/api/v1/playback/sources` (Provider resolving)
     - `/api/v1/auth/register` (Credential stuffing / bot spam)
2. **Immediate Edge Mitigation**:
   - In **Vercel Dashboard > Security > Attack Mode / Firewall**:
     - Enable **Vercel Attack Mode** (challenges suspicious L7 traffic with Turnstile).
     - Add Custom Firewall Rule blocking malicious IP ranges or User-Agent headers.
3. **Application-Level Throttle Adjustments**:
   - If abuse targets `/api/v1/proxy`, temporarily lower rate limit window:
     - Set `RATE_LIMIT_MAX=30` in Vercel environment variables and redeploy.
4. **Upstream Circuit Protection**:
   - Verify `healthRegistry` has quarantined degraded providers to protect downstream database workers.

---

### Playbook C: Upstream Provider Outage or Malicious Redirect
*Trigger*: Streaming or manga providers returning HTTP 403/502/503 or redirecting to malicious advertisement domains.

1. **Diagnosis**:
   - Query `/api/v1/providers/health` to identify which upstream sources are degraded.
   - Check quarantine status in logs.
2. **Provider Isolation**:
   - If a provider is serving compromised or deceptive streaming manifests:
     - In `backend/src/providers/streaming/registry.ts`, comment out or disable the offending provider adapter.
     - Trigger quick deployment.
3. **Cache Flush**:
   - Flush Upstash Redis cached provider payloads for the affected media IDs.
4. **Reader Fallback Verification**:
   - Ensure `zenkaiShield` falls back to secondary mirrors (e.g. WeebCentral -> ComicK, NovelFire -> NovelFull).

---

### Playbook D: Deserialization / Database Connection Pool Exhaustion
*Trigger*: Elevated 500/503 errors with `sorry, too many clients already` or `wrong final block length`.

1. **Decryption Error Check**:
   - Check logs for settings decryption errors. If corrupted legacy records are encountered:
     - Verify `backend/src/lib/encryption.ts` uses direct buffer decryption (`decipher.update(ciphertext, undefined, "utf8")`).
     - Corrupted legacy rows automatically return `{}` without crashing sessions.
2. **Database Pool Saturation**:
   - Inspect active connections on PostgreSQL:
     ```sql
     SELECT count(*), state FROM pg_stat_activity GROUP BY state;
     ```
   - If idle connections exceed limits:
     - Switch `DATABASE_URL` in Vercel to pooled endpoint (port 6543 on Supabase / Neon pooled host with `?pgbouncer=true`).
     - Terminate hung connections:
       ```sql
       SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle in transaction' AND state_change < NOW() - INTERVAL '5 minutes';
       ```

---

## 4. Post-Incident Review & Root Cause Analysis (RCA)

Within 48 hours of resolving any SEV-1 or SEV-2 incident, the Incident Lead must facilitate a blameless post-mortem covering:

1. **Incident Timeline**: Precise timestamps of detection, escalation, containment, and recovery.
2. **Root Cause Analysis**: The underlying vulnerability, missing control, or configuration defect.
3. **Detection Gaps**: Why existing automated alerts or health probes did not catch the issue earlier.
4. **Corrective Action Items**: Specific code, infrastructure, or process fixes assigned with due dates.
5. **Report Archival**: Store completed RCA document in `security/reports/incidents/YYYY-MM-DD-<incident-slug>.md`.
