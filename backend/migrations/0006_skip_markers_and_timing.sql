-- Skip markers timing metadata extension (Prompt 04)
-- Adds recap/preview skip markers, custom per-episode timing, and community-submitted timing data

-- Expand episode_playback_meta to include recap and preview markers
ALTER TABLE episode_playback_meta
  ADD COLUMN IF NOT EXISTS recap_start_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS recap_end_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS preview_start_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS preview_end_seconds INTEGER;

-- Community-submitted skip timing data (versioned for different cuts/versions)
CREATE TABLE IF NOT EXISTS skip_timing_community (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  submitter_anilist_id INTEGER,

  -- Which segment this timing applies to
  segment_type VARCHAR(32) NOT NULL CHECK (segment_type IN ('intro', 'outro', 'recap', 'preview')),

  -- Timing values
  start_seconds INTEGER NOT NULL,
  end_seconds INTEGER NOT NULL,

  -- Optional: which version/cut this timing is for (e.g. "TV", "Web", "Blu-ray", "Filler Edit")
  version_note VARCHAR(128),

  -- Confidence: how many users have validated this timing
  validation_count INTEGER NOT NULL DEFAULT 1,
  is_verified BOOLEAN NOT NULL DEFAULT false,

  -- Source of the timing (manual submit, community report, automated detection)
  source VARCHAR(64) NOT NULL DEFAULT 'manual',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skip_timing_episode ON skip_timing_community(episode_id);
CREATE INDEX IF NOT EXISTS idx_skip_timing_segment ON skip_timing_community(episode_id, segment_type);
CREATE INDEX IF NOT EXISTS idx_skip_timing_verified ON skip_timing_community(episode_id, segment_type, is_verified) WHERE is_verified = true;

-- Skip timing reports/corrections (user feedback on timing accuracy)
CREATE TABLE IF NOT EXISTS skip_timing_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skip_timing_id UUID NOT NULL REFERENCES skip_timing_community(id) ON DELETE CASCADE,

  -- Type of report
  report_type VARCHAR(32) NOT NULL CHECK (report_type IN ('too_early', 'too_late', 'wrong_segment', 'incorrect')),

  -- Optional correction values (if user provides corrected timing)
  suggested_start_seconds INTEGER,
  suggested_end_seconds INTEGER,

  -- Reporter identifier (anilist id or anonymous)
  reporter_anilist_id INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skip_timing_reports_timing ON skip_timing_reports(skip_timing_id);

-- Episode format/category for better skip timing defaults
ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS episode_format VARCHAR(32),
  ADD COLUMN IF NOT EXISTS is_recap BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_preview BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canon_type VARCHAR(32);

-- Index for quick lookup of episodes needing special handling
CREATE INDEX IF NOT EXISTS idx_episodes_format ON episodes(anime_id, episode_format) WHERE episode_format IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_episodes_recap_preview ON episodes(anime_id) WHERE is_recap = true OR is_preview = true;
