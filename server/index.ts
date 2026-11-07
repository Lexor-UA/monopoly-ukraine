import cors from 'cors';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import { createServer } from 'http';
import os from 'os';
import path from 'path';
import { Server, Socket } from 'socket.io';
import { fileURLToPath } from 'url';
import { MAX_GAME_PLAYERS, parseRoomCodeInput } from '../src/shared/boardData.ts';
import {
  GameMode,
  GameState,
  PlayerMatchRecord,
  RoomSettings,
  TeamId,
  TokenId,
  UserProfile,
  UserStats,
} from '../src/shared/types.ts';
import {
  applyMatchToStats,
  normalizeUserStats,
  sanitizeTokenId,
  toLeaderboardEntry,
  validatePasswordInput,
  validateUsernameInput,
} from '../src/shared/userProfileUtils.ts';
import { GameRoom } from './gameRoom.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProd =
  process.argv.includes('--prod') || process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || (isProd ? 3000 : 3001));
const SERVER_SNAPSHOT_PATH = path.join(
  os.tmpdir(),
  'magnat-ua-server-rooms-v1.json'
);

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: 2 * 1024 * 1024,
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const rooms = new Map<string, GameRoom>();
/** Maps socket.id -> { roomCode, playerId } */
const socketSessions = new Map<string, { roomCode: string; playerId: string }>();
const roomCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
let persistSnapshotTimer: ReturnType<typeof setTimeout> | null = null;

function getLocalLanIps(): string[] {
  const nets = os.networkInterfaces();
  const candidates: { ip: string; priority: number }[] = [];

  for (const [ifaceName, addrs] of Object.entries(nets)) {
    if (!addrs) continue;
    const lowerName = ifaceName.toLowerCase();
    const isVirtual =
      lowerName.includes('vethernet') ||
      lowerName.includes('wsl') ||
      lowerName.includes('hyper-v') ||
      lowerName.includes('virtual') ||
      lowerName.includes('vmware') ||
      lowerName.includes('vbox') ||
      lowerName.includes('docker');

    for (const addr of addrs) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      if (addr.address.startsWith('169.254.')) continue;

      let priority = isVirtual ? 50 : 10;
      if (!isVirtual && addr.address.startsWith('192.168.')) {
        priority = 1;
      } else if (!isVirtual && addr.address.startsWith('10.')) {
        priority = 2;
      } else if (!isVirtual && /^172\.(1[6-9]|2\d|3[0-1])\./.test(addr.address)) {
        priority = 3;
      }
      candidates.push({ ip: addr.address, priority });
    }
  }

  candidates.sort((a, b) => a.priority - b.priority);
  return [...new Set(candidates.map((c) => c.ip))];
}

function clearRoomCleanupTimer(roomCode: string): void {
  const existing = roomCleanupTimers.get(roomCode);
  if (existing) {
    clearTimeout(existing);
    roomCleanupTimers.delete(roomCode);
  }
}

function generateRoomCode(): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const num = Math.floor(1000 + Math.random() * 9000);
    const code = `UA-${num}`;
    if (!rooms.has(code)) return code;
  }
  return `UA-${Date.now().toString().slice(-4)}`;
}

function getPublicRoomSummaries() {
  const list = [];
  for (const room of rooms.values()) {
    if (
      room.state.settings.isPublic &&
      room.state.status === 'lobby' &&
      room.state.players.length > 0
    ) {
      list.push(room.getSummary());
    }
  }
  return list;
}

function broadcastLobbyRooms(): void {
  io.emit('lobby:rooms', getPublicRoomSummaries());
}

function hasActiveHumanPresence(roomCode: string): boolean {
  const room = rooms.get(roomCode);
  if (!room) return false;
  if (room.state.players.some((p) => !p.isBot && p.isConnected)) {
    return true;
  }
  for (const sess of socketSessions.values()) {
    if (sess.roomCode === roomCode) return true;
  }
  return false;
}

function serializeActiveRoomsPayload(): string {
  return JSON.stringify({
    savedAt: Date.now(),
    rooms: Array.from(rooms.values()).map((r) => r.state),
  });
}

