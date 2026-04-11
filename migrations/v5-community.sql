-- ============================================================================
-- Carded v5.0 — Community & Sharing Migration
-- Run this in the Supabase SQL Editor before deploying v5.
-- Safe to run multiple times (uses IF NOT EXISTS / IF NOT EXISTS guards).
-- ============================================================================

-- ── 1. Extend user_profiles ────────────────────────────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS bio          TEXT CHECK (char_length(bio) <= 200),
  ADD COLUMN IF NOT EXISTS avatar_url   TEXT;

-- ── 2. community_publishes ────────────────────────────────────────────────────
-- Stores every set or folder that a user has published to the community feed.
CREATE TABLE IF NOT EXISTS community_publishes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type   TEXT        NOT NULL CHECK (item_type IN ('set', 'folder')),
  item_id     UUID        NOT NULL,
  title       TEXT        NOT NULL CHECK (char_length(title) <= 80),
  description TEXT        CHECK (char_length(description) <= 300),
  category    TEXT        CHECK (char_length(category) <= 40),
  card_count  INTEGER     NOT NULL DEFAULT 0,
  set_count   INTEGER     NOT NULL DEFAULT 0,
  add_count   INTEGER     NOT NULL DEFAULT 0,
  -- Future-proofing (not used in v5)
  flagged     BOOLEAN     NOT NULL DEFAULT FALSE,
  featured    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. community_adds ─────────────────────────────────────────────────────────
-- Tracks which published items a user has added to their library.
-- Orphan handling: when a publish is deleted, is_orphaned flips to true.
CREATE TABLE IF NOT EXISTS community_adds (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  publish_id       UUID        REFERENCES community_publishes(id) ON DELETE SET NULL,
  is_orphaned      BOOLEAN     NOT NULL DEFAULT FALSE,
  orphan_notified  BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Denormalized for orphan notification display (content_title persists after publish is deleted)
  content_title    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. shared_links ───────────────────────────────────────────────────────────
-- Private share links — anyone with the UUID can view/study, no login required.
CREATE TABLE IF NOT EXISTS shared_links (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type   TEXT        NOT NULL CHECK (item_type IN ('set', 'folder')),
  item_id     UUID        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. RLS policies ────────────────────────────────────────────────────────────

-- community_publishes: public read, owner write
ALTER TABLE community_publishes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_publishes_select_all"  ON community_publishes;
DROP POLICY IF EXISTS "community_publishes_insert_owner" ON community_publishes;
DROP POLICY IF EXISTS "community_publishes_update_owner" ON community_publishes;
DROP POLICY IF EXISTS "community_publishes_delete_owner" ON community_publishes;

CREATE POLICY "community_publishes_select_all"
  ON community_publishes FOR SELECT USING (true);

CREATE POLICY "community_publishes_insert_owner"
  ON community_publishes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "community_publishes_update_owner"
  ON community_publishes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "community_publishes_delete_owner"
  ON community_publishes FOR DELETE
  USING (auth.uid() = user_id);

-- community_adds: owner only
ALTER TABLE community_adds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_adds_owner" ON community_adds;

CREATE POLICY "community_adds_owner"
  ON community_adds FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- shared_links: public read by id, owner insert/delete
ALTER TABLE shared_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shared_links_select_all"   ON shared_links;
DROP POLICY IF EXISTS "shared_links_insert_owner" ON shared_links;
DROP POLICY IF EXISTS "shared_links_delete_owner" ON shared_links;

CREATE POLICY "shared_links_select_all"
  ON shared_links FOR SELECT USING (true);

CREATE POLICY "shared_links_insert_owner"
  ON shared_links FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "shared_links_delete_owner"
  ON shared_links FOR DELETE
  USING (auth.uid() = user_id);

-- user_profiles: public can read display_name/bio/avatar_url (existing policy
-- should already allow this — add if it doesn't exist in your project).
-- Check your existing user_profiles RLS before running:
-- CREATE POLICY "user_profiles_select_all" ON user_profiles FOR SELECT USING (true);

-- ── 6. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS community_publishes_user_id_idx
  ON community_publishes(user_id);

CREATE INDEX IF NOT EXISTS community_publishes_item_type_idx
  ON community_publishes(item_type);

CREATE INDEX IF NOT EXISTS community_publishes_created_at_idx
  ON community_publishes(created_at DESC);

CREATE INDEX IF NOT EXISTS community_publishes_add_count_idx
  ON community_publishes(add_count DESC);

-- Full-text search index on title for fast ilike queries
CREATE INDEX IF NOT EXISTS community_publishes_title_trgm_idx
  ON community_publishes USING gin (title gin_trgm_ops);
-- Note: requires pg_trgm extension. Enable with:
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS community_adds_user_id_idx
  ON community_adds(user_id);

CREATE INDEX IF NOT EXISTS community_adds_publish_id_idx
  ON community_adds(publish_id);

CREATE INDEX IF NOT EXISTS community_adds_orphan_idx
  ON community_adds(user_id, is_orphaned, orphan_notified)
  WHERE is_orphaned = TRUE AND orphan_notified = FALSE;

CREATE INDEX IF NOT EXISTS shared_links_user_id_idx
  ON shared_links(user_id);

CREATE INDEX IF NOT EXISTS shared_links_item_id_idx
  ON shared_links(item_id);

-- ── 7. Trigger: auto-set content_title on community_adds ──────────────────────
-- Copies publish.title into community_adds.content_title so it persists after
-- the publish is deleted (for the orphan notification modal).
CREATE OR REPLACE FUNCTION set_community_add_title()
RETURNS TRIGGER AS $$
BEGIN
  SELECT title INTO NEW.content_title
  FROM community_publishes
  WHERE id = NEW.publish_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS community_adds_set_title ON community_adds;
CREATE TRIGGER community_adds_set_title
  BEFORE INSERT ON community_adds
  FOR EACH ROW EXECUTE FUNCTION set_community_add_title();

-- ── 8. Trigger: mark community_adds as orphaned when publish is deleted ────────
CREATE OR REPLACE FUNCTION mark_community_adds_orphaned()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE community_adds
  SET is_orphaned = TRUE
  WHERE publish_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS community_publishes_orphan_trigger ON community_publishes;
CREATE TRIGGER community_publishes_orphan_trigger
  AFTER DELETE ON community_publishes
  FOR EACH ROW EXECUTE FUNCTION mark_community_adds_orphaned();

-- ── Done ──────────────────────────────────────────────────────────────────────
-- After running this migration, redeploy the app (push to main) so the new
-- service worker (v26) takes effect.
