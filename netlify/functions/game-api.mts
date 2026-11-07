import type { Config, Context } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { getStore } from '@netlify/blobs';
import { parseRoomCodeInput } from '../../src/shared/boardData';
import { GameRoom } from '../../src/shared/gameRoom';
import type {
  GameMode,
  GameState,
  RoomSettings,
  RoomSummary,
  TeamId,
  TokenId,
  TradeOffer,
} from '../../src/shared/types';

interface StoredRoomRecord {
  roomCode: string;
  hostId: string;
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

const memoryRooms = new Map<string, StoredRoomRecord>();
const recentlyDeletedRooms = new Map<string, number>();
let dbSchemaInitialized = false;
let lastPruneAt = 0;

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

function buildRecordFromRoom(
  room: GameRoom,
  prevVersion = 0
): StoredRoomRecord {
  const now = Date.now();
  const state = room.state;
  state.serverTime = now;
  recentlyDeletedRooms.delete(state.roomCode.toUpperCase());
  return {
    roomCode: state.roomCode,
    hostId: state.hostId,
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
          const rec: StoredRoomRecord = {
            roomCode: String(row.room_code),
            hostId: String(row.host_id),
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
          memoryRooms.set(code, rec);
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
        memoryRooms.set(code, rec);
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
  const existingMem = memoryRooms.get(code);
  if (existingMem) {
    if (isHeartbeatOnly && existingMem.version !== record.version) {
      return false;
    }
    if (!isHeartbeatOnly && existingMem.version >= record.version) {
      return false;
    }
  }
  memoryRooms.set(code, record);

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
      return Array.isArray(rows) && rows.length > 0;
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
          return false;
        }
        if (!isHeartbeatOnly && currentBlob.version >= record.version) {
          memoryRooms.set(code, currentBlob);
          return false;
        }
      }
      await blobStore.setJSON(`room:${code}`, record);
      return true;
    } catch {
      // Stored in memoryRooms
    }
  }

  return true;
}

async function pruneExpiredRoomsIfNeeded(): Promise<void> {
  const now = Date.now();
  if (now - lastPruneAt < 10 * 60 * 1000) return;
  lastPruneAt = now;

  const staleCutoff = now - 12 * 60 * 60 * 1000; // 12 hours idle
  const finishedCutoff = now - 2 * 60 * 60 * 1000; // 2 hours after finish

  for (const [code, rec] of memoryRooms.entries()) {
    if (
      rec.updatedAt < staleCutoff ||
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
  recentlyDeletedRooms.set(code, Date.now());

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
  const cutoff = Date.now() - 3 * 60 * 60 * 1000; // 3 hours
  const sql = await getSqlClient();
  if (sql) {
    try {
      const rows = await sql`
        SELECT
          room_code,
          room_name,
          game_mode,
          status,
          player_count,
          max_players,
          turn_time_seconds,
          state_json,
          updated_at
        FROM magnat_rooms
        WHERE is_public = true
          AND status = 'lobby'
          AND updated_at >= ${cutoff}
        ORDER BY updated_at DESC
        LIMIT 25
      `;
      const summaries: RoomSummary[] = [];
      for (const row of rows as Array<Record<string, unknown>>) {
        const parsedState =
          typeof row.state_json === 'string'
            ? (JSON.parse(row.state_json) as GameState)
            : (row.state_json as GameState);
        const host = parsedState?.players?.find(
          (p) => p.id === parsedState.hostId
        );
        summaries.push({
          roomCode: String(row.room_code),
          roomName: String(row.room_name || 'Бізнес-Ліга України'),
          hostName: host?.name ?? 'Гравець',
          gameMode: row.game_mode === 'team2v2' ? 'team2v2' : 'classic',
          playerCount: Number(row.player_count) || 1,
          maxPlayers: Number(row.max_players) || 4,
          status: 'lobby',
          turnTimeSeconds: Number(row.turn_time_seconds) || 60,
        });
      }
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
      for (const b of blobs.slice(0, 25)) {
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
            hostName: host?.name ?? 'Гравець',
            gameMode: rec.gameMode,
            playerCount: rec.state.players.length,
            maxPlayers: rec.maxPlayers,
            status: 'lobby',
            turnTimeSeconds: rec.turnTimeSeconds,
          });
        }
      }
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
        hostName: host?.name ?? 'Гравець',
        gameMode: rec.gameMode,
        playerCount: rec.state.players.length,
        maxPlayers: rec.maxPlayers,
        status: 'lobby',
        turnTimeSeconds: rec.turnTimeSeconds,
      });
    }
  }
  return list;
}

async function createUniqueRoomCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const num = Math.floor(1000 + Math.random() * 9000);
    const code = `UA-${num}`;
    const existing = await loadRoomRecord(code);
    if (!existing) return code;
  }
  return `UA-${Math.floor(10000 + Math.random() * 90000)}`;
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

    if (action === 'room:quick_bots') {
      if (!playerId) {
        return Response.json({ ok: false, error: 'Не вказано ID гравця' });
      }
      const code = await createUniqueRoomCode();
      const gameMode: GameMode =
        body.gameMode === 'team2v2' ? 'team2v2' : 'classic';
      const botCount =
        gameMode === 'team2v2'
          ? 3
          : Math.min(3, Math.max(1, Number(body.botCount) || 2));

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
      await saveRoomRecord(rec);
      return Response.json({
        ok: true,
        roomCode: room.state.roomCode,
        state: room.state,
        version: rec.version,
      });
    }

    if (action === 'room:create') {
      if (!playerId) {
        return Response.json({ ok: false, error: 'Не вказано ID гравця' });
      }
      const code = await createUniqueRoomCode();
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
      const room = new GameRoom(code, playerId, settings, () => {});
      room.addOrReconnectPlayer(playerId, playerName, preferredToken);
      room.destroy();

      const rec = buildRecordFromRoom(room, 0);
      await saveRoomRecord(rec);
      const rooms = await listPublicRooms();
      return Response.json({
        ok: true,
        roomCode: room.state.roomCode,
        state: room.state,
        version: rec.version,
        rooms,
      });
    }

    if (action === 'room:join') {
      if (!roomCode) {
        return Response.json({ ok: false, error: 'Введіть код кімнати' });
      }
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
      await saveRoomRecord(nextRec);
      return Response.json({
        ok: true,
        roomCode: room.state.roomCode,
        state: room.state,
        version: nextRec.version,
      });
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

    for (let conflictAttempt = 1; conflictAttempt <= 2; conflictAttempt++) {
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
        if (!saved && conflictAttempt < 2) {
          // Concurrent update collided — retry once against the newly saved record
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
  path: ['/api/health', '/api/cloud-room'],
};
