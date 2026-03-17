-- Supabase migration: initial schema for AI Workbench
-- Run this in the Supabase SQL editor or via CLI

-- =====================================================================
--  PROFILES (extension of auth.users)
-- =====================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_delete_own" ON profiles FOR DELETE USING (auth.uid() = id);

-- Auto-create profile on signup (SECURITY DEFINER — runs as DB owner)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, username, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      LEFT(NEW.raw_user_meta_data ->> 'full_name', 100),
      LEFT(NEW.email, 100)
    ),
    LEFT(NEW.raw_user_meta_data ->> 'avatar_url', 500)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =====================================================================
--  USER SETTINGS (JSON blob with encrypted API keys)
-- =====================================================================
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB DEFAULT '{}',
  encrypted_api_keys BYTEA,
  updated_at TIMESTAMPTZ DEFAULT now(),
  version BIGINT DEFAULT 1
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_settings_select" ON user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_settings_insert" ON user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_settings_update" ON user_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "user_settings_delete" ON user_settings FOR DELETE USING (auth.uid() = user_id);

-- =====================================================================
--  CONVERSATIONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS conversations (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  title TEXT CHECK (char_length(title) <= 500),
  folder_id TEXT CHECK (char_length(folder_id) <= 100),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations_select" ON conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "conversations_insert" ON conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "conversations_update" ON conversations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "conversations_delete" ON conversations FOR DELETE USING (auth.uid() = user_id);

-- =====================================================================
--  MESSAGES (largest table — append-only by design)
-- =====================================================================
CREATE TABLE IF NOT EXISTS messages (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  id TEXT NOT NULL,
  branch_id TEXT DEFAULT 'main' CHECK (char_length(branch_id) <= 100),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT CHECK (char_length(content) <= 500000),
  model TEXT CHECK (char_length(model) <= 200),
  citations JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  version BIGINT DEFAULT 1,
  PRIMARY KEY (user_id, conversation_id, id)
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_select" ON messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "messages_insert" ON messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "messages_update" ON messages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "messages_delete" ON messages FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (user_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages (user_id, created_at DESC);

-- =====================================================================
--  BRANCHES
-- =====================================================================
CREATE TABLE IF NOT EXISTS branches (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL CHECK (char_length(namespace) <= 500),
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  version BIGINT DEFAULT 1,
  PRIMARY KEY (user_id, namespace)
);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "branches_select" ON branches FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "branches_insert" ON branches FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "branches_update" ON branches FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "branches_delete" ON branches FOR DELETE USING (auth.uid() = user_id);

-- =====================================================================
--  CONVERSATION MEMORY
-- =====================================================================
CREATE TABLE IF NOT EXISTS conversation_memory (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL CHECK (char_length(namespace) <= 500),
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  version BIGINT DEFAULT 1,
  PRIMARY KEY (user_id, namespace)
);

ALTER TABLE conversation_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conv_memory_select" ON conversation_memory FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "conv_memory_insert" ON conversation_memory FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "conv_memory_update" ON conversation_memory FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "conv_memory_delete" ON conversation_memory FOR DELETE USING (auth.uid() = user_id);

-- =====================================================================
--  MEMORY MAP (knowledge graph)
-- =====================================================================
CREATE TABLE IF NOT EXISTS memory_map (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL CHECK (char_length(namespace) <= 500),
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  version BIGINT DEFAULT 1,
  PRIMARY KEY (user_id, namespace)
);

ALTER TABLE memory_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "memory_map_select" ON memory_map FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "memory_map_insert" ON memory_map FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "memory_map_update" ON memory_map FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "memory_map_delete" ON memory_map FOR DELETE USING (auth.uid() = user_id);

-- =====================================================================
--  SIDEBAR FOLDERS
-- =====================================================================
CREATE TABLE IF NOT EXISTS sidebar_folders (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL DEFAULT 'sidebar-folders' CHECK (char_length(namespace) <= 500),
  data JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT now(),
  version BIGINT DEFAULT 1,
  PRIMARY KEY (user_id, namespace)
);

ALTER TABLE sidebar_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sidebar_folders_select" ON sidebar_folders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sidebar_folders_insert" ON sidebar_folders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sidebar_folders_update" ON sidebar_folders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "sidebar_folders_delete" ON sidebar_folders FOR DELETE USING (auth.uid() = user_id);

-- =====================================================================
--  USER DATA (generic namespace → JSONB — catch-all store)
-- =====================================================================
CREATE TABLE IF NOT EXISTS user_data (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL CHECK (char_length(namespace) <= 500),
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  version BIGINT DEFAULT 1,
  PRIMARY KEY (user_id, namespace)
);

ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_data_select" ON user_data FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_data_insert" ON user_data FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_data_update" ON user_data FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "user_data_delete" ON user_data FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_data_user ON user_data (user_id);

-- =====================================================================
--  AUDIT LOG (track writes for security review)
-- =====================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  table_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Audit log is admin-only (no user access)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- No policies = no user can read/write. Use service_role key or DB admin only.

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (user_id, table_name, action, old_data)
    VALUES (auth.uid(), TG_TABLE_NAME, TG_OP, to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (user_id, table_name, action, old_data, new_data)
    VALUES (auth.uid(), TG_TABLE_NAME, TG_OP, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (user_id, table_name, action, new_data)
    VALUES (auth.uid(), TG_TABLE_NAME, TG_OP, to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- Attach audit triggers to sensitive tables
CREATE TRIGGER audit_user_settings AFTER INSERT OR UPDATE OR DELETE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_messages AFTER INSERT OR UPDATE OR DELETE ON messages
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- =====================================================================
--  REALTIME (for sync engine)
-- =====================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE user_data;

-- =====================================================================
--  ROW COUNT LIMITS (prevent abuse)
-- =====================================================================
-- Limit messages per user to 100,000 (prevents runaway storage)
CREATE OR REPLACE FUNCTION check_message_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT COUNT(*) FROM messages WHERE user_id = NEW.user_id) >= 100000 THEN
    RAISE EXCEPTION 'Message limit reached (100,000). Please delete old conversations.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_message_limit BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION check_message_limit();

-- Limit conversations per user to 5,000
CREATE OR REPLACE FUNCTION check_conversation_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT COUNT(*) FROM conversations WHERE user_id = NEW.user_id) >= 5000 THEN
    RAISE EXCEPTION 'Conversation limit reached (5,000). Please delete old conversations.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_conversation_limit BEFORE INSERT ON conversations
  FOR EACH ROW EXECUTE FUNCTION check_conversation_limit();
