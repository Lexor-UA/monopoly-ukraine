import {
  BOARD_CELLS,
  BOT_PROFILES,
  DIIA_CARDS,
  MAX_GAME_PLAYERS,
  RawEventCard,
  TEAM_META,
  TOKENS,
  UNITY_CARDS,
  areTeammates,
  calculateMaxLiquidatableCash,
  calculatePlayerNetWorth,
  calculateRent,
  canBuildBranch,
  canMortgageProperty,
  canSellBranch,
  formatMoney,
  getMortgageValue,
  getSectorCells,
  getUnmortgageCost,
  hasFullSectorMonopoly,
  isPurchasableCell,
} from './boardData';
import {
  ChatMessage,
  GameLogEntry,
  GameMode,
  GameState,
  Player,
  PropertyState,
  RoomSettings,
  RoomSummary,
  TeamId,
  ToastTransfer,
  TokenId,
  TradeOffer,
} from './types';

const PLAYER_PALETTE = [
  '#2563EB', // Royal Ukrainian Blue
  '#F97316', // Monobank Coral Orange
  '#10B981', // Emerald
  '#E11D48', // Crimson Rose
  '#8B5CF6', // Violet
  '#EAB308', // Golden Wheat
];

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

export class GameRoom {
  public state: GameState;
  private onUpdate: (room: GameRoom) => void;
  private diiaDeck: RawEventCard[] = [];
  private unityDeck: RawEventCard[] = [];
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private auctionTimer: ReturnType<typeof setTimeout> | null = null;
  private tradeTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogInterval: ReturnType<typeof setInterval> | null = null;
  private isProcessingTimeout = false;
  private botTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  private moveCounter = 0;
  private toastCounter = 0;
  private lastBotTradeTurn = -5;
  private lastBotAllyTradeTurn = -3;
  private attemptedDebtRescueKey: string | null = null;
  private rejectedBotTradeCooldowns = new Map<string, number>();
  private lastRollTimestamp = 0;
  private lastMoveTimestamp = 0;
  private isChainingRollMoves = false;
  private serverlessMode = false;

  constructor(
    roomCode: string,
    hostId: string,
    settings: RoomSettings,
    onUpdate: (room: GameRoom) => void
  ) {
    this.onUpdate = onUpdate;
    const normalizedMode: GameMode =
      settings.gameMode === 'team2v2' ? 'team2v2' : 'classic';
    const normalizedSettings: RoomSettings = {
      ...settings,
      gameMode: normalizedMode,
      maxPlayers:
        normalizedMode === 'team2v2'
          ? MAX_GAME_PLAYERS
          : Math.min(
              MAX_GAME_PLAYERS,
              Math.max(2, Number(settings.maxPlayers) || MAX_GAME_PLAYERS)
            ),
    };

    const properties: Record<number, PropertyState> = {};
    for (const cell of BOARD_CELLS) {
      if (isPurchasableCell(cell)) {
        properties[cell.index] = {
          cellIndex: cell.index,
          ownerId: null,
          branches: 0,
          isMortgaged: false,
        };
      }
    }

    this.state = {
      roomCode,
      hostId,
      settings: normalizedSettings,
      status: 'lobby',
      phase: 'WAITING',
      turnIndex: 0,
      turnNumber: 1,
      turnEndsAt: null,
      turnDurationMs: null,
      playerActedThisTurn: false,
      eliminatedPlayers: [],
      players: [],
      properties,
      lastDice: null,
      diceRollId: 0,
      lastMove: null,
      lastToast: null,
      auction: null,
      pendingTrade: null,
      debt: null,
      latestEventCard: null,
      karpatyFund: normalizedSettings.karpatyBonusEnabled ? 1000 : 0,
      zsuTotalDonated: 0,
      winnerId: null,
      winningTeamId: null,
      logs: [],
      chat: [],
    };

    this.addLog(
      'info',
      normalizedMode === 'team2v2'
        ? `Командну кімнату 2 на 2 «${normalizedSettings.roomName}» створено. Формуємо альянси! 🤝🇺🇦`
        : `Кімнату «${normalizedSettings.roomName}» створено. Очікуємо учасників! 🇺🇦`
    );
  }

  public isTeamMode(): boolean {
    return this.state.settings.gameMode === 'team2v2';
  }

  public areAllies(id1?: string | null, id2?: string | null): boolean {
    if (!this.isTeamMode() || !id1 || !id2 || id1 === id2) return false;
    const p1 = this.state.players.find((p) => p.id === id1);
    const p2 = this.state.players.find((p) => p.id === id2);
    return areTeammates(this.state.settings.gameMode, p1, p2);
  }

  public getTeammate(playerId: string): Player | undefined {
    if (!this.isTeamMode()) return undefined;
    const me = this.state.players.find((p) => p.id === playerId);
    if (!me?.teamId) return undefined;
    return this.state.players.find(
      (p) => p.id !== playerId && p.teamId === me.teamId
    );
  }

  private pickBalancedTeamId(preferred?: TeamId): TeamId {
    const countA = this.state.players.filter((p) => p.teamId === 'A').length;
    const countB = this.state.players.filter((p) => p.teamId === 'B').length;
    if (preferred === 'A' && countA < 2) return 'A';
    if (preferred === 'B' && countB < 2) return 'B';
    if (countA <= countB && countA < 2) return 'A';
    if (countB < 2) return 'B';
    return 'A';
  }

  private ensureBalancedLobbyTeams(): void {
    if (!this.isTeamMode()) {
      for (const p of this.state.players) {
        p.teamId = undefined;
      }
      return;
    }
    let countA = 0;
    let countB = 0;
    for (const p of this.state.players) {
      if (p.teamId === 'A' && countA < 2) {
        countA += 1;
      } else if (p.teamId === 'B' && countB < 2) {
        countB += 1;
      } else if (countA <= countB && countA < 2) {
        p.teamId = 'A';
        countA += 1;
      } else {
        p.teamId = 'B';
        countB += 1;
      }
    }
  }

  public destroy(): void {
    this.clearWatchdog();
    this.clearTurnTimer();
    this.clearAuctionTimer();
    this.clearTradeTimer();
    this.clearBotTimers();
  }

  public restoreFromSnapshot(saved: GameState, serverlessMode = false): void {
    this.destroy();
    this.serverlessMode = serverlessMode;
    this.state = JSON.parse(JSON.stringify(saved)) as GameState;
    this.state.settings.gameMode =
      this.state.settings.gameMode === 'team2v2' ? 'team2v2' : 'classic';
    this.state.settings.maxPlayers = this.isTeamMode()
      ? MAX_GAME_PLAYERS
      : Math.min(
          MAX_GAME_PLAYERS,
          Math.max(2, Number(this.state.settings.maxPlayers) || MAX_GAME_PLAYERS)
        );
    this.state.winningTeamId = saved.winningTeamId ?? null;
    this.state.playerActedThisTurn = Boolean(saved.playerActedThisTurn);
    this.state.eliminatedPlayers = saved.eliminatedPlayers ?? [];
    this.state.lastStepAt =
      typeof saved.lastStepAt === 'number'
        ? saved.lastStepAt
        : (saved.logs?.[0]?.timestamp ?? Date.now());
    this.moveCounter = saved.lastMove?.moveId ?? 0;
    this.toastCounter = saved.lastToast?.id ?? 0;
    this.lastMoveTimestamp = saved.lastMove?.timestamp ?? 0;
    this.lastRollTimestamp = saved.lastMove?.timestamp ?? 0;
    this.lastBotTradeTurn = saved.botMemory?.lastBotTradeTurn ?? -5;
    this.lastBotAllyTradeTurn = saved.botMemory?.lastBotAllyTradeTurn ?? -3;
    this.attemptedDebtRescueKey =
      saved.botMemory?.attemptedDebtRescueKey ?? null;
    this.rejectedBotTradeCooldowns = new Map<string, number>(
      Object.entries(saved.botMemory?.rejectedCooldowns ?? {})
    );
    this.syncBotMemoryToState();
    this.diiaDeck = shuffle(DIIA_CARDS);
    this.unityDeck = shuffle(UNITY_CARDS);
    for (const p of this.state.players) {
      if (typeof p.missedTurns !== 'number') {
        p.missedTurns = 0;
      }
      if (!p.isBot && !serverlessMode) {
        p.isConnected = p.id === this.state.hostId;
      }
    }
    if (serverlessMode) {
      return;
    }
    if (this.state.status === 'playing') {
      this.ensureWatchdog();
      if (this.state.phase === 'AUCTION' && this.state.auction) {
        const remAuction = Math.max(
          1200,
          this.state.auction.endsAt - Date.now()
        );
        this.resetAuctionTimer(remAuction);
        this.scheduleBotsForAuction();
      } else if (this.state.pendingTrade) {
        const target = this.state.players.find(
          (pl) => pl.id === this.state.pendingTrade?.toPlayerId
        );
        const remTrade = Math.max(
          4500,
          this.state.pendingTrade.expiresAt - Date.now()
        );
        this.state.pendingTrade.expiresAt = Date.now() + remTrade;
        this.state.turnEndsAt = this.state.pendingTrade.expiresAt + 15000;
        if (target?.isBot) {
          this.scheduleBotTradeDecision(target, this.state.pendingTrade);
        } else {
          this.tradeTimer = setTimeout(() => {
            if (this.state.pendingTrade) {
              this.respondTrade(this.state.pendingTrade.toPlayerId, false, true);
            }
          }, remTrade);
        }
      } else {
        const remTurn = saved.turnEndsAt
          ? Math.max(800, saved.turnEndsAt - Date.now())
          : undefined;
        this.resetTurnTimer(remTurn);
        this.scheduleBotIfNeeded();
      }
    }
  }

  public getSummary(): RoomSummary {
    const host = this.state.players.find((p) => p.id === this.state.hostId);
    return {
      roomCode: this.state.roomCode,
      roomName: this.state.settings.roomName,
      hostName: host?.name ?? 'Гравець',
      gameMode: this.state.settings.gameMode ?? 'classic',
      playerCount: this.state.players.length,
      maxPlayers: this.state.settings.maxPlayers,
      status: this.state.status === 'lobby' ? 'lobby' : 'playing',
      turnTimeSeconds: this.state.settings.turnTimeSeconds,
    };
  }

  private syncBotMemoryToState(): void {
    this.state.botMemory = {
      lastBotTradeTurn: this.lastBotTradeTurn,
      lastBotAllyTradeTurn: this.lastBotAllyTradeTurn,
      attemptedDebtRescueKey: this.attemptedDebtRescueKey,
      rejectedCooldowns: Object.fromEntries(
        this.rejectedBotTradeCooldowns.entries()
      ),
    };
  }