function schedulePersistRoomsSnapshot(): void {
  if (persistSnapshotTimer) return;
  persistSnapshotTimer = setTimeout(() => {
    persistSnapshotTimer = null;
    try {
      const json = serializeActiveRoomsPayload();
      void fs.promises.writeFile(SERVER_SNAPSHOT_PATH, json, 'utf8').catch(() => {});
    } catch {
      // Ignore snapshot write failures
    }
  }, 180);
}

function persistRoomsSnapshotSync(): void {
  if (persistSnapshotTimer) {
    clearTimeout(persistSnapshotTimer);
    persistSnapshotTimer = null;
  }
  try {
    fs.writeFileSync(SERVER_SNAPSHOT_PATH, serializeActiveRoomsPayload(), 'utf8');
  } catch {
    // Ignore snapshot write failures
  }
}

function cleanupRoomIfEmpty(roomCode: string): void {
  const room = rooms.get(roomCode);
  if (!room) return;

  if (hasActiveHumanPresence(roomCode)) {
    clearRoomCleanupTimer(roomCode);
    return;
  }

  if (roomCleanupTimers.has(roomCode)) return;

  // Give 60s grace period for page refresh, server restart, or Wi-Fi reconnect before destroying room
  const timer = setTimeout(() => {
    roomCleanupTimers.delete(roomCode);
    const current = rooms.get(roomCode);
    if (!current) return;
    if (!hasActiveHumanPresence(roomCode)) {
      current.destroy();
      rooms.delete(roomCode);
      broadcastLobbyRooms();
      schedulePersistRoomsSnapshot();
    }
  }, 60000);
  roomCleanupTimers.set(roomCode, timer);
}

function attachManagedRoom(
  code: string,
  hostId: string,
  settings: RoomSettings
): GameRoom {
  const room = new GameRoom(code, hostId, settings, (updatedRoom) => {
    io.to(updatedRoom.state.roomCode).emit('room:state', updatedRoom.state);
    broadcastLobbyRooms();
    schedulePersistRoomsSnapshot();
  });
  rooms.set(code, room);
  return room;
}

function createManagedRoom(hostId: string, settings: RoomSettings): GameRoom {
  const code = generateRoomCode();
  const room = attachManagedRoom(code, hostId, settings);
  schedulePersistRoomsSnapshot();
  return room;
}

function restorePersistedRoomsOnBoot(): void {
  try {
    if (!fs.existsSync(SERVER_SNAPSHOT_PATH)) return;
    const raw = fs.readFileSync(SERVER_SNAPSHOT_PATH, 'utf8');
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      savedAt?: number;
      rooms?: GameState[];
    };
    if (
      !parsed ||
      typeof parsed.savedAt !== 'number' ||
      Date.now() - parsed.savedAt > 12 * 60 * 60 * 1000 ||
      !Array.isArray(parsed.rooms)
    ) {
      return;
    }

    for (const snap of parsed.rooms) {
      if (
        !snap ||
        typeof snap.roomCode !== 'string' ||
        !snap.settings ||
        !Array.isArray(snap.players)
      ) {
        continue;
      }
      const code = parseRoomCodeInput(snap.roomCode);
      if (!code || rooms.has(code)) continue;

      const preparedSnap: GameState = {
        ...snap,
        roomCode: code,
        players: snap.players.map((p) =>
          p.isBot ? p : { ...p, isConnected: false }
        ),
      };
      const room = attachManagedRoom(
        code,
        preparedSnap.hostId || preparedSnap.players[0]?.id || 'host',
        preparedSnap.settings
      );
      room.restoreFromSnapshot(preparedSnap);
      cleanupRoomIfEmpty(code);
    }
  } catch {
    // Ignore corrupt snapshot on boot
  }
}

restorePersistedRoomsOnBoot();

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    name: 'КАБЗДА.UA Server',
    activeRooms: rooms.size,
    lanIps: getLocalLanIps(),
  });
});

