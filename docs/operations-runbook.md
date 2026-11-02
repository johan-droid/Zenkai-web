# Zenkai Extraction & Provider Operations Runbook

## 1. Incident Response & Troubleshooting Workflows

This runbook guides on-call engineers through diagnosing, mitigating, and recovering from upstream provider disruptions, rate limits, schema changes, and cache synchronization failures.

---

## 2. Standard Diagnostics Checklist

When an alert fires or users report missing chapters:
1. **Check Provider Health Dashboard**:
   ```bash
   curl -s http://localhost:4000/api/v1/providers | jq .
   ```
2. **Inspect Shield Token State**:
   ```bash
   # Check if shield challenge/verify is functioning
   curl -s https://zenkaii.pages.dev/api/shield/challenge | jq .
   ```
3. **Verify Proxy Logs for Blocked Media**:
   ```bash
   tail -n 100 logs/dev-server.log | grep -E "proxy|upstream_error|SHIELD"
   ```

---

## 3. High-Priority Playbooks

### Playbook A: Upstream Shield Token Invalidation (`SHIELD_VERIFICATION_REQUIRED`)
- **Symptoms**: Manga or novel endpoints return HTTP 502 or empty lists; logs display `SHIELD_VERIFICATION_REQUIRED`.
- **Root Cause**: The cached `x-zenkai-shield` token expired, or Cloudflare rotated challenge keys.
- **Remediation Steps**:
  1. Trigger manual token refresh:
     ```bash
     npm run dev -- --refresh-shield
     ```
     Or restart backend service:
     ```bash
     cd backend && npm restart
     ```
  2. Verify edge connectivity:
     ```bash
     TOKEN=$(node -e '...solvePoW...')
     curl -H "x-zenkai-shield: $TOKEN" "https://zenkaii.pages.dev/api/novel/home?source=lnori"
     ```

---

### Playbook B: Upstream Provider Quarantined / Rate-Limited (HTTP 429)
- **Symptoms**: Specific provider (e.g. `weebcentral` or `mangadex`) shows `quarantined: true` in health stats.
- **Root Cause**: Provider exceeded published rate limits or Cloudflare rate limiting kicked in.
- **Remediation Steps**:
  1. Inspect the health registry:
     ```bash
     curl -s http://localhost:4000/api/v1/providers/health | jq .
     ```
  2. The system automatically switches to secondary providers (`mangadex` falls back to `weebcentral`, `novelfire` falls back to `lnori` / `novelfull`).
  3. Increase request backoff in `backend/.env`:
     ```env
     PROVIDER_HTTP_TIMEOUT_MS=10000
     PROVIDER_RATE_LIMIT_DELAY_MS=500
     ```

---

### Playbook C: Broken CDN Referer for Chapter Pages
- **Symptoms**: Manga pages fail to load in reader; browser console shows HTTP 403 from `official.lowee.us` or `cdn.lnori.com`.
- **Root Cause**: Client attempted direct load without routing through `/api/v1/proxy?url=...&referer=...`.
- **Remediation Steps**:
  1. Confirm that frontend reader image URLs use `/api/v1/proxy`:
     ```typescript
     const proxyUrl = `/api/v1/proxy?url=${encodeURIComponent(pageUrl)}&referer=${encodeURIComponent("https://weebcentral.com/")}`;
     ```
  2. Ensure SSRF validator does not block legitimate provider CDN hostnames in `backend/src/http/urlGuard.ts`.

---

## 4. Rollback & Emergency Procedures

If a newly deployed provider adapter causes crashes or data inconsistencies:
1. **Rollback Git Commit**:
   ```bash
   git revert HEAD --no-edit
   git push origin main
   ```
2. **Flush Corrupted Cache Keys**:
   ```bash
   # If Redis is active:
   redis-cli KEYS "zenkai:novel:*" | xargs redis-cli DEL
   redis-cli KEYS "zenkai:manga:*" | xargs redis-cli DEL
   ```
3. **Database Migration Rollback**:
   - Drizzle migrations are stored sequentially in `backend/migrations/`.
   - Never run destructive down migrations on live data without database backup (`pg_dump`).
