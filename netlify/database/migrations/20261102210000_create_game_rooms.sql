CREATE TABLE IF NOT EXISTS magnat_rooms (
  room_code TEXT PRIMARY KEY,
  host_id TEXT NOT NULL,
  room_name TEXT NOT NULL DEFAULT 'Бізнес-Ліга України',
  game_mode TEXT NOT NULL DEFAULT 'classic',
  status TEXT NOT NULL DEFAULT 'lobby',
  is_public BOOLEAN NOT NULL DEFAULT true,
  player_count INTEGER NOT NULL DEFAULT 1,
  max_players INTEGER NOT NULL DEFAULT 4,
  turn_time_seconds INTEGER NOT NULL DEFAULT 60,
  version INTEGER NOT NULL DEFAULT 1,
  state_json JSONB NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_magnat_rooms_lobby
  ON magnat_rooms (is_public, status, updated_at DESC);

