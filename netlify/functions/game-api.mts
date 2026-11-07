import crypto from 'node:crypto';
import type { Config, Context } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { getStore } from '@netlify/blobs';
import { parseRoomCodeInput } from '../../src/shared/boardData';
import { GameRoom } from '../../src/shared/gameRoom';
import type {
  GameMode,
  GameState,
  LeaderboardEntry,
  PlayerMatchRecord,
  RoomSettings,
  RoomSummary,
  TeamId,
  TokenId,
  UserProfile,
  UserStats,
} from '../../src/shared/types';
import {
  applyMatchToStats,
  normalizeUserStats,
  sanitizeTokenId,
  toLeaderboardEntry,
  validatePasswordInput,
  validateUsernameInput,
} from '../../src/shared/userProfileUtils';

interface StoredRoomRecord {
  roomCode: string;
  hostId: string;
  hostName: string;
  roomName: string;
  gameMode: GameMode;
  status: GameState['status'];
  isPublic: boolean;
  playerCount: number;
  maxPlayers: number;
  turnTimeSeconds: number;
  version: number;
  state: GameState;
  updatedAt: number;
}

interface StoredUserAccount {
  userId: string;
  usernameLower: string;
  username: string;
  passwordHash: string;
  sessionToken: string;
  profile: UserProfile;
  updatedAt: number;
}

const MAX_MEMORY_ROOMS = 400;
const MAX_MEMORY_USERS = 800;
const MAX_RECENTLY_DELETED = 400;

const memoryRooms = new Map<string, StoredRoomRecord>();
const memoryUsersById = new Map<string, StoredUserAccount>();
const memoryUserIdsByUsername = new Map<string, string>();
const recentlyDeletedRooms = new Map<string, number>();

let cachedLobbyRooms: { rooms: RoomSummary[]; expiresAt: number } | null = null;
let cachedLeaderboard: {
  entries: LeaderboardEntry[];
  expiresAt: number;
} | null = null;

let dbSchemaInitialized = false;
let lastPruneAt = 0;

function setMemoryRoomBounded(code: string, rec: StoredRoomRecord): void {
  if (memoryRooms.has(code)) {
    memoryRooms.delete(code);
  } else if (memoryRooms.size >= MAX_MEMORY_ROOMS) {
    const oldestKey = memoryRooms.keys().next().value;
    if (oldestKey) memoryRooms.delete(oldestKey);
  }
  memoryRooms.set(code, rec);
}

function setMemoryUserBounded(acc: StoredUserAccount): void {
  if (memoryUsersById.has(acc.userId)) {
    memoryUsersById.delete(acc.userId);
  } else if (memoryUsersById.size >= MAX_MEMORY_USERS) {
    const oldestId = memoryUsersById.keys().next().value;
    if (oldestId) {
      const oldestAcc = memoryUsersById.get(oldestId);
      if (oldestAcc) memoryUserIdsByUsername.delete(oldestAcc.usernameLower);
      memoryUsersById.delete(oldestId);
    }
  }
  memoryUsersById.set(acc.userId, acc);
  memoryUserIdsByUsername.set(acc.usernameLower, acc.userId);
}

function markRecentlyDeletedBounded(code: string): void {
  const now = Date.now();
  recentlyDeletedRooms.delete(code);
  if (recentlyDeletedRooms.size >= MAX_RECENTLY_DELETED) {
    const oldestKey = recentlyDeletedRooms.keys().next().value;
    if (oldestKey) recentlyDeletedRooms.delete(oldestKey);
  }
  recentlyDeletedRooms.set(code, now);
}

function invalidateLobbyCache(): void {
  cachedLobbyRooms = null;
}

function invalidateLeaderboardCache(): void {
  cachedLeaderboard = null;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = String(storedHash || '').split(':');
  if (!salt || !keyHex) return false;
  try {
    const keyBuf = Buffer.from(keyHex, 'hex');
    const derivedBuf = crypto.scryptSync(password, salt, 64);
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, derivedBuf);
  } catch {
    return false;
  }
}

function generateSessionToken(): string {
  return crypto.randomBytes(28).toString('hex');
}

async function getSqlClient() {
  if (!process.env.NETLIFY_DB_URL && !process.env.DATABASE_URL) {
    return null;
  }
  try {
    const { sql } = getDatabase();
    if (!dbSchemaInitialized) {
      await sql`
        CREATE TABLE IF NOT EXISTS magnat_rooms (
          room_code TEXT PRIMARY KEY,
          host_id TEXT NOT NULL,
          host_name TEXT NOT NULL DEFAULT 'Гравець',
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
        )
      `;
      await sql`
        ALTER TABLE magnat_rooms
        ADD COLUMN IF NOT EXISTS host_name TEXT NOT NULL DEFAULT 'Гравець'
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_magnat_rooms_lobby
        ON magnat_rooms (is_public, status, updated_at DESC)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_magnat_rooms_updated
        ON magnat_rooms (updated_at)
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS magnat_users (
          user_id TEXT PRIMARY KEY,
          username_lower TEXT UNIQUE NOT NULL,
          username TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          session_token TEXT NOT NULL,
          profile_json JSONB NOT NULL,
          wins INTEGER NOT NULL DEFAULT 0,
          best_net_worth BIGINT NOT NULL DEFAULT 0,
          updated_at BIGINT NOT NULL
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_magnat_users_leaderboard
        ON magnat_users (wins DESC, best_net_worth DESC, updated_at DESC)
      `;
      dbSchemaInitialized = true;
    }
    return sql;
  } catch {
    return null;
  }
}

function getBlobsRoomStore() {
  try {
    return getStore({ name: 'magnat-rooms', consistency: 'strong' });
  } catch {
    return null;
  }
}

function getBlobsUserStore() {
  try {
    return getStore({ name: 'magnat-users', consistency: 'strong' });
  } catch {
    return null;
  }
}

