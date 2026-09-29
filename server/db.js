import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import crypto from 'node:crypto';

const dbPath = process.env.NIGHTCALL_DB ?? './data/nightcall.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 account_id TEXT PRIMARY KEY,
 username TEXT NOT NULL UNIQUE,
 display_name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 avatar_url TEXT,
 banner_url TEXT,
 status TEXT NOT NULL DEFAULT 'offline' CHECK(status IN ('online','away','dnd','offline')),
 custom_status TEXT,
 bio TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
 session_id_hash TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES users(account_id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
CREATE TABLE IF NOT EXISTS friendships (
 friendship_id TEXT PRIMARY KEY,
 requester_id TEXT NOT NULL REFERENCES users(account_id) ON DELETE CASCADE,
 addressee_id TEXT NOT NULL REFERENCES users(account_id) ON DELETE CASCADE,
 status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','blocked')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(requester_id, addressee_id)
);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);
CREATE TABLE IF NOT EXISTS dm_conversations (conversation_id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS dm_participants (conversation_id TEXT NOT NULL REFERENCES dm_conversations(conversation_id) ON DELETE CASCADE, account_id TEXT NOT NULL REFERENCES users(account_id) ON DELETE CASCADE, joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(conversation_id, account_id));
CREATE TABLE IF NOT EXISTS messages (message_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES dm_conversations(conversation_id) ON DELETE CASCADE, author_id TEXT NOT NULL REFERENCES users(account_id) ON DELETE CASCADE, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, edited_at TEXT, deleted_at TEXT);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE TABLE IF NOT EXISTS spaces (space_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(account_id) ON DELETE CASCADE, name TEXT NOT NULL, is_private INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS space_members (space_id TEXT NOT NULL REFERENCES spaces(space_id) ON DELETE CASCADE, account_id TEXT NOT NULL REFERENCES users(account_id) ON DELETE CASCADE, role TEXT NOT NULL DEFAULT 'member', joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(space_id, account_id));
CREATE TABLE IF NOT EXISTS space_invites (invite_id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(space_id) ON DELETE CASCADE, inviter_id TEXT NOT NULL REFERENCES users(account_id) ON DELETE CASCADE, invitee_id TEXT REFERENCES users(account_id) ON DELETE CASCADE, token_hash TEXT UNIQUE, expires_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS channels (channel_id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES spaces(space_id) ON DELETE CASCADE, name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('text','voice')), is_private INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS channel_members (channel_id TEXT NOT NULL REFERENCES channels(channel_id) ON DELETE CASCADE, account_id TEXT NOT NULL REFERENCES users(account_id) ON DELETE CASCADE, PRIMARY KEY(channel_id, account_id));
CREATE TABLE IF NOT EXISTS channel_messages (message_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL REFERENCES channels(channel_id) ON DELETE CASCADE, author_id TEXT NOT NULL REFERENCES users(account_id) ON DELETE CASCADE, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, edited_at TEXT, deleted_at TEXT);
CREATE INDEX IF NOT EXISTS idx_channel_messages_channel ON channel_messages(channel_id, created_at);
`);

export const newId = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;

// Lightweight forward migrations for Nightcall v0.9.
for (const sql of [
  "ALTER TABLE users ADD COLUMN links_json TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE spaces ADD COLUMN icon_url TEXT"
]) { try { db.exec(sql); } catch {} }
