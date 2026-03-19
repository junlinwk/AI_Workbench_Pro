-- Migration: server-side API key storage
-- Stores encrypted API keys per user per provider (AES-256-GCM)
-- Keys are NEVER returned to the client; only the server proxy reads them.

-- Drop if exists (for re-running)
DROP TABLE IF EXISTS user_api_keys CASCADE;

CREATE TABLE user_api_keys (
  user_id       UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider      TEXT    NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 50),
  encrypted_key TEXT    NOT NULL,   -- base64-encoded AES-256-GCM ciphertext + auth tag
  iv            TEXT    NOT NULL,   -- base64-encoded 12-byte IV
  key_prefix    TEXT,               -- e.g. "sk-a…" for UI display
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);

ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own keys
CREATE POLICY "api_keys_select" ON user_api_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "api_keys_insert" ON user_api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "api_keys_update" ON user_api_keys FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "api_keys_delete" ON user_api_keys FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_api_keys_updated_at
  BEFORE UPDATE ON user_api_keys
  FOR EACH ROW EXECUTE FUNCTION update_api_keys_updated_at();