async function loadUserByUsername(
  usernameLower: string
): Promise<StoredUserAccount | null> {
  const key = usernameLower.trim().toLowerCase();
  if (!key) return null;

  const sql = await getSqlClient();
  if (sql) {
    try {
      const rows = await sql`
        SELECT
          user_id,
          username_lower,
          username,
          password_hash,
          session_token,
          profile_json,
          updated_at
        FROM magnat_users
        WHERE username_lower = ${key}
        LIMIT 1
      `;
      if (rows && rows.length > 0) {
        const row = rows[0] as Record<string, unknown>;
        const profile =
          typeof row.profile_json === 'string'
            ? (JSON.parse(row.profile_json) as UserProfile)
            : (row.profile_json as UserProfile);
        if (profile && profile.id) {
          profile.stats = normalizeUserStats(profile.stats);
          const acc: StoredUserAccount = {
            userId: String(row.user_id),
            usernameLower: String(row.username_lower),
            username: String(row.username),
            passwordHash: String(row.password_hash),
            sessionToken: String(row.session_token),
            profile,
            updatedAt: Number(row.updated_at) || Date.now(),
          };
          setMemoryUserBounded(acc);
          return acc;
        }
      }
    } catch {
      // Fall through
    }
  }

  const blobStore = getBlobsUserStore();
  if (blobStore) {
    try {
      const acc = (await blobStore.get(`uname:${key}`, {
        type: 'json',
      })) as StoredUserAccount | null;
      if (acc && acc.profile) {
        acc.profile.stats = normalizeUserStats(acc.profile.stats);
        setMemoryUserBounded(acc);
        return acc;
      }
    } catch {
      // Fall through
    }
  }

  const memId = memoryUserIdsByUsername.get(key);
  return memId ? (memoryUsersById.get(memId) ?? null) : null;
}

async function loadUserById(userId: string): Promise<StoredUserAccount | null> {
  const id = userId.trim();
  if (!id) return null;

  const sql = await getSqlClient();
  if (sql) {
    try {
      const rows = await sql`
        SELECT
          user_id,
          username_lower,
          username,
          password_hash,
          session_token,
          profile_json,
          updated_at
        FROM magnat_users
        WHERE user_id = ${id}
        LIMIT 1
      `;
      if (rows && rows.length > 0) {
        const row = rows[0] as Record<string, unknown>;
        const profile =
          typeof row.profile_json === 'string'
            ? (JSON.parse(row.profile_json) as UserProfile)
            : (row.profile_json as UserProfile);
        if (profile && profile.id) {
          profile.stats = normalizeUserStats(profile.stats);
          const acc: StoredUserAccount = {
            userId: String(row.user_id),
            usernameLower: String(row.username_lower),
            username: String(row.username),
            passwordHash: String(row.password_hash),
            sessionToken: String(row.session_token),
            profile,
            updatedAt: Number(row.updated_at) || Date.now(),
          };
          setMemoryUserBounded(acc);
          return acc;
        }
      }
    } catch {
      // Fall through
    }
  }

  const blobStore = getBlobsUserStore();
  if (blobStore) {
    try {
      const acc = (await blobStore.get(`uid:${id}`, {
        type: 'json',
      })) as StoredUserAccount | null;
      if (acc && acc.profile) {
        acc.profile.stats = normalizeUserStats(acc.profile.stats);
        setMemoryUserBounded(acc);
        return acc;
      }
    } catch {
      // Fall through
    }
  }

  return memoryUsersById.get(id) ?? null;
}

async function saveUserAccount(acc: StoredUserAccount): Promise<void> {
  acc.updatedAt = Date.now();
  acc.profile.updatedAt = acc.updatedAt;
  setMemoryUserBounded(acc);
  invalidateLeaderboardCache();

  const sql = await getSqlClient();
  if (sql) {
    try {
      const profileJson = JSON.stringify(acc.profile);
      await sql`
        INSERT INTO magnat_users (
          user_id,
          username_lower,
          username,
          password_hash,
          session_token,
          profile_json,
          wins,
          best_net_worth,
          updated_at
        ) VALUES (
          ${acc.userId},
          ${acc.usernameLower},
          ${acc.username},
          ${acc.passwordHash},
          ${acc.sessionToken},
          ${profileJson}::jsonb,
          ${acc.profile.stats.wins},
          ${acc.profile.stats.bestNetWorth},
          ${acc.updatedAt}
        )
        ON CONFLICT (user_id) DO UPDATE SET
          username_lower = EXCLUDED.username_lower,
          username = EXCLUDED.username,
          password_hash = EXCLUDED.password_hash,
          session_token = EXCLUDED.session_token,
          profile_json = EXCLUDED.profile_json,
          wins = EXCLUDED.wins,
          best_net_worth = EXCLUDED.best_net_worth,
          updated_at = EXCLUDED.updated_at
      `;
    } catch {
      // Fall through to Blobs
    }
  }

  const blobStore = getBlobsUserStore();
  if (blobStore) {
    try {
      await blobStore.setJSON(`uid:${acc.userId}`, acc);
      await blobStore.setJSON(`uname:${acc.usernameLower}`, acc);
    } catch {
      // Stored in memory
    }
  }
}

