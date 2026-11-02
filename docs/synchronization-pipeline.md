# Zenkai Synchronization Pipeline & Scheduling Engine

## 1. Overview & Operational Principles

The Zenkai Synchronization Pipeline continuously harmonizes metadata, newly released manga chapters, and novel installments across all authorized upstream providers.

### Core Tenets
1. **Idempotence**: Every sync operation can be executed multiple times without corrupting records, duplicating chapter rows, or clobbering user reading states.
2. **Resilience & Checkpointing**: Sync jobs checkpoint progress periodically so interrupted runs resume seamlessly without re-scraping entire catalogs.
3. **Bounded Jitter & Rate Respect**: Requests adapt dynamically to upstream quotas with exponential backoff and randomized jitter.
4. **Zero Cache Stampede**: In-flight synchronization locks coalesce concurrent user requests for newly discovered titles.

---

## 2. Synchronization Job Lifecycle

```
[Trigger: Cron / Webhook / On-Demand Cache Miss]
                      |
           [Acquire Distributed Job Mutex]
           (prevents concurrent duplicate jobs)
                      |
          [Load Checkpoint & High-Water Mark]
                      |
         [Enumerate Changed / New Titles]
                      |
     +--------------->|
     |     [Rate Limiter & Concurrency Pool]
     |                |
     |    [Fetch Upstream Provider Metadata]
     |                |
     |       [Validate & Normalize]
     |                |
     |         [Match or Create]
     |   (Preserves internal UUID & Slug)
     |                |
     |     [Enumerate Chapters & Volumes]
     |                |
     |   [Upsert Chapters (Idempotent Diff)]
     |                |
     |      [Update Checkpoint & Metrics]
     |                |
     +-- Has More? ---+
             | NO
    [Release Mutex & Invalidate Stale Caches]
             |
  [Emit Structured Execution Report]
```

---

## 3. Scheduled Workflows & Cadence

| Job Identifier | Purpose | Schedule | Concurrency | Backoff Policy |
| :--- | :--- | :--- | :--- | :--- |
| `sync:popular-manga` | Refreshes top 200 trending manga metadata & latest chapter lists | Every 6 hours | 2 concurrent workers | Max 3 retries, exponential backoff (2s, 4s, 8s) + jitter |
| `sync:recent-novels` | Polls `lnori` and `novelfire` latest releases for new chapters | Every 30 minutes | 1 worker | Max 3 retries, 5s backoff |
| `sync:stale-catalog` | Sweeps older catalog records whose lastSync > 14 days | Daily at 03:00 UTC | 1 worker (low priority) | Max 2 retries |
| `sync:provider-health` | Executes lightweight ping / home probes across all registered providers | Every 5 minutes | 5 parallel probes | Circuit-breaker trip on 3 consecutive failures |

---

## 4. Chapter Reconciliation & Diffing Logic

When reconciling upstream chapter lists with existing database records:
1. **Chapter Number Ordering**: Numbers are cast to float/decimal for precise ordering (`"10"` > `"9"`, `"10.5"` between `"10"` and `"11"`).
2. **Rename vs Removal**:
   - A chapter missing from a single scrape is flagged as `status: "MISSING_VERIFICATION"` rather than immediately dropped, preventing transient upstream 404s or network blips from truncating catalogues.
   - Deletion occurs only after 3 consecutive reconciliation sweeps over 48 hours confirm provider removal.
3. **Upsert Semantics**:
   - PostgreSQL `ON CONFLICT (novel_id, chapter_number) DO UPDATE SET title = EXCLUDED.title, release_date = COALESCE(EXCLUDED.release_date, novel_chapters.release_date)`.

---

## 5. Metrics & Diagnostic Observability

Every sync execution emits structured logs and metrics:
- `sync.duration_ms`: Execution wall time per provider.
- `sync.items_discovered`: Count of new series found.
- `sync.chapters_appended`: Count of new chapter records created.
- `sync.errors.rate_limit`: Count of HTTP 429 responses encountered.
- `sync.errors.parsing`: Count of selector or JSON decoding failures.
- `sync.circuit_breaker.state`: Current state (`CLOSED`, `HALF_OPEN`, `OPEN`).