  public touchPlayer(playerId: string, now = Date.now()): boolean {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.isBot) return false;
    const prevConnected = player.isConnected;
    const prevSeen = player.lastSeenAt ?? 0;
    player.isConnected = true;
    player.lastSeenAt = now;
    return !prevConnected || now - prevSeen >= 8000;
  }

  private emit(): void {
    this.syncBotMemoryToState();
    this.state.serverTime = Date.now();
    this.onUpdate(this);
  }

  private addLog(
    type: GameLogEntry['type'],
    text: string,
    playerId?: string
  ): void {
    this.state.logs.unshift({
      id: uid('log'),
      timestamp: Date.now(),
      type,
      text,
      playerId,
    });
    if (this.state.logs.length > 80) {
      this.state.logs.length = 80;
    }
  }

  private pushToast(
    title: string,
    subtitle: string,
    amountText: string,
    variant: ToastTransfer['variant']
  ): void {
    this.toastCounter += 1;
    this.state.lastToast = {
      id: this.toastCounter,
      title,
      subtitle,
      amountText,
      variant,
    };
  }

  private pickAvailableToken(preferred?: TokenId): TokenId {
    const used = new Set(this.state.players.map((p) => p.token));
    if (preferred && !used.has(preferred)) return preferred;
    const free = TOKENS.find((t) => !used.has(t.id));
    return free ? free.id : TOKENS[0].id;
  }

  private pickAvailableColor(token: TokenId): string {
    const usedColors = new Set(this.state.players.map((p) => p.color));
    const tokenDef = TOKENS.find((t) => t.id === token);
    if (tokenDef && !usedColors.has(tokenDef.defaultColor)) {
      return tokenDef.defaultColor;
    }
    const free = PLAYER_PALETTE.find((c) => !usedColors.has(c));
    return free ?? PLAYER_PALETTE[this.state.players.length % PLAYER_PALETTE.length];
  }

  public migratePlayerId(oldId: string, newId: string): void {
    if (!oldId || !newId || oldId === newId) return;
    for (const p of this.state.players) {
      if (p.id === oldId) {
        p.id = newId;
      }
    }
    if (this.state.eliminatedPlayers) {
      for (const e of this.state.eliminatedPlayers) {
        if (e.id === oldId) {
          e.id = newId;
        }
      }
    }
    if (this.state.hostId === oldId) {
      this.state.hostId = newId;
    }
    if (this.state.winnerId === oldId) {
      this.state.winnerId = newId;
    }
    for (const prop of Object.values(this.state.properties)) {
      if (prop.ownerId === oldId) {
        prop.ownerId = newId;
      }
    }
    if (this.state.auction) {
      this.state.auction.activeParticipantIds =
        this.state.auction.activeParticipantIds.map((id) =>
          id === oldId ? newId : id
        );
      if (this.state.auction.highestBidderId === oldId) {
        this.state.auction.highestBidderId = newId;
      }
    }
    if (this.state.pendingTrade) {
      if (this.state.pendingTrade.fromPlayerId === oldId) {
        this.state.pendingTrade.fromPlayerId = newId;
      }
      if (this.state.pendingTrade.toPlayerId === oldId) {
        this.state.pendingTrade.toPlayerId = newId;
      }
    }
    if (this.state.debt) {
      if (this.state.debt.debtorId === oldId) {
        this.state.debt.debtorId = newId;
      }
      if (this.state.debt.creditorId === oldId) {
        this.state.debt.creditorId = newId;
      }
    }
    if (this.state.lastMove?.playerId === oldId) {
      this.state.lastMove.playerId = newId;
    }
    if (this.state.latestEventCard?.playerId === oldId) {
      this.state.latestEventCard.playerId = newId;
    }
    for (const log of this.state.logs) {
      if (log.playerId === oldId) {
        log.playerId = newId;
      }
    }
    for (const msg of this.state.chat) {
      if (msg.playerId === oldId) {
        msg.playerId = newId;
      }
    }
  }

  public addOrReconnectPlayer(
    playerId: string,
    name: string,
    preferredToken?: TokenId
  ): { ok: boolean; error?: string } {
    const now = Date.now();
    const existing = this.state.players.find((p) => p.id === playerId);
    if (existing) {
      existing.isConnected = true;
      existing.lastSeenAt = now;
      if (this.state.status === 'lobby' && name.trim()) {
        const candidateName = name.trim().slice(0, 22);
        const takenByOther = this.state.players.some(
          (p) =>
            p.id !== playerId &&
            p.name.trim().toLowerCase() === candidateName.toLowerCase()
        );
        if (!takenByOther) {
          existing.name = candidateName;
        }
      }
      this.emit();
      return { ok: true };
    }

    // Reclaim seat if player refreshed in mobile WebView / switched browser and got a new playerId
    const normalizedName = name.trim().toLowerCase();
    const isGenericDefaultName =
      normalizedName === 'магнат україни' || normalizedName === 'гравець';
    const matchesNameOrNumbered = (p: Player): boolean => {
      if (!normalizedName) return false;
      const pName = p.name.trim().toLowerCase();
      return (
        pName === normalizedName ||
        pName.startsWith(`${normalizedName.slice(0, 19)} `)
      );
    };

    const activeHumans = this.state.players.filter(
      (p) => !p.isBot && !p.isBankrupt
    );
    const nonHostHumans = activeHumans.filter(
      (p) => p.id !== this.state.hostId
    );
    const disconnectedHumans = activeHumans.filter((p) => !p.isConnected);

    // 1. Disconnected human matching name (preferring non-host first if numbered suffix)
    const reclaimDisconnectedByName = normalizedName
      ? (disconnectedHumans.find(
          (p) => p.id !== this.state.hostId && matchesNameOrNumbered(p)
        ) ?? disconnectedHumans.find((p) => matchesNameOrNumbered(p)))
      : undefined;

    // 2. Sole disconnected human in an active match
    const reclaimSoleDisconnected =
      !reclaimDisconnectedByName &&
      this.state.status !== 'lobby' &&
      disconnectedHumans.length === 1
        ? disconnectedHumans[0]
        : undefined;

    // 3. Connected human in an active match whose network dropped before 45s timeout
    let reclaimConnectedInActiveMatch: Player | undefined;
    if (
      !reclaimDisconnectedByName &&
      !reclaimSoleDisconnected &&
      this.state.status !== 'lobby'
    ) {
      if (normalizedName && !isGenericDefaultName) {
        // Custom player name: match non-host human immediately, or host if stale (>2.5s)
        reclaimConnectedInActiveMatch =
          nonHostHumans.find((p) => matchesNameOrNumbered(p)) ??
          activeHumans.find(
            (p) =>
              matchesNameOrNumbered(p) &&
              (!p.lastSeenAt || now - p.lastSeenAt > 2500)
          );
      } else if (normalizedName && isGenericDefaultName) {
        // Default name ('Магнат України'):
        // - Guest who joined with default name was auto-named 'Магнат України 2' (or 'Магнат України' if host had custom name).
        //   Allow reclaiming non-host human seat without ever touching an active host!
        reclaimConnectedInActiveMatch =
          nonHostHumans.find(
            (p) =>
              p.name.trim().toLowerCase() !== normalizedName &&
              matchesNameOrNumbered(p)
          ) ??
          nonHostHumans.find((p) => matchesNameOrNumbered(p)) ??
          (nonHostHumans.length === 1 &&
          (!nonHostHumans[0].lastSeenAt ||
            now - nonHostHumans[0].lastSeenAt > 2500)
            ? nonHostHumans[0]
            : undefined) ??
          activeHumans.find(
            (p) =>
              p.id === this.state.hostId &&
              matchesNameOrNumbered(p) &&
              (!p.lastSeenAt || now - p.lastSeenAt > 4000)
          );
      }
    }

    const seatToReclaim =
      reclaimDisconnectedByName ??
      reclaimSoleDisconnected ??
      reclaimConnectedInActiveMatch;
    if (seatToReclaim) {
      this.migratePlayerId(seatToReclaim.id, playerId);
      seatToReclaim.isConnected = true;
      seatToReclaim.lastSeenAt = now;
      this.emit();
      return { ok: true };
    }

    if (
      this.state.status !== 'lobby' &&
      this.state.eliminatedPlayers?.some(
        (e) =>
          e.id === playerId ||
          (normalizedName && e.name.trim().toLowerCase() === normalizedName)
      )
    ) {
      const elim = this.state.eliminatedPlayers.find(
        (e) =>
          e.id === playerId ||
          (normalizedName && e.name.trim().toLowerCase() === normalizedName)
      );
      if (elim && elim.id !== playerId) {
        this.migratePlayerId(elim.id, playerId);
      }
      return { ok: true };
    }

    if (this.state.status !== 'lobby') {
      return {
        ok: false,
        error: 'Гра в цій кімнаті вже розпочалася',
      };
    }

    if (this.state.players.length >= this.state.settings.maxPlayers) {
      return {
        ok: false,
        error: 'Кімната вже заповнена',
      };
    }

    const token = this.pickAvailableToken(preferredToken);
    const color = this.pickAvailableColor(token);

    const baseName = (name.trim() || 'Гравець').slice(0, 22);
    const takenNames = new Set(
      this.state.players.map((p) => p.name.toLowerCase())
    );
    let finalName = baseName;
    if (takenNames.has(finalName.toLowerCase())) {
      let suffix = 2;
      while (
        takenNames.has(
          `${baseName.slice(0, 19)} ${suffix}`.toLowerCase()
        )
      ) {
        suffix += 1;
      }
      finalName = `${baseName.slice(0, 19)} ${suffix}`;
    }

    const player: Player = {
      id: playerId,
      name: finalName,
      token,
      color,
      teamId: this.isTeamMode() ? this.pickBalancedTeamId() : undefined,
      money: this.state.settings.startingMoney,
      position: 0,
      isBot: false,
      isConnected: true,
      isBankrupt: false,
      inJail: false,
      jailTurns: 0,
      amnestyCards: 0,
      doublesCount: 0,
      missedTurns: 0,
      lastSeenAt: now,
    };

    this.state.players.push(player);
    this.addLog('info', `${player.name} приєднався до кімнати.`);
    this.emit();
    return { ok: true };
  }

  public selectToken(playerId: string, token: TokenId): void {
    if (this.state.status !== 'lobby') return;
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return;
    const conflict = this.state.players.find(
      (p) => p.id !== playerId && p.token === token
    );
    if (conflict) {
      if (conflict.isBot) {
        // Swap with bot smoothly, preserving 1:1 token <-> jewel pedestal color sync
        const prevToken = player.token;
        conflict.token = prevToken;
        player.token = token;
        const prevTokenDef = TOKENS.find((t) => t.id === prevToken);
        if (prevTokenDef) {
          conflict.color = prevTokenDef.defaultColor;
        }
      } else {
        return;
      }
    } else {
      player.token = token;
    }
    const tokenDef = TOKENS.find((t) => t.id === token);
    if (tokenDef) {
      player.color = tokenDef.defaultColor;
    }
    this.emit();
  }

  public updatePlayerName(
    playerId: string,
    name: string
  ): { ok: boolean; error?: string } {
    if (this.state.status !== 'lobby') {
      return { ok: false, error: 'Змінювати ім’я можна лише в кімнаті очікування' };
    }
    const player = this.state.players.find((p) => p.id === playerId && !p.isBot);
    if (!player) {
      return { ok: false, error: 'Гравця не знайдено' };
    }
    const clean = (name || '').trim().slice(0, 22);
    if (!clean) {
      return { ok: false, error: 'Введіть ім’я гравця' };
    }
    const takenNames = new Set(
      this.state.players
        .filter((p) => p.id !== playerId)
        .map((p) => p.name.toLowerCase())
    );
    let finalName = clean;
    if (takenNames.has(finalName.toLowerCase())) {
      let suffix = 2;
      while (
        takenNames.has(`${clean.slice(0, 19)} ${suffix}`.toLowerCase())
      ) {
        suffix += 1;
      }
      finalName = `${clean.slice(0, 19)} ${suffix}`;
    }
    player.name = finalName;
    this.emit();
    return { ok: true };
  }

  public addBot(
    requesterId: string,
    preferredTeamId?: TeamId
  ): { ok: boolean; error?: string } {
    if (requesterId !== this.state.hostId) {
      return { ok: false, error: 'Тільки власник кімнати може додавати ботів' };
    }
    if (this.state.status !== 'lobby') {
      return { ok: false, error: 'Гра вже триває' };
    }
    if (this.state.players.length >= this.state.settings.maxPlayers) {
      return { ok: false, error: 'Досягнуто ліміт 4 гравців у кімнаті' };
    }

    const usedNames = new Set(this.state.players.map((p) => p.name));
    const profile =
      BOT_PROFILES.find((b) => !usedNames.has(b.name)) ?? BOT_PROFILES[0];
    const token = this.pickAvailableToken(profile.token);
    const color = this.pickAvailableColor(token);

    const bot: Player = {
      id: uid('bot'),
      name: usedNames.has(profile.name)
        ? `${profile.name} #${this.state.players.length}`
        : profile.name,
      token,
      color,
      teamId: this.isTeamMode()
        ? this.pickBalancedTeamId(preferredTeamId)
        : undefined,
      money: this.state.settings.startingMoney,
      position: 0,
      isBot: true,
      botPersonality: profile.personality,
      isConnected: true,
      isBankrupt: false,
      inJail: false,
      jailTurns: 0,
      amnestyCards: 0,
      doublesCount: 0,
      missedTurns: 0,
      lastSeenAt: Date.now(),
    };

    this.state.players.push(bot);
    this.addLog('info', `Додано AI-гравця: ${bot.name}.`);
    this.emit();
    return { ok: true };
  }

  public setLobbyGameMode(
    requesterId: string,
    gameMode: GameMode
  ): { ok: boolean; error?: string } {
    if (requesterId !== this.state.hostId) {
      return { ok: false, error: 'Тільки власник кімнати може змінювати режим гри' };
    }
    if (this.state.status !== 'lobby') {
      return { ok: false, error: 'Змінювати режим можна лише в лобі перед стартом' };
    }
    const nextMode: GameMode = gameMode === 'team2v2' ? 'team2v2' : 'classic';
    if ((this.state.settings.gameMode ?? 'classic') === nextMode) {
      return { ok: true };
    }

    this.state.settings.gameMode = nextMode;
    if (nextMode === 'team2v2') {
      this.state.settings.maxPlayers = MAX_GAME_PLAYERS;
      this.ensureBalancedLobbyTeams();
      this.addLog('info', '🤝 Увімкнено командний режим «2 на 2» (2 альянси по 2 гравці).');
    } else {
      this.state.settings.maxPlayers = Math.min(
        MAX_GAME_PLAYERS,
        Math.max(2, this.state.players.length, this.state.settings.maxPlayers || MAX_GAME_PLAYERS)
      );
      this.ensureBalancedLobbyTeams();
      this.addLog('info', '🏆 Увімкнено класичний режим (кожен сам за себе, до 4 гравців).');
    }
    this.emit();
    return { ok: true };
  }

  public setLobbyVisibility(
    requesterId: string,
    isPublic?: boolean
  ): { ok: boolean; error?: string } {
    if (requesterId !== this.state.hostId) {
      return {
        ok: false,
        error: 'Тільки власник кімнати може змінювати приватність столу',
      };
    }
    if (this.state.status !== 'lobby') {
      return {
        ok: false,
        error: 'Змінювати приватність можна лише в лобі перед стартом',
      };
    }
    const nextPublic =
      typeof isPublic === 'boolean' ? isPublic : !this.state.settings.isPublic;
    if (Boolean(this.state.settings.isPublic) === nextPublic) {
      return { ok: true };
    }

    this.state.settings.isPublic = nextPublic;
    this.addLog(
      'info',
      nextPublic
        ? '🌐 Стіл зроблено відкритим — тепер він відображається у загальному списку на сайті.'
        : '🔒 Стіл зроблено закритим (приватним) — вхід тільки за кодом або прямим посиланням.'
    );
    this.emit();
    return { ok: true };
  }

  public switchPlayerTeam(
    requesterId: string,
    targetId?: string,
    desiredTeam?: TeamId
  ): { ok: boolean; error?: string } {
    if (this.state.status !== 'lobby') {
      return { ok: false, error: 'Змінювати команду можна лише в лобі' };
    }
    if (!this.isTeamMode()) {
      return { ok: false, error: 'Вибір команд доступний лише в режимі 2 на 2' };
    }
    const subjectId = targetId || requesterId;
    if (requesterId !== this.state.hostId && subjectId !== requesterId) {
      return {
        ok: false,
        error: 'Тільки хост може змінювати команду інших учасників',
      };
    }

    const subject = this.state.players.find((p) => p.id === subjectId);
    if (!subject) {
      return { ok: false, error: 'Учасника не знайдено' };
    }

    const currentTeam: TeamId = subject.teamId === 'B' ? 'B' : 'A';
    const nextTeam: TeamId =
      desiredTeam === 'A' || desiredTeam === 'B'
        ? desiredTeam
        : currentTeam === 'A'
          ? 'B'
          : 'A';

    if (nextTeam === currentTeam) {
      subject.teamId = nextTeam;
      this.emit();
      return { ok: true };
    }

    const inTarget = this.state.players.filter(
      (p) => p.id !== subject.id && p.teamId === nextTeam
    );
    if (inTarget.length < 2) {
      subject.teamId = nextTeam;
      this.emit();
      return { ok: true };
    }

    // Target team already has 2 members — swap with a bot if present, or if host is swapping
    const botToSwap = inTarget.find((p) => p.isBot);
    const swapCandidate =
      botToSwap ??
      (requesterId === this.state.hostId
        ? inTarget[inTarget.length - 1]
        : undefined);

    if (!swapCandidate) {
      return {
        ok: false,
        error: `У команді «${TEAM_META[nextTeam].name}» вже зайняті обидва місця`,
      };
    }

    swapCandidate.teamId = currentTeam;
    subject.teamId = nextTeam;
    this.emit();
    return { ok: true };
  }

  public removePlayerFromLobby(requesterId: string, targetId: string): void {
    if (this.state.status !== 'lobby') return;
    if (requesterId !== this.state.hostId && requesterId !== targetId) return;
    this.state.players = this.state.players.filter((p) => p.id !== targetId);
    if (
      this.state.hostId === targetId &&
      this.state.players.some((p) => !p.isBot)
    ) {
      const nextHuman = this.state.players.find((p) => !p.isBot);
      if (nextHuman) this.state.hostId = nextHuman.id;
    }
    this.emit();
  }

  public handleDisconnect(playerId: string): void {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return;
    player.isConnected = false;
    this.emit();
  }

  private recordManualPlayerAction(playerId: string): void {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.isBot) return;
    player.missedTurns = 0;
    player.isConnected = true;
    player.lastSeenAt = Date.now();
    const active = this.getActivePlayer();
    if (active && active.id === playerId) {
      this.state.playerActedThisTurn = true;
    }
  }

  public sendChat(
    playerId: string,
    text: string,
    isQuickReaction = false
  ): void {
    const activePlayer = this.state.players.find((p) => p.id === playerId);
    const eliminatedSpectator = !activePlayer
      ? this.state.eliminatedPlayers?.find((e) => e.id === playerId)
      : undefined;
    const sender = activePlayer ?? eliminatedSpectator;
    if (!sender) return;
    const clean = text.trim().slice(0, 200);
    if (!clean) return;
    if (activePlayer) {
      this.recordManualPlayerAction(playerId);
    }

    const msg: ChatMessage = {
      id: uid('chat'),
      playerId: sender.id,
      playerName: sender.name,
      playerColor: sender.color,
      text: clean,
      isQuickReaction,
      timestamp: Date.now(),
    };
    this.state.chat.push(msg);
    if (this.state.chat.length > 100) {
      this.state.chat.shift();
    }
    this.emit();
  }

  public startGame(requesterId: string): { ok: boolean; error?: string } {
    if (requesterId !== this.state.hostId) {
      return { ok: false, error: 'Тільки хост може розпочати гру' };
    }
    if (this.state.status !== 'lobby') {
      return { ok: false, error: 'Гра вже розпочата' };
    }
    if (this.isTeamMode()) {
      if (this.state.players.length < 4) {
        return {
          ok: false,
          error:
            'Для режиму 2 на 2 потрібно 4 учасники — запросіть друзів або додайте AI-ботів',
        };
      }
      this.ensureBalancedLobbyTeams();
      const teamA = this.state.players.filter((p) => p.teamId === 'A');
      const teamB = this.state.players.filter((p) => p.teamId === 'B');
      if (teamA.length !== 2 || teamB.length !== 2) {
        return {
          ok: false,
          error: 'У кожній команді має бути по 2 гравці (2 проти 2)',
        };
      }
      // Alternate turn order across alliances: A1 -> B1 -> A2 -> B2
      this.state.players = [teamA[0], teamB[0], teamA[1], teamB[1]];
    } else if (this.state.players.length < 2) {
      return { ok: false, error: 'Додайте хоча б одного суперника або AI-бота' };
    }

    // Reset state cleanly (also supports rematch)
    for (const key of Object.keys(this.state.properties)) {
      const idx = Number(key);
      this.state.properties[idx] = {
        cellIndex: idx,
        ownerId: null,
        branches: 0,
        isMortgaged: false,
      };
    }

    for (const p of this.state.players) {
      p.money = this.state.settings.startingMoney;
      p.position = 0;
      p.isBankrupt = false;
      p.inJail = false;
      p.jailTurns = 0;
      p.amnestyCards = 0;
      p.doublesCount = 0;
      p.missedTurns = 0;
    }

    this.diiaDeck = shuffle(DIIA_CARDS);
    this.unityDeck = shuffle(UNITY_CARDS);
    this.attemptedDebtRescueKey = null;
    this.rejectedBotTradeCooldowns.clear();
    this.lastBotTradeTurn = -5;
    this.lastBotAllyTradeTurn = -3;
    this.state.status = 'playing';
    this.state.phase = 'PRE_ROLL';
    this.state.turnIndex = 0;
    this.state.turnNumber = 1;
    this.state.playerActedThisTurn = false;
    this.state.eliminatedPlayers = [];
    this.state.winnerId = null;
    this.state.winningTeamId = null;
    this.state.lastDice = null;
    this.state.lastMove = null;
    this.state.auction = null;
    this.state.pendingTrade = null;
    this.state.debt = null;
    this.state.latestEventCard = null;
    this.state.karpatyFund = this.state.settings.karpatyBonusEnabled ? 1000 : 0;
    this.state.zsuTotalDonated = 0;

    const first = this.getActivePlayer();
    if (this.isTeamMode()) {
      const teamANames = this.state.players
        .filter((p) => p.teamId === 'A')
        .map((p) => p.name)
        .join(' + ');
      const teamBNames = this.state.players
        .filter((p) => p.teamId === 'B')
        .map((p) => p.name)
        .join(' + ');
      this.addLog(
        'info',
        `🤝 Командну гру 2 на 2 розпочато! ${TEAM_META.A.name} (${teamANames}) проти ${TEAM_META.B.name} (${teamBNames}). Першим ходить ${first?.name ?? 'гравець'}! 🇺🇦`
      );
    } else {
      this.addLog(
        'info',
        `Гру розпочато! Першим ходить ${first?.name ?? 'гравець'}. Успіхів! 🇺🇦`
      );
    }
    this.ensureWatchdog();
    this.resetTurnTimer();
    this.emit();
    this.scheduleBotIfNeeded();
    return { ok: true };
  }

  public restartToLobby(requesterId: string): void {
    const requester = this.state.players.find(
      (p) => p.id === requesterId && !p.isBot
    );
    const eliminatedRequester =
      !requester && this.state.status === 'finished'
        ? this.state.eliminatedPlayers?.find((e) => e.id === requesterId)
        : undefined;
    if (!requester && !eliminatedRequester) return;
    if (
      this.state.status !== 'finished' &&
      requesterId !== this.state.hostId
    ) {
      return;
    }
    this.clearWatchdog();
    this.clearTurnTimer();
    this.clearAuctionTimer();
    this.clearTradeTimer();
    this.clearBotTimers();
    this.attemptedDebtRescueKey = null;
    this.rejectedBotTradeCooldowns.clear();
    this.lastBotTradeTurn = -5;
    this.lastBotAllyTradeTurn = -3;

    // Restore AFK-eliminated human friends into free slots for the rematch (prioritizing requester)
    const eliminatedToRestore = [
      ...(eliminatedRequester ? [eliminatedRequester] : []),
      ...(this.state.eliminatedPlayers ?? []).filter(
        (e) => e.id !== eliminatedRequester?.id
      ),
    ];

    for (const elim of eliminatedToRestore) {
      if (this.state.players.some((p) => p.id === elim.id)) continue;
      if (this.state.players.length >= this.state.settings.maxPlayers) break;

      const hadHuman = this.state.players.some((p) => !p.isBot);
      const token = this.pickAvailableToken(elim.token);
      const color = this.pickAvailableColor(token);
      const restoredPlayer: Player = {
        id: elim.id,
        name: elim.name,
        token,
        color,
        teamId: this.isTeamMode()
          ? this.pickBalancedTeamId(elim.teamId)
          : undefined,
        money: this.state.settings.startingMoney,
        position: 0,
        isBot: false,
        isConnected: true,
        isBankrupt: false,
        inJail: false,
        jailTurns: 0,
        amnestyCards: 0,
        doublesCount: 0,
        missedTurns: 0,
      };
      if (elim.id === requesterId) {
        this.state.players.unshift(restoredPlayer);
      } else {
        this.state.players.push(restoredPlayer);
      }
      if (!hadHuman) {
        this.state.hostId = elim.id;
      }
    }

    // Ensure hostId belongs to an active human player if possible
    const currentHost = this.state.players.find(
      (p) => p.id === this.state.hostId
    );
    if (!currentHost || currentHost.isBot || !currentHost.isConnected) {
      const nextHost =
        this.state.players.find((p) => !p.isBot && p.isConnected) ??
        this.state.players.find((p) => !p.isBot) ??
        this.state.players[0];
      if (nextHost) {
        this.state.hostId = nextHost.id;
      }
    }

    // Reset all player match fields & board properties cleanly for lobby view
    for (const key of Object.keys(this.state.properties)) {
      const idx = Number(key);
      this.state.properties[idx] = {
        cellIndex: idx,
        ownerId: null,
        branches: 0,
        isMortgaged: false,
      };
    }

    for (const p of this.state.players) {
      p.money = this.state.settings.startingMoney;
      p.position = 0;
      p.isBankrupt = false;
      p.inJail = false;
      p.jailTurns = 0;
      p.amnestyCards = 0;
      p.doublesCount = 0;
      p.missedTurns = 0;
    }
    this.ensureBalancedLobbyTeams();

    this.state.status = 'lobby';
    this.state.phase = 'WAITING';
    this.state.turnIndex = 0;
    this.state.turnNumber = 1;
    this.state.turnEndsAt = null;
    this.state.turnDurationMs = null;
    this.state.playerActedThisTurn = false;
    this.state.eliminatedPlayers = [];
    this.state.winnerId = null;
    this.state.winningTeamId = null;
    this.state.lastDice = null;
    this.state.lastMove = null;
    this.state.lastToast = null;
    this.state.auction = null;
    this.state.pendingTrade = null;
    this.state.debt = null;
    this.state.latestEventCard = null;
    this.state.karpatyFund = this.state.settings.karpatyBonusEnabled ? 1000 : 0;
    this.state.zsuTotalDonated = 0;
    this.addLog('info', 'Кімнату повернуто в лобі для реваншу! 🔥');
    this.emit();
  }

  public getActivePlayer(): Player | undefined {
    return this.state.players[this.state.turnIndex];
  }

  // === TIMERS & WATCHDOG HEARTBEAT ===
  private ensureWatchdog(): void {
    if (this.serverlessMode) return;
    if (this.watchdogInterval) return;
    this.watchdogInterval = setInterval(() => {
      this.runWatchdogTick();
    }, 1000);
  }

  private clearWatchdog(): void {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
  }

  private runWatchdogTick(): void {
    if (this.isProcessingTimeout) return;
    if (this.state.status !== 'playing' || this.state.phase === 'GAME_OVER') {
      return;
    }

    const now = Date.now();

    if (this.state.phase === 'AUCTION' && this.state.auction) {
      if (now >= this.state.auction.endsAt + 400) {
        this.isProcessingTimeout = true;
        try {
          this.finalizeAuction();
        } finally {
          this.isProcessingTimeout = false;
        }
      }
      return;
    }

    if (this.state.pendingTrade) {
      if (now >= this.state.pendingTrade.expiresAt + 400) {
        this.isProcessingTimeout = true;
        try {
          this.respondTrade(this.state.pendingTrade.toPlayerId, false, true);
        } finally {
          this.isProcessingTimeout = false;
        }
      }
      return;
    }

    if (this.state.turnEndsAt === null) {
      this.resetTurnTimer();
      this.emit();
      return;
    }

    if (now >= this.state.turnEndsAt + 400) {
      this.handleTurnTimeout();
    }
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  private clearAuctionTimer(): void {
    if (this.auctionTimer) {
      clearTimeout(this.auctionTimer);
      this.auctionTimer = null;
    }
  }

  private clearTradeTimer(): void {
    if (this.tradeTimer) {
      clearTimeout(this.tradeTimer);
      this.tradeTimer = null;
    }
  }

  private clearBotTimers(): void {
    for (const t of this.botTimers) {
      clearTimeout(t);
    }
    this.botTimers.clear();
  }

  private scheduleBotTimeout(fn: () => void, ms: number): void {
    if (this.serverlessMode) return;
    const t = setTimeout(() => {
      this.botTimers.delete(t);
      if (this.state.status !== 'playing') return;
      fn();
    }, ms);
    this.botTimers.add(t);
  }

  private resetTurnTimer(explicitMs?: number): void {
    this.clearTurnTimer();
    this.state.lastStepAt = Date.now();
    if (this.state.status !== 'playing' || this.state.phase === 'GAME_OVER') {
      this.state.turnEndsAt = null;
      this.state.turnDurationMs = null;
      return;
    }

    const baseMs = Math.max(10, this.state.settings.turnTimeSeconds || 60) * 1000;
    const active = this.getActivePlayer();
    const isAutoInactiveHumanTurn = Boolean(
      active && !active.isBot && !this.state.playerActedThisTurn
    );

    let ms = baseMs;
    if (explicitMs !== undefined) {
      ms = Math.max(500, explicitMs);
    } else if (this.state.phase === 'BUY_DECISION' && isAutoInactiveHumanTurn && active) {
      // Dice were auto-rolled on timeout: let pawn walk onto the card + 12s countdown before auto-auction
      ms = Math.min(
        baseMs,
        this.getRemainingVisualMotionMs(active.id) + 12000
      );
    } else if (
      this.state.phase === 'DEBT_RESOLUTION' &&
      isAutoInactiveHumanTurn &&
      active
    ) {
      ms = Math.min(
        baseMs,
        this.getRemainingVisualMotionMs(active.id) + 10000
      );
    } else if (this.state.phase === 'POST_ROLL' && isAutoInactiveHumanTurn && active) {
      // Auto-rolled turn with zero manual actions: finish cleanly right after visual animations complete
      const motionMs = this.getRemainingVisualMotionMs(active.id);
      const cardMs =
        this.state.latestEventCard?.playerId === active.id ? 8600 : 0;
      ms = Math.min(baseMs, Math.max(motionMs, cardMs) + 3200);
    }

    this.state.turnDurationMs = ms;
    this.state.turnEndsAt = Date.now() + ms;
    if (!this.serverlessMode) {
      this.turnTimer = setTimeout(() => {
        this.handleTurnTimeout();
      }, ms);
    }
  }

  private handleTurnTimeout(): void {
    if (this.isProcessingTimeout) return;
    if (this.state.status !== 'playing') return;
    const active = this.getActivePlayer();
    if (!active) return;

    this.isProcessingTimeout = true;
    try {
      this.clearTurnTimer();

      if (this.state.phase === 'PRE_ROLL') {
        this.addLog(
          'info',
          `⏱ Час на кидок вичерпано — кубики автоматично кинуто за ${active.name}.`,
          active.id
        );
        this.rollDice(active.id, true);
        return;
      }

      if (this.state.phase === 'BUY_DECISION') {
        const cell = BOARD_CELLS[active.position];
        this.addLog(
          'auction',
          `🔨 ${active.name} не придбав «${cell?.shortName ?? 'актив'}» — автоматично виставлено на аукціон!`,
          active.id
        );
        this.startAuction(active.id, true);
        return;
      }

      if (this.state.phase === 'DEBT_RESOLUTION') {
        if (
          !active.isBot &&
          !this.state.playerActedThisTurn &&
          (active.missedTurns ?? 0) + 1 >= 3
        ) {
          this.eliminatePlayerForInactivity(active.id);
          return;
        }

        this.autoLiquidateForPlayer(active.id, true);
        if (this.state.debt && active.money >= this.state.debt.amount) {
          this.payDebt(active.id, true);
        } else {
          this.declareBankruptcy(active.id, true);
        }
        return;
      }

      if (this.state.phase === 'POST_ROLL') {
        if (active.doublesCount > 0 && !active.inJail) {
          this.rollDice(active.id, true);
        } else {
          this.endTurn(active.id, true);
        }
      }
    } finally {
      this.isProcessingTimeout = false;
    }
  }

  // === CORE TURN ACTIONS ===
  public payJailBail(playerId: string): { ok: boolean; error?: string } {
    const active = this.getActivePlayer();
    if (!active || active.id !== playerId) {
      return { ok: false, error: 'Зараз не ваш хід' };
    }
    if (this.state.phase !== 'PRE_ROLL' || !active.inJail) {
      return { ok: false, error: 'Ви не перебуваєте під санкціями' };
    }
    if (active.money < 500) {
      return { ok: false, error: 'Недостатньо коштів для застави 500 ₴' };
    }

    this.recordManualPlayerAction(playerId);
    active.money -= 500;
    active.inJail = false;
    active.jailTurns = 0;
    this.state.zsuTotalDonated += 500;
    this.addLog(
      'jail',
      `${active.name} сплатив 500 ₴ офіційної застави та вийшов із Санкційного Ізолятора.`,
      active.id
    );
    this.pushToast('Санкції знято', active.name, '-500 ₴', 'expense');
    this.resetTurnTimer();
    this.emit();
    this.scheduleBotIfNeeded();
    return { ok: true };
  }

  public useJailAmnesty(playerId: string): { ok: boolean; error?: string } {
    const active = this.getActivePlayer();
    if (!active || active.id !== playerId) {
      return { ok: false, error: 'Зараз не ваш хід' };
    }
    if (this.state.phase !== 'PRE_ROLL' || !active.inJail) {
      return { ok: false, error: 'Ви не перебуваєте під санкціями' };
    }
    if (active.amnestyCards <= 0) {
      return { ok: false, error: 'У вас немає картки Імунітету Бізнесу' };
    }

    this.recordManualPlayerAction(playerId);
    active.amnestyCards -= 1;
    active.inJail = false;
    active.jailTurns = 0;
    this.addLog(
      'jail',
      `${active.name} використав Імунітет Бізнесу та вийшов з-під санкцій!`,
      active.id
    );
    this.pushToast('Імунітет Бізнесу', active.name, 'Безкоштовно', 'info');
    this.resetTurnTimer();
    this.emit();
    this.scheduleBotIfNeeded();
    return { ok: true };
  }

  public rollDice(
    playerId: string,
    isAuto = false
  ): { ok: boolean; error?: string } {
    const active = this.getActivePlayer();
    if (!active || active.id !== playerId) {
      return { ok: false, error: 'Зараз не ваш хід' };
    }
    if (this.state.pendingTrade) {
      return {
        ok: false,
        error: 'Спочатку дочекайтеся відповіді на Смарт-Угоду',
      };
    }
    const canRollInPost =
      this.state.phase === 'POST_ROLL' &&
      active.doublesCount > 0 &&
      !active.inJail;

    if (this.state.phase !== 'PRE_ROLL' && !canRollInPost) {
      return { ok: false, error: 'Зараз не можна кидати кубики' };
    }

    if (!isAuto) {
      this.recordManualPlayerAction(playerId);
    }

    this.state.latestEventCard = null;
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const sum = d1 + d2;
    const isDouble = d1 === d2;

    this.state.lastDice = [d1, d2];
    this.state.diceRollId += 1;
    this.lastRollTimestamp = Date.now();

    // Jail handling
    if (active.inJail) {
      if (isDouble) {
        active.inJail = false;
        active.jailTurns = 0;
        active.doublesCount = 0;
        this.addLog(
          'roll',
          `${active.name} викинув дубль [${d1}:${d2}] і вийшов з-під санкцій!`,
          active.id
        );
        this.movePlayerBySteps(active, sum, false);
        return { ok: true };
      } else {
        active.jailTurns += 1;
        if (active.jailTurns >= 3) {
          active.inJail = false;
          active.jailTurns = 0;
          active.doublesCount = 0;
          this.addLog(
            'jail',
            `${active.name} викинув [${d1}:${d2}] (3-тя спроба) — обов’язкова застава 500 ₴ та рух уперед.`,
            active.id
          );
          if (active.money >= 500) {
            active.money -= 500;
            this.state.zsuTotalDonated += 500;
            this.movePlayerBySteps(active, sum, false);
          } else {
            this.triggerDebt(
              active,
              500,
              null,
              'Обов’язкова судова застава',
              false,
              {
                isZsu: true,
                pendingMoveSteps: sum,
              }
            );
          }
          return { ok: true };
        } else {
          this.addLog(
            'jail',
            `${active.name} викинув [${d1}:${d2}] — дубля немає, залишається в ізоляторі (${active.jailTurns}/3).`,
            active.id
          );
          this.state.phase = 'POST_ROLL';
          this.resetTurnTimer();
          this.emit();
          this.scheduleBotIfNeeded();
          return { ok: true };
        }
      }
    }

    // Normal roll
    if (isDouble) {
      active.doublesCount += 1;
      if (active.doublesCount >= 3) {
        this.addLog(
          'jail',
          `${active.name} викинув 3 дублі поспіль [${d1}:${d2}]! Антимонопольний комітет відправляє в Санкційний Ізолятор! 🚨`,
          active.id
        );
        this.sendPlayerToJail(active);
        this.state.phase = 'POST_ROLL';
        this.resetTurnTimer();
        this.emit();
        this.scheduleBotIfNeeded();
        return { ok: true };
      }
      this.addLog(
        'roll',
        `${active.name} викинув ДУБЛЬ [${d1}:${d2}] (${sum})! 🔥`,
        active.id
      );
    } else {
      active.doublesCount = 0;
      this.addLog(
        'roll',
        `${active.name} викинув [${d1}:${d2}] (хід на ${sum}).`,
        active.id
      );
    }

    this.movePlayerBySteps(active, sum, isDouble);
    return { ok: true };
  }

  private movePlayerBySteps(
    player: Player,
    stepCount: number,
    canRollAgain: boolean
  ): void {
    const from = player.position;
    const steps: number[] = [];
    for (let i = 1; i <= stepCount; i++) {
      steps.push((from + i) % 40);
    }
    const to = steps[steps.length - 1];
    player.position = to;
    this.moveCounter += 1;
    this.lastMoveTimestamp = Date.now();
    this.state.lastMove = {
      playerId: player.id,
      from,
      to,
      steps,
      moveId: this.moveCounter,
      timestamp: this.lastMoveTimestamp,
    };

    if (steps.includes(0)) {
      player.money += 2000;
      this.addLog(
        'info',
        `${player.name} пройшов коло через Старт та отримав +2 000 ₴!`,
        player.id
      );
      this.pushToast('Виплата за коло', player.name, '+2 000 ₴', 'income');
    }

    this.isChainingRollMoves = true;
    try {
      this.resolveLanding(player, to, canRollAgain);
    } finally {
      this.isChainingRollMoves = false;
    }
  }

  private movePlayerToIndexDirect(
    player: Player,
    targetIndex: number,
    passStartBonus: boolean
  ): void {
    const from = player.position;
    const steps: number[] = [];
    let curr = from;
    while (curr !== targetIndex) {
      curr = (curr + 1) % 40;
      steps.push(curr);
      if (steps.length > 40) break;
    }
    const prevMove =
      this.isChainingRollMoves &&
      this.state.lastMove &&
      this.state.lastMove.playerId === player.id
        ? this.state.lastMove
        : null;

    player.position = targetIndex;
    this.moveCounter += 1;
    this.lastMoveTimestamp = Date.now();
    this.state.lastMove = {
      playerId: player.id,
      from: prevMove ? prevMove.from : from,
      to: targetIndex,
      steps: prevMove ? [...prevMove.steps, ...steps] : steps,
      moveId: this.moveCounter,
      timestamp: this.lastMoveTimestamp,
    };

    if (passStartBonus && steps.includes(0)) {
      player.money += 2000;
      this.addLog(
        'info',
        `${player.name} пройшов Старт і отримав +2 000 ₴!`,
        player.id
      );
      this.pushToast('Виплата за коло', player.name, '+2 000 ₴', 'income');
    }
  }

  private sendPlayerToJail(player: Player): void {
    const from = player.position;
    const prevMove =
      this.isChainingRollMoves &&
      this.state.lastMove &&
      this.state.lastMove.playerId === player.id
        ? this.state.lastMove
        : null;

    player.position = 10;
    player.inJail = true;
    player.jailTurns = 0;
    player.doublesCount = 0;
    this.moveCounter += 1;
    this.lastMoveTimestamp = Date.now();
    this.state.lastMove = {
      playerId: player.id,
      from: prevMove ? prevMove.from : from,
      to: 10,
      steps: prevMove ? [...prevMove.steps, 10] : [10],
      moveId: this.moveCounter,
      timestamp: this.lastMoveTimestamp,
    };
    this.pushToast('Санкційний Ізолятор', player.name, 'Активи під наглядом', 'expense');
  }

  private resolveLanding(
    player: Player,
    cellIndex: number,
    canRollAgain: boolean
  ): void {
    const cell = BOARD_CELLS[cellIndex];
    if (!cell) return;

    if (isPurchasableCell(cell)) {
      const prop = this.state.properties[cellIndex];
      if (!prop.ownerId) {
        this.state.phase = 'BUY_DECISION';
        this.resetTurnTimer();
        this.emit();
        this.scheduleBotIfNeeded();
        return;
      }

      if (prop.ownerId === player.id) {
        this.state.phase = 'POST_ROLL';
        this.resetTurnTimer();
        this.emit();
        this.scheduleBotIfNeeded();
        return;
      }

      const owner = this.state.players.find((p) => p.id === prop.ownerId);
      if (owner && !owner.isBankrupt && this.areAllies(player.id, owner.id)) {
        this.addLog(
          'info',
          `🤝 ${player.name} завітав до напарника ${owner.name} («${cell.shortName}») — для союзників оренда 0 ₴!`,
          player.id
        );
        this.pushToast(
          `Актив напарника • ${cell.shortName}`,
          `${player.name} 🤝 ${owner.name}`,
          '0 ₴',
          'info'
        );
        this.state.phase = 'POST_ROLL';
        this.resetTurnTimer();
        this.emit();
        this.scheduleBotIfNeeded();
        return;
      }

      if (prop.isMortgaged) {
        this.addLog(
          'info',
          `${player.name} завітав у «${cell.shortName}», але компанія в заставі (оренда 0 ₴).`,
          player.id
        );
        this.state.phase = 'POST_ROLL';
        this.resetTurnTimer();
        this.emit();
        this.scheduleBotIfNeeded();
        return;
      }

      const diceSum =
        (this.state.lastDice?.[0] ?? 3) + (this.state.lastDice?.[1] ?? 4);
      const rent = calculateRent(cellIndex, this.state.properties, diceSum);

      if (rent > 0 && owner && !owner.isBankrupt) {
        this.chargePlayer(
          player,
          rent,
          owner.id,
          `Оренда за «${cell.shortName}»`,
          canRollAgain
        );
        return;
      }

      this.state.phase = 'POST_ROLL';
      this.resetTurnTimer();
      this.emit();
      this.scheduleBotIfNeeded();
      return;
    }

    if (cell.type === 'tax' && cell.taxAmount) {
      const amount = cell.taxAmount;
      this.chargePlayer(
        player,
        amount,
        null,
        `${cell.name} 🇺🇦`,
        canRollAgain,
        true,
        true
      );
      return;
    }

    if (cell.type === 'karpaty') {
      if (
        this.state.settings.karpatyBonusEnabled &&
        this.state.karpatyFund > 0
      ) {
        const bonus = this.state.karpatyFund;
        player.money += bonus;
        this.state.karpatyFund = 500; // Seed next round slightly
        this.addLog(
          'event',
          `${player.name} відпочив у Карпатах та отримав регіональний грант +${formatMoney(bonus)}! 🏔️`,
          player.id
        );
        this.pushToast(
          'Карпатський Курорт',
          player.name,
          `+${formatMoney(bonus)}`,
          'income'
        );
      } else {
        this.addLog(
          'info',
          `${player.name} насолоджується чистим гірським повітрям Карпат 🏔️`,
          player.id
        );
      }
      this.state.phase = 'POST_ROLL';
      this.resetTurnTimer();
      this.emit();
      this.scheduleBotIfNeeded();
      return;
    }

    if (cell.type === 'sbu') {
      this.addLog(
        'jail',
        `Антимонопольний рейд! ${player.name} негайно відправляється в Санкційний Ізолятор! 🚨`,
        player.id
      );
      this.sendPlayerToJail(player);
      this.state.phase = 'POST_ROLL';
      this.resetTurnTimer();
      this.emit();
      this.scheduleBotIfNeeded();
      return;
    }

    if (cell.type === 'event_diia' || cell.type === 'event_unity') {
      this.drawAndApplyEventCard(
        player,
        cell.type === 'event_diia' ? 'diia' : 'unity',
        canRollAgain
      );
      return;
    }

    // Start or Jail Just Visiting
    this.state.phase = 'POST_ROLL';
    this.resetTurnTimer();
    this.emit();
    this.scheduleBotIfNeeded();
  }

  private drawAndApplyEventCard(
    player: Player,
    deckType: 'diia' | 'unity',
    canRollAgain: boolean
  ): void {
    if (deckType === 'diia') {
      if (this.diiaDeck.length === 0) this.diiaDeck = shuffle(DIIA_CARDS);
    } else {
      if (this.unityDeck.length === 0) this.unityDeck = shuffle(UNITY_CARDS);
    }

    const card =
      deckType === 'diia' ? this.diiaDeck.pop()! : this.unityDeck.pop()!;
    let impactText = '';

    const act = card.action;
    if (act.type === 'money') {
      if (act.amount >= 0) {
        player.money += act.amount;
        impactText = `+${formatMoney(act.amount)}`;
        this.state.latestEventCard = {
          id: uid('ev'),
          deck: deckType,
          badge: card.badge,
          title: card.title,
          description: card.description,
          impactText,
          playerId: player.id,
          timestamp: Date.now(),
        };
        this.addLog(
          'event',
          `${player.name} • ${card.badge}: «${card.title}» (${impactText})`,
          player.id
        );
        this.pushToast(card.badge, player.name, impactText, 'income');
        this.state.phase = 'POST_ROLL';
        this.resetTurnTimer();
        this.emit();
        this.scheduleBotIfNeeded();
        return;
      } else {
        const cost = Math.abs(act.amount);
        impactText = `-${formatMoney(cost)}`;
        this.state.latestEventCard = {
          id: uid('ev'),
          deck: deckType,
          badge: card.badge,
          title: card.title,
          description: card.description,
          impactText,
          playerId: player.id,
          timestamp: Date.now(),
        };
        this.addLog(
          act.isZsu ? 'zsu' : 'event',
          `${player.name} • ${card.badge}: «${card.title}» (${impactText})`,
          player.id
        );
        this.chargePlayer(
          player,
          cost,
          null,
          card.title,
          canRollAgain,
          Boolean(act.isZsu),
          true
        );
        return;
      }
    }

    if (act.type === 'amnesty') {
      player.amnestyCards += 1;
      impactText = '+1 Імунітет Бізнесу';
      this.state.latestEventCard = {
        id: uid('ev'),
        deck: deckType,
        badge: card.badge,
        title: card.title,
        description: card.description,
        impactText,
        playerId: player.id,
        timestamp: Date.now(),
      };
      this.addLog(
        'event',
        `${player.name} отримав картку Імунітету Бізнесу (вихід із Санкційного Ізолятора)!`,
        player.id
      );
      this.state.phase = 'POST_ROLL';
      this.resetTurnTimer();
      this.emit();
      this.scheduleBotIfNeeded();
      return;
    }

    if (act.type === 'go_to_jail') {
      impactText = 'Санкційний Ізолятор';
      this.state.latestEventCard = {
        id: uid('ev'),
        deck: deckType,
        badge: card.badge,
        title: card.title,
        description: card.description,
        impactText,
        playerId: player.id,
        timestamp: Date.now(),
      };
      this.addLog(
        'jail',
        `${player.name} • ${card.title} — відправлено в Санкційний Ізолятор!`,
        player.id
      );
      this.sendPlayerToJail(player);
      this.state.phase = 'POST_ROLL';
      this.resetTurnTimer();
      this.emit();
      this.scheduleBotIfNeeded();
      return;
    }

    if (act.type === 'collect_from_each') {
      let collected = 0;
      for (const other of this.state.players) {
        if (
          other.id !== player.id &&
          !other.isBankrupt &&
          !this.areAllies(player.id, other.id)
        ) {
          const gift = Math.min(other.money, act.amount);
          other.money -= gift;
          collected += gift;
        }
      }
      player.money += collected;
      impactText = `+${formatMoney(collected)}`;
      this.state.latestEventCard = {
        id: uid('ev'),
        deck: deckType,
        badge: card.badge,
        title: card.title,
        description: card.description,
        impactText,
        playerId: player.id,
        timestamp: Date.now(),
      };
      this.addLog(
        'event',
        `${player.name} • «${card.title}» — зібрано +${formatMoney(collected)} від ${
          this.isTeamMode() ? 'суперників' : 'учасників'
        }!`,
        player.id
      );
      this.pushToast(card.badge, player.name, impactText, 'income');
      this.state.phase = 'POST_ROLL';
      this.resetTurnTimer();
      this.emit();
      this.scheduleBotIfNeeded();
      return;
    }

    if (act.type === 'repairs') {
      let branchesCount = 0;
      let holdingsCount = 0;
      for (const prop of Object.values(this.state.properties)) {
        if (prop.ownerId === player.id) {
          if (prop.branches >= 5) holdingsCount += 1;
          else if (prop.branches > 0) branchesCount += prop.branches;
        }
      }
      const totalCost =
        branchesCount * act.perBranch + holdingsCount * act.perHolding;
      impactText =
        totalCost > 0 ? `-${formatMoney(totalCost)}` : '0 ₴ (немає філій)';
      this.state.latestEventCard = {
        id: uid('ev'),
        deck: deckType,
        badge: card.badge,
        title: card.title,
        description: card.description,
        impactText,
        playerId: player.id,
        timestamp: Date.now(),
      };
      this.addLog(
        'event',
        `${player.name} • «${card.title}»: ${impactText}`,
        player.id
      );
      if (totalCost > 0) {
        this.chargePlayer(player, totalCost, null, card.title, canRollAgain);
      } else {
        this.state.phase = 'POST_ROLL';
        this.resetTurnTimer();
        this.emit();
        this.scheduleBotIfNeeded();
      }
      return;
    }

    if (act.type === 'move_to') {
      const targetCell = BOARD_CELLS[act.targetIndex];
      impactText = `Перехід → ${targetCell?.shortName ?? ''}`;
      this.state.latestEventCard = {
        id: uid('ev'),
        deck: deckType,
        badge: card.badge,
        title: card.title,
        description: card.description,
        impactText,
        playerId: player.id,
        timestamp: Date.now(),
      };
      this.addLog(
        'event',
        `${player.name} • «${card.title}» → переміщується на «${targetCell?.shortName}».`,
        player.id
      );
      this.movePlayerToIndexDirect(player, act.targetIndex, act.passStartBonus);
      this.resolveLanding(player, act.targetIndex, canRollAgain);
    }
  }

  private chargePlayer(
    player: Player,
    amount: number,
    creditorId: string | null,
    reason: string,
    canRollAgain: boolean,
    isZsu = false,
    addToKarpaty = false
  ): void {
    const creditor = creditorId
      ? this.state.players.find((p) => p.id === creditorId)
      : null;

    if (player.money >= amount) {
      player.money -= amount;
      if (creditor) {
        creditor.money += amount;
        this.addLog(
          'rent',
          `${player.name} сплатив ${formatMoney(amount)} гравцю ${creditor.name} (${reason}).`,
          player.id
        );
        this.pushToast(
          reason,
          `${player.name} → ${creditor.name}`,
          formatMoney(amount),
          'expense'
        );
      } else {
        if (isZsu) {
          this.state.zsuTotalDonated += amount;
        }
        if (addToKarpaty && this.state.settings.karpatyBonusEnabled) {
          this.state.karpatyFund += Math.floor(amount * 0.5);
        }
        this.addLog(
          isZsu ? 'zsu' : 'info',
          `${player.name} сплатив ${formatMoney(amount)} (${reason}).`,
          player.id
        );
        this.pushToast(
          reason,
          player.name,
          `-${formatMoney(amount)}`,
          isZsu ? 'zsu' : 'expense'
        );
      }

      this.state.phase = 'POST_ROLL';
      this.resetTurnTimer();
      this.emit();
      this.scheduleBotIfNeeded();
    } else {
      this.triggerDebt(player, amount, creditorId, reason, canRollAgain, {
        isZsu,
        addToKarpaty,
      });
    }
  }

  private triggerDebt(
    player: Player,
    amount: number,
    creditorId: string | null,
    reason: string,
    canRollAgainAfter: boolean,
    opts?: {
      isZsu?: boolean;
      addToKarpaty?: boolean;
      pendingMoveSteps?: number;
    }
  ): void {
    this.state.debt = {
      debtorId: player.id,
      creditorId,
      amount,
      reason,
      canRollAgainAfter,
      isZsu: opts?.isZsu,
      addToKarpaty: opts?.addToKarpaty,
      pendingMoveSteps: opts?.pendingMoveSteps,
    };
    this.state.phase = 'DEBT_RESOLUTION';
    this.addLog(
      'rent',
      `⚠️ ${player.name} має сплатити борг ${formatMoney(amount)} (${reason})! Потрібно продати філії або закласти активи.`,
      player.id
    );
    this.resetTurnTimer();
    this.emit();
    this.scheduleBotIfNeeded();
  }

  public payDebt(
    playerId: string,
    isAuto = false
  ): { ok: boolean; error?: string } {
    if (
      this.state.phase !== 'DEBT_RESOLUTION' ||
      !this.state.debt ||
      this.state.debt.debtorId !== playerId
    ) {
      return { ok: false, error: 'Немає активного боргу' };
    }

    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.money < this.state.debt.amount) {
      return { ok: false, error: 'Ще недостатньо коштів для погашення боргу' };
    }

    if (!isAuto) {
      this.recordManualPlayerAction(playerId);
    }

    const {
      amount,
      creditorId,
      reason,
      isZsu,
      addToKarpaty,
      pendingMoveSteps,
    } = this.state.debt;
    player.money -= amount;
    if (creditorId) {
      const creditor = this.state.players.find((p) => p.id === creditorId);
      if (creditor) creditor.money += amount;
    } else {
      if (isZsu) {
        this.state.zsuTotalDonated += amount;
      }
      if (addToKarpaty && this.state.settings.karpatyBonusEnabled) {
        this.state.karpatyFund += Math.floor(amount * 0.5);
      }
    }

    this.addLog(
      'rent',
      `${player.name} успішно погасив борг ${formatMoney(amount)} (${reason})!`,
      player.id
    );
    this.pushToast('Борг погашено', player.name, `-${formatMoney(amount)}`, 'info');
    this.state.debt = null;

    if (pendingMoveSteps && pendingMoveSteps > 0) {
      this.movePlayerBySteps(player, pendingMoveSteps, false);
      return { ok: true };
    }

    this.state.phase = 'POST_ROLL';
    this.resetTurnTimer();
    this.emit();
    this.scheduleBotIfNeeded();
    return { ok: true };
  }

  public autoLiquidateDebt(playerId: string): { ok: boolean; error?: string } {
    if (
      this.state.phase !== 'DEBT_RESOLUTION' ||
      !this.state.debt ||
      this.state.debt.debtorId !== playerId
    ) {
      return { ok: false, error: 'Немає активного боргу для авто-застави' };
    }
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return { ok: false, error: 'Гравця не знайдено' };

    this.recordManualPlayerAction(playerId);
    const before = player.money;
    this.autoLiquidateForPlayer(playerId, false);
    if (player.money <= before && player.money < this.state.debt.amount) {
      return { ok: false, error: 'Більше немає вільних активів для застави чи продажу' };
    }
    this.emit();
    return { ok: true };
  }

  // === BUYING & AUCTIONS ===
  public buyProperty(playerId: string): { ok: boolean; error?: string } {
    const active = this.getActivePlayer();
    if (!active || active.id !== playerId) {
      return { ok: false, error: 'Зараз не ваш хід' };
    }
    if (this.state.phase !== 'BUY_DECISION') {
      return { ok: false, error: 'Зараз немає пропозиції купівлі' };
    }

    const cell = BOARD_CELLS[active.position];
    const prop = this.state.properties[active.position];
    if (!cell || !cell.price || !prop || prop.ownerId) {
      return { ok: false, error: 'Цю компанію не можна придбати' };
    }
    if (active.money < cell.price) {
      return { ok: false, error: 'Недостатньо коштів для купівлі' };
    }

    this.recordManualPlayerAction(playerId);
    active.money -= cell.price;
    prop.ownerId = active.id;

    this.addLog(
      'buy',
      `${active.name} придбав «${cell.name}» за ${formatMoney(cell.price)}!`,
      active.id
    );
    this.pushToast(
      `Придбано • ${cell.shortName}`,
      active.name,
      `-${formatMoney(cell.price)}`,
      'info'
    );

    if (
      cell.type === 'company' &&
      cell.sector &&
      hasFullSectorMonopoly(active.id, cell.sector, this.state.properties, false)
    ) {
      this.addLog(
        'buy',
        `🏆 ПОВНИЙ ХОЛДИНГ! ${active.name} зібрав увесь сектор «${cell.sectorName}»! Тепер можна будувати філії!`,
        active.id
      );
    }

    this.state.phase = 'POST_ROLL';
    this.resetTurnTimer();
    this.emit();
    this.scheduleBotIfNeeded();
    return { ok: true };
  }

  public startAuction(
    playerId: string,
    isAuto = false
  ): { ok: boolean; error?: string } {
    const active = this.getActivePlayer();
    if (!active || active.id !== playerId) {
      return { ok: false, error: 'Зараз не ваш хід' };
    }
    if (this.state.phase !== 'BUY_DECISION') {
      return { ok: false, error: 'Неможливо розпочати аукціон' };
    }

    if (!isAuto) {
      this.recordManualPlayerAction(playerId);
    }

    const cellIndex = active.position;
    const cell = BOARD_CELLS[cellIndex];
    if (!cell || !cell.price) {
      this.state.phase = 'POST_ROLL';
      this.resetTurnTimer();
      this.emit();
      this.scheduleBotIfNeeded();
      return { ok: true };
    }

    const startBid = Math.max(100, Math.floor(cell.price * 0.25));
    const participants = this.state.players
      .filter((p) => !p.isBankrupt && p.money >= startBid)
      .map((p) => p.id);

    if (participants.length === 0) {
      this.addLog(
        'auction',
        `Ніхто не має коштів для участі в аукціоні за «${cell.shortName}».`
      );
      this.state.phase = 'POST_ROLL';
      this.resetTurnTimer();
      this.emit();
      this.scheduleBotIfNeeded();
      return { ok: true };
    }

    const initialAuctionMs = isAuto ? 13000 : 18000;
    this.clearTurnTimer();
    this.state.turnEndsAt = null;
    this.state.turnDurationMs = null;
    this.state.phase = 'AUCTION';
    this.state.auction = {
      cellIndex,
      currentBid: startBid,
      highestBidderId: null,
      activeParticipantIds: participants,
      endsAt: Date.now() + initialAuctionMs,
    };

    this.addLog(
      'auction',
      `🔨 Аукціон за «${cell.name}» розпочато! Стартова ціна: ${formatMoney(startBid)}.`,
      active.id
    );
    this.resetAuctionTimer(initialAuctionMs);
    this.emit();
    this.scheduleBotsForAuction();
    return { ok: true };
  }

  private resetAuctionTimer(ms = 14000): void {
    this.clearAuctionTimer();
    this.state.lastStepAt = Date.now();
    if (!this.state.auction) return;
    this.state.auction.endsAt = Date.now() + ms;
    if (!this.serverlessMode) {
      this.auctionTimer = setTimeout(() => {
        this.finalizeAuction();
      }, ms);
    }
  }

  public placeAuctionBid(
    playerId: string,
    increment: number
  ): { ok: boolean; error?: string } {
    if (this.state.phase !== 'AUCTION' || !this.state.auction) {
      return { ok: false, error: 'Аукціон вже завершено' };
    }
    const auc = this.state.auction;
    if (!auc.activeParticipantIds.includes(playerId)) {
      return { ok: false, error: 'Ви вже вийшли з цих торгів' };
    }
    if (auc.highestBidderId === playerId) {
      return { ok: false, error: 'Ви вже лідируєте в торгах' };
    }

    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.isBankrupt) {
      return { ok: false, error: 'Гравець недоступний' };
    }

    const safeInc = Math.max(0, Math.round(increment));
    const nextBid =
      auc.highestBidderId === null
        ? auc.currentBid + safeInc
        : auc.currentBid + Math.max(100, safeInc);

    if (player.money < nextBid) {
      return { ok: false, error: 'Недостатньо коштів для такої ставки' };
    }

    this.recordManualPlayerAction(playerId);
    auc.currentBid = nextBid;
    auc.highestBidderId = player.id;

    // Auto-remove participants who can no longer afford currentBid + 100
    auc.activeParticipantIds = auc.activeParticipantIds.filter((id) => {
      if (id === player.id) return true;
      const p = this.state.players.find((pl) => pl.id === id);
      return Boolean(p && !p.isBankrupt && p.money >= auc.currentBid + 100);
    });

    const cell = BOARD_CELLS[auc.cellIndex];
    this.addLog(
      'auction',
      `🔨 ${player.name} піднімає ставку за «${cell?.shortName}» до ${formatMoney(nextBid)}!`,
      player.id
    );

    // If nobody else remains able/active to outbid, win right away!
    if (
      auc.activeParticipantIds.length <= 1 &&
      auc.highestBidderId === player.id
    ) {
      this.finalizeAuction();
      return { ok: true };
    }

    const nextTimerMs =
      !this.state.playerActedThisTurn && !this.getActivePlayer()?.isBot
        ? 11000
        : 14000;
    this.resetAuctionTimer(nextTimerMs);
    this.emit();
    this.scheduleBotsForAuction();
    return { ok: true };
  }

  public passAuction(playerId: string): void {
    if (this.state.phase !== 'AUCTION' || !this.state.auction) return;
    const auc = this.state.auction;
    if (!auc.activeParticipantIds.includes(playerId)) return;
    if (auc.highestBidderId === playerId) return; // Leader cannot pass against themselves

    this.recordManualPlayerAction(playerId);
    this.state.lastStepAt = Date.now();
    auc.activeParticipantIds = auc.activeParticipantIds.filter(
      (id) => id !== playerId
    );
    const player = this.state.players.find((p) => p.id === playerId);
    if (player) {
      this.addLog('auction', `${player.name} пасує на аукціоні.`, player.id);
    }

    if (auc.activeParticipantIds.length === 0) {
      this.finalizeAuction();
      return;
    }

    if (
      auc.activeParticipantIds.length === 1 &&
      auc.highestBidderId === auc.activeParticipantIds[0]
    ) {
      this.finalizeAuction();
      return;
    }

    this.emit();
  }

  private finalizeAuction(): void {
    this.clearAuctionTimer();
    const auc = this.state.auction;
    this.state.auction = null;

    if (auc && auc.highestBidderId) {
      const winner = this.state.players.find(
        (p) => p.id === auc.highestBidderId
      );
      const cell = BOARD_CELLS[auc.cellIndex];
      const prop = this.state.properties[auc.cellIndex];
      if (winner && cell && prop && winner.money >= auc.currentBid) {
        winner.money -= auc.currentBid;
        prop.ownerId = winner.id;
        this.addLog(
          'auction',
          `🏆 ${winner.name} виграв аукціон за «${cell.name}» зі ставкою ${formatMoney(auc.currentBid)}!`,
          winner.id
        );
        this.pushToast(
          `Аукціон • ${cell.shortName}`,
          `Переможець: ${winner.name}`,
          `-${formatMoney(auc.currentBid)}`,
          'info'
        );

        if (
          cell.type === 'company' &&
          cell.sector &&
          hasFullSectorMonopoly(
            winner.id,
            cell.sector,
            this.state.properties,
            false
          )
        ) {
          this.addLog(
            'buy',
            `🏆 ПОВНИЙ ХОЛДИНГ! ${winner.name} зібрав увесь сектор «${cell.sectorName}»!`,
            winner.id
          );
        }
      }
    } else if (auc) {
      const cell = BOARD_CELLS[auc.cellIndex];
      this.addLog(
        'auction',
        `Аукціон за «${cell?.shortName}» завершився без ставок.`
      );
    }

    const active = this.getActivePlayer();
    if (!active || active.isBankrupt) {
      this.advanceToNextPlayer();
      return;
    }

    this.state.phase = 'POST_ROLL';
    this.resetTurnTimer();
    this.emit();
    this.scheduleBotIfNeeded();
  }

  // === PROPERTY MANAGEMENT (BRANCHES & MORTGAGE) ===
  private canManageAssetsNow(playerId: string): boolean {
    const active = this.getActivePlayer();
    if (!active || active.id !== playerId) return false;
    if (this.state.pendingTrade) return false;
    return (
      this.state.phase === 'PRE_ROLL' ||
      this.state.phase === 'BUY_DECISION' ||
      this.state.phase === 'POST_ROLL' ||
      this.state.phase === 'DEBT_RESOLUTION'
    );
  }

  public buildBranch(
    playerId: string,
    cellIndex: number
  ): { ok: boolean; error?: string } {
    if (!this.canManageAssetsNow(playerId)) {
      return { ok: false, error: 'Будувати філії можна лише під час свого ходу' };
    }
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return { ok: false, error: 'Гравця не знайдено' };

    const check = canBuildBranch(
      playerId,
      cellIndex,
      player.money,
      this.state.properties
    );
    if (!check.ok) return { ok: false, error: check.reason };

    const cell = BOARD_CELLS[cellIndex];
    const prop = this.state.properties[cellIndex];
    if (!cell.branchCost) return { ok: false, error: 'Помилка даних' };

    this.recordManualPlayerAction(playerId);
    player.money -= cell.branchCost;
    prop.branches += 1;

    const label =
      prop.branches >= 5
        ? '🌟 ГОЛОВНИЙ ХОЛДИНГ'
        : `філію #${prop.branches}`;
    this.addLog(
      'buy',
      `${player.name} побудував ${label} для «${cell.shortName}» (-${formatMoney(cell.branchCost)}).`,
      player.id
    );
    this.emit();
    return { ok: true };
  }

  public sellBranch(
    playerId: string,
    cellIndex: number,
    isAuto = false
  ): { ok: boolean; error?: string } {
    if (!this.canManageAssetsNow(playerId)) {
      return { ok: false, error: 'Керувати філіями можна під час свого ходу' };
    }
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return { ok: false, error: 'Гравця не знайдено' };

    const check = canSellBranch(playerId, cellIndex, this.state.properties);
    if (!check.ok) return { ok: false, error: check.reason };

    if (!isAuto) {
      this.recordManualPlayerAction(playerId);
    }
    const cell = BOARD_CELLS[cellIndex];
    const prop = this.state.properties[cellIndex];
    const refund = Math.floor((cell.branchCost ?? 0) * 0.5);

    prop.branches -= 1;
    player.money += refund;

    this.addLog(
      'info',
      `${player.name} продав філію «${cell.shortName}» (+${formatMoney(refund)}).`,
      player.id
    );
    this.emit();
    return { ok: true };
  }

  public mortgageProperty(
    playerId: string,
    cellIndex: number,
    isAuto = false
  ): { ok: boolean; error?: string } {
    if (!this.canManageAssetsNow(playerId)) {
      return { ok: false, error: 'Закладати активи можна лише у свій хід' };
    }
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return { ok: false, error: 'Гравця не знайдено' };

    const check = canMortgageProperty(
      playerId,
      cellIndex,
      this.state.properties
    );
    if (!check.ok) return { ok: false, error: check.reason };

    if (!isAuto) {
      this.recordManualPlayerAction(playerId);
    }
    const cell = BOARD_CELLS[cellIndex];
    const prop = this.state.properties[cellIndex];
    const value = getMortgageValue(cellIndex);

    prop.isMortgaged = true;
    player.money += value;

    this.addLog(
      'info',
      `${player.name} передав у заставу «${cell.shortName}» (+${formatMoney(value)}).`,
      player.id
    );
    this.emit();
    return { ok: true };
  }

  public unmortgageProperty(
    playerId: string,
    cellIndex: number
  ): { ok: boolean; error?: string } {
    if (!this.canManageAssetsNow(playerId)) {
      return { ok: false, error: 'Викуповувати активи можна лише у свій хід' };
    }
    const player = this.state.players.find((p) => p.id === playerId);
    const prop = this.state.properties[cellIndex];
    const cell = BOARD_CELLS[cellIndex];
    if (!player || !prop || prop.ownerId !== playerId || !prop.isMortgaged) {
      return { ok: false, error: 'Компанія не перебуває у заставі' };
    }

    const cost = getUnmortgageCost(cellIndex);
    if (player.money < cost) {
      return {
        ok: false,
        error: `Недостатньо коштів для викупу (${formatMoney(cost)})`,
      };
    }

    this.recordManualPlayerAction(playerId);
    player.money -= cost;
    prop.isMortgaged = false;
    this.addLog(
      'buy',
      `${player.name} викупив із застави «${cell.shortName}» (-${formatMoney(cost)}).`,
      player.id
    );
    this.emit();
    return { ok: true };
  }

  // === TRADES (ДІЯ.ДОГОВІР) ===
  public proposeTrade(
    fromId: string,
    payload: {
      toPlayerId: string;
      offerProperties: number[];
      requestProperties: number[];
      offerMoney: number;
      requestMoney: number;
    }
  ): { ok: boolean; error?: string } {
    if (this.state.status !== 'playing') {
      return { ok: false, error: 'Гра не активна' };
    }
    if (this.state.pendingTrade) {
      return { ok: false, error: 'Вже є активний договір на розгляді' };
    }
    const active = this.getActivePlayer();
    if (!active || active.id !== fromId) {
      return { ok: false, error: 'Пропонувати договір можна лише у свій хід' };
    }
    if (
      this.state.phase !== 'PRE_ROLL' &&
      this.state.phase !== 'POST_ROLL' &&
      this.state.phase !== 'DEBT_RESOLUTION'
    ) {
      return { ok: false, error: 'Спочатку завершіть поточну дію на полі' };
    }

    const from = this.state.players.find((p) => p.id === fromId);
    const to = this.state.players.find((p) => p.id === payload.toPlayerId);
    if (!from || !to || from.isBankrupt || to.isBankrupt || from.id === to.id) {
      return { ok: false, error: 'Некоректний контрагент' };
    }

    const offerMoney = Math.max(0, Math.round(payload.offerMoney || 0));
    const requestMoney = Math.max(0, Math.round(payload.requestMoney || 0));

    if (from.money < offerMoney) {
      return { ok: false, error: 'У вас недостатньо коштів для такої пропозиції' };
    }
    if (to.money < requestMoney) {
      return { ok: false, error: `У ${to.name} немає такої суми` };
    }

    if (
      payload.offerProperties.length === 0 &&
      payload.requestProperties.length === 0 &&
      offerMoney === 0 &&
      requestMoney === 0
    ) {
      return { ok: false, error: 'Договір не може бути порожнім' };
    }

    // Validate ownership & zero branches in traded sectors
    for (const idx of payload.offerProperties) {
      const prop = this.state.properties[idx];
      const cell = BOARD_CELLS[idx];
      if (!prop || prop.ownerId !== from.id) {
        return { ok: false, error: 'Ви не володієте обраною компанією' };
      }
      if (cell?.sector) {
        const hasBr = getSectorCells(cell.sector).some(
          (c) => (this.state.properties[c.index]?.branches ?? 0) > 0
        );
        if (hasBr) {
          return {
            ok: false,
            error: `Спочатку продайте філії в секторі «${cell.sectorName}»`,
          };
        }
      }
    }

    for (const idx of payload.requestProperties) {
      const prop = this.state.properties[idx];
      const cell = BOARD_CELLS[idx];
      if (!prop || prop.ownerId !== to.id) {
        return { ok: false, error: 'Контрагент не володіє обраною компанією' };
      }
      if (cell?.sector) {
        const hasBr = getSectorCells(cell.sector).some(
          (c) => (this.state.properties[c.index]?.branches ?? 0) > 0
        );
        if (hasBr) {
          return {
            ok: false,
            error: `У секторі «${cell.sectorName}» побудовані філії — обмін неможливий`,
          };
        }
      }
    }

    this.recordManualPlayerAction(fromId);
    const durationMs = to.isBot ? 25000 : 60000;
    const now = Date.now();
    const trade: TradeOffer = {
      id: uid('trade'),
      fromPlayerId: from.id,
      toPlayerId: to.id,
      offerProperties: [...new Set(payload.offerProperties)],
      requestProperties: [...new Set(payload.requestProperties)],
      offerMoney,
      requestMoney,
      createdAt: now,
      expiresAt: now + durationMs,
    };

    this.state.pendingTrade = trade;
    this.state.lastStepAt = now;
    // Pause turn timeout while players review the Smart-Trade so turn never auto-ends mid-negotiation
    this.clearTurnTimer();
    this.state.turnEndsAt = trade.expiresAt + 15000;
    this.state.turnDurationMs = durationMs + 15000;

    this.addLog(
      'trade',
      `📄 ${from.name} надіслав Смарт-Угоду гравцю ${to.name}.`,
      from.id
    );

    this.clearTradeTimer();
    if (!this.serverlessMode) {
      this.tradeTimer = setTimeout(() => {
        if (this.state.pendingTrade?.id === trade.id) {
          this.respondTrade(to.id, false, true);
        }
      }, durationMs);
    }

    this.emit();

    if (to.isBot) {
      this.scheduleBotTradeDecision(to, trade);
    }

    return { ok: true };
  }

  public respondTrade(
    responderId: string,
    accept: boolean,
    isAuto = false
  ): { ok: boolean; error?: string } {
    const trade = this.state.pendingTrade;
    if (!trade) return { ok: false, error: 'Договір вже неактивний' };
    if (
      responderId !== trade.toPlayerId &&
      !( !accept && responderId === trade.fromPlayerId )
    ) {
      return { ok: false, error: 'Ви не є стороною цього рішення' };
    }

    if (!isAuto) {
      this.recordManualPlayerAction(responderId);
    }

    this.clearTradeTimer();
    this.state.pendingTrade = null;

    const from = this.state.players.find((p) => p.id === trade.fromPlayerId);
    const to = this.state.players.find((p) => p.id === trade.toPlayerId);
    if (!from || !to) {
      this.resetTurnTimer();
      this.emit();
      this.scheduleBotIfNeeded();
      return { ok: true };
    }

    if (!accept) {
      if (from.isBot && responderId === to.id) {
        for (const reqIdx of trade.requestProperties) {
          this.rejectedBotTradeCooldowns.set(
            `${from.id}:${to.id}:${reqIdx}`,
            this.state.turnNumber
          );
        }
      }
      const who = responderId === from.id ? `${from.name} скасував` : `${to.name} відхилив`;
      this.addLog('trade', `❌ ${who} Смарт-Угоду.`, responderId);
      this.resetTurnTimer();
      this.emit();
      this.scheduleBotIfNeeded();
      return { ok: true };
    }

    // Re-verify cash & ownership atomically
    if (from.money < trade.offerMoney || to.money < trade.requestMoney) {
      this.addLog('trade', 'Договір скасовано через зміну балансу сторін.');
      this.resetTurnTimer();
      this.emit();
      this.scheduleBotIfNeeded();
      return { ok: false, error: 'Недостатньо коштів' };
    }

    for (const idx of trade.offerProperties) {
      if (this.state.properties[idx]?.ownerId !== from.id) {
        this.resetTurnTimer();
        this.emit();
        this.scheduleBotIfNeeded();
        return { ok: false, error: 'Власність змінилася' };
      }
    }
    for (const idx of trade.requestProperties) {
      if (this.state.properties[idx]?.ownerId !== to.id) {
        this.resetTurnTimer();
        this.emit();
        this.scheduleBotIfNeeded();
        return { ok: false, error: 'Власність змінилася' };
      }
    }

    from.money = from.money - trade.offerMoney + trade.requestMoney;
    to.money = to.money - trade.requestMoney + trade.offerMoney;

    for (const idx of trade.offerProperties) {
      this.state.properties[idx].ownerId = to.id;
    }
    for (const idx of trade.requestProperties) {
      this.state.properties[idx].ownerId = from.id;
    }

    this.addLog(
      'trade',
      `🤝 Цифровий Підпис підтверджено! ${from.name} та ${to.name} успішно уклали Смарт-Угоду!`,
      to.id
    );
    this.pushToast(
      'Смарт-Угоду підписано',
      `${from.name} ⇄ ${to.name}`,
      'Успішна угода',
      'income'
    );
    this.resetTurnTimer();
    this.emit();
    this.scheduleBotIfNeeded();
    return { ok: true };
  }

  // === END TURN, 3-STRIKE INACTIVITY REMOVAL & BANKRUPTCY ===
  public endTurn(
    playerId: string,
    isAuto = false
  ): { ok: boolean; error?: string } {
    const active = this.getActivePlayer();
    if (!active || active.id !== playerId) {
      return { ok: false, error: 'Зараз не ваш хід' };
    }
    if (this.state.phase !== 'POST_ROLL') {
      return { ok: false, error: 'Спочатку завершіть поточну дію ходу' };
    }
    if (active.doublesCount > 0 && !active.inJail) {
      return { ok: false, error: 'Ви викинули дубль — киньте кубики ще раз!' };
    }

    if (!isAuto) {
      this.recordManualPlayerAction(playerId);
    }

    if (this.state.pendingTrade) {
      this.clearTradeTimer();
      this.state.pendingTrade = null;
    }

    // Track consecutive completely-inactive turns for human players (3 -> eliminated from board)
    if (!active.isBot && !this.state.playerActedThisTurn) {
      const nextMissed = (active.missedTurns ?? 0) + 1;
      active.missedTurns = nextMissed;

      if (nextMissed >= 3) {
        this.eliminatePlayerForInactivity(active.id);
        return { ok: true };
      }

      this.addLog(
        'info',
        `⚠️ ${active.name} пропустив хід без жодної дії (${nextMissed}/3 — після 3 пропусків виліт із гри).`,
        active.id
      );
      this.pushToast(
        `Пропущено хід (${nextMissed}/3)`,
        active.name,
        `Ще ${3 - nextMissed} до вильоту`,
        'info'
      );
    }

    this.advanceToNextPlayer();
    return { ok: true };
  }

  public eliminatePlayerForInactivity(playerId: string): void {
    const removedIdx = this.state.players.findIndex((p) => p.id === playerId);
    if (removedIdx === -1 || this.state.status !== 'playing') return;
    const player = this.state.players[removedIdx];
    const wasActiveTurn = removedIdx === this.state.turnIndex;

    // 1. All purchased properties become completely unowned (free on board, 0 branches, unmortgaged)
    for (const prop of Object.values(this.state.properties)) {
      if (prop.ownerId === player.id) {
        prop.ownerId = null;
        prop.branches = 0;
        prop.isMortgaged = false;
      }
    }

    // 2. Player's money simply disappears (not transferred to any creditor or fund)
    if (!this.state.eliminatedPlayers) {
      this.state.eliminatedPlayers = [];
    }
    if (!this.state.eliminatedPlayers.some((e) => e.id === player.id)) {
      this.state.eliminatedPlayers.push({
        id: player.id,
        name: player.name,
        token: player.token,
        color: player.color,
        teamId: player.teamId,
        reason: 'afk',
        timestamp: Date.now(),
      });
    }

    // 3. Clean up any debt, trade, auction, or animations referencing the eliminated player
    if (this.state.debt) {
      if (this.state.debt.debtorId === player.id) {
        this.state.debt = null;
      } else if (this.state.debt.creditorId === player.id) {
        this.state.debt.creditorId = null;
      }
    }

    if (
      this.state.pendingTrade &&
      (this.state.pendingTrade.fromPlayerId === player.id ||
        this.state.pendingTrade.toPlayerId === player.id)
    ) {
      this.clearTradeTimer();
      this.state.pendingTrade = null;
    }

    if (this.state.lastMove?.playerId === player.id) {
      this.state.lastMove = null;
    }
    if (this.state.latestEventCard?.playerId === player.id) {
      this.state.latestEventCard = null;
    }

    // 4. Remove player completely from the board and players list ("гравців стає менше, зникає з поля")
    this.state.players.splice(removedIdx, 1);

    // 5. Reassign hostId if needed
    if (this.state.hostId === player.id && this.state.players.length > 0) {
      const nextHost =
        this.state.players.find((p) => !p.isBot && p.isConnected) ??
        this.state.players.find((p) => !p.isBot) ??
        this.state.players[0];
      if (nextHost) {
        this.state.hostId = nextHost.id;
      }
    }

    this.addLog(
      'info',
      `🚫 ${player.name} не виконав жодної дії 3 ходи поспіль і вилітає з гри! Його компанії знову нічиї, а кошти зникли.`
    );
    this.pushToast(
      'Виліт із гри (3/3)',
      `${player.name} зникає з поля`,
      'Компанії вільні',
      'expense'
    );

    // 6. Check victory condition (<= 1 player in classic, or <= 1 surviving team in 2v2)
    if (this.checkAndFinalizeVictory()) {
      this.emit();
      return;
    }

    if (this.isTeamMode() && player.teamId) {
      const survivingPartner = this.state.players.find(
        (p) => !p.isBankrupt && p.teamId === player.teamId
      );
      if (survivingPartner) {
        this.addLog(
          'info',
          `⚔️ ${survivingPartner.name} продовжує боротьбу за «${TEAM_META[player.teamId].name}»!`,
          survivingPartner.id
        );
      }
    }

    // 7. Adjust turn index & preserve or finalize any live auction cleanly
    const newCount = this.state.players.length;
    if (wasActiveTurn) {
      if (this.state.auction) {
        this.clearAuctionTimer();
        this.state.auction = null;
      }
      const startSearchIdx = removedIdx % newCount;
      let nextIdx = startSearchIdx;
      for (let offset = 0; offset < newCount; offset++) {
        const candidateIdx = (startSearchIdx + offset) % newCount;
        if (!this.state.players[candidateIdx].isBankrupt) {
          nextIdx = candidateIdx;
          break;
        }
      }

      if (removedIdx >= newCount || nextIdx < removedIdx) {
        this.state.turnNumber += 1;
      }

      this.state.turnIndex = nextIdx;
      const nextPlayer = this.state.players[nextIdx];
      nextPlayer.doublesCount = 0;
      this.state.playerActedThisTurn = false;
      this.state.phase = 'PRE_ROLL';
      this.state.latestEventCard = null;
      this.resetTurnTimer();
      this.emit();
      this.scheduleBotIfNeeded();
    } else {
      if (removedIdx < this.state.turnIndex) {
        this.state.turnIndex = Math.max(0, this.state.turnIndex - 1);
      } else if (this.state.turnIndex >= newCount) {
        this.state.turnIndex = 0;
      }

      if (this.state.phase === 'AUCTION' && this.state.auction) {
        const auc = this.state.auction;
        auc.activeParticipantIds = auc.activeParticipantIds.filter(
          (id) => id !== player.id
        );
        const wasHighest = auc.highestBidderId === player.id;
        if (wasHighest) {
          const cell = BOARD_CELLS[auc.cellIndex];
          auc.highestBidderId = null;
          auc.currentBid = Math.max(
            100,
            Math.floor((cell?.price ?? 400) * 0.25)
          );
        }
        if (
          auc.activeParticipantIds.length === 0 ||
          (auc.activeParticipantIds.length === 1 &&
            auc.highestBidderId === auc.activeParticipantIds[0])
        ) {
          this.finalizeAuction();
          return;
        }
        if (wasHighest) {
          this.resetAuctionTimer(14000);
          this.scheduleBotsForAuction();
        }
      }

      this.emit();
    }
  }

  public declareBankruptcy(
    playerId: string,
    _isAuto = false
  ): { ok: boolean; error?: string } {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.isBankrupt || this.state.status !== 'playing') {
      return { ok: false, error: 'Гравець вже вибув' };
    }

    const creditorId =
      this.state.debt?.debtorId === playerId
        ? this.state.debt.creditorId
        : null;
    const creditor = creditorId
      ? this.state.players.find((p) => p.id === creditorId)
      : null;

    // Sell all branches first
    for (const prop of Object.values(this.state.properties)) {
      if (prop.ownerId === player.id) {
        if (prop.branches > 0) {
          const cell = BOARD_CELLS[prop.cellIndex];
          player.money +=
            prop.branches * Math.floor((cell.branchCost ?? 0) * 0.5);
          prop.branches = 0;
        }
      }
    }

    if (creditor && !creditor.isBankrupt) {
      creditor.money += Math.max(0, player.money);
      creditor.amnestyCards += player.amnestyCards;
      for (const prop of Object.values(this.state.properties)) {
        if (prop.ownerId === player.id) {
          prop.ownerId = creditor.id;
        }
      }
      this.addLog(
        'info',
        `💥 ${player.name} оголосив банкрутство! Усі активи переходять до ${creditor.name}.`,
        player.id
      );
    } else {
      const activeDebt =
        this.state.debt?.debtorId === playerId ? this.state.debt : null;
      const seizedCash = Math.max(0, player.money);
      if (activeDebt && seizedCash > 0) {
        if (activeDebt.isZsu) {
          this.state.zsuTotalDonated += seizedCash;
        }
        if (activeDebt.addToKarpaty && this.state.settings.karpatyBonusEnabled) {
          this.state.karpatyFund += Math.floor(seizedCash * 0.5);
        }
      }
      for (const prop of Object.values(this.state.properties)) {
        if (prop.ownerId === player.id) {
          prop.ownerId = null;
          prop.branches = 0;
          prop.isMortgaged = false;
        }
      }
      this.addLog(
        'info',
        `💥 ${player.name} вибуває з гри! Його компанії повертаються на відкритий ринок.`,
        player.id
      );
    }

    player.money = 0;
    player.amnestyCards = 0;
    player.isBankrupt = true;
    player.inJail = false;

    if (this.state.debt?.debtorId === playerId) {
      this.state.debt = null;
    } else if (this.state.debt?.creditorId === playerId) {
      this.state.debt.creditorId = null;
    }

    if (this.state.hostId === playerId) {
      const nextHost =
        this.state.players.find(
          (p) => !p.isBot && !p.isBankrupt && p.isConnected
        ) ??
        this.state.players.find((p) => !p.isBot && !p.isBankrupt) ??
        this.state.players.find((p) => !p.isBot);
      if (nextHost) {
        this.state.hostId = nextHost.id;
      }
    }

    let cancelledTrade = false;
    if (
      this.state.pendingTrade &&
      (this.state.pendingTrade.fromPlayerId === playerId ||
        this.state.pendingTrade.toPlayerId === playerId)
    ) {
      this.clearTradeTimer();
      this.state.pendingTrade = null;
      this.resetTurnTimer();
      cancelledTrade = true;
    }

    // Check winner (classic or 2v2 alliance victory)
    if (this.checkAndFinalizeVictory()) {
      this.emit();
      return { ok: true };
    }

    if (this.isTeamMode() && player.teamId) {
      const survivingPartner = this.state.players.find(
        (p) => !p.isBankrupt && p.teamId === player.teamId
      );
      if (survivingPartner) {
        this.addLog(
          'info',
          `⚔️ ${survivingPartner.name} залишається в грі та продовжує боротьбу за «${TEAM_META[player.teamId].name}»!`,
          survivingPartner.id
        );
      }
    }

    const active = this.getActivePlayer();

    // Cleanly handle if player left/bankrupted during an active auction without destroying remaining bidders' auction
    if (this.state.phase === 'AUCTION' && this.state.auction) {
      const auc = this.state.auction;
      auc.activeParticipantIds = auc.activeParticipantIds.filter(
        (id) => id !== playerId
      );
      const wasHighest = auc.highestBidderId === playerId;
      if (wasHighest) {
        const cell = BOARD_CELLS[auc.cellIndex];
        auc.highestBidderId = null;
        auc.currentBid = Math.max(
          100,
          Math.floor((cell?.price ?? 400) * 0.25)
        );
      }
      if (
        auc.activeParticipantIds.length === 0 ||
        (auc.activeParticipantIds.length === 1 &&
          auc.highestBidderId === auc.activeParticipantIds[0])
      ) {
        this.finalizeAuction();
        return { ok: true };
      }
      if (wasHighest) {
        this.resetAuctionTimer(14000);
        this.scheduleBotsForAuction();
      }
      this.emit();
      return { ok: true };
    }

    // If active player went bankrupt, advance turn
    if (active?.id === playerId) {
      this.advanceToNextPlayer();
    } else {
      this.emit();
      if (cancelledTrade) {
        this.scheduleBotIfNeeded();
      }
    }
    return { ok: true };
  }

  private checkAndFinalizeVictory(): boolean {
    const alive = this.state.players.filter((p) => !p.isBankrupt);

    if (this.isTeamMode()) {
      const aliveA = alive.filter((p) => p.teamId === 'A');
      const aliveB = alive.filter((p) => p.teamId === 'B');
      if (aliveA.length > 0 && aliveB.length > 0) {
        return false;
      }

      const winningTeamId: TeamId | null =
        aliveA.length > 0 ? 'A' : aliveB.length > 0 ? 'B' : null;
      const winningAlive =
        winningTeamId === 'A'
          ? aliveA
          : winningTeamId === 'B'
            ? aliveB
            : alive;

      const sortedWinning = [...winningAlive].sort(
        (p1, p2) =>
          calculatePlayerNetWorth(p2.id, p2.money, this.state.properties) -
          calculatePlayerNetWorth(p1.id, p1.money, this.state.properties)
      );
      const mvp = sortedWinning[0] ?? null;

      this.state.winningTeamId = winningTeamId;
      this.state.winnerId = mvp?.id ?? null;
      if (mvp) {
        const mvpIdx = this.state.players.findIndex((p) => p.id === mvp.id);
        if (mvpIdx >= 0) this.state.turnIndex = mvpIdx;
      }
      this.state.status = 'finished';
      this.state.phase = 'GAME_OVER';
      this.state.auction = null;
      this.state.turnEndsAt = null;
      this.state.turnDurationMs = null;
      this.clearWatchdog();
      this.clearTurnTimer();
      this.clearAuctionTimer();
      this.clearTradeTimer();
      this.clearBotTimers();

      if (winningTeamId) {
        const teamRoster = [
          ...this.state.players.filter((p) => p.teamId === winningTeamId),
          ...(this.state.eliminatedPlayers ?? []).filter(
            (e) => e.teamId === winningTeamId
          ),
        ];
        const totalTeamNetWorth = winningAlive.reduce(
          (sum, p) =>
            sum + calculatePlayerNetWorth(p.id, p.money, this.state.properties),
          0
        );
        const rosterNames =
          teamRoster.map((m) => m.name).join(' та ') || mvp?.name || 'Альянс';
        this.addLog(
          'win',
          `🏆 КОМАНДНА ПЕРЕМОГА! ${TEAM_META[winningTeamId].name} (${rosterNames}) переміг із сумарним капіталом ${formatMoney(totalTeamNetWorth)}! Слава Україні! 🇺🇦`,
          mvp?.id
        );
      }
      return true;
    }

    if (alive.length > 1) {
      return false;
    }

    const winner = alive[0] ?? null;
    this.state.winningTeamId = null;
    this.state.winnerId = winner?.id ?? null;
    if (winner) {
      const winnerIdx = this.state.players.findIndex((p) => p.id === winner.id);
      if (winnerIdx >= 0) this.state.turnIndex = winnerIdx;
    }
    this.state.status = 'finished';
    this.state.phase = 'GAME_OVER';
    this.state.auction = null;
    this.state.turnEndsAt = null;
    this.state.turnDurationMs = null;
    this.clearWatchdog();
    this.clearTurnTimer();
    this.clearAuctionTimer();
    this.clearTradeTimer();
    this.clearBotTimers();

    if (winner) {
      const netWorth = calculatePlayerNetWorth(
        winner.id,
        winner.money,
        this.state.properties
      );
      this.addLog(
        'win',
        `🏆 ПЕРЕМОГА! ${winner.name} став головним бізнес-магнатом України з капіталом ${formatMoney(netWorth)}! Слава Україні! 🇺🇦`,
        winner.id
      );
    }
    return true;
  }

  private advanceToNextPlayer(): void {
    const count = this.state.players.length;
    if (count === 0) return;
    let nextIdx = this.state.turnIndex;
    for (let i = 1; i <= count; i++) {
      const candidateIdx = (this.state.turnIndex + i) % count;
      if (!this.state.players[candidateIdx].isBankrupt) {
        nextIdx = candidateIdx;
        break;
      }
    }

    if (nextIdx <= this.state.turnIndex) {
      this.state.turnNumber += 1;
    }

    this.state.turnIndex = nextIdx;
    const nextPlayer = this.state.players[nextIdx];
    nextPlayer.doublesCount = 0;
    this.state.playerActedThisTurn = false;
    this.state.phase = 'PRE_ROLL';
    this.state.latestEventCard = null;
    this.resetTurnTimer();
    this.emit();
    this.scheduleBotIfNeeded();
  }

  // === SMART AI BOT ENGINE ===
  private getRemainingVisualMotionMs(
    playerId: string,
    now = Date.now()
  ): number {
    const diceElapsed = now - this.lastRollTimestamp;
    const remDice = diceElapsed < 1350 ? 1350 - diceElapsed : 0;

    if (this.state.lastMove && this.state.lastMove.playerId === playerId) {
      const stepsCount = this.state.lastMove.steps.length;
      const stepMs =
        stepsCount <= 12 ? 215 : Math.max(95, Math.round(2300 / stepsCount));
      const initialDelay =
        Math.abs(this.lastMoveTimestamp - this.lastRollTimestamp) < 250
          ? 1020
          : 160;
      const diceSum = this.state.lastDice
        ? this.state.lastDice[0] + this.state.lastDice[1]
        : 0;
      const hasMidJourneyEventCardPause =
        Boolean(
          this.state.latestEventCard &&
            this.state.latestEventCard.playerId === playerId &&
            diceSum > 0 &&
            stepsCount > diceSum
        );
      const totalMoveMs =
        stepsCount > 0
          ? initialDelay +
            stepsCount * stepMs +
            (hasMidJourneyEventCardPause ? 3450 : 0) +
            220
          : 0;
      const moveElapsed = now - this.lastMoveTimestamp;
      const remMove = moveElapsed < totalMoveMs ? totalMoveMs - moveElapsed : 0;
      return Math.max(remDice, remMove);
    }

    return remDice;
  }

  private scheduleBotIfNeeded(): void {
    if (this.state.status !== 'playing') return;
    if (this.state.pendingTrade) return; // Wait for trade response first
    this.clearBotTimers();
    const active = this.getActivePlayer();
    if (!active || !active.isBot || active.isBankrupt) return;

    if (this.state.phase === 'PRE_ROLL') {
      this.scheduleBotTimeout(() => {
        if (this.getActivePlayer()?.id !== active.id) return;
        this.botManageUpgrades(active);

        if (active.inJail) {
          const unownedCount = Object.values(this.state.properties).filter(
            (p) => !p.ownerId
          ).length;
          if (active.amnestyCards > 0) {
            this.useJailAmnesty(active.id);
            return;
          }
          if (active.money >= 1800 && unownedCount >= 5) {
            this.payJailBail(active.id);
            return;
          }
        }

        this.rollDice(active.id);
      }, 2400);
      return;
    }

    if (this.state.phase === 'BUY_DECISION') {
      const decisionDelay =
        this.getRemainingVisualMotionMs(active.id) +
        2400 +
        (this.state.latestEventCard ? 5400 : 0);
      this.scheduleBotTimeout(() => {
        if (
          this.getActivePlayer()?.id !== active.id ||
          this.state.phase !== 'BUY_DECISION'
        )
          return;
        const cell = BOARD_CELLS[active.position];
        if (!cell || !cell.price) return;

        const teammate = this.getTeammate(active.id);
        const completesMonopoly = Boolean(
          cell.sector &&
            getSectorCells(cell.sector).filter(
              (c) =>
                c.index !== cell.index &&
                (this.state.properties[c.index]?.ownerId === active.id ||
                  (teammate &&
                    !teammate.isBankrupt &&
                    this.state.properties[c.index]?.ownerId === teammate.id))
            ).length ===
              getSectorCells(cell.sector).length - 1
        );

        if (active.money < cell.price && completesMonopoly) {
          // Try mortgaging a single loose property to afford completing monopoly for self or alliance
          this.botRaiseCashSafely(active, cell.price);
        }

        if (
          active.money >= cell.price &&
          (completesMonopoly ||
            active.money - cell.price >= 400 ||
            cell.price <= 2000)
        ) {
          this.buyProperty(active.id);
        } else {
          this.startAuction(active.id);
        }
      }, decisionDelay);
      return;
    }

    if (this.state.phase === 'DEBT_RESOLUTION') {
      const debtDelay =
        this.getRemainingVisualMotionMs(active.id) +
        2300 +
        (this.state.latestEventCard ? 5400 : 0);
      this.scheduleBotTimeout(() => {
        if (
          this.getActivePlayer()?.id !== active.id ||
          this.state.phase !== 'DEBT_RESOLUTION'
        )
          return;
        this.autoLiquidateForPlayer(active.id);
        if (this.state.debt && active.money >= this.state.debt.amount) {
          this.payDebt(active.id);
          return;
        }

        // In 2v2 mode, ask a solvent teammate for emergency rescue before surrendering to bankruptcy!
        if (this.state.debt && this.isTeamMode() && !this.state.pendingTrade) {
          const shortfall = this.state.debt.amount - active.money;
          const rescueKey = `${this.state.turnNumber}:${active.id}:${this.state.debt.amount}:${this.state.debt.reason}`;
          const ally = this.getTeammate(active.id);
          const minAllyReserve = ally?.isBot ? 100 : 0;
          if (
            shortfall > 0 &&
            ally &&
            !ally.isBankrupt &&
            ally.money >= shortfall + minAllyReserve &&
            this.attemptedDebtRescueKey !== rescueKey
          ) {
            this.attemptedDebtRescueKey = rescueKey;
            const res = this.proposeTrade(active.id, {
              toPlayerId: ally.id,
              offerProperties: [],
              requestProperties: [],
              offerMoney: 0,
              requestMoney: shortfall,
            });
            if (res.ok) {
              this.sendChat(
                active.id,
                `🆘 Напарнику, виручай! Бракує ${formatMoney(shortfall)} для порятунку від банкрутства! 🤝`
              );
              return;
            }
          }
        }

        this.declareBankruptcy(active.id);
      }, debtDelay);
      return;
    }

    if (this.state.phase === 'POST_ROLL') {
      const postRollDelay =
        this.getRemainingVisualMotionMs(active.id) +
        (this.state.latestEventCard ? 8600 : 2200);
      this.scheduleBotTimeout(() => {
        if (
          this.getActivePlayer()?.id !== active.id ||
          this.state.phase !== 'POST_ROLL'
        )
          return;
        this.botManageUpgrades(active);

        // In 2v2 mode, proactively unite split monopolies or send urgent support to teammate
        if (
          !this.state.pendingTrade &&
          this.isTeamMode() &&
          this.state.turnNumber - this.lastBotAllyTradeTurn >= 2 &&
          this.botTryProposeAllyConsolidation(active)
        ) {
          this.lastBotAllyTradeTurn = this.state.turnNumber;
          this.syncBotMemoryToState();
          return;
        }

        // Occasional smart bot trade proposal for missing monopoly piece
        if (
          !this.state.pendingTrade &&
          this.state.turnNumber - this.lastBotTradeTurn >= 5 &&
          this.botTryProposeMonopolyTrade(active)
        ) {
          this.lastBotTradeTurn = this.state.turnNumber;
          this.syncBotMemoryToState();
          return;
        }

        if (active.doublesCount > 0 && !active.inJail) {
          this.rollDice(active.id);
        } else {
          this.endTurn(active.id);
        }
      }, postRollDelay);
    }
  }

  private getBotArchetype(bot: Player): {
    preferredSectors: string[];
    sectorAffinityBonus: number;
    auctionAggression: number;
    minAuctionCushion: number;
    branchReserve: number;
  } {
    const name = bot.name.toLowerCase();
    if (bot.token === 'patron' || name.includes('лев')) {
      return {
        preferredSectors: ['fintech', 'ecommerce', 'telecom'],
        sectorAffinityBonus: 1.28,
        auctionAggression: 1.12,
        minAuctionCushion: 400,
        branchReserve: 1250,
      };
    }
    if (bot.token === 'kashtan' || name.includes('леся')) {
      return {
        preferredSectors: ['coffee', 'retail', 'delivery'],
        sectorAffinityBonus: 1.24,
        auctionAggression: 1.06,
        minAuctionCushion: 350,
        branchReserve: 850,
      };
    }
    if (bot.token === 'kozak' || name.includes('тарас')) {
      return {
        preferredSectors: ['fuel', 'ecommerce', 'delivery'],
        sectorAffinityBonus: 1.2,
        auctionAggression: 1.22,
        minAuctionCushion: 250,
        branchReserve: 1100,
      };
    }
    if (bot.token === 'bulava' || name.includes('богдан')) {
      return {
        preferredSectors: ['transport', 'delivery', 'fuel'],
        sectorAffinityBonus: 1.32,
        auctionAggression: 1.1,
        minAuctionCushion: 350,
        branchReserve: 1150,
      };
    }
    // Софія (AI) та інші
    return {
      preferredSectors: ['tech', 'utility', 'telecom'],
      sectorAffinityBonus: 1.28,
      auctionAggression: 1.08,
      minAuctionCushion: 350,
      branchReserve: 1050,
    };
  }

  private botManageUpgrades(bot: Player): void {
    const archetype = this.getBotArchetype(bot);
    // 1. Unmortgage profitable assets (prioritize unlocking full sector monopolies!)
    for (const prop of Object.values(this.state.properties)) {
      if (prop.ownerId === bot.id && prop.isMortgaged) {
        const cost = getUnmortgageCost(prop.cellIndex);
        const cell = BOARD_CELLS[prop.cellIndex];
        const unlocksSectorMonopoly = Boolean(
          cell?.type === 'company' &&
            cell.sector &&
            hasFullSectorMonopoly(
              bot.id,
              cell.sector,
              this.state.properties,
              true
            )
        );
        const minCushion = unlocksSectorMonopoly ? 900 : 2100;
        if (bot.money - cost >= minCushion) {
          this.unmortgageProperty(bot.id, prop.cellIndex);
        }
      }
    }

    // 2. Build branches evenly while maintaining personality-specific cash cushion (prioritize preferred sectors first)
    const reserve = archetype.branchReserve;
    const sortedCompanyCells = BOARD_CELLS.filter(
      (c) => c.type === 'company' && c.branchCost
    ).sort((a, b) => {
      const aPref = a.sector && archetype.preferredSectors.includes(a.sector) ? 1 : 0;
      const bPref = b.sector && archetype.preferredSectors.includes(b.sector) ? 1 : 0;
      return bPref - aPref;
    });
    let builtAny = true;
    let safety = 0;
    while (builtAny && safety < 8) {
      builtAny = false;
      safety += 1;
      for (const cell of sortedCompanyCells) {
        if (
          cell.branchCost &&
          bot.money - cell.branchCost >= reserve
        ) {
          const check = canBuildBranch(
            bot.id,
            cell.index,
            bot.money,
            this.state.properties
          );
          if (check.ok) {
            this.buildBranch(bot.id, cell.index);
            builtAny = true;
            break;
          }
        }
      }
    }
  }

  private botRaiseCashSafely(bot: Player, targetMoney: number): void {
    for (const cell of BOARD_CELLS) {
      if (bot.money >= targetMoney) break;
      const prop = this.state.properties[cell.index];
      if (!prop || prop.ownerId !== bot.id || prop.isMortgaged) continue;
      if (
        cell.sector &&
        hasFullSectorMonopoly(bot.id, cell.sector, this.state.properties, false)
      ) {
        continue;
      }
      if (canMortgageProperty(bot.id, cell.index, this.state.properties).ok) {
        this.mortgageProperty(bot.id, cell.index, true);
      }
    }
  }

  private autoLiquidateForPlayer(playerId: string, isAuto = false): void {
    const player = this.state.players.find((p) => p.id === playerId);
    const target = this.state.debt?.amount ?? 0;
    if (!player || player.money >= target) return;

    // 1. Mortgage non-monopoly properties first
    for (const cell of BOARD_CELLS) {
      if (player.money >= target) return;
      const prop = this.state.properties[cell.index];
      if (!prop || prop.ownerId !== playerId || prop.isMortgaged) continue;
      const isMono =
        cell.sector &&
        hasFullSectorMonopoly(
          playerId,
          cell.sector,
          this.state.properties,
          false
        );
      if (
        !isMono &&
        canMortgageProperty(playerId, cell.index, this.state.properties).ok
      ) {
        this.mortgageProperty(playerId, cell.index, isAuto);
      }
    }

    // 2. Sell branches evenly if still short
    let safety = 0;
    while (player.money < target && safety < 60) {
      safety += 1;
      let sold = false;
      for (const cell of BOARD_CELLS) {
        if (canSellBranch(playerId, cell.index, this.state.properties).ok) {
          this.sellBranch(playerId, cell.index, isAuto);
          sold = true;
          if (player.money >= target) return;
        }
      }
      if (!sold) break;
    }

    // 3. Mortgage remaining properties
    for (const cell of BOARD_CELLS) {
      if (player.money >= target) return;
      if (canMortgageProperty(playerId, cell.index, this.state.properties).ok) {
        this.mortgageProperty(playerId, cell.index, isAuto);
      }
    }
  }

  private scheduleBotsForAuction(): void {
    if (this.state.phase !== 'AUCTION' || !this.state.auction) return;
    this.clearBotTimers();
    const auc = this.state.auction;
    const cell = BOARD_CELLS[auc.cellIndex];
    if (!cell || !cell.price) return;

    const activeBots = auc.activeParticipantIds
      .map((id) => this.state.players.find((p) => p.id === id))
      .filter((p): p is Player => Boolean(p && p.isBot && !p.isBankrupt));

    activeBots.forEach((bot, idx) => {
      const delay = 2200 + idx * 1100 + Math.floor(Math.random() * 850);
      this.scheduleBotTimeout(() => {
        if (
          this.state.phase !== 'AUCTION' ||
          !this.state.auction ||
          this.state.auction.cellIndex !== cell.index
        )
          return;
        if (!this.state.auction.activeParticipantIds.includes(bot.id)) return;
        if (this.state.auction.highestBidderId === bot.id) return;

        // Never bid against your own teammate in 2v2!
        if (
          this.state.auction.highestBidderId &&
          this.areAllies(bot.id, this.state.auction.highestBidderId)
        ) {
          this.passAuction(bot.id);
          return;
        }

        const maxVal = this.evaluatePropertyForBot(bot, cell.index);
        const nextMinBid =
          this.state.auction.highestBidderId === null
            ? this.state.auction.currentBid
            : this.state.auction.currentBid + 100;

        if (nextMinBid <= maxVal && bot.money >= nextMinBid + 300) {
          const firstStep =
            this.state.auction.highestBidderId === null ? 0 : 100;
          const step = maxVal - nextMinBid >= 400 ? 250 : firstStep;
          if (bot.money >= this.state.auction.currentBid + step) {
            this.placeAuctionBid(bot.id, step);
          } else {
            this.placeAuctionBid(bot.id, firstStep);
          }
        } else {
          this.passAuction(bot.id);
        }
      }, delay);
    });
  }

  private evaluatePropertyForBot(bot: Player, cellIndex: number): number {
    const cell = BOARD_CELLS[cellIndex];
    if (!cell || !cell.price) return 0;
    const archetype = this.getBotArchetype(bot);
    const isPreferredSector = Boolean(
      cell.sector && archetype.preferredSectors.includes(cell.sector)
    );
    let value =
      cell.price *
      0.95 *
      archetype.auctionAggression *
      (isPreferredSector ? archetype.sectorAffinityBonus : 1);

    if (cell.sector) {
      const sectorCells = getSectorCells(cell.sector);
      const teammate = this.getTeammate(bot.id);
      const botOwned = sectorCells.filter(
        (c) => this.state.properties[c.index]?.ownerId === bot.id
      ).length;
      const allyOwned =
        teammate && !teammate.isBankrupt
          ? sectorCells.filter(
              (c) => this.state.properties[c.index]?.ownerId === teammate.id
            ).length
          : 0;

      if (botOwned === sectorCells.length - 1) {
        value = Math.max(value, cell.price * 1.48 * archetype.auctionAggression); // Completes bot's monopoly!
      } else if (allyOwned === sectorCells.length - 1) {
        value = Math.max(value, cell.price * 1.42); // Secures teammate's monopoly!
      } else if (botOwned + allyOwned === sectorCells.length - 1) {
        value = Math.max(value, cell.price * 1.35); // Secures alliance sector for Smart-Trade union!
      } else if (botOwned > 0 || allyOwned > 0) {
        value = Math.max(
          value,
          cell.price * 1.18 * (isPreferredSector ? 1.12 : 1)
        );
      }

      // Check if an opposing player/alliance would complete monopoly with it
      for (const other of this.state.players) {
        if (
          other.id !== bot.id &&
          !other.isBankrupt &&
          !this.areAllies(bot.id, other.id)
        ) {
          const otherTeammate = this.getTeammate(other.id);
          const otherOwned = sectorCells.filter(
            (c) =>
              this.state.properties[c.index]?.ownerId === other.id ||
              (otherTeammate &&
                !otherTeammate.isBankrupt &&
                this.state.properties[c.index]?.ownerId === otherTeammate.id)
          ).length;
          if (otherOwned === sectorCells.length - 1) {
            value = Math.max(
              value,
              cell.price * 1.32 * archetype.auctionAggression
            );
          }
        }
      }
    }

    return Math.min(
      Math.floor(value),
      Math.max(0, bot.money - archetype.minAuctionCushion)
    );
  }

  private scheduleBotTradeDecision(bot: Player, trade: TradeOffer): void {
    this.scheduleBotTimeout(() => {
      if (this.state.pendingTrade?.id !== trade.id) return;

      const isAlly = this.areAllies(bot.id, trade.fromPlayerId);
      let breaksCompletedBotMonopoly = false;
      if (isAlly) {
        breaksCompletedBotMonopoly = trade.requestProperties.some(
          (idx) => {
            const c = BOARD_CELLS[idx];
            return Boolean(
              c?.type === 'company' &&
                c.sector &&
                hasFullSectorMonopoly(
                  bot.id,
                  c.sector,
                  this.state.properties,
                  false
                )
            );
          }
        );
        const proposerInEmergencyDebt =
          this.state.phase === 'DEBT_RESOLUTION' &&
          this.state.debt?.debtorId === trade.fromPlayerId;
        const minCashReserve = proposerInEmergencyDebt ? 100 : 600;
        const botCashAfter =
          bot.money - trade.requestMoney + trade.offerMoney;
        const cashSafe =
          trade.requestMoney === 0 || botCashAfter >= minCashReserve;

        if (!breaksCompletedBotMonopoly && cashSafe) {
          this.sendChat(
            bot.id,
            proposerInEmergencyDebt && trade.requestMoney > 0
              ? 'Напарнику, тримай фінансову підтримку — рятуємо активи нашої команди! 🤝🇺🇦'
              : 'Для нашої команди — завжди! Підписую Смарт-Угоду 🤝🇺🇦'
          );
          this.respondTrade(bot.id, true);
          return;
        }
        if (!cashSafe) {
          this.sendChat(
            bot.id,
            proposerInEmergencyDebt
              ? 'Напарнику, на жаль, у мене зараз не вистачає вільної готівки на такий транш 🙏'
              : 'Напарнику, мені потрібно залишити хоча б 600 ₴ резерву на хід 🙏'
          );
          this.respondTrade(bot.id, false);
          return;
        }
      }

      let valueReceived = trade.offerMoney;
      let valueGiven = trade.requestMoney;
      const botTeammate = this.getTeammate(bot.id);
      const proposerTeammate = this.getTeammate(trade.fromPlayerId);

      for (const idx of trade.offerProperties) {
        const cell = BOARD_CELLS[idx];
        const prop = this.state.properties[idx];
        if (!cell?.price) continue;
        let v = prop?.isMortgaged ? cell.price * 0.5 : cell.price;
        if (cell.sector) {
          const sec = getSectorCells(cell.sector);
          const botHas = sec.filter(
            (c) => this.state.properties[c.index]?.ownerId === bot.id
          ).length;
          if (botHas + 1 >= sec.length) v *= 1.65;
          else if (botHas > 0) v *= 1.2;
        }
        valueReceived += v;
      }

      for (const idx of trade.requestProperties) {
        const cell = BOARD_CELLS[idx];
        const prop = this.state.properties[idx];
        if (!cell?.price) continue;
        let v = prop?.isMortgaged ? cell.price * 0.55 : cell.price * 1.1;
        if (cell.sector) {
          const sec = getSectorCells(cell.sector);
          const botTeamHas = sec.filter(
            (c) =>
              this.state.properties[c.index]?.ownerId === bot.id ||
              (botTeammate &&
                !botTeammate.isBankrupt &&
                this.state.properties[c.index]?.ownerId === botTeammate.id)
          ).length;
          const proposerTeamHas = sec.filter(
            (c) =>
              this.state.properties[c.index]?.ownerId === trade.fromPlayerId ||
              (proposerTeammate &&
                !proposerTeammate.isBankrupt &&
                this.state.properties[c.index]?.ownerId === proposerTeammate.id)
          ).length;
          // If bot/alliance already has multiple in sector or it hands monopoly to opposing alliance, demand strong premium!
          if (botTeamHas >= sec.length - 1) v *= 1.8;
          if (!isAlly && proposerTeamHas + 1 >= sec.length) v *= 1.42;
        }
        valueGiven += v;
      }

      const accept = valueReceived >= valueGiven * (isAlly ? 0.95 : 0.98);
      if (accept) {
        this.sendChat(
          bot.id,
          isAlly
            ? 'Чудовий обмін для нашого альянсу! Підписую 🤝🇺🇦'
            : 'Вигідна пропозиція! Завіряю Цифровим Підписом 🤝'
        );
      } else {
        this.sendChat(
          bot.id,
          isAlly && breaksCompletedBotMonopoly
            ? 'Напарнику, у мене вже зібрана ця повна монополія — будуватиму на ній філії для нашого альянсу! 🤝👑'
            : 'Ні, друже, за таку ціну стратегічний актив не віддам 😎'
        );
      }
      this.respondTrade(bot.id, accept);
    }, 2800);
  }

  private botTryProposeAllyConsolidation(bot: Player): boolean {
    const ally = this.getTeammate(bot.id);
    if (!ally || ally.isBankrupt) return false;

    const sectors = [
      'coffee',
      'retail',
      'delivery',
      'fuel',
      'ecommerce',
      'telecom',
      'tech',
      'fintech',
    ] as const;

    for (const sec of sectors) {
      const cells = getSectorCells(sec);
      const hasBranches = cells.some(
        (c) => (this.state.properties[c.index]?.branches ?? 0) > 0
      );
      if (hasBranches) continue;

      const botCells = cells.filter(
        (c) => this.state.properties[c.index]?.ownerId === bot.id
      );
      const allyCells = cells.filter(
        (c) => this.state.properties[c.index]?.ownerId === ally.id
      );

      // Together, bot and teammate hold 100% of this sector — consolidate into 1 full monopoly!
      if (
        botCells.length > 0 &&
        allyCells.length > 0 &&
        botCells.length + allyCells.length === cells.length
      ) {
        const giftToAlly = !ally.isBot || allyCells.length > botCells.length;
        if (giftToAlly) {
          const res = this.proposeTrade(bot.id, {
            toPlayerId: ally.id,
            offerProperties: botCells.map((c) => c.index),
            requestProperties: [],
            offerMoney: 0,
            requestMoney: 0,
          });
          if (res.ok) {
            this.sendChat(
              bot.id,
              `Напарнику, передаю актив, щоб ти зібрав повну монополію «${cells[0]?.sectorName ?? sec}»! 🤝👑`
            );
            return true;
          }
        } else {
          const res = this.proposeTrade(bot.id, {
            toPlayerId: ally.id,
            offerProperties: [],
            requestProperties: allyCells.map((c) => c.index),
            offerMoney: 0,
            requestMoney: 0,
          });
          if (res.ok) {
            this.sendChat(
              bot.id,
              `Об'єднаймо сектор «${cells[0]?.sectorName ?? sec}» в одну монополію нашого альянсу! 🤝`
            );
            return true;
          }
        }
      }
    }

    // Emergency cash aid if teammate is dangerously low on money while bot has deep reserves
    if (ally.money < 350 && bot.money >= 3400) {
      const aidAmount = 900;
      const res = this.proposeTrade(bot.id, {
        toPlayerId: ally.id,
        offerProperties: [],
        requestProperties: [],
        offerMoney: aidAmount,
        requestMoney: 0,
      });
      if (res.ok) {
        this.sendChat(
          bot.id,
          `Підтримую напарника фінансовим траншем +${formatMoney(aidAmount)}! 🤝🇺🇦`
        );
        return true;
      }
    }

    return false;
  }

  private botTryProposeMonopolyTrade(bot: Player): boolean {
    const sectors = [
      'coffee',
      'retail',
      'delivery',
      'fuel',
      'ecommerce',
      'telecom',
      'tech',
      'fintech',
    ] as const;

    for (const sec of sectors) {
      const cells = getSectorCells(sec);
      const botCells = cells.filter(
        (c) => this.state.properties[c.index]?.ownerId === bot.id
      );
      if (botCells.length === cells.length - 1) {
        const missing = cells.find(
          (c) => this.state.properties[c.index]?.ownerId !== bot.id
        );
        if (!missing || !missing.price) continue;
        const ownerId = this.state.properties[missing.index]?.ownerId;
        if (!ownerId) continue;
        const owner = this.state.players.find(
          (p) => p.id === ownerId && !p.isBankrupt
        );
        if (!owner || this.areAllies(bot.id, owner.id)) continue;

        const hasBranches = cells.some(
          (c) => (this.state.properties[c.index]?.branches ?? 0) > 0
        );
        if (hasBranches) continue;

        const cooldownKey = `${bot.id}:${owner.id}:${missing.index}`;
        const rejectedAt = this.rejectedBotTradeCooldowns.get(cooldownKey);
        if (
          rejectedAt !== undefined &&
          this.state.turnNumber - rejectedAt < 10
        ) {
          continue;
        }

        // In 2-card sectors (coffee / fintech), rival also holds 1/2 and demands higher buyout premium
        const multiplier = cells.length === 2 ? 1.85 : 1.65;
        const offerPrice = Math.round(missing.price * multiplier);
        if (bot.money >= offerPrice + 1400) {
          const res = this.proposeTrade(bot.id, {
            toPlayerId: owner.id,
            offerProperties: [],
            requestProperties: [missing.index],
            offerMoney: offerPrice,
            requestMoney: 0,
          });
          if (res.ok) return true;
        }
      }
    }
    return false;
  }

  public getPlayerMaxLiquidatable(playerId: string): number {
    const p = this.state.players.find((pl) => pl.id === playerId);
    if (!p) return 0;
    return calculateMaxLiquidatableCash(
      playerId,
      p.money,
      this.state.properties
    );
  }

  private executeBotTradeDecisionImmediate(
    bot: Player,
    trade: TradeOffer
  ): boolean {
    if (this.state.pendingTrade?.id !== trade.id) return false;
    const isAlly = this.areAllies(bot.id, trade.fromPlayerId);
    let breaksCompletedBotMonopoly = false;
    if (isAlly) {
      breaksCompletedBotMonopoly = trade.requestProperties.some((idx) => {
        const c = BOARD_CELLS[idx];
        return Boolean(
          c?.type === 'company' &&
            c.sector &&
            hasFullSectorMonopoly(
              bot.id,
              c.sector,
              this.state.properties,
              false
            )
        );
      });
      const proposerInEmergencyDebt =
        this.state.phase === 'DEBT_RESOLUTION' &&
        this.state.debt?.debtorId === trade.fromPlayerId;
      const minCashReserve = proposerInEmergencyDebt ? 100 : 600;
      const botCashAfter =
        bot.money - trade.requestMoney + trade.offerMoney;
      const cashSafe =
        trade.requestMoney === 0 || botCashAfter >= minCashReserve;

      if (!breaksCompletedBotMonopoly && cashSafe) {
        this.sendChat(
          bot.id,
          proposerInEmergencyDebt && trade.requestMoney > 0
            ? 'Напарнику, тримай фінансову підтримку — рятуємо активи нашої команди! 🤝🇺🇦'
            : 'Для нашої команди — завжди! Підписую Смарт-Угоду 🤝🇺🇦'
        );
        this.respondTrade(bot.id, true);
        return true;
      }
      if (!cashSafe) {
        this.sendChat(
          bot.id,
          proposerInEmergencyDebt
            ? 'Напарнику, на жаль, у мене зараз не вистачає вільної готівки на такий транш 🙏'
            : 'Напарнику, мені потрібно залишити хоча б 600 ₴ резерву на хід 🙏'
        );
        this.respondTrade(bot.id, false);
        return true;
      }
    }

    let valueReceived = trade.offerMoney;
    let valueGiven = trade.requestMoney;
    const botTeammate = this.getTeammate(bot.id);
    const proposerTeammate = this.getTeammate(trade.fromPlayerId);

    for (const idx of trade.offerProperties) {
      const cell = BOARD_CELLS[idx];
      const prop = this.state.properties[idx];
      if (!cell?.price) continue;
      let v = prop?.isMortgaged ? cell.price * 0.5 : cell.price;
      if (cell.sector) {
        const sec = getSectorCells(cell.sector);
        const botHas = sec.filter(
          (c) => this.state.properties[c.index]?.ownerId === bot.id
        ).length;
        if (botHas + 1 >= sec.length) v *= 1.65;
        else if (botHas > 0) v *= 1.2;
      }
      valueReceived += v;
    }

    for (const idx of trade.requestProperties) {
      const cell = BOARD_CELLS[idx];
      const prop = this.state.properties[idx];
      if (!cell?.price) continue;
      let v = prop?.isMortgaged ? cell.price * 0.55 : cell.price * 1.1;
      if (cell.sector) {
        const sec = getSectorCells(cell.sector);
        const botTeamHas = sec.filter(
          (c) =>
            this.state.properties[c.index]?.ownerId === bot.id ||
            (botTeammate &&
              !botTeammate.isBankrupt &&
              this.state.properties[c.index]?.ownerId === botTeammate.id)
        ).length;
        const proposerTeamHas = sec.filter(
          (c) =>
            this.state.properties[c.index]?.ownerId === trade.fromPlayerId ||
            (proposerTeammate &&
              !proposerTeammate.isBankrupt &&
              this.state.properties[c.index]?.ownerId === proposerTeammate.id)
        ).length;
        if (botTeamHas >= sec.length - 1) v *= 1.8;
        if (!isAlly && proposerTeamHas + 1 >= sec.length) v *= 1.42;
      }
      valueGiven += v;
    }

    const accept = valueReceived >= valueGiven * (isAlly ? 0.95 : 0.98);
    if (accept) {
      this.sendChat(
        bot.id,
        isAlly
          ? 'Чудовий обмін для нашого альянсу! Підписую 🤝🇺🇦'
          : 'Вигідна пропозиція! Завіряю Цифровим Підписом 🤝'
      );
    } else {
      this.sendChat(
        bot.id,
        isAlly && breaksCompletedBotMonopoly
          ? 'Напарнику, у мене вже зібрана ця повна монополія — будуватиму на ній філії для нашого альянсу! 🤝👑'
          : 'Ні, друже, за таку ціну стратегічний актив не віддам 😎'
      );
    }
    this.respondTrade(bot.id, accept);
    return true;
  }

  private executeBotAuctionStepImmediate(bot: Player): boolean {
    if (this.state.phase !== 'AUCTION' || !this.state.auction) return false;
    const auc = this.state.auction;
    const cell = BOARD_CELLS[auc.cellIndex];
    if (!cell || !cell.price) return false;
    if (!auc.activeParticipantIds.includes(bot.id)) return false;
    if (auc.highestBidderId === bot.id) return false;

    if (auc.highestBidderId && this.areAllies(bot.id, auc.highestBidderId)) {
      this.passAuction(bot.id);
      return true;
    }

    const maxVal = this.evaluatePropertyForBot(bot, cell.index);
    const nextMinBid =
      auc.highestBidderId === null ? auc.currentBid : auc.currentBid + 100;

    if (nextMinBid <= maxVal && bot.money >= nextMinBid + 300) {
      const firstStep = auc.highestBidderId === null ? 0 : 100;
      const step = maxVal - nextMinBid >= 400 ? 250 : firstStep;
      if (bot.money >= auc.currentBid + step) {
        this.placeAuctionBid(bot.id, step);
      } else {
        this.placeAuctionBid(bot.id, firstStep);
      }
    } else {
      this.passAuction(bot.id);
    }
    return true;
  }

  private executeBotStepImmediate(active: Player): boolean {
    if (this.state.status !== 'playing') return false;
    if (this.state.pendingTrade) return false;
    if (
      !active ||
      !active.isBot ||
      active.isBankrupt ||
      this.getActivePlayer()?.id !== active.id
    ) {
      return false;
    }

    if (this.state.phase === 'PRE_ROLL') {
      this.botManageUpgrades(active);
      if (active.inJail) {
        const unownedCount = Object.values(this.state.properties).filter(
          (p) => !p.ownerId
        ).length;
        if (active.amnestyCards > 0) {
          this.useJailAmnesty(active.id);
          return true;
        }
        if (active.money >= 1800 && unownedCount >= 5) {
          this.payJailBail(active.id);
          return true;
        }
      }
      this.rollDice(active.id);
      return true;
    }

    if (this.state.phase === 'BUY_DECISION') {
      const cell = BOARD_CELLS[active.position];
      if (!cell || !cell.price) {
        this.startAuction(active.id);
        return true;
      }

      const teammate = this.getTeammate(active.id);
      const completesMonopoly = Boolean(
        cell.sector &&
          getSectorCells(cell.sector).filter(
            (c) =>
              c.index !== cell.index &&
              (this.state.properties[c.index]?.ownerId === active.id ||
                (teammate &&
                  !teammate.isBankrupt &&
                  this.state.properties[c.index]?.ownerId === teammate.id))
          ).length ===
            getSectorCells(cell.sector).length - 1
      );

      if (active.money < cell.price && completesMonopoly) {
        this.botRaiseCashSafely(active, cell.price);
      }

      if (
        active.money >= cell.price &&
        (completesMonopoly ||
          active.money - cell.price >= 400 ||
          cell.price <= 2000)
      ) {
        this.buyProperty(active.id);
      } else {
        this.startAuction(active.id);
      }
      return true;
    }

    if (this.state.phase === 'DEBT_RESOLUTION') {
      this.autoLiquidateForPlayer(active.id);
      if (this.state.debt && active.money >= this.state.debt.amount) {
        this.payDebt(active.id);
        return true;
      }

      if (this.state.debt && this.isTeamMode() && !this.state.pendingTrade) {
        const shortfall = this.state.debt.amount - active.money;
        const rescueKey = `${this.state.turnNumber}:${active.id}:${this.state.debt.amount}:${this.state.debt.reason}`;
        const ally = this.getTeammate(active.id);
        const minAllyReserve = ally?.isBot ? 100 : 0;
        if (
          shortfall > 0 &&
          ally &&
          !ally.isBankrupt &&
          ally.money >= shortfall + minAllyReserve &&
          this.attemptedDebtRescueKey !== rescueKey
        ) {
          this.attemptedDebtRescueKey = rescueKey;
          const res = this.proposeTrade(active.id, {
            toPlayerId: ally.id,
            offerProperties: [],
            requestProperties: [],
            offerMoney: 0,
            requestMoney: shortfall,
          });
          if (res.ok) {
            this.sendChat(
              active.id,
              `🆘 Напарнику, виручай! Бракує ${formatMoney(shortfall)} для порятунку від банкрутства! 🤝`
            );
            return true;
          }
        }
      }

      this.declareBankruptcy(active.id);
      return true;
    }

    if (this.state.phase === 'POST_ROLL') {
      this.botManageUpgrades(active);

      if (
        !this.state.pendingTrade &&
        this.isTeamMode() &&
        this.state.turnNumber - this.lastBotAllyTradeTurn >= 2 &&
        this.botTryProposeAllyConsolidation(active)
      ) {
        this.lastBotAllyTradeTurn = this.state.turnNumber;
        this.syncBotMemoryToState();
        return true;
      }

      if (
        !this.state.pendingTrade &&
        this.state.turnNumber - this.lastBotTradeTurn >= 5 &&
        this.botTryProposeMonopolyTrade(active)
      ) {
        this.lastBotTradeTurn = this.state.turnNumber;
        this.syncBotMemoryToState();
        return true;
      }

      if (active.doublesCount > 0 && !active.inJail) {
        this.rollDice(active.id);
      } else {
        this.endTurn(active.id);
      }
      return true;
    }

    return false;
  }

  /**
   * Advances overdue timers, auctions, trades, and AI bot steps synchronously
   * when running inside a stateless Serverless Function (e.g. Netlify Database).
   */
  public advanceServerlessTick(now = Date.now()): boolean {
    let mutated = false;

    for (const p of this.state.players) {
      if (
        !p.isBot &&
        p.isConnected &&
        typeof p.lastSeenAt === 'number' &&
        now - p.lastSeenAt > 20000
      ) {
        p.isConnected = false;
        mutated = true;
      }
    }

    if (this.state.status !== 'playing' || this.state.phase === 'GAME_OVER') {
      return mutated;
    }

    const lastStepTs = Math.max(
      this.state.lastStepAt ?? 0,
      this.state.logs[0]?.timestamp ?? 0
    );

    // 1. Pending Smart-Trade
    if (this.state.pendingTrade) {
      const trade = this.state.pendingTrade;
      const target = this.state.players.find(
        (p) => p.id === trade.toPlayerId
      );
      if (target?.isBot && now - trade.createdAt >= 2000) {
        return this.executeBotTradeDecisionImmediate(target, trade) || mutated;
      }
      if (now >= trade.expiresAt + 250) {
        this.respondTrade(trade.toPlayerId, false, true);
        return true;
      }
      return mutated;
    }

    // 2. Active Auction
    if (this.state.phase === 'AUCTION' && this.state.auction) {
      const auc = this.state.auction;
      const activeBots = auc.activeParticipantIds
        .map((id) => this.state.players.find((p) => p.id === id))
        .filter((p): p is Player => Boolean(p && p.isBot && !p.isBankrupt));
      const nextBot = activeBots.find((b) => b.id !== auc.highestBidderId);
      if (nextBot && now - lastStepTs >= 1800) {
        return this.executeBotAuctionStepImmediate(nextBot) || mutated;
      }
      if (now >= auc.endsAt + 250) {
        this.finalizeAuction();
        return true;
      }
      return mutated;
    }

    // 3. Active AI Bot Turn
    const active = this.getActivePlayer();
    if (active && active.isBot && !active.isBankrupt) {
      const remMotionMs = this.getRemainingVisualMotionMs(active.id, now);
      const minStepDelay =
        this.state.phase === 'PRE_ROLL'
          ? 1600
          : this.state.latestEventCard
            ? Math.max(4200, remMotionMs + 2200)
            : Math.max(2100, remMotionMs + 1100);
      if (now - lastStepTs >= minStepDelay) {
        return this.executeBotStepImmediate(active) || mutated;
      }
    }

    // 4. Turn Timeout
    if (this.state.turnEndsAt === null) {
      this.resetTurnTimer();
      return true;
    }
    if (now >= this.state.turnEndsAt + 300) {
      this.handleTurnTimeout();
      return true;
    }

    return mutated;
  }
}