async function listTopMagnates(): Promise<LeaderboardEntry[]> {
  const now = Date.now();
  if (cachedLeaderboard && cachedLeaderboard.expiresAt > now) {
    return cachedLeaderboard.entries;
  }

  const sql = await getSqlClient();
  if (sql) {
    try {
      const rows = await sql`
        SELECT profile_json
        FROM magnat_users
        ORDER BY wins DESC, best_net_worth DESC, updated_at DESC
        LIMIT 15
      `;
      const entries: LeaderboardEntry[] = [];
      for (const row of rows as Array<Record<string, unknown>>) {
        const profile =
          typeof row.profile_json === 'string'
            ? (JSON.parse(row.profile_json) as UserProfile)
            : (row.profile_json as UserProfile);
        if (profile && profile.id) {
          profile.stats = normalizeUserStats(profile.stats);
          entries.push(toLeaderboardEntry(profile));
        }
      }
      cachedLeaderboard = { entries, expiresAt: now + 5000 };
      return entries;
    } catch {
      // Fall through
    }
  }

  const blobStore = getBlobsUserStore();
  if (blobStore) {
    try {
      const { blobs } = await blobStore.list({ prefix: 'uid:' });
      const entries: LeaderboardEntry[] = [];
      for (const b of blobs.slice(0, 30)) {
        const acc = (await blobStore.get(b.key, {
          type: 'json',
        })) as StoredUserAccount | null;
        if (acc?.profile) {
          acc.profile.stats = normalizeUserStats(acc.profile.stats);
          entries.push(toLeaderboardEntry(acc.profile));
        }
      }
      entries.sort(
        (a, b) =>
          b.wins - a.wins ||
          b.bestNetWorth - a.bestNetWorth ||
          b.matchesPlayed - a.matchesPlayed
      );
      const top = entries.slice(0, 15);
      cachedLeaderboard = { entries: top, expiresAt: now + 5000 };
      return top;
    } catch {
      // Fall through
    }
  }

  const list = Array.from(memoryUsersById.values()).map((acc) =>
    toLeaderboardEntry(acc.profile)
  );
  list.sort(
    (a, b) =>
      b.wins - a.wins ||
      b.bestNetWorth - a.bestNetWorth ||
      b.matchesPlayed - a.matchesPlayed
  );
  const top = list.slice(0, 15);
  cachedLeaderboard = { entries: top, expiresAt: now + 5000 };
  return top;
}

function buildRecordFromRoom(
  room: GameRoom,
  prevVersion = 0
): StoredRoomRecord {
  const now = Date.now();
  const state = room.state;
  state.serverTime = now;
  recentlyDeletedRooms.delete(state.roomCode.toUpperCase());
  const host = state.players.find((p) => p.id === state.hostId);
  return {
    roomCode: state.roomCode,
    hostId: state.hostId,
    hostName: host?.name ?? 'Гравець',
    roomName: state.settings.roomName || 'Бізнес-Ліга України',
    gameMode: state.settings.gameMode ?? 'classic',
    status: state.status,
    isPublic: Boolean(state.settings.isPublic),
    playerCount: state.players.length,
    maxPlayers: state.settings.maxPlayers || 4,
    turnTimeSeconds: state.settings.turnTimeSeconds || 60,
    version: prevVersion + 1,
    state,
    updatedAt: now,
  };
}

async function loadRoomRecord(
  roomCode: string
): Promise<StoredRoomRecord | null> {
  const code = roomCode.trim().toUpperCase();
  if (!code) return null;

  const sql = await getSqlClient();
  if (sql) {
    try {
      const rows = await sql`
        SELECT
          room_code,
          host_id,
          host_name,
          room_name,
          game_mode,
          status,
          is_public,
          player_count,
          max_players,
          turn_time_seconds,
          version,
          state_json,
          updated_at
        FROM magnat_rooms
        WHERE room_code = ${code}
        LIMIT 1
      `;
      if (rows && rows.length > 0) {
        const row = rows[0] as Record<string, unknown>;
        const parsedState =
          typeof row.state_json === 'string'
            ? (JSON.parse(row.state_json) as GameState)
            : (row.state_json as GameState);
        if (parsedState && parsedState.roomCode) {
          const host = parsedState.players?.find(
            (p) => p.id === parsedState.hostId
          );
          const rec: StoredRoomRecord = {
            roomCode: String(row.room_code),
            hostId: String(row.host_id),
            hostName: String(row.host_name || host?.name || 'Гравець'),
            roomName: String(row.room_name || 'Бізнес-Ліга України'),
            gameMode:
              row.game_mode === 'team2v2' ? 'team2v2' : 'classic',
            status: (row.status as GameState['status']) || 'lobby',
            isPublic: Boolean(row.is_public),
            playerCount: Number(row.player_count) || parsedState.players.length,
            maxPlayers: Number(row.max_players) || 4,
            turnTimeSeconds: Number(row.turn_time_seconds) || 60,
            version: Number(row.version) || 1,
            state: parsedState,
            updatedAt: Number(row.updated_at) || Date.now(),
          };
          setMemoryRoomBounded(code, rec);
          return rec;
        }
      }
    } catch {
      // Fall through to Blobs / Memory
    }
  }

  const blobStore = getBlobsRoomStore();
  if (blobStore) {
    try {
      const rec = (await blobStore.get(`room:${code}`, {
        type: 'json',
      })) as StoredRoomRecord | null;
      if (rec && rec.state) {
        setMemoryRoomBounded(code, rec);
        return rec;
      }
    } catch {
      // Fall through to memory
    }
  }

  return memoryRooms.get(code) ?? null;
}

