-- Migration: user-configured MCP (Model Context Protocol) servers
-- Stores HTTP/SSE endpoint URLs per user, plus optional encrypted auth headers.
-- stdio transport is not supported (Vercel serverless cannot keep long-lived
-- subprocesses). Auth headers use the same AES-256-GCM scheme as user_api_keys.

DROP TABLE IF EXISTS user_mcp_servers CASCADE;

CREATE TABLE user_mcp_servers (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT         NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  url             TEXT         NOT NULL CHECK (char_length(url) BETWEEN 8 AND 2048),
  encrypted_auth  TEXT,        -- base64 AES-256-GCM ciphertext + auth tag, nullable
  auth_iv         TEXT,        -- base64 12-byte IV, nullable
  auth_hint       TEXT,        -- e.g. "Bearer sk-abc…" for UI display, no secret
  enabled         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  DEFAULT now(),
  updated_at      TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX idx_user_mcp_servers_user ON user_mcp_servers(user_id);

ALTER TABLE user_mcp_servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mcp_servers_select" ON user_mcp_servers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "mcp_servers_insert" ON user_mcp_servers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "mcp_servers_update" ON user_mcp_servers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "mcp_servers_delete" ON user_mcp_servers FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_mcp_servers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mcp_servers_updated_at
  BEFORE UPDATE ON user_mcp_servers
  FOR EACH ROW EXECUTE FUNCTION update_mcp_servers_updated_at();
