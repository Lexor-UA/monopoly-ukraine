import { DataConnection, Peer } from 'peerjs';
import { io, Socket } from 'socket.io-client';
import { MAX_GAME_PLAYERS, parseRoomCodeInput } from '../shared/boardData';
import { GameRoom } from '../shared/gameRoom';
import {
  GameMode,
  GameState,
  RoomSettings,
  RoomSummary,
  TeamId,
  TokenId,
} from '../shared/types';

export type TransportMode = 'connecting' | 'server' | 'cloud' | 'p2p';

interface HybridClientOptions {
  playerId: string;
  onConnect: (mode: 'server' | 'cloud' | 'p2p', lanIp: string | null) => void;
  onDisconnect: () => void;
  onRooms: (rooms: RoomSummary[]) => void;
  onState: (state: GameState) => void;
  onRoomExit?: (reason: string) => void;
}

interface P2PRequestMessage {
  type: 'req';
  reqId: string;
  event: string;
  payload: Record<string, unknown>;
}

interface P2PAckMessage {
  type: 'ack';
  reqId: string;
  res: Record<string, unknown>;
}

interface P2PStateEventMessage {
  type: 'event';
  event: 'room:state';
  data: GameState;
}

interface P2PRoomExitEventMessage {
  type: 'event';
  event: 'room:kicked' | 'room:closed';
  message: string;
}

type P2PEventMessage = P2PStateEventMessage | P2PRoomExitEventMessage;

type P2PWireMessage = P2PRequestMessage | P2PAckMessage | P2PEventMessage;

type LocalRoomBroadcastMsg =
  | { type: 'query' }
  | { type: 'announce'; room: RoomSummary }
  | { type: 'withdraw'; roomCode: string };

const HOST_SNAPSHOT_KEY = 'magnat_p2p_host_snapshot';
const PEER_PREFIX = 'magnat-ua-v1-';
const LOCAL_ROOMS_CHANNEL = 'magnat_ua_p2p_rooms_v1';

const PEER_ICE_CONFIG = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  },
};