async function saveRoomRecord(
  record: StoredRoomRecord,
  isHeartbeatOnly = false
): Promise<boolean> {
  const code = record.roomCode.toUpperCase();

  const sql = await getSqlClient();
  if (sql) {
    try {
      const stateJson = JSON.stringify(record.state);
      const rows = isHeartbeatOnly
        ? await sql`
            UPDATE magnat_rooms SET
              state_json = ${stateJson}::jsonb,
              updated_at = ${record.updatedAt}
            WHERE room_code = ${code}
              AND version = ${record.version}
            RETURNING version
          `
        : await sql`
            INSERT INTO magnat_rooms (
              room_code,
              host_id,
              host_name,
              room_name,
              game_mode,
              status,
              is_public,
              player_count,
              max_players,
              turn_time_seconds,
              version,
              state_json,
              updated_at
            ) VALUES (
              ${code},
              ${record.hostId},
              ${record.hostName},
              ${record.roomName},
              ${record.gameMode},
              ${record.status},
              ${record.isPublic},
              ${record.playerCount},
              ${record.maxPlayers},
              ${record.turnTimeSeconds},
              ${record.version},
              ${stateJson}::jsonb,
              ${record.updatedAt}
            )
            ON CONFLICT (room_code) DO UPDATE SET
              host_id = EXCLUDED.host_id,
              host_name = EXCLUDED.host_name,
              room_name = EXCLUDED.room_name,
              game_mode = EXCLUDED.game_mode,
              status = EXCLUDED.status,
              is_public = EXCLUDED.is_public,
              player_count = EXCLUDED.player_count,
              max_players = EXCLUDED.max_players,
              turn_time_seconds = EXCLUDED.turn_time_seconds,
              version = EXCLUDED.version,
              state_json = EXCLUDED.state_json,
              updated_at = EXCLUDED.updated_at
            WHERE magnat_rooms.version < EXCLUDED.version
            RETURNING version
          `;
      const saved = Array.isArray(rows) && rows.length > 0;
      if (saved) {
        setMemoryRoomBounded(code, record);
        if (!isHeartbeatOnly) invalidateLobbyCache();
      } else {
        memoryRooms.delete(code);
      }
      return saved;
    } catch {
      // Fall through to Blobs
    }
  }

  const blobStore = getBlobsRoomStore();
  if (blobStore) {
    try {
      const currentBlob = (await blobStore.get(`room:${code}`, {
        type: 'json',
      })) as StoredRoomRecord | null;
      if (currentBlob) {
        if (isHeartbeatOnly && currentBlob.version !== record.version) {
          setMemoryRoomBounded(code, currentBlob);
          return false;
        }
        if (!isHeartbeatOnly && currentBlob.version >= record.version) {
          setMemoryRoomBounded(code, currentBlob);
          return false;
        }
      }
      await blobStore.setJSON(`room:${code}`, record);
      setMemoryRoomBounded(code, record);
      if (!isHeartbeatOnly) invalidateLobbyCache();
      return true;
    } catch {
      // Fall through to memoryRooms
    }
  }

  const existingMem = memoryRooms.get(code);
  if (existingMem) {
    if (isHeartbeatOnly && existingMem.version !== record.version) {
      return false;
    }
    if (!isHeartbeatOnly && existingMem.version >= record.version) {
      return false;
    }
  }
  setMemoryRoomBounded(code, record);
  if (!isHeartbeatOnly) {
    invalidateLobbyCache();
  }
  return true;
}

async function pruneExpiredRoomsIfNeeded(): Promise<void> {
  const now = Date.now();
  if (now - lastPruneAt < 5 * 60 * 1000) return;
  lastPruneAt = now;

  const staleCutoff = now - 6 * 60 * 60 * 1000; // 6 hours idle
  const lobbyCutoff = now - 90 * 60 * 1000; // 90 minutes unstarted lobby
  const finishedCutoff = now - 30 * 60 * 1000; // 30 minutes after finish

  for (const [code, ts] of recentlyDeletedRooms.entries()) {
    if (now - ts > 10 * 60 * 1000) {
      recentlyDeletedRooms.delete(code);
    }
  }

  for (const [code, rec] of memoryRooms.entries()) {
    if (
      rec.updatedAt < staleCutoff ||
      (rec.status === 'lobby' && rec.updatedAt < lobbyCutoff) ||
      (rec.status === 'finished' && rec.updatedAt < finishedCutoff)
    ) {
      memoryRooms.delete(code);
    }
  }

  const sql = await getSqlClient();
  if (sql) {
    try {
      await sql`
        DELETE FROM magnat_rooms
        WHERE updated_at < ${staleCutoff}
           OR (status = 'lobby' AND updated_at < ${lobbyCutoff})
           OR (status = 'finished' AND updated_at < ${finishedCutoff})
      `;
    } catch {
      // Ignore prune errors
    }
  }
}

async function deleteRoomRecord(roomCode: string): Promise<void> {
  const code = roomCode.trim().toUpperCase();
  memoryRooms.delete(code);
  markRecentlyDeletedBounded(code);
  invalidateLobbyCache();

  const sql = await getSqlClient();
  if (sql) {
    try {
      await sql`DELETE FROM magnat_rooms WHERE room_code = ${code}`;
    } catch {
      // Ignore
    }
  }

  const blobStore = getBlobsRoomStore();
  if (blobStore) {
    try {
      await blobStore.delete(`room:${code}`);
    } catch {
      // Ignore
    }
  }
}

async function listPublicRooms(): Promise<RoomSummary[]> {
  const now = Date.now();
  if (cachedLobbyRooms && cachedLobbyRooms.expiresAt > now) {
    return cachedLobbyRooms.rooms;
  }

  const cutoff = now - 90 * 60 * 1000; // 90 minutes active lobby window
  const sql = await getSqlClient();
  if (sql) {
    try {
      // Zero JSONB (`state_json`) read — uses composite index idx_magnat_rooms_lobby!
      const rows = await sql`
        SELECT
          room_code,
          host_name,
          room_name,
          game_mode,
          player_count,
          max_players,
          turn_time_seconds
        FROM magnat_rooms
        WHERE is_public = true
          AND status = 'lobby'
          AND updated_at >= ${cutoff}
        ORDER BY updated_at DESC
        LIMIT 30
      `;
      const summaries: RoomSummary[] = [];
      for (const row of rows as Array<Record<string, unknown>>) {
        summaries.push({
          roomCode: String(row.room_code),
          roomName: String(row.room_name || 'Бізнес-Ліга України'),
          hostName: String(row.host_name || 'Гравець'),
          gameMode: row.game_mode === 'team2v2' ? 'team2v2' : 'classic',
          playerCount: Number(row.player_count) || 1,
          maxPlayers: Number(row.max_players) || 4,
          status: 'lobby',
          turnTimeSeconds: Number(row.turn_time_seconds) || 60,
        });
      }
      cachedLobbyRooms = { rooms: summaries, expiresAt: now + 2000 };
      return summaries;
    } catch {
      // Fall through
    }
  }

  const blobStore = getBlobsRoomStore();
  if (blobStore) {
    try {
      const { blobs } = await blobStore.list({ prefix: 'room:' });
      const summaries: RoomSummary[] = [];
      for (const b of blobs.slice(0, 30)) {
        const rec = (await blobStore.get(b.key, {
          type: 'json',
        })) as StoredRoomRecord | null;
        if (
          rec &&
          rec.isPublic &&
          rec.status === 'lobby' &&
          rec.updatedAt >= cutoff
        ) {
          const host = rec.state.players.find(
            (p) => p.id === rec.state.hostId
          );
          summaries.push({
            roomCode: rec.roomCode,
            roomName: rec.roomName,
            hostName: rec.hostName || host?.name || 'Гравець',
            gameMode: rec.gameMode,
            playerCount: rec.state.players.length,
            maxPlayers: rec.maxPlayers,
            status: 'lobby',
            turnTimeSeconds: rec.turnTimeSeconds,
          });
        }
      }
      cachedLobbyRooms = { rooms: summaries, expiresAt: now + 2000 };
      return summaries;
    } catch {
      // Fall through
    }
  }

  const list: RoomSummary[] = [];
  for (const rec of memoryRooms.values()) {
    if (rec.isPublic && rec.status === 'lobby' && rec.updatedAt >= cutoff) {
      const host = rec.state.players.find((p) => p.id === rec.state.hostId);
      list.push({
        roomCode: rec.roomCode,
        roomName: rec.roomName,
        hostName: rec.hostName || host?.name || 'Гравець',
        gameMode: rec.gameMode,
        playerCount: rec.state.players.length,
        maxPlayers: rec.maxPlayers,
        status: 'lobby',
        turnTimeSeconds: rec.turnTimeSeconds,
      });
    }
  }
  const topList = list.slice(0, 30);
  cachedLobbyRooms = { rooms: topList, expiresAt: now + 2000 };
  return topList;
}