interface LocalUserAccount {
  userId: string;
  usernameLower: string;
  username: string;
  passwordHash: string;
  sessionToken: string;
  profile: UserProfile;
  updatedAt: number;
}

const SERVER_USERS_PATH = path.join(os.tmpdir(), 'magnat-ua-users-v1.json');
const localUsersById = new Map<string, LocalUserAccount>();
const localUserIdsByUsername = new Map<string, string>();

function hashPasswordLocal(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPasswordLocal(password: string, storedHash: string): boolean {
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

function persistLocalUsersSync(): void {
  try {
    const users = Array.from(localUsersById.values());
    fs.writeFileSync(
      SERVER_USERS_PATH,
      JSON.stringify({ savedAt: Date.now(), users }),
      'utf8'
    );
  } catch {
    // Ignore write errors
  }
}

function restoreLocalUsersOnBoot(): void {
  try {
    if (!fs.existsSync(SERVER_USERS_PATH)) return;
    const raw = fs.readFileSync(SERVER_USERS_PATH, 'utf8');
    const parsed = JSON.parse(raw) as { users?: LocalUserAccount[] };
    if (!parsed || !Array.isArray(parsed.users)) return;
    for (const acc of parsed.users) {
      if (acc && acc.userId && acc.usernameLower && acc.profile) {
        acc.profile.stats = normalizeUserStats(acc.profile.stats);
        localUsersById.set(acc.userId, acc);
        localUserIdsByUsername.set(acc.usernameLower, acc.userId);
      }
    }
  } catch {
    // Ignore
  }
}

restoreLocalUsersOnBoot();

const handleAuthApiRequest: express.RequestHandler = (req, res) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const action = String(body.action || '');

  if (action === 'auth:leaderboard') {
    const leaderboard = Array.from(localUsersById.values())
      .map((acc) => toLeaderboardEntry(acc.profile))
      .sort(
        (a, b) =>
          b.wins - a.wins ||
          b.bestNetWorth - a.bestNetWorth ||
          b.matchesPlayed - a.matchesPlayed
      )
      .slice(0, 15);
    res.json({ ok: true, leaderboard });
    return;
  }

  if (action === 'auth:register') {
    const unameCheck = validateUsernameInput(String(body.username || ''));
    if (!unameCheck.ok) {
      res.json({ ok: false, error: unameCheck.error });
      return;
    }
    const pwdCheck = validatePasswordInput(String(body.password || ''));
    if (!pwdCheck.ok) {
      res.json({ ok: false, error: pwdCheck.error });
      return;
    }
    if (localUserIdsByUsername.has(unameCheck.lower)) {
      res.json({
        ok: false,
        error: `Користувач «${unameCheck.cleaned}» вже зареєстрований. Увійдіть у свій акаунт або оберіть інший логін.`,
      });
      return;
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
    const sessionToken = crypto.randomBytes(28).toString('hex');

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

    const account: LocalUserAccount = {
      userId,
      usernameLower: unameCheck.lower,
      username: unameCheck.cleaned,
      passwordHash: hashPasswordLocal(String(body.password)),
      sessionToken,
      profile,
      updatedAt: now,
    };

    localUsersById.set(userId, account);
    localUserIdsByUsername.set(unameCheck.lower, userId);
    persistLocalUsersSync();

    res.json({
      ok: true,
      profile: account.profile,
      authToken: account.sessionToken,
    });
    return;
  }

  if (action === 'auth:login') {
    const unameCheck = validateUsernameInput(String(body.username || ''));
    if (!unameCheck.ok) {
      res.json({ ok: false, error: 'Введіть коректний логін або Email' });
      return;
    }
    const uid = localUserIdsByUsername.get(unameCheck.lower);
    const account = uid ? localUsersById.get(uid) : undefined;
    if (
      !account ||
      !verifyPasswordLocal(String(body.password || ''), account.passwordHash)
    ) {
      res.json({ ok: false, error: 'Невірний логін або пароль' });
      return;
    }
    if (!account.sessionToken) {
      account.sessionToken = crypto.randomBytes(28).toString('hex');
      persistLocalUsersSync();
    }
    res.json({
      ok: true,
      profile: account.profile,
      authToken: account.sessionToken,
    });
    return;
  }

  if (action === 'auth:me') {
    const userId = String(body.userId || '').trim();
    const authToken = String(body.authToken || '').trim();
    const account = localUsersById.get(userId);
    if (!account || account.sessionToken !== authToken) {
      res.json({
        ok: false,
        expired: true,
        error: 'Сесія застаріла, увійдіть повторно',
      });
      return;
    }
    res.json({ ok: true, profile: account.profile });
    return;
  }

  if (action === 'auth:update_profile') {
    const userId = String(body.userId || '').trim();
    const authToken = String(body.authToken || '').trim();
    const account = localUsersById.get(userId);
    if (!account || account.sessionToken !== authToken) {
      res.json({ ok: false, error: 'Не вдалося підтвердити сесію профілю' });
      return;
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
        res.json({ ok: false, error: pwdCheck.error });
        return;
      }
      account.passwordHash = hashPasswordLocal(String(body.newPassword));
      account.sessionToken = crypto.randomBytes(28).toString('hex');
    }
    account.updatedAt = Date.now();
    account.profile.updatedAt = account.updatedAt;
    persistLocalUsersSync();
    res.json({
      ok: true,
      profile: account.profile,
      authToken: account.sessionToken,
    });
    return;
  }

  if (action === 'auth:record_match') {
    const userId = String(body.userId || '').trim();
    const authToken = String(body.authToken || '').trim();
    const match = body.match as PlayerMatchRecord | undefined;
    const account = localUsersById.get(userId);
    if (!account || account.sessionToken !== authToken || !match?.id) {
      res.json({ ok: false, error: 'Сесія або дані матчу недійсні' });
      return;
    }
    const { stats, added } = applyMatchToStats(account.profile.stats, match);
    account.profile.stats = stats;
    account.updatedAt = Date.now();
    account.profile.updatedAt = account.updatedAt;
    if (added) {
      persistLocalUsersSync();
    }
    res.json({ ok: true, added, profile: account.profile });
    return;
  }

  res.status(400).json({ ok: false, error: `Невідома дія: ${action}` });
};

app.post('/api/auth', handleAuthApiRequest);
app.post('/api/cloud-room', handleAuthApiRequest);

io.on('connection', (socket: Socket) => {
  socket.emit('lobby:rooms', getPublicRoomSummaries());

  const detachCurrentRoom = (explicitLeave = false) => {
    const sess = socketSessions.get(socket.id);
    if (!sess) return;
    socket.leave(sess.roomCode);
    socketSessions.delete(socket.id);

    const room = rooms.get(sess.roomCode);
    if (!room) return;

    const stillHasActiveSocketForPlayer = Array.from(
      socketSessions.values()
    ).some(
      (s) => s.roomCode === sess.roomCode && s.playerId === sess.playerId
    );

    if (explicitLeave) {
      if (room.state.status === 'lobby') {
        room.removePlayerFromLobby(sess.playerId, sess.playerId);
        if (!hasActiveHumanPresence(sess.roomCode) && !room.state.players.some((p) => !p.isBot)) {
          clearRoomCleanupTimer(sess.roomCode);
          room.destroy();
          rooms.delete(sess.roomCode);
        }
      } else if (room.state.status === 'playing') {
        if (!stillHasActiveSocketForPlayer) {
          room.handleDisconnect(sess.playerId);
        }
        room.declareBankruptcy(sess.playerId);
        if (!hasActiveHumanPresence(sess.roomCode)) {
          clearRoomCleanupTimer(sess.roomCode);
          room.destroy();
          rooms.delete(sess.roomCode);
        }
      } else {
        if (!stillHasActiveSocketForPlayer) {
          room.handleDisconnect(sess.playerId);
        }
        if (!hasActiveHumanPresence(sess.roomCode)) {
          clearRoomCleanupTimer(sess.roomCode);
          room.destroy();
          rooms.delete(sess.roomCode);
        } else {
          cleanupRoomIfEmpty(sess.roomCode);
        }
      }
      broadcastLobbyRooms();
      schedulePersistRoomsSnapshot();
    } else {
      // Only mark disconnected if no newer reconnected socket exists for this player!
      if (!stillHasActiveSocketForPlayer) {
        room.handleDisconnect(sess.playerId);
      }
      cleanupRoomIfEmpty(sess.roomCode);
      schedulePersistRoomsSnapshot();
    }
  };

  socket.on('lobby:list', () => {
    socket.emit('lobby:rooms', getPublicRoomSummaries());
  });

  socket.on(
    'room:create',
    (
      payload: {
        playerId: string;
        playerName: string;
        token: TokenId;
        settings: Partial<RoomSettings>;
      },
      ack?: (res: unknown) => void
    ) => {
      detachCurrentRoom(true);
      const gameMode: GameMode =
        payload.settings?.gameMode === 'team2v2' ? 'team2v2' : 'classic';
      const settings: RoomSettings = {
        roomName:
          (payload.settings?.roomName || `Кімната ${payload.playerName}`).slice(
            0,
            32
          ),
        gameMode,
        maxPlayers:
          gameMode === 'team2v2'
            ? MAX_GAME_PLAYERS
            : Math.min(
                MAX_GAME_PLAYERS,
                Math.max(2, Number(payload.settings?.maxPlayers) || MAX_GAME_PLAYERS)
              ),
        startingMoney: Number(payload.settings?.startingMoney) || 15000,
        turnTimeSeconds: Number(payload.settings?.turnTimeSeconds) || 60,
        isPublic: payload.settings?.isPublic ?? true,
        karpatyBonusEnabled: payload.settings?.karpatyBonusEnabled ?? true,
      };

      const room = createManagedRoom(payload.playerId, settings);
      room.addOrReconnectPlayer(
        payload.playerId,
        payload.playerName,
        payload.token
      );

      socket.join(room.state.roomCode);
      socketSessions.set(socket.id, {
        roomCode: room.state.roomCode,
        playerId: payload.playerId,
      });

      broadcastLobbyRooms();
      ack?.({ ok: true, roomCode: room.state.roomCode, state: room.state });
    }
  );

  socket.on(
    'room:quick_bots',
    (
      payload: {
        playerId: string;
        playerName: string;
        token: TokenId;
        botCount?: number;
        gameMode?: GameMode;
      },
      ack?: (res: unknown) => void
    ) => {
      detachCurrentRoom(true);
      const gameMode: GameMode =
        payload.gameMode === 'team2v2' ? 'team2v2' : 'classic';
      const botCount =
        gameMode === 'team2v2'
          ? 3
          : Math.min(3, Math.max(1, Number(payload.botCount) || 3));
      const settings: RoomSettings = {
        roomName:
          gameMode === 'team2v2'
            ? `Альянс 2×2 • ${payload.playerName}`
            : `Битва Магнатів • ${payload.playerName}`,
        gameMode,
        maxPlayers: botCount + 1,
        startingMoney: 15000,
        turnTimeSeconds: 60,
        isPublic: false,
        karpatyBonusEnabled: true,
      };

      const room = createManagedRoom(payload.playerId, settings);
      room.addOrReconnectPlayer(
        payload.playerId,
        payload.playerName,
        payload.token
      );
      for (let i = 0; i < botCount; i++) {
        room.addBot(payload.playerId);
      }

      socket.join(room.state.roomCode);
      socketSessions.set(socket.id, {
        roomCode: room.state.roomCode,
        playerId: payload.playerId,
      });

      room.startGame(payload.playerId);
      ack?.({ ok: true, roomCode: room.state.roomCode, state: room.state });
    }
  );

  socket.on(
    'room:join',
    (
      payload: {
        roomCode: string;
        playerId: string;
        playerName: string;
        token?: TokenId;
        fallbackState?: GameState;
      },
      ack?: (res: unknown) => void
    ) => {
      const code = parseRoomCodeInput(payload.roomCode || '');
      if (!code) {
        ack?.({
          ok: false,
          error: 'Введіть код кімнати (напр. UA-4821) або вставте посилання',
        });
        return;
      }

      let room = rooms.get(code);
      if (
        !room &&
        payload.fallbackState &&
        parseRoomCodeInput(payload.fallbackState.roomCode || '') === code &&
        payload.fallbackState.settings &&
        Array.isArray(payload.fallbackState.players)
      ) {
        room = attachManagedRoom(
          code,
          payload.fallbackState.hostId || payload.playerId,
          payload.fallbackState.settings
        );
        room.restoreFromSnapshot({
          ...payload.fallbackState,
          roomCode: code,
        });
        schedulePersistRoomsSnapshot();
      }

      if (!room) {
        ack?.({
          ok: false,
          error: `Кімнату «${code || payload.roomCode}» не знайдено`,
        });
        return;
      }

      const prev = socketSessions.get(socket.id);
      if (prev && prev.roomCode !== code) {
        detachCurrentRoom(true);
      }

      const res = room.addOrReconnectPlayer(
        payload.playerId,
        payload.playerName,
        payload.token
      );
      if (!res.ok) {
        ack?.(res);
        return;
      }

      clearRoomCleanupTimer(code);
      socket.join(code);
      socketSessions.set(socket.id, {
        roomCode: code,
        playerId: payload.playerId,
      });

      broadcastLobbyRooms();
      schedulePersistRoomsSnapshot();
      ack?.({ ok: true, roomCode: code, state: room.state });
    }
  );

  socket.on('room:leave', (_payload, ack?: (res: unknown) => void) => {
    detachCurrentRoom(true);
    ack?.({ ok: true });
  });

  const getActiveSession = () => {
    const sess = socketSessions.get(socket.id);
    if (!sess) return null;
    const room = rooms.get(sess.roomCode);
    if (!room) return null;
    return { room, playerId: sess.playerId };
  };

  const requireActiveSession = (ack?: (res: unknown) => void) => {
    const ctx = getActiveSession();
    if (!ctx) {
      ack?.({
        ok: false,
        code: 'NO_SESSION',
        error: 'Зв’язок із кімнатою синхронізується...',
      });
      return null;
    }
    return ctx;
  };

  socket.on(
    'game:select_token',
    (payload: { token: TokenId }, ack?: (res: unknown) => void) => {
      const ctx = requireActiveSession(ack);
      if (!ctx) return;
      ctx.room.selectToken(ctx.playerId, payload.token);
      ack?.({ ok: true });
    }
  );

  socket.on(
    'game:update_name',
    (payload: { name: string }, ack?: (res: unknown) => void) => {
      const ctx = requireActiveSession(ack);
      if (!ctx) return;
      const res = ctx.room.updatePlayerName(ctx.playerId, payload.name);
      if (res.ok) {
        broadcastLobbyRooms();
      }
      ack?.(res);
    }
  );

  socket.on(
    'game:add_bot',
    (payload: { teamId?: TeamId } | undefined, ack?: (res: unknown) => void) => {
      const ctx = requireActiveSession(ack);
      if (!ctx) return;
      const preferredTeam =
        payload?.teamId === 'A' || payload?.teamId === 'B'
          ? payload.teamId
          : undefined;
      ack?.(ctx.room.addBot(ctx.playerId, preferredTeam));
    }
  );

  socket.on(
    'game:set_mode',
    (payload: { gameMode: GameMode }, ack?: (res: unknown) => void) => {
      const ctx = requireActiveSession(ack);
      if (!ctx) return;
      const res = ctx.room.setLobbyGameMode(ctx.playerId, payload?.gameMode);
      if (res.ok) {
        broadcastLobbyRooms();
      }
      ack?.(res);
    }
  );

  socket.on(
    'game:set_visibility',
    (payload: { isPublic?: boolean }, ack?: (res: unknown) => void) => {
      const ctx = requireActiveSession(ack);
      if (!ctx) return;
      const res = ctx.room.setLobbyVisibility(ctx.playerId, payload?.isPublic);
      if (res.ok) {
        broadcastLobbyRooms();
      }
      ack?.(res);
    }
  );

  socket.on(
    'game:switch_team',
    (
      payload: { targetId?: string; teamId?: TeamId },
      ack?: (res: unknown) => void
    ) => {
      const ctx = requireActiveSession(ack);
      if (!ctx) return;
      const desiredTeam =
        payload?.teamId === 'A' || payload?.teamId === 'B'
          ? payload.teamId
          : undefined;
      ack?.(
        ctx.room.switchPlayerTeam(ctx.playerId, payload?.targetId, desiredTeam)
      );
    }
  );

  socket.on(
    'game:remove_player',
    (payload: { targetId: string }, ack?: (res: unknown) => void) => {
      const ctx = requireActiveSession(ack);
      if (!ctx) return;
      const isHostRemovingOther =
        ctx.room.state.hostId === ctx.playerId &&
        payload.targetId &&
        payload.targetId !== ctx.playerId;

      if (isHostRemovingOther && ctx.room.state.status === 'lobby') {
        for (const [sockId, sess] of socketSessions.entries()) {
          if (
            sess.roomCode === ctx.room.state.roomCode &&
            sess.playerId === payload.targetId
          ) {
            socketSessions.delete(sockId);
            const targetSock = io.sockets.sockets.get(sockId);
            if (targetSock) {
              targetSock.leave(ctx.room.state.roomCode);
              targetSock.emit('room:kicked', {
                message: 'Власник кімнати вилучив вас зі столу',
              });
            }
          }
        }
      }

      ctx.room.removePlayerFromLobby(ctx.playerId, payload.targetId);
      ack?.({ ok: true });
    }
  );

  socket.on('game:start', (_payload, ack?: (res: unknown) => void) => {
    const ctx = requireActiveSession(ack);
    if (!ctx) return;
    ack?.(ctx.room.startGame(ctx.playerId));
  });

  socket.on('game:restart_lobby', (_payload, ack?: (res: unknown) => void) => {
    const ctx = requireActiveSession(ack);
    if (!ctx) return;
    ctx.room.restartToLobby(ctx.playerId);
    ack?.({ ok: true });
  });

  socket.on('game:roll', (_payload, ack?: (res: unknown) => void) => {
    const ctx = requireActiveSession(ack);
    if (!ctx) return;
    ack?.(ctx.room.rollDice(ctx.playerId));
  });

  socket.on('game:pay_bail', (_payload, ack?: (res: unknown) => void) => {
    const ctx = requireActiveSession(ack);
    if (!ctx) return;
    ack?.(ctx.room.payJailBail(ctx.playerId));
  });

  socket.on('game:use_amnesty', (_payload, ack?: (res: unknown) => void) => {
    const ctx = requireActiveSession(ack);
    if (!ctx) return;
    ack?.(ctx.room.useJailAmnesty(ctx.playerId));
  });

  socket.on('game:buy', (_payload, ack?: (res: unknown) => void) => {
    const ctx = requireActiveSession(ack);
    if (!ctx) return;
    ack?.(ctx.room.buyProperty(ctx.playerId));
  });

  socket.on('game:start_auction', (_payload, ack?: (res: unknown) => void) => {
    const ctx = requireActiveSession(ack);
    if (!ctx) return;
    ack?.(ctx.room.startAuction(ctx.playerId));
  });

  socket.on(
    'game:bid',
    (payload: { increment: number }, ack?: (res: unknown) => void) => {
      const ctx = requireActiveSession(ack);
      if (!ctx) return;
      ack?.(ctx.room.placeAuctionBid(ctx.playerId, payload.increment));
    }
  );

  socket.on('game:pass_auction', (_payload, ack?: (res: unknown) => void) => {
    const ctx = requireActiveSession(ack);
    if (!ctx) return;
    ctx.room.passAuction(ctx.playerId);
    ack?.({ ok: true });
  });

  socket.on(
    'game:build_branch',
    (payload: { cellIndex: number }, ack?: (res: unknown) => void) => {
      const ctx = requireActiveSession(ack);
      if (!ctx) return;
      ack?.(ctx.room.buildBranch(ctx.playerId, payload.cellIndex));
    }
  );

  socket.on(
    'game:sell_branch',
    (payload: { cellIndex: number }, ack?: (res: unknown) => void) => {
      const ctx = requireActiveSession(ack);
      if (!ctx) return;
      ack?.(ctx.room.sellBranch(ctx.playerId, payload.cellIndex));
    }
  );

  socket.on(
    'game:mortgage',
    (payload: { cellIndex: number }, ack?: (res: unknown) => void) => {
      const ctx = requireActiveSession(ack);
      if (!ctx) return;
      ack?.(ctx.room.mortgageProperty(ctx.playerId, payload.cellIndex));
    }
  );

  socket.on(
    'game:unmortgage',
    (payload: { cellIndex: number }, ack?: (res: unknown) => void) => {
      const ctx = requireActiveSession(ack);
      if (!ctx) return;
      ack?.(ctx.room.unmortgageProperty(ctx.playerId, payload.cellIndex));
    }
  );

  socket.on('game:pay_debt', (_payload, ack?: (res: unknown) => void) => {
    const ctx = requireActiveSession(ack);
    if (!ctx) return;
    ack?.(ctx.room.payDebt(ctx.playerId));
  });

  socket.on('game:auto_liquidate', (_payload, ack?: (res: unknown) => void) => {
    const ctx = requireActiveSession(ack);
    if (!ctx) return;
    ack?.(ctx.room.autoLiquidateDebt(ctx.playerId));
  });

  socket.on('game:bankrupt', (_payload, ack?: (res: unknown) => void) => {
    const ctx = requireActiveSession(ack);
    if (!ctx) return;
    ack?.(ctx.room.declareBankruptcy(ctx.playerId));
  });

  socket.on(
    'game:propose_trade',
    (
      payload: {
        toPlayerId: string;
        offerProperties: number[];
        requestProperties: number[];
        offerMoney: number;
        requestMoney: number;
      },
      ack?: (res: unknown) => void
    ) => {
      const ctx = requireActiveSession(ack);
      if (!ctx) return;
      ack?.(ctx.room.proposeTrade(ctx.playerId, payload));
    }
  );

  socket.on(
    'game:respond_trade',
    (payload: { accept: boolean }, ack?: (res: unknown) => void) => {
      const ctx = requireActiveSession(ack);
      if (!ctx) return;
      ack?.(ctx.room.respondTrade(ctx.playerId, payload.accept));
    }
  );

  socket.on('game:end_turn', (_payload, ack?: (res: unknown) => void) => {
    const ctx = requireActiveSession(ack);
    if (!ctx) return;
    ack?.(ctx.room.endTurn(ctx.playerId));
  });

  socket.on(
    'game:chat',
    (
      payload: { text: string; isQuickReaction?: boolean },
      ack?: (res: unknown) => void
    ) => {
      const ctx = requireActiveSession(ack);
      if (!ctx) return;
      ctx.room.sendChat(
        ctx.playerId,
        payload.text,
        Boolean(payload.isQuickReaction)
      );
      ack?.({ ok: true });
    }
  );

  socket.on('disconnect', () => {
    detachCurrentRoom(false);
  });
});

const handleGracefulShutdown = () => {
  persistRoomsSnapshotSync();
  process.exit(0);
};
process.once('SIGINT', handleGracefulShutdown);
process.once('SIGTERM', handleGracefulShutdown);

if (isProd) {
  const distPath = path.resolve(__dirname, '../dist');
  app.use(express.static(distPath));
  app.use((_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

httpServer.listen(PORT, '0.0.0.0', () => {
  const lanIps = getLocalLanIps();
  const lanHint = lanIps[0] ? ` • Wi-Fi LAN: http://${lanIps[0]}:${PORT}` : '';
  console.log(
    `🇺🇦 КАБЗДА.UA Сервер запущено на http://localhost:${PORT}${lanHint} (${isProd ? 'production' : 'development'})`
  );
});