function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function randomFourDigits(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export class HybridGameClient {
  private opts: HybridClientOptions;
  private destroyed = false;
  public mode: TransportMode = 'connecting';
  private readyResolve!: () => void;
  private readyPromise: Promise<void>;
  private isReady = false;

  // Server Socket.IO state
  private socket: Socket | null = null;

  // Cloud Database (Netlify Postgres / Functions) state
  private cloudActiveRoomCode: string | null = null;
  private cloudPlayerName = 'Магнат України';
  private cloudPlayerToken: TokenId = 'tryzub';
  private cloudSyncTimer: ReturnType<typeof setInterval> | null = null;
  private cloudLobbyTimer: ReturnType<typeof setInterval> | null = null;
  private cloudSyncInFlight = false;
  private cloudMutationSeq = 0;
  private cloudRoomVersion = 0;
  private visibilityListener: (() => void) | null = null;

  // P2P / In-Browser Engine state
  private hostRoom: GameRoom | null = null;
  private hostPeer: Peer | null = null;
  private hostPeerReconnecting = false;
  private hostSignalingTimer: ReturnType<typeof setInterval> | null = null;
  private guestConnections = new Map<DataConnection, string>();
  private lastAnnouncedRoomCode: string | null = null;
  private localRoomsChannel: BroadcastChannel | null = null;
  private discoveredLocalRooms = new Map<string, RoomSummary>();

  private guestPeer: Peer | null = null;
  private guestConn: DataConnection | null = null;
  private guestActiveRoomCode: string | null = null;
  private guestJoinCredentials: {
    roomCode: string;
    playerId: string;
    playerName: string;
    token?: TokenId;
  } | null = null;
  private guestExplicitLeft = false;
  private guestReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private guestReconnectAttempts = 0;
  private pendingAcks = new Map<
    string,
    {
      resolve: (res: Record<string, unknown>) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(opts: HybridClientOptions) {
    this.opts = opts;
    this.readyPromise = new Promise<void>((resolve) => {
      this.readyResolve = resolve;
    });
    void this.initialize();
  }

  private markReady(): void {
    if (!this.isReady) {
      this.isReady = true;
      this.readyResolve();
    }
  }

  private async initialize(): Promise<void> {
    const serverHealth = await this.probeNodeBackend();
    if (this.destroyed) return;

    if (serverHealth.available && serverHealth.backendMode === 'cloud') {
      this.bootCloudDatabaseMode();
    } else if (serverHealth.available) {
      this.bootSocketServerMode(serverHealth.lanIp);
    } else {
      this.bootServerlessP2PMode();
    }
  }

  private async probeNodeBackend(): Promise<{
    available: boolean;
    backendMode: 'server' | 'cloud' | null;
    lanIp: string | null;
  }> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (this.destroyed) break;
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 5000);
      try {
        const res = await fetch('/api/health', {
          signal: ctrl.signal,
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        clearTimeout(timeout);
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const data = (await res.json()) as {
              ok?: boolean;
              mode?: string;
              lanIps?: string[];
            };
            if (data?.ok === true) {
              return {
                available: true,
                backendMode: data.mode === 'netlify-db' ? 'cloud' : 'server',
                lanIp:
                  data.lanIps && data.lanIps.length > 0 ? data.lanIps[0] : null,
              };
            }
          } else {
            // Static SPA fallback (HTML returned for /api/health) -> no backend
            return { available: false, backendMode: null, lanIp: null };
          }
        }
      } catch {
        clearTimeout(timeout);
      }
      if (attempt < 2 && !this.destroyed) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    return { available: false, backendMode: null, lanIp: null };
  }

  private bootCloudDatabaseMode(): void {
    const alreadyCloud = this.mode === 'cloud';
    this.mode = 'cloud';
    this.markReady();
    if (!alreadyCloud) {
      this.opts.onConnect('cloud', null);
    }

    if (!this.cloudSyncTimer) {
      // Poll active room every 1000ms for real-time state, timers, and AI bot steps
      this.cloudSyncTimer = setInterval(() => {
        if (!this.destroyed && this.cloudActiveRoomCode) {
          void this.pollCloudRoom();
        }
      }, 1000);
    }

    if (!this.cloudLobbyTimer) {
      // Refresh public lobby list when on home screen
      this.cloudLobbyTimer = setInterval(() => {
        if (!this.destroyed && !this.cloudActiveRoomCode) {
          void this.fetchCloudLobbyRooms();
        }
      }, 4500);
    }

    if (typeof document !== 'undefined') {
      if (this.visibilityListener) {
        document.removeEventListener('visibilitychange', this.visibilityListener);
        window.removeEventListener('online', this.visibilityListener);
        window.removeEventListener('focus', this.visibilityListener);
      }
      const onWake = () => {
        if (this.destroyed || document.visibilityState === 'hidden') return;
        if (this.cloudActiveRoomCode) {
          void this.pollCloudRoom();
        } else {
          void this.fetchCloudLobbyRooms();
        }
      };
      this.visibilityListener = onWake;
      document.addEventListener('visibilitychange', onWake);
      window.addEventListener('online', onWake);
      window.addEventListener('focus', onWake);
    }

    void this.fetchCloudLobbyRooms();
  }

  private async fetchCloudLobbyRooms(): Promise<void> {
    try {
      const res = await fetch('/api/cloud-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'lobby:list',
          playerId: this.opts.playerId,
        }),
      });
      if (!res.ok || this.destroyed) return;
      const data = (await res.json()) as {
        ok?: boolean;
        rooms?: RoomSummary[];
      };
      if (data?.ok && Array.isArray(data.rooms)) {
        this.opts.onRooms(data.rooms);
      }
    } catch {
      // Ignore transient network hiccup
    }
  }

  private async pollCloudRoom(): Promise<void> {
    if (this.cloudSyncInFlight || !this.cloudActiveRoomCode || this.destroyed) {
      return;
    }
    this.cloudSyncInFlight = true;
    const targetCode = this.cloudActiveRoomCode;
    const seqAtStart = this.cloudMutationSeq;
    try {
      const sendSync = async (withFallback: boolean) => {
        const savedSnap = withFallback ? this.loadHostSnapshot() : null;
        const fallbackState =
          savedSnap && savedSnap.roomCode === targetCode
            ? savedSnap
            : undefined;
        return fetch('/api/cloud-room', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'room:sync',
            roomCode: targetCode,
            playerId: this.opts.playerId,
            playerName: this.cloudPlayerName,
            token: this.cloudPlayerToken,
            knownVersion: this.cloudRoomVersion,
            fallbackState,
          }),
        });
      };

      let res = await sendSync(false);
      if (!res.ok || this.destroyed || this.cloudActiveRoomCode !== targetCode) {
        return;
      }
      let data = (await res.json()) as {
        ok?: boolean;
        unchanged?: boolean;
        code?: string;
        kicked?: boolean;
        error?: string;
        version?: number;
        state?: GameState;
      };
      if (
        data?.code === 'NEED_FALLBACK_STATE' &&
        !this.destroyed &&
        this.cloudActiveRoomCode === targetCode
      ) {
        res = await sendSync(true);
        if (
          !res.ok ||
          this.destroyed ||
          this.cloudActiveRoomCode !== targetCode
        ) {
          return;
        }
        data = await res.json();
      }

      if (this.destroyed || this.cloudActiveRoomCode !== targetCode) {
        return;
      }
      if (data?.kicked) {
        this.cloudActiveRoomCode = null;
        this.cloudRoomVersion = 0;
        this.clearHostSnapshot();
        this.opts.onRoomExit?.(
          data.error || 'Власник кімнати вилучив вас зі столу'
        );
        return;
      }
      // If a user action started or completed while this poll was in flight, discard stale poll
      if (this.cloudMutationSeq !== seqAtStart) {
        return;
      }
      if (
        typeof data?.version === 'number' &&
        data.version < this.cloudRoomVersion
      ) {
        return;
      }
      if (data?.unchanged) {
        return;
      }
      if (data?.ok && data.state) {
        if (typeof data.version === 'number') {
          this.cloudRoomVersion = data.version;
        }
        const wasRemovedFromLobby =
          data.state.status === 'lobby' &&
          !data.state.players.some((p) => p.id === this.opts.playerId);
        if (wasRemovedFromLobby) {
          this.cloudActiveRoomCode = null;
          this.cloudRoomVersion = 0;
          this.clearHostSnapshot();
          this.opts.onRoomExit?.('Власник кімнати вилучив вас зі столу');
          return;
        }
        this.saveStateSnapshot(data.state);
        this.opts.onState(data.state);
      }
    } catch {
      // Ignore transient offline hiccup; next poll or wake event will sync
    } finally {
      this.cloudSyncInFlight = false;
    }
  }

  private async handleCloudEmit(
    event: string,
    payload: Record<string, unknown>,
    ack?: (res: Record<string, unknown>) => void
  ): Promise<void> {
    if (typeof payload.playerName === 'string' && payload.playerName.trim()) {
      this.cloudPlayerName = payload.playerName.trim();
    } else if (typeof payload.name === 'string' && payload.name.trim()) {
      this.cloudPlayerName = payload.name.trim();
    }
    if (typeof payload.token === 'string' && payload.token) {
      this.cloudPlayerToken = payload.token as TokenId;
    }

    if (event === 'lobby:list') {
      await this.fetchCloudLobbyRooms();
      ack?.({ ok: true });
      return;
    }

    this.cloudMutationSeq += 1;

    if (event === 'room:leave') {
      const codeToLeave = this.cloudActiveRoomCode;
      this.cloudActiveRoomCode = null;
      this.cloudRoomVersion = 0;
      this.clearHostSnapshot();
      try {
        if (codeToLeave) {
          await fetch('/api/cloud-room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'room:leave',
              roomCode: codeToLeave,
              playerId: this.opts.playerId,
            }),
          });
        }
      } catch {
        // Ignore
      }
      ack?.({ ok: true });
      void this.fetchCloudLobbyRooms();
      return;
    }

    const requestedRoomCode =
      event === 'room:join'
        ? parseRoomCodeInput(String(payload.roomCode || ''))
        : this.cloudActiveRoomCode;
    let includeFallback = event === 'room:join';

    let lastNetworkError = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (this.destroyed) return;
      try {
        const savedSnap = includeFallback ? this.loadHostSnapshot() : null;
        const fallbackState = includeFallback
          ? ((payload.fallbackState as GameState | undefined) ??
            (savedSnap &&
            requestedRoomCode &&
            savedSnap.roomCode === requestedRoomCode
              ? savedSnap
              : undefined))
          : undefined;
        const { fallbackState: _omitFallback, ...cleanPayload } = payload;
        const res = await fetch('/api/cloud-room', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...cleanPayload,
            action: event,
            roomCode: requestedRoomCode,
            playerId: String(payload.playerId || this.opts.playerId),
            playerName: this.cloudPlayerName,
            token: (payload.token as TokenId) || this.cloudPlayerToken,
            fallbackState,
          }),
        });
        if (!res.ok && res.status >= 502 && attempt < 3) {
          await new Promise((r) => setTimeout(r, 550 * attempt));
          continue;
        }
        const data = (await res.json()) as Record<string, unknown> & {
          ok?: boolean;
          code?: string;
          version?: number;
          state?: GameState;
          rooms?: RoomSummary[];
          error?: string;
        };

        if (
          data?.code === 'NEED_FALLBACK_STATE' &&
          !includeFallback &&
          attempt < 3
        ) {
          includeFallback = true;
          continue;
        }

        if (data?.rooms && Array.isArray(data.rooms)) {
          this.opts.onRooms(data.rooms);
        }

        if (data?.ok && data.state) {
          if (this.cloudActiveRoomCode !== data.state.roomCode) {
            this.cloudRoomVersion = 0;
          }
          this.cloudActiveRoomCode = data.state.roomCode;
          if (typeof data.version === 'number') {
            this.cloudRoomVersion = Math.max(
              this.cloudRoomVersion,
              data.version
            );
          }
          this.saveStateSnapshot(data.state);
          this.opts.onState(data.state);
          ack?.(data);
          return;
        }

        // Cross-transport bridge: if room was created on P2P by another device, try P2P join automatically!
        if (
          event === 'room:join' &&
          requestedRoomCode &&
          data?.ok === false &&
          typeof data.error === 'string' &&
          data.error.includes('не знайдено')
        ) {
          const p2pJoin = await this.connectGuestToHost(
            requestedRoomCode,
            String(payload.playerId || this.opts.playerId),
            this.cloudPlayerName,
            (payload.token as TokenId) || this.cloudPlayerToken
          );
          if (p2pJoin?.ok && p2pJoin.state) {
            if (this.cloudSyncTimer) {
              clearInterval(this.cloudSyncTimer);
              this.cloudSyncTimer = null;
            }
            if (this.cloudLobbyTimer) {
              clearInterval(this.cloudLobbyTimer);
              this.cloudLobbyTimer = null;
            }
            this.guestExplicitLeft = false;
            this.guestActiveRoomCode = requestedRoomCode;
            this.guestJoinCredentials = {
              roomCode: requestedRoomCode,
              playerId: String(payload.playerId || this.opts.playerId),
              playerName: this.cloudPlayerName,
              token: (payload.token as TokenId) || this.cloudPlayerToken,
            };
            this.bootServerlessP2PMode();
            this.opts.onState(p2pJoin.state as GameState);
            ack?.(p2pJoin);
            return;
          }
        }

        ack?.(data);
        return;
      } catch {
        lastNetworkError = true;
        if (attempt < 3 && !this.destroyed) {
          await new Promise((r) => setTimeout(r, 550 * attempt));
        }
      }
    }

    if (lastNetworkError) {
      // Fallback: if player has a local snapshot of this room and network is momentarily unreachable
      const localSnap = this.loadHostSnapshot();
      const localFallback =
        localSnap &&
        requestedRoomCode &&
        localSnap.roomCode === requestedRoomCode
          ? localSnap
          : undefined;
      if (event === 'room:join' && localFallback) {
        this.cloudActiveRoomCode = localFallback.roomCode;
        this.opts.onState(localFallback);
        ack?.({
          ok: true,
          roomCode: localFallback.roomCode,
          state: localFallback,
        });
        return;
      }
      ack?.({
        ok: false,
        error: 'Тимчасова помилка мережі. Спробуйте ще раз за секунду.',
      });
    }
  }

  private bootSocketServerMode(initialLanIp: string | null): void {
    this.mode = 'server';
    let currentLanIp = initialLanIp;

    const socket = io({
      transports: ['websocket', 'polling'],
    });
    this.socket = socket;

    socket.on('connect', () => {
      if (this.destroyed) return;
      this.markReady();
      this.opts.onConnect('server', currentLanIp);
    });

    socket.on('disconnect', () => {
      if (!this.destroyed) {
        this.opts.onDisconnect();
      }
    });

    socket.on('lobby:rooms', (rooms: RoomSummary[]) => {
      if (!this.destroyed) {
        this.opts.onRooms(rooms);
      }
    });

    socket.on('room:state', (nextState: GameState) => {
      if (!this.destroyed) {
        this.saveStateSnapshot(nextState);
        this.opts.onState(nextState);
      }
    });

    socket.on('room:kicked', (payload?: { message?: string }) => {
      if (!this.destroyed) {
        this.clearHostSnapshot();
        this.opts.onRoomExit?.(
          payload?.message || 'Власник кімнати вилучив вас зі столу'
        );
      }
    });
  }

  private bootServerlessP2PMode(): void {
    this.mode = 'p2p';
    this.setupLocalRoomsDiscoveryChannel();
    this.setupP2PVisibilityRecovery();
    if (!this.hostSignalingTimer) {
      this.hostSignalingTimer = setInterval(() => {
        if (!this.destroyed) {
          this.ensureHostPeerAlive();
        }
      }, 6000);
    }
    this.markReady();
    this.emitMergedLocalPublicRooms();
    this.opts.onConnect('p2p', null);
  }

  private ensureHostPeerAlive(): void {
    if (
      !this.hostRoom ||
      this.destroyed ||
      this.hostPeerReconnecting
    ) {
      return;
    }
    if (
      this.hostPeer &&
      !this.hostPeer.destroyed &&
      !this.hostPeer.disconnected
    ) {
      return;
    }
    if (
      this.hostPeer &&
      this.hostPeer.disconnected &&
      !this.hostPeer.destroyed
    ) {
      try {
        this.hostPeer.reconnect();
        return;
      } catch {
        // Fall through to full re-open
      }
    }
    const room = this.hostRoom;
    const code = room.state.roomCode;
    this.hostPeerReconnecting = true;
    this.openHostPeerWithRetry(code, 8)
      .then(({ peer }) => {
        this.hostPeerReconnecting = false;
        if (this.destroyed || this.hostRoom !== room) {
          peer.destroy();
          return;
        }
        this.hostPeer = peer;
        this.bindIncomingHostConnections(peer, room);
      })
      .catch(() => {
        this.hostPeerReconnecting = false;
      });
  }

  private setupP2PVisibilityRecovery(): void {
    if (typeof document === 'undefined' || this.visibilityListener) return;
    const onWake = () => {
      if (this.destroyed || document.visibilityState === 'hidden') return;
      // If host switched to WhatsApp on mobile and PeerJS dropped in background, re-register host peer automatically!
      if (
        this.hostRoom &&
        (!this.hostPeer || this.hostPeer.destroyed || this.hostPeer.disconnected) &&
        !this.hostPeerReconnecting
      ) {
        if (this.hostPeer && this.hostPeer.disconnected && !this.hostPeer.destroyed) {
          try {
            this.hostPeer.reconnect();
            return;
          } catch {
            // Fall through to full re-open
          }
        }
        const room = this.hostRoom;
        const code = room.state.roomCode;
        this.hostPeerReconnecting = true;
        this.openHostPeerWithRetry(code, 8)
          .then(({ peer }) => {
            this.hostPeerReconnecting = false;
            if (this.destroyed || this.hostRoom !== room) {
              peer.destroy();
              return;
            }
            this.hostPeer = peer;
            this.bindIncomingHostConnections(peer, room);
          })
          .catch(() => {
            this.hostPeerReconnecting = false;
          });
      } else if (
        this.guestActiveRoomCode &&
        (!this.guestConn || !this.guestConn.open) &&
        !this.guestExplicitLeft
      ) {
        this.scheduleGuestAutoReconnect();
      }
    };
    const onUnload = () => {
      // Immediately release PeerJS broker ID on F5 / pull-to-refresh so the reloaded page can reclaim the exact same UA-XXXX code
      if (this.hostPeer && !this.hostPeer.destroyed) {
        try {
          this.hostPeer.destroy();
        } catch {
          // Ignore
        }
      }
      if (this.guestPeer && !this.guestPeer.destroyed) {
        try {
          this.guestPeer.destroy();
        } catch {
          // Ignore
        }
      }
    };
    this.visibilityListener = onWake;
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('online', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('beforeunload', onUnload);
  }

  private setupLocalRoomsDiscoveryChannel(): void {
    if (typeof BroadcastChannel === 'undefined' || this.localRoomsChannel) {
      return;
    }
    try {
      const ch = new BroadcastChannel(LOCAL_ROOMS_CHANNEL);
      this.localRoomsChannel = ch;
      ch.onmessage = (ev: MessageEvent<LocalRoomBroadcastMsg>) => {
        if (this.destroyed || !ev.data) return;
        const msg = ev.data;
        if (msg.type === 'query') {
          if (
            this.hostRoom &&
            this.hostRoom.state.settings.isPublic &&
            this.hostRoom.state.status === 'lobby' &&
            this.hostRoom.state.players.length > 0
          ) {
            ch.postMessage({
              type: 'announce',
              room: this.hostRoom.getSummary(),
            } satisfies LocalRoomBroadcastMsg);
          }
        } else if (msg.type === 'announce' && msg.room?.roomCode) {
          this.discoveredLocalRooms.set(msg.room.roomCode, msg.room);
          this.emitMergedLocalPublicRooms();
        } else if (msg.type === 'withdraw' && msg.roomCode) {
          this.discoveredLocalRooms.delete(msg.roomCode);
          this.emitMergedLocalPublicRooms();
        }
      };
      ch.postMessage({ type: 'query' } satisfies LocalRoomBroadcastMsg);
    } catch {
      // Ignore if BroadcastChannel is restricted
    }
  }

  private emitMergedLocalPublicRooms(): void {
    const map = new Map<string, RoomSummary>(this.discoveredLocalRooms);
    if (
      this.hostRoom &&
      this.hostRoom.state.settings.isPublic &&
      this.hostRoom.state.status === 'lobby' &&
      this.hostRoom.state.players.length > 0
    ) {
      const own = this.hostRoom.getSummary();
      map.set(own.roomCode, own);
    }
    this.opts.onRooms(Array.from(map.values()));
  }

  public emit(
    event: string,
    payload: unknown = {},
    ack?: (res: Record<string, unknown>) => void
  ): void {
    if (this.destroyed) return;

    if (!this.isReady || this.mode === 'connecting') {
      void this.readyPromise.then(() => {
        if (!this.destroyed) {
          this.emit(event, payload, ack);
        }
      });
      return;
    }

    if (this.mode === 'server' && this.socket) {
      if (ack) {
        this.socket.emit(event, payload, ack);
      } else {
        this.socket.emit(event, payload);
      }
      return;
    }

    if (this.mode === 'cloud') {
      void this.handleCloudEmit(
        event,
        (payload ?? {}) as Record<string, unknown>,
        ack
      );
      return;
    }

    if (this.mode === 'p2p') {
      void this.handleP2PEmit(
        event,
        (payload ?? {}) as Record<string, unknown>,
        ack
      );
    }
  }

  // ============================================================================
  // SERVERLESS IN-BROWSER ENGINE + WEBRTC P2P MULTIPLAYER
  // ============================================================================

  private saveStateSnapshot(state: GameState): void {
    const serialized = JSON.stringify(state);
    try {
      window.sessionStorage.setItem(HOST_SNAPSHOT_KEY, serialized);
    } catch {
      // Ignore quota errors
    }
    try {
      window.localStorage.setItem(HOST_SNAPSHOT_KEY, serialized);
    } catch {
      // Ignore quota errors
    }
  }

  private saveHostSnapshot(room: GameRoom): void {
    this.saveStateSnapshot(room.state);
  }

  private clearHostSnapshot(): void {
    try {
      window.sessionStorage.removeItem(HOST_SNAPSHOT_KEY);
    } catch {
      // Ignore
    }
    try {
      window.localStorage.removeItem(HOST_SNAPSHOT_KEY);
    } catch {
      // Ignore
    }
  }

  private loadHostSnapshot(): GameState | null {
    try {
      const raw =
        window.sessionStorage.getItem(HOST_SNAPSHOT_KEY) ||
        window.localStorage.getItem(HOST_SNAPSHOT_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as GameState;
    } catch {
      return null;
    }
  }

  private syncLocalPublicRooms(): void {
    const canAnnounce =
      Boolean(this.hostRoom) &&
      this.hostRoom!.state.settings.isPublic &&
      this.hostRoom!.state.status === 'lobby' &&
      this.hostRoom!.state.players.length > 0;

    if (canAnnounce && this.hostRoom) {
      const summary = this.hostRoom.getSummary();
      this.lastAnnouncedRoomCode = summary.roomCode;
      try {
        this.localRoomsChannel?.postMessage({
          type: 'announce',
          room: summary,
        } satisfies LocalRoomBroadcastMsg);
      } catch {
        // Ignore
      }
    } else if (this.lastAnnouncedRoomCode) {
      const prevCode = this.lastAnnouncedRoomCode;
      this.lastAnnouncedRoomCode = null;
      this.discoveredLocalRooms.delete(prevCode);
      try {
        this.localRoomsChannel?.postMessage({
          type: 'withdraw',
          roomCode: prevCode,
        } satisfies LocalRoomBroadcastMsg);
      } catch {
        // Ignore
      }
    }
    this.emitMergedLocalPublicRooms();
  }

  private broadcastFromHost(room: GameRoom): void {
    if (this.destroyed || this.hostRoom !== room) return;
    const snapshot = cloneState(room.state);
    this.saveHostSnapshot(room);
    this.opts.onState(snapshot);
    this.syncLocalPublicRooms();

    const wireMsg: P2PEventMessage = {
      type: 'event',
      event: 'room:state',
      data: snapshot,
    };
    for (const conn of this.guestConnections.keys()) {
      if (conn.open) {
        try {
          conn.send(wireMsg);
        } catch {
          // Ignore broken pipe; close handler cleans up
        }
      }
    }
  }

  private teardownP2PSession(clearSavedSnapshot = true): void {
    if (this.guestReconnectTimer) {
      clearTimeout(this.guestReconnectTimer);
      this.guestReconnectTimer = null;
    }
    this.guestExplicitLeft = true;
    this.guestActiveRoomCode = null;
    this.guestJoinCredentials = null;
    this.guestReconnectAttempts = 0;

    for (const pending of this.pendingAcks.values()) {
      clearTimeout(pending.timer);
      pending.resolve({ ok: false, error: 'Сесію завершено' });
    }
    this.pendingAcks.clear();

    if (this.guestConn) {
      try {
        this.guestConn.close();
      } catch {
        // Ignore
      }
      this.guestConn = null;
    }
    if (this.guestPeer) {
      try {
        this.guestPeer.destroy();
      } catch {
        // Ignore
      }
      this.guestPeer = null;
    }

    for (const conn of this.guestConnections.keys()) {
      try {
        conn.close();
      } catch {
        // Ignore
      }
    }
    this.guestConnections.clear();

    if (this.hostPeer) {
      try {
        this.hostPeer.destroy();
      } catch {
        // Ignore
      }
      this.hostPeer = null;
    }

    if (this.hostRoom) {
      this.hostRoom.destroy();
      this.hostRoom = null;
    }

    if (clearSavedSnapshot) {
      this.clearHostSnapshot();
    }
    this.syncLocalPublicRooms();
  }

  private dispatchRoomAction(
    room: GameRoom,
    actorId: string,
    event: string,
    payload: Record<string, unknown>
  ): Record<string, unknown> {
    switch (event) {
      case 'game:select_token':
        room.selectToken(actorId, payload.token as TokenId);
        return { ok: true };
      case 'game:update_name': {
        const res = room.updatePlayerName(actorId, String(payload.name || ''));
        this.syncLocalPublicRooms();
        return res;
      }
      case 'game:add_bot': {
        const preferredTeam =
          payload.teamId === 'A' || payload.teamId === 'B'
            ? (payload.teamId as TeamId)
            : undefined;
        return room.addBot(actorId, preferredTeam);
      }
      case 'game:set_mode': {
        const nextMode: GameMode =
          payload.gameMode === 'team2v2' ? 'team2v2' : 'classic';
        const res = room.setLobbyGameMode(actorId, nextMode);
        this.syncLocalPublicRooms();
        return res;
      }
      case 'game:set_visibility': {
        const nextPublic =
          typeof payload.isPublic === 'boolean' ? payload.isPublic : undefined;
        const res = room.setLobbyVisibility(actorId, nextPublic);
        this.syncLocalPublicRooms();
        return res;
      }
      case 'game:switch_team': {
        const targetId = payload.targetId ? String(payload.targetId) : undefined;
        const desiredTeam =
          payload.teamId === 'A' || payload.teamId === 'B'
            ? (payload.teamId as TeamId)
            : undefined;
        return room.switchPlayerTeam(actorId, targetId, desiredTeam);
      }
      case 'game:remove_player': {
        const targetId = String(payload.targetId || '');
        if (
          actorId === room.state.hostId &&
          targetId &&
          targetId !== actorId &&
          room.state.status === 'lobby'
        ) {
          for (const [conn, gId] of this.guestConnections.entries()) {
            if (gId === targetId) {
              this.guestConnections.delete(conn);
              if (conn.open) {
                try {
                  conn.send({
                    type: 'event',
                    event: 'room:kicked',
                    message: 'Власник кімнати вилучив вас зі столу',
                  } satisfies P2PRoomExitEventMessage);
                } catch {
                  // Ignore
                }
              }
              setTimeout(() => {
                try {
                  conn.close();
                } catch {
                  // Ignore
                }
              }, 80);
            }
          }
        }
        room.removePlayerFromLobby(actorId, targetId);
        return { ok: true };
      }
      case 'game:start':
        return room.startGame(actorId);
      case 'game:restart_lobby':
        room.restartToLobby(actorId);
        return { ok: true };
      case 'game:roll':
        return room.rollDice(actorId);
      case 'game:pay_bail':
        return room.payJailBail(actorId);
      case 'game:use_amnesty':
        return room.useJailAmnesty(actorId);
      case 'game:buy':
        return room.buyProperty(actorId);
      case 'game:start_auction':
        return room.startAuction(actorId);
      case 'game:bid':
        return room.placeAuctionBid(actorId, Number(payload.increment) || 0);
      case 'game:pass_auction':
        room.passAuction(actorId);
        return { ok: true };
      case 'game:build_branch':
        return room.buildBranch(actorId, Number(payload.cellIndex));
      case 'game:sell_branch':
        return room.sellBranch(actorId, Number(payload.cellIndex));
      case 'game:mortgage':
        return room.mortgageProperty(actorId, Number(payload.cellIndex));
      case 'game:unmortgage':
        return room.unmortgageProperty(actorId, Number(payload.cellIndex));
      case 'game:pay_debt':
        return room.payDebt(actorId);
      case 'game:auto_liquidate':
        return room.autoLiquidateDebt(actorId);
      case 'game:bankrupt':
        return room.declareBankruptcy(actorId);
      case 'game:propose_trade':
        return room.proposeTrade(actorId, {
          toPlayerId: String(payload.toPlayerId || ''),
          offerProperties: (payload.offerProperties as number[]) || [],
          requestProperties: (payload.requestProperties as number[]) || [],
          offerMoney: Number(payload.offerMoney) || 0,
          requestMoney: Number(payload.requestMoney) || 0,
        });
      case 'game:respond_trade':
        return room.respondTrade(actorId, Boolean(payload.accept));
      case 'game:end_turn':
        return room.endTurn(actorId);
      case 'game:chat':
        room.sendChat(
          actorId,
          String(payload.text || ''),
          Boolean(payload.isQuickReaction)
        );
        return { ok: true };
      default:
        return { ok: false, error: `Невідома дія: ${event}` };
    }
  }

  private bindIncomingHostConnections(peer: Peer, room: GameRoom): void {
    peer.on('disconnected', () => {
      if (this.destroyed || this.hostRoom !== room || this.hostPeer !== peer) {
        return;
      }
      if (!peer.destroyed) {
        try {
          peer.reconnect();
        } catch {
          // Periodic ensureHostPeerAlive will recreate if needed
        }
      }
    });

    peer.on('connection', (conn: DataConnection) => {
      conn.on('data', (raw: unknown) => {
        if (this.destroyed || this.hostRoom !== room) return;
        const msg = raw as P2PWireMessage;
        if (!msg || msg.type !== 'req') return;

        const reply = (res: Record<string, unknown>) => {
          if (conn.open) {
            const ackMsg: P2PAckMessage = {
              type: 'ack',
              reqId: msg.reqId,
              res,
            };
            conn.send(ackMsg);
          }
        };

        if (msg.event === 'room:join') {
          const guestId = String(msg.payload.playerId || '');
          const guestName = String(msg.payload.playerName || 'Гравець');
          const guestToken = msg.payload.token as TokenId | undefined;
          if (!guestId) {
            reply({ ok: false, error: 'Некоректний ідентифікатор гравця' });
            return;
          }

          const joinRes = room.addOrReconnectPlayer(
            guestId,
            guestName,
            guestToken
          );
          if (!joinRes.ok) {
            reply(joinRes);
            return;
          }

          this.guestConnections.set(conn, guestId);
          const snap = cloneState(room.state);
          reply({ ok: true, roomCode: room.state.roomCode, state: snap });
          this.broadcastFromHost(room);
          return;
        }

        let actorId = this.guestConnections.get(conn);
        if (!actorId) {
          // Self-heal guest session if DataChannel dropped/re-bound or had a transient error
          const candidateId = String(msg.payload?.playerId || '').trim();
          const candidateName = String(
            msg.payload?.playerName || 'Магнат України'
          ).trim();
          const candidateToken = msg.payload?.token as TokenId | undefined;
          if (candidateId) {
            const existingPlayer = room.state.players.find(
              (p) => p.id === candidateId
            );
            if (existingPlayer) {
              room.touchPlayer(candidateId, Date.now());
              actorId = candidateId;
              this.guestConnections.set(conn, candidateId);
            } else {
              const rejoin = room.addOrReconnectPlayer(
                candidateId,
                candidateName,
                candidateToken
              );
              if (rejoin.ok) {
                actorId = candidateId;
                this.guestConnections.set(conn, candidateId);
              }
            }
          }
        }
        if (!actorId) {
          reply({
            ok: false,
            code: 'NO_SESSION',
            error: 'З’єднання з кімнатою синхронізується...',
          });
          return;
        }

        if (msg.event === 'room:leave') {
          this.guestConnections.delete(conn);
          const hasOtherConn = Array.from(this.guestConnections.values()).some(
            (id) => id === actorId
          );
          if (room.state.status === 'lobby') {
            room.removePlayerFromLobby(actorId, actorId);
          } else if (room.state.status === 'playing') {
            if (!hasOtherConn) {
              room.handleDisconnect(actorId);
            }
            room.declareBankruptcy(actorId);
          } else if (!hasOtherConn) {
            room.handleDisconnect(actorId);
          }
          reply({ ok: true });
          this.broadcastFromHost(room);
          return;
        }

        if (msg.event.startsWith('game:')) {
          const actionRes = this.dispatchRoomAction(
            room,
            actorId,
            msg.event,
            msg.payload
          );
          reply(actionRes);
        }
      });

      const handleConnClosed = () => {
        const actorId = this.guestConnections.get(conn);
        if (!actorId) return;
        this.guestConnections.delete(conn);
        if (this.destroyed || this.hostRoom !== room) return;
        const stillConnected = Array.from(this.guestConnections.values()).some(
          (id) => id === actorId
        );
        if (!stillConnected) {
          room.handleDisconnect(actorId);
        }
      };

      conn.on('close', handleConnClosed);
      conn.on('error', () => {
        if (!conn.open) {
          handleConnClosed();
        }
      });
    });
  }

  private openHostPeerWithRetry(
    preferredCode?: string,
    maxAttempts = 5
  ): Promise<{ peer: Peer; code: string }> {
    return new Promise((resolve, reject) => {
      let attempt = 0;

      const tryOpen = (candidateCode: string) => {
        attempt += 1;
        let settled = false;
        const peer = new Peer(
          `${PEER_PREFIX}${candidateCode}`,
          PEER_ICE_CONFIG
        );

        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          try {
            peer.destroy();
          } catch {
            // Ignore
          }
          reject(
            new Error(
              'Не вдалося підключитися до хмарного P2P-сигналінгу. Перевірте інтернет.'
            )
          );
        }, 7000);

        peer.on('open', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve({ peer, code: candidateCode });
        });

        peer.on('error', (err: { type?: string; message?: string }) => {
          if (settled) return;
          if (err?.type === 'unavailable-id' && attempt < maxAttempts) {
            settled = true;
            clearTimeout(timeout);
            try {
              peer.destroy();
            } catch {
              // Ignore
            }
            if (preferredCode) {
              // Wait for previous page socket to expire on PeerJS broker and retry the EXACT SAME room code!
              setTimeout(() => {
                if (!this.destroyed) {
                  tryOpen(preferredCode);
                }
              }, 1600);
            } else {
              tryOpen(`UA-${randomFourDigits()}`);
            }
            return;
          }
          settled = true;
          clearTimeout(timeout);
          try {
            peer.destroy();
          } catch {
            // Ignore
          }
          reject(
            new Error(
              'Хмарний мультиплеєр тимчасово недоступний. Перевірте з’єднання з мережею.'
            )
          );
        });
      };

      tryOpen(preferredCode || `UA-${randomFourDigits()}`);
    });
  }

  private async handleP2PEmit(
    event: string,
    payload: Record<string, unknown>,
    ack?: (res: Record<string, unknown>) => void
  ): Promise<void> {
    if (event === 'lobby:list') {
      this.syncLocalPublicRooms();
      ack?.({ ok: true });
      return;
    }

    // 1. QUICK GAME WITH AI BOTS (Works 100% offline in browser + background P2P invite link!)
    if (event === 'room:quick_bots') {
      this.teardownP2PSession(true);
      const code = `UA-${randomFourDigits()}`;
      const playerId = String(payload.playerId || this.opts.playerId);
      const playerName = String(payload.playerName || 'Магнат України');
      const token = (payload.token as TokenId) || 'tryzub';
      const gameMode: GameMode =
        payload.gameMode === 'team2v2' ? 'team2v2' : 'classic';
      const botCount =
        gameMode === 'team2v2'
          ? 3
          : Math.min(3, Math.max(1, Number(payload.botCount) || 3));

      const settings: RoomSettings = {
        roomName:
          gameMode === 'team2v2'
            ? `Альянс 2×2 • ${playerName}`
            : `Битва Магнатів • ${playerName}`,
        gameMode,
        maxPlayers: botCount + 1,
        startingMoney: 15000,
        turnTimeSeconds: 60,
        isPublic: false,
        karpatyBonusEnabled: true,
      };

      const room = new GameRoom(code, playerId, settings, (updated) => {
        this.broadcastFromHost(updated);
      });
      this.hostRoom = room;
      room.addOrReconnectPlayer(playerId, playerName, token);
      for (let i = 0; i < botCount; i++) {
        room.addBot(playerId);
      }
      room.startGame(playerId);
      this.saveHostSnapshot(room);

      // Best-effort background P2P registration in case host rematches to lobby and shares code
      this.openHostPeerWithRetry(code, 1)
        .then(({ peer }) => {
          if (this.destroyed || this.hostRoom !== room) {
            peer.destroy();
            return;
          }
          this.hostPeer = peer;
          this.bindIncomingHostConnections(peer, room);
        })
        .catch(() => {
          // Offline mode is completely fine for AI match
        });

      ack?.({ ok: true, roomCode: code, state: cloneState(room.state) });
      return;
    }

    // 2. CREATE ONLINE MULTIPLAYER ROOM (Upgrade to Cloud DB if reachable, else WebRTC P2P Host)
    if (event === 'room:create') {
      const health = await this.probeNodeBackend();
      if (!this.destroyed && health.available && health.backendMode === 'cloud') {
        this.teardownP2PSession(true);
        this.bootCloudDatabaseMode();
        await this.handleCloudEmit(event, payload, ack);
        return;
      }

      this.teardownP2PSession(true);
      const playerId = String(payload.playerId || this.opts.playerId);
      const playerName = String(payload.playerName || 'Магнат України');
      const token = (payload.token as TokenId) || 'tryzub';
      const rawSettings = (payload.settings || {}) as Partial<RoomSettings>;
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
            ? MAX_GAME_PLAYERS
            : Math.min(
                MAX_GAME_PLAYERS,
                Math.max(2, Number(rawSettings.maxPlayers) || MAX_GAME_PLAYERS)
              ),
        startingMoney: Number(rawSettings.startingMoney) || 15000,
        turnTimeSeconds: Number(rawSettings.turnTimeSeconds) || 60,
        isPublic: rawSettings.isPublic ?? true,
        karpatyBonusEnabled: rawSettings.karpatyBonusEnabled ?? true,
      };

      try {
        const { peer, code } = await this.openHostPeerWithRetry();
        if (this.destroyed) {
          peer.destroy();
          return;
        }
        const room = new GameRoom(code, playerId, settings, (updated) => {
          this.broadcastFromHost(updated);
        });
        this.hostRoom = room;
        this.hostPeer = peer;
        this.bindIncomingHostConnections(peer, room);

        room.addOrReconnectPlayer(playerId, playerName, token);
        this.saveHostSnapshot(room);
        this.syncLocalPublicRooms();

        ack?.({ ok: true, roomCode: code, state: cloneState(room.state) });
      } catch (err) {
        ack?.({
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Не вдалося створити онлайн-кімнату',
        });
      }
      return;
    }

    // 3. JOIN ROOM (Host F5 Recovery OR Guest WebRTC DataChannel)
    if (event === 'room:join') {
      const code = parseRoomCodeInput(String(payload.roomCode || ''));
      const playerId = String(payload.playerId || this.opts.playerId);
      const playerName = String(payload.playerName || 'Магнат України');
      const token = payload.token as TokenId | undefined;

      if (!code) {
        ack?.({
          ok: false,
          error: 'Введіть код кімнати (напр. UA-4821) або вставте посилання',
        });
        return;
      }

      // Case 3A: Already hosting this room in memory
      if (this.hostRoom && this.hostRoom.state.roomCode === code) {
        const res = this.hostRoom.addOrReconnectPlayer(
          playerId,
          playerName,
          token
        );
        if (!res.ok) {
          ack?.(res);
          return;
        }
        ack?.({
          ok: true,
          roomCode: code,
          state: cloneState(this.hostRoom.state),
        });
        return;
      }

      // Case 3B: Host refreshed browser tab — restore room from sessionStorage / localStorage!
      const savedSnapshot = this.loadHostSnapshot();
      const normalizedPlayerName = playerName.trim().toLowerCase();
      const hostPlayerInSnap = savedSnapshot?.players.find(
        (p) => p.id === savedSnapshot.hostId
      );
      if (
        savedSnapshot &&
        savedSnapshot.roomCode === code &&
        (savedSnapshot.hostId === playerId ||
          Boolean(
            hostPlayerInSnap &&
              normalizedPlayerName &&
              hostPlayerInSnap.name.trim().toLowerCase() === normalizedPlayerName
          ))
      ) {
        this.teardownP2PSession(false);
        const room = new GameRoom(
          code,
          playerId,
          savedSnapshot.settings,
          (updated) => {
            this.broadcastFromHost(updated);
          }
        );
        room.restoreFromSnapshot(savedSnapshot);
        this.hostRoom = room;
        room.addOrReconnectPlayer(playerId, playerName, token);
        this.saveHostSnapshot(room);
        this.syncLocalPublicRooms();

        this.openHostPeerWithRetry(code, 8)
          .then(({ peer }) => {
            if (this.destroyed || this.hostRoom !== room) {
              peer.destroy();
              return;
            }
            this.hostPeer = peer;
            this.bindIncomingHostConnections(peer, room);
          })
          .catch(() => {});

        ack?.({ ok: true, roomCode: code, state: cloneState(room.state) });
        return;
      }

      // Case 3C: Check if room exists in Cloud Database first (in case host created room in Cloud mode while this client cold-started into P2P!)
      try {
        const cloudCheckCtrl = new AbortController();
        const cloudCheckTimer = setTimeout(() => cloudCheckCtrl.abort(), 3500);
        const cloudRes = await fetch('/api/cloud-room', {
          method: 'POST',
          signal: cloudCheckCtrl.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'room:join',
            roomCode: code,
            playerId,
            playerName,
            token: token || this.cloudPlayerToken,
          }),
        });
        clearTimeout(cloudCheckTimer);
        if (cloudRes.ok && !this.destroyed) {
          const cloudData = (await cloudRes.json()) as Record<string, unknown> & {
            ok?: boolean;
            version?: number;
            state?: GameState;
          };
          if (cloudData?.ok && cloudData.state) {
            this.teardownP2PSession(true);
            this.cloudPlayerName = playerName;
            if (token) this.cloudPlayerToken = token;
            this.cloudActiveRoomCode = cloudData.state.roomCode;
            this.cloudRoomVersion =
              typeof cloudData.version === 'number' ? cloudData.version : 1;
            this.bootCloudDatabaseMode();
            this.saveStateSnapshot(cloudData.state);
            this.opts.onState(cloudData.state);
            ack?.(cloudData);
            return;
          }
        }
      } catch {
        // Cloud endpoint unavailable; proceed with WebRTC P2P join
      }

      // Guest joining remote Host over WebRTC P2P (with 3-attempt retry if host tab is waking from WhatsApp)
      this.teardownP2PSession(true);
      this.guestExplicitLeft = false;
      this.guestActiveRoomCode = code;
      this.guestJoinCredentials = {
        roomCode: code,
        playerId,
        playerName,
        token,
      };

      let joinRes: Record<string, unknown> = {
        ok: false,
        error: `Не вдалося підключитися до кімнати «${code}»`,
      };
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (this.destroyed || this.guestExplicitLeft) break;
        joinRes = await this.connectGuestToHost(
          code,
          playerId,
          playerName,
          token
        );
        if (joinRes?.ok) break;
        if (attempt < 3) {
          if (this.guestPeer) {
            try {
              this.guestPeer.destroy();
            } catch {
              // Ignore
            }
            this.guestPeer = null;
          }
          await new Promise((r) => setTimeout(r, 1400));
        }
      }
      ack?.(joinRes);
      return;
    }

    // 4. LEAVE ROOM
    if (event === 'room:leave') {
      if (this.hostRoom && this.guestConnections.size > 0) {
        for (const conn of this.guestConnections.keys()) {
          if (conn.open) {
            try {
              conn.send({
                type: 'event',
                event: 'room:closed',
                message: 'Власник кімнати закрив ігровий стіл',
              } satisfies P2PRoomExitEventMessage);
            } catch {
              // Ignore
            }
          }
        }
        await new Promise((r) => setTimeout(r, 80));
      } else if (this.guestConn && this.guestConn.open) {
        this.guestExplicitLeft = true;
        await this.sendGuestRequest('room:leave', {}, 1200).catch(() => {});
      }
      this.teardownP2PSession(true);
      ack?.({ ok: true });
      return;
    }

    // 5. IN-ROOM GAMEPLAY EVENTS (game:*)
    if (event.startsWith('game:')) {
      if (this.hostRoom) {
        const res = this.dispatchRoomAction(
          this.hostRoom,
          this.opts.playerId,
          event,
          payload
        );
        ack?.(res);
        return;
      }

      if (this.guestConn && this.guestConn.open) {
        try {
          const res = await this.sendGuestRequest(event, payload, 5500);
          ack?.(res);
          return;
        } catch {
          // Connection stalled or dropped mid-request — fall through to immediate auto-reconnect & retry below!
        }
      }

      if (
        !this.destroyed &&
        !this.guestExplicitLeft &&
        this.guestActiveRoomCode &&
        this.guestJoinCredentials
      ) {
        const creds = this.guestJoinCredentials;
        if (this.guestConn) {
          try {
            this.guestConn.close();
          } catch {
            // Ignore
          }
          this.guestConn = null;
        }
        if (this.guestPeer) {
          try {
            this.guestPeer.destroy();
          } catch {
            // Ignore
          }
          this.guestPeer = null;
        }
        const reconn = await this.connectGuestToHost(
          creds.roomCode,
          creds.playerId,
          creds.playerName,
          creds.token
        );
        const activeConn = this.guestConn as DataConnection | null;
        if (reconn?.ok && activeConn && activeConn.open) {
          if (reconn.state) {
            this.opts.onState(reconn.state as GameState);
          }
          try {
            const retryRes = await this.sendGuestRequest(event, payload, 5500);
            ack?.(retryRes);
            return;
          } catch {
            // Fall through
          }
        }
      }

      this.scheduleGuestAutoReconnect();
      ack?.({
        ok: false,
        code: 'NO_SESSION',
        error: 'З’єднання з кімнатою відновлюється — спробуйте ще раз',
      });
    }
  }

  private connectGuestToHost(
    code: string,
    playerId: string,
    playerName: string,
    token?: TokenId
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      let settled = false;
      const peer = new Peer(PEER_ICE_CONFIG);
      this.guestPeer = peer;

      const finish = (res: Record<string, unknown>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(res);
      };

      const timeout = setTimeout(() => {
        finish({
          ok: false,
          error: `Кімнату «${code}» не знайдено або хост вже закрив стіл`,
        });
      }, 7500);

      peer.on('error', (err: { type?: string }) => {
        if (err?.type === 'peer-unavailable') {
          finish({
            ok: false,
            error: `Кімнату «${code}» не знайдено (перевірте код і чи відкрита вкладка у хоста)`,
          });
        } else {
          finish({
            ok: false,
            error: `Не вдалося підключитися до кімнати «${code}»`,
          });
        }
      });

      peer.on('open', () => {
        if (this.destroyed || this.guestPeer !== peer) {
          finish({ ok: false, error: 'Підключення скасовано' });
          return;
        }

        const conn = peer.connect(`${PEER_PREFIX}${code}`, {
          reliable: true,
          serialization: 'json',
        });
        this.guestConn = conn;

        conn.on('data', (raw: unknown) => {
          if (this.destroyed) return;
          const msg = raw as P2PWireMessage;
          if (!msg) return;

          if (msg.type === 'ack') {
            const pending = this.pendingAcks.get(msg.reqId);
            if (pending) {
              clearTimeout(pending.timer);
              this.pendingAcks.delete(msg.reqId);
              pending.resolve(msg.res);
            }
            return;
          }

          if (msg.type === 'event' && msg.event === 'room:state') {
            this.opts.onState(msg.data);
            return;
          }

          if (
            msg.type === 'event' &&
            (msg.event === 'room:kicked' || msg.event === 'room:closed')
          ) {
            this.guestExplicitLeft = true;
            this.teardownP2PSession(true);
            this.opts.onRoomExit?.(msg.message);
          }
        });

        conn.on('open', () => {
          this.sendGuestRequest(
            'room:join',
            { roomCode: code, playerId, playerName, token },
            5500
          )
            .then((res) => {
              if (res?.ok) {
                this.guestReconnectAttempts = 0;
              }
              finish(res);
            })
            .catch(() => {
              try {
                conn.close();
              } catch {
                // Ignore
              }
              if (this.guestConn === conn) {
                this.guestConn = null;
              }
              finish({
                ok: false,
                error: `Хост кімнати «${code}» не відповідає`,
              });
            });
        });

        const handleDisconnect = () => {
          if (this.guestConn !== conn) return;
          this.guestConn = null;
          if (!settled) {
            finish({
              ok: false,
              error: `З’єднання з кімнатою «${code}» перервано`,
            });
            return;
          }
          this.scheduleGuestAutoReconnect();
        };

        conn.on('close', handleDisconnect);
        conn.on('error', () => {
          if (!conn.open) {
            handleDisconnect();
          }
        });
      });
    });
  }

  private scheduleGuestAutoReconnect(): void {
    if (
      this.destroyed ||
      this.guestExplicitLeft ||
      !this.guestActiveRoomCode ||
      !this.guestJoinCredentials
    ) {
      return;
    }
    if (this.guestReconnectTimer) return;
    if (this.guestReconnectAttempts >= 15) {
      this.teardownP2PSession(true);
      this.opts.onRoomExit?.('Зв’язок із власником кімнати втрачено');
      return;
    }

    this.guestReconnectAttempts += 1;
    const creds = this.guestJoinCredentials;

    this.guestReconnectTimer = setTimeout(async () => {
      this.guestReconnectTimer = null;
      if (
        this.destroyed ||
        this.guestExplicitLeft ||
        !this.guestActiveRoomCode
      ) {
        return;
      }

      if (this.guestPeer) {
        try {
          this.guestPeer.destroy();
        } catch {
          // Ignore
        }
        this.guestPeer = null;
      }

      const res = await this.connectGuestToHost(
        creds.roomCode,
        creds.playerId,
        creds.playerName,
        creds.token
      );
      if (res?.ok && res.state) {
        this.opts.onState(res.state as GameState);
      } else {
        this.scheduleGuestAutoReconnect();
      }
    }, 1800);
  }

  private sendGuestRequest(
    event: string,
    payload: Record<string, unknown>,
    timeoutMs = 5000
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const conn = this.guestConn;
      if (!conn || !conn.open) {
        reject(new Error('Канал зв’язку закритий'));
        return;
      }

      const reqId = `req_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
      const timer = setTimeout(() => {
        this.pendingAcks.delete(reqId);
        reject(new Error('Час очікування відповіді від хоста вичерпано'));
      }, timeoutMs);

      this.pendingAcks.set(reqId, { resolve, timer });

      const enrichedPayload: Record<string, unknown> = {
        ...payload,
        playerId: String(
          payload.playerId ||
            this.guestJoinCredentials?.playerId ||
            this.opts.playerId
        ),
        playerName: String(
          payload.playerName ||
            this.guestJoinCredentials?.playerName ||
            this.cloudPlayerName ||
            'Магнат України'
        ),
        token:
          (payload.token as TokenId) ||
          this.guestJoinCredentials?.token ||
          this.cloudPlayerToken,
      };

      const msg: P2PRequestMessage = {
        type: 'req',
        reqId,
        event,
        payload: enrichedPayload,
      };
      conn.send(msg);
    });
  }

  public destroy(): void {
    this.destroyed = true;
    if (this.hostSignalingTimer) {
      clearInterval(this.hostSignalingTimer);
      this.hostSignalingTimer = null;
    }
    if (this.cloudSyncTimer) {
      clearInterval(this.cloudSyncTimer);
      this.cloudSyncTimer = null;
    }
    if (this.cloudLobbyTimer) {
      clearInterval(this.cloudLobbyTimer);
      this.cloudLobbyTimer = null;
    }
    if (this.visibilityListener && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityListener);
      window.removeEventListener('online', this.visibilityListener);
      window.removeEventListener('focus', this.visibilityListener);
      this.visibilityListener = null;
    }
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.teardownP2PSession(false);
    if (this.localRoomsChannel) {
      try {
        this.localRoomsChannel.close();
      } catch {
        // Ignore
      }
      this.localRoomsChannel = null;
    }
  }
}