const reservedRoomCodes = new Set<string>();

async function createUniqueRoomCode(): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const num = Math.floor(1000 + Math.random() * 9000);
    const code = `UA-${num}`;
    if (!memoryRooms.has(code) && !reservedRoomCodes.has(code)) {
      reservedRoomCodes.add(code);
      const existing = await loadRoomRecord(code);
      if (!existing) return code;
      reservedRoomCodes.delete(code);
    }
  }
  for (let i = 0; i < 12; i++) {
    const num = Math.floor(10000 + Math.random() * 90000);
    const code = `UA-${num}`;
    if (!memoryRooms.has(code) && !reservedRoomCodes.has(code)) {
      reservedRoomCodes.add(code);
      const existing = await loadRoomRecord(code);
      if (!existing) return code;
      reservedRoomCodes.delete(code);
    }
  }
  const fallback = `UA-${Math.floor(100000 + Math.random() * 900000)}`;
  reservedRoomCodes.add(fallback);
  return fallback;
}

function hydrateGameRoom(state: GameState): GameRoom {
  const room = new GameRoom(
    state.roomCode,
    state.hostId,
    state.settings,
    () => {}
  );
  room.restoreFromSnapshot(state, true);
  return room;
}

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);

  if (req.method === 'GET' && url.pathname.endsWith('/api/health')) {
    const sql = await getSqlClient();
    return Response.json({
      ok: true,
      mode: 'netlify-db',
      database: sql ? 'postgres' : 'blobs-fallback',
    });
  }

  if (req.method !== 'POST') {
    return Response.json(
      { ok: false, error: 'Method Not Allowed' },
      { status: 405 }
    );
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action || '');
    const playerId = String(body.playerId || '').trim();
    const playerName = String(body.playerName || 'Гравець').trim() || 'Гравець';
    const preferredToken = body.token as TokenId | undefined;
    const roomCode = parseRoomCodeInput(String(body.roomCode || ''));
    const fallbackState = body.fallbackState as GameState | undefined;

    if (action === 'lobby:list') {
      void pruneExpiredRoomsIfNeeded();
      const rooms = await listPublicRooms();
      return Response.json({ ok: true, rooms });
    }

    if (action === 'auth:leaderboard') {
      const leaderboard = await listTopMagnates();
      return Response.json({ ok: true, leaderboard });
    }

    if (action === 'auth:register') {
      const unameCheck = validateUsernameInput(String(body.username || ''));
      if (!unameCheck.ok) {
        return Response.json({ ok: false, error: unameCheck.error });
      }
      const pwdCheck = validatePasswordInput(String(body.password || ''));
      if (!pwdCheck.ok) {
        return Response.json({ ok: false, error: pwdCheck.error });
      }

      const existing = await loadUserByUsername(unameCheck.lower);
      if (existing) {
        return Response.json({
          ok: false,
          error: `Користувач «${unameCheck.cleaned}» вже зареєстрований. Увійдіть у свій акаунт або оберіть інший логін.`,
        });
      }

      const now = Date.now();
      const userId = `u_${crypto.randomBytes(8).toString('hex')}`;
      const displayName =
        String(body.displayName || unameCheck.cleaned)
          .trim()
          .slice(0, 22) || unameCheck.cleaned.slice(0, 22);
      const favoriteToken = sanitizeTokenId(body.favoriteToken);
      const motto = String(body.motto || 'Будую українську бізнес-імперію!')
        .trim()
        .slice(0, 80);
      const initialStats = normalizeUserStats(
        body.initialStats as Partial<UserStats> | undefined
      );
      const sessionToken = generateSessionToken();

      const profile: UserProfile = {
        id: userId,
        username: unameCheck.cleaned,
        displayName,
        favoriteToken,
        motto,
        createdAt: now,
        updatedAt: now,
        stats: initialStats,
      };

      const account: StoredUserAccount = {
        userId,
        usernameLower: unameCheck.lower,
        username: unameCheck.cleaned,
        passwordHash: hashPassword(String(body.password)),
        sessionToken,
        profile,
        updatedAt: now,
      };

      await saveUserAccount(account);
      return Response.json({
        ok: true,
        profile: account.profile,
        authToken: account.sessionToken,
      });
    }

    if (action === 'auth:login') {
      const unameCheck = validateUsernameInput(String(body.username || ''));
      if (!unameCheck.ok) {
        return Response.json({
          ok: false,
          error: 'Введіть коректний логін або Email',
        });
      }
      const password = String(body.password || '');
      const account = await loadUserByUsername(unameCheck.lower);
      if (!account || !verifyPassword(password, account.passwordHash)) {
        return Response.json({
          ok: false,
          error: 'Невірний логін або пароль',
        });
      }

      if (!account.sessionToken) {
        account.sessionToken = generateSessionToken();
        await saveUserAccount(account);
      }

      return Response.json({
        ok: true,
        profile: account.profile,
        authToken: account.sessionToken,
      });
    }

    if (action === 'auth:me') {
      const userId = String(body.userId || '').trim();
      const authToken = String(body.authToken || '').trim();
      if (!userId || !authToken) {
        return Response.json({ ok: false, error: 'Немає активної сесії' });
      }
      const account = await loadUserById(userId);
      if (!account || account.sessionToken !== authToken) {
        return Response.json({
          ok: false,
          expired: true,
          error: 'Сесія застаріла, увійдіть повторно',
        });
      }
      return Response.json({
        ok: true,
        profile: account.profile,
      });
    }

    if (action === 'auth:update_profile') {
      const userId = String(body.userId || '').trim();
      const authToken = String(body.authToken || '').trim();
      const account = await loadUserById(userId);
      if (!account || account.sessionToken !== authToken) {
        return Response.json({
          ok: false,
          error: 'Не вдалося підтвердити сесію профілю',
        });
      }

      if (typeof body.displayName === 'string') {
        const nextName = body.displayName.trim().slice(0, 22);
        if (nextName.length >= 2) {
          account.profile.displayName = nextName;
        }
      }
      if (body.favoriteToken) {
        account.profile.favoriteToken = sanitizeTokenId(body.favoriteToken);
      }
      if (typeof body.motto === 'string') {
        account.profile.motto = body.motto.trim().slice(0, 80);
      }

      if (body.newPassword) {
        const pwdCheck = validatePasswordInput(String(body.newPassword));
        if (!pwdCheck.ok) {
          return Response.json({ ok: false, error: pwdCheck.error });
        }
        account.passwordHash = hashPassword(String(body.newPassword));
        account.sessionToken = generateSessionToken();
      }

      await saveUserAccount(account);
      return Response.json({
        ok: true,
        profile: account.profile,
        authToken: account.sessionToken,
      });
    }

    if (action === 'auth:record_match') {
      const userId = String(body.userId || '').trim();
      const authToken = String(body.authToken || '').trim();
      const match = body.match as PlayerMatchRecord | undefined;
      if (!userId || !authToken || !match || !match.id) {
        return Response.json({ ok: false, error: 'Некоректні дані матчу' });
      }
      const account = await loadUserById(userId);
      if (!account || account.sessionToken !== authToken) {
        return Response.json({ ok: false, error: 'Сесія недійсна' });
      }

      const { stats, added } = applyMatchToStats(account.profile.stats, match);
      account.profile.stats = stats;
      if (added) {
        await saveUserAccount(account);
      }
      return Response.json({
        ok: true,
        added,
        profile: account.profile,
      });
    }

    if (action === 'room:quick_bots') {
      if (!playerId) {
        return Response.json({ ok: false, error: 'Не вказано ID гравця' });
      }
      const gameMode: GameMode =
        body.gameMode === 'team2v2' ? 'team2v2' : 'classic';
      const botCount =
        gameMode === 'team2v2'
          ? 3
          : Math.min(3, Math.max(1, Number(body.botCount) || 2));

      for (let createAttempt = 1; createAttempt <= 5; createAttempt++) {
        const code = await createUniqueRoomCode();
        const room = new GameRoom(
          code,
          playerId,
          {
            roomName:
              gameMode === 'team2v2'
                ? `Альянс 2×2 • ${playerName}`
                : `Битва Магнатів • ${playerName}`,
            maxPlayers: botCount + 1,
            gameMode,
            startingMoney: 15000,
            turnTimeSeconds: 60,
            karpatyBonusEnabled: true,
            isPublic: false,
          },
          () => {}
        );
        room.addOrReconnectPlayer(playerId, playerName, preferredToken);
        for (let i = 0; i < botCount; i++) {
          room.addBot(playerId);
        }
        room.startGame(playerId);
        room.destroy();

        const rec = buildRecordFromRoom(room, 0);
        const saved = await saveRoomRecord(rec);
        reservedRoomCodes.delete(code);
        if (saved || createAttempt === 5) {
          return Response.json({
            ok: true,
            roomCode: room.state.roomCode,
            state: room.state,
            version: rec.version,
          });
        }
      }
    }

    if (action === 'room:create') {
      if (!playerId) {
        return Response.json({ ok: false, error: 'Не вказано ID гравця' });
      }
      const rawSettings = (body.settings as Partial<RoomSettings>) ?? {};
      const gameMode: GameMode =
        rawSettings.gameMode === 'team2v2' ? 'team2v2' : 'classic';
      const settings: RoomSettings = {
        roomName: (rawSettings.roomName || `Кімната ${playerName}`).slice(
          0,
          32
        ),
        gameMode,
        maxPlayers:
          gameMode === 'team2v2'
            ? 4
            : Math.min(4, Math.max(2, Number(rawSettings.maxPlayers) || 4)),
        startingMoney: Number(rawSettings.startingMoney) || 15000,
        turnTimeSeconds: Number(rawSettings.turnTimeSeconds) || 60,
        isPublic: rawSettings.isPublic ?? true,
        karpatyBonusEnabled: rawSettings.karpatyBonusEnabled ?? true,
      };

      for (let createAttempt = 1; createAttempt <= 5; createAttempt++) {
        const code = await createUniqueRoomCode();
        const room = new GameRoom(code, playerId, settings, () => {});
        room.addOrReconnectPlayer(playerId, playerName, preferredToken);
        room.destroy();

        const rec = buildRecordFromRoom(room, 0);
        const saved = await saveRoomRecord(rec);
        reservedRoomCodes.delete(code);
        if (saved || createAttempt === 5) {
          const rooms = await listPublicRooms();
          return Response.json({
            ok: true,
            roomCode: room.state.roomCode,
            state: room.state,
            version: rec.version,
            rooms,
          });
        }
      }
    }

    if (action === 'room:join') {
      if (!roomCode) {
        return Response.json({ ok: false, error: 'Введіть код кімнати' });
      }
      for (let joinAttempt = 1; joinAttempt <= 6; joinAttempt++) {
        let rec = await loadRoomRecord(roomCode);
        if (!rec && fallbackState && fallbackState.roomCode === roomCode) {
          const restored = hydrateGameRoom(fallbackState);
          for (const p of restored.state.players) {
            if (!p.isBot) {
              p.isConnected = p.id === playerId;
            }
          }
          restored.destroy();
          rec = buildRecordFromRoom(restored, 0);
          await saveRoomRecord(rec);
        }
        if (!rec) {
          return Response.json({
            ok: false,
            error: `Кімнату ${roomCode} не знайдено. Перевірте код або створіть нову!`,
          });
        }

        const room = hydrateGameRoom(rec.state);
        const res = room.addOrReconnectPlayer(
          playerId,
          playerName,
          preferredToken
        );
        room.advanceServerlessTick(Date.now());
        room.destroy();

        if (!res.ok) {
          return Response.json({ ok: false, error: res.error });
        }

        const nextRec = buildRecordFromRoom(room, rec.version);
        const saved = await saveRoomRecord(nextRec);
        if (!saved && joinAttempt < 6) {
          await new Promise((r) =>
            setTimeout(r, 12 * joinAttempt + Math.floor(Math.random() * 18))
          );
          continue;
        }
        return Response.json({
          ok: true,
          roomCode: room.state.roomCode,
          state: room.state,
          version: nextRec.version,
        });
      }
    }

    if (action === 'room:sync') {
      if (!roomCode) {
        return Response.json({ ok: false, error: 'Не вказано код кімнати' });
      }
      const knownVersion = Number(body.knownVersion) || 0;
      let rec = await loadRoomRecord(roomCode);
      const deletedAt = recentlyDeletedRooms.get(roomCode.toUpperCase());
      const wasRecentlyClosed =
        Boolean(deletedAt) && Date.now() - (deletedAt ?? 0) < 5 * 60 * 1000;
      if (
        !rec &&
        !wasRecentlyClosed &&
        fallbackState &&
        fallbackState.roomCode === roomCode
      ) {
        const restored = hydrateGameRoom(fallbackState);
        restored.destroy();
        rec = buildRecordFromRoom(restored, Math.max(0, knownVersion));
        await saveRoomRecord(rec);
      }
      if (!rec) {
        if (wasRecentlyClosed) {
          return Response.json({
            ok: false,
            kicked: true,
            error: 'Ігровий стіл закрито',
          });
        }
        return Response.json({
          ok: false,
          code: 'NEED_FALLBACK_STATE',
          error: `Кімнату ${roomCode} не знайдено`,
        });
      }

      const room = hydrateGameRoom(rec.state);
      let stateMutated = false;
      let heartbeatMutated = false;
      const now = Date.now();

      if (playerId) {
        const existing = room.state.players.find((p) => p.id === playerId);
        const isEliminated = room.state.eliminatedPlayers?.some(
          (e) => e.id === playerId
        );
        if (existing) {
          const wasConnected = existing.isConnected;
          if (room.touchPlayer(playerId, now)) {
            if (!wasConnected) {
              stateMutated = true;
            } else {
              heartbeatMutated = true;
            }
          }
        } else if (!isEliminated) {
          if (room.state.status === 'lobby') {
            room.destroy();
            return Response.json({
              ok: false,
              kicked: true,
              error: 'Власник кімнати вилучив вас зі столу',
            });
          }
          const reconnectRes = room.addOrReconnectPlayer(
            playerId,
            playerName,
            preferredToken
          );
          if (reconnectRes.ok) {
            stateMutated = true;
          }
        }
      }

      if (room.advanceServerlessTick(now)) {
        stateMutated = true;
      }
      room.destroy();

      let currentVersion = rec.version;
      if (stateMutated) {
        const nextRec = buildRecordFromRoom(room, rec.version);
        const saved = await saveRoomRecord(nextRec, false);
        if (saved) {
          currentVersion = nextRec.version;
        } else {
          const latest = await loadRoomRecord(roomCode);
          if (latest) {
            return Response.json({
              ok: true,
              state: latest.state,
              version: latest.version,
            });
          }
        }
      } else if (heartbeatMutated) {
        const heartbeatRec: StoredRoomRecord = {
          ...rec,
          state: room.state,
          updatedAt: now,
        };
        await saveRoomRecord(heartbeatRec, true);
      }

      if (knownVersion > 0 && currentVersion === knownVersion && !stateMutated) {
        return Response.json({
          ok: true,
          unchanged: true,
          version: currentVersion,
        });
      }

      return Response.json({
        ok: true,
        state: room.state,
        version: currentVersion,
      });
    }

    if (action === 'room:leave') {
      if (!roomCode || !playerId) {
        return Response.json({ ok: true });
      }
      const rec = await loadRoomRecord(roomCode);
      if (!rec) {
        return Response.json({ ok: true });
      }
      const room = hydrateGameRoom(rec.state);
      if (room.state.status === 'lobby') {
        room.removePlayerFromLobby(playerId, playerId);
      } else {
        const p = room.state.players.find((pl) => pl.id === playerId);
        if (p && !p.isBankrupt && !p.isBot && room.state.status === 'playing') {
          room.declareBankruptcy(playerId, true);
        }
        room.handleDisconnect(playerId);
        if (room.state.hostId === playerId) {
          const nextHost = room.state.players.find(
            (pl) => pl.id !== playerId && !pl.isBot && pl.isConnected
          );
          if (nextHost) {
            room.state.hostId = nextHost.id;
          }
        }
        room.advanceServerlessTick(Date.now());
      }
      room.destroy();

      const hasConnectedHuman = room.state.players.some(
        (p) =>
          !p.isBot &&
          p.isConnected &&
          (room.state.status !== 'playing' || !p.isBankrupt)
      );
      if (!hasConnectedHuman) {
        await deleteRoomRecord(roomCode);
      } else {
        const nextRec = buildRecordFromRoom(room, rec.version);
        await saveRoomRecord(nextRec);
      }
      return Response.json({ ok: true });
    }

    // All in-game / lobby mutations (`game:*`) with optimistic concurrency retry
    if (!roomCode) {
      return Response.json({ ok: false, error: 'Не вказано код кімнати' });
    }

    for (let conflictAttempt = 1; conflictAttempt <= 6; conflictAttempt++) {
      let rec = await loadRoomRecord(roomCode);
      if (!rec && fallbackState && fallbackState.roomCode === roomCode) {
        const restored = hydrateGameRoom(fallbackState);
        restored.destroy();
        rec = buildRecordFromRoom(restored, 0);
        await saveRoomRecord(rec);
      }
      if (!rec) {
        return Response.json({
          ok: false,
          code: 'NEED_FALLBACK_STATE',
          error: `Кімнату ${roomCode} не знайдено`,
        });
      }

      const room = hydrateGameRoom(rec.state);
      // Ensure returning player seat is linked if their ID changed
      if (playerId) {
        if (
          !room.state.players.some((p) => p.id === playerId) &&
          !room.state.eliminatedPlayers?.some((e) => e.id === playerId) &&
          room.state.status !== 'lobby'
        ) {
          room.addOrReconnectPlayer(playerId, playerName, preferredToken);
        }
        room.touchPlayer(playerId, Date.now());
      }

      let opResult: { ok: boolean; error?: string } = { ok: true };

      switch (action) {
        case 'game:select_token':
          room.selectToken(playerId, body.token as TokenId);
          break;
        case 'game:update_name':
          opResult = room.updatePlayerName(playerId, String(body.name || ''));
          break;
        case 'game:add_bot':
          opResult = room.addBot(playerId, body.teamId as TeamId | undefined);
          break;
        case 'game:set_mode':
          opResult = room.setLobbyGameMode(playerId, body.gameMode as GameMode);
          break;
        case 'game:set_visibility':
          opResult = room.setLobbyVisibility(
            playerId,
            typeof body.isPublic === 'boolean' ? body.isPublic : undefined
          );
          break;
        case 'game:switch_team':
          opResult = room.switchPlayerTeam(
            playerId,
            body.targetId as string | undefined,
            body.teamId as TeamId | undefined
          );
          break;
        case 'game:remove_player':
          room.removePlayerFromLobby(playerId, String(body.targetId || ''));
          break;
        case 'game:start':
          opResult = room.startGame(playerId);
          break;
        case 'game:restart_lobby':
          room.restartToLobby(playerId);
          break;
        case 'game:roll':
        case 'game:roll_dice':
          opResult = room.rollDice(playerId);
          break;
        case 'game:buy':
        case 'game:buy_property':
          opResult = room.buyProperty(playerId);
          break;
        case 'game:start_auction':
          opResult = room.startAuction(playerId);
          break;
        case 'game:bid':
        case 'game:auction_bid':
          opResult = room.placeAuctionBid(
            playerId,
            Number(body.increment ?? body.step) || 0
          );
          break;
        case 'game:pass_auction':
        case 'game:auction_pass':
          room.passAuction(playerId);
          break;
        case 'game:build_branch':
          opResult = room.buildBranch(playerId, Number(body.cellIndex));
          break;
        case 'game:sell_branch':
          opResult = room.sellBranch(playerId, Number(body.cellIndex));
          break;
        case 'game:mortgage':
          opResult = room.mortgageProperty(playerId, Number(body.cellIndex));
          break;
        case 'game:unmortgage':
          opResult = room.unmortgageProperty(playerId, Number(body.cellIndex));
          break;
        case 'game:pay_bail':
        case 'game:pay_jail_bail':
          opResult = room.payJailBail(playerId);
          break;
        case 'game:use_amnesty':
          opResult = room.useJailAmnesty(playerId);
          break;
        case 'game:propose_trade': {
          const offerSource = (body.offer as Record<string, unknown>) || body;
          opResult = room.proposeTrade(playerId, {
            toPlayerId: String(offerSource.toPlayerId || ''),
            offerProperties: (offerSource.offerProperties as number[]) || [],
            requestProperties:
              (offerSource.requestProperties as number[]) || [],
            offerMoney: Number(offerSource.offerMoney) || 0,
            requestMoney: Number(offerSource.requestMoney) || 0,
          });
          break;
        }
        case 'game:respond_trade':
          opResult = room.respondTrade(playerId, Boolean(body.accept));
          break;
        case 'game:pay_debt':
          opResult = room.payDebt(playerId);
          break;
        case 'game:auto_liquidate':
          opResult = room.autoLiquidateDebt(playerId);
          break;
        case 'game:bankrupt':
        case 'game:declare_bankruptcy':
          opResult = room.declareBankruptcy(playerId);
          break;
        case 'game:end_turn':
          opResult = room.endTurn(playerId);
          break;
        case 'game:chat':
        case 'game:send_chat':
          room.sendChat(
            playerId,
            String(body.text || ''),
            Boolean(body.isQuickReaction)
          );
          break;
        default:
          room.destroy();
          return Response.json(
            { ok: false, error: `Невідома дія: ${action}` },
            { status: 400 }
          );
      }

      const tickMutated = room.advanceServerlessTick(Date.now());
      room.destroy();

      let currentVersion = rec.version;
      if (opResult.ok || tickMutated) {
        const nextRec = buildRecordFromRoom(room, rec.version);
        const saved = await saveRoomRecord(nextRec, false);
        if (!saved && conflictAttempt < 6) {
          // Concurrent update collided — wait brief jitter and retry against the newly saved record
          await new Promise((r) =>
            setTimeout(r, 12 * conflictAttempt + Math.floor(Math.random() * 18))
          );
          continue;
        }
        currentVersion = nextRec.version;
      }

      return Response.json({
        ok: opResult.ok,
        error: opResult.error,
        state: room.state,
        version: currentVersion,
      });
    }
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Помилка обробки запиту до бази даних кімнати',
      },
      { status: 500 }
    );
  }
};

export const config: Config = {
  path: ['/api/health', '/api/cloud-room', '/api/auth'],
};
