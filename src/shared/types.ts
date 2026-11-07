export type TokenId =
  | 'tryzub'
  | 'mriya'
  | 'kozak'
  | 'patron'
  | 'kashtan'
  | 'bulava'
  | 'kotyk'
  | 'paddington'
  | 'potter'
  | 'mickey';

export type GameMode = 'classic' | 'team2v2';
export type TeamId = 'A' | 'B';

export type CellType =
  | 'start'
  | 'company'
  | 'transport'
  | 'utility'
  | 'event_diia'
  | 'event_unity'
  | 'tax'
  | 'jail'
  | 'karpaty'
  | 'sbu';

export type SectorId =
  | 'coffee'
  | 'retail'
  | 'delivery'
  | 'fuel'
  | 'ecommerce'
  | 'telecom'
  | 'tech'
  | 'fintech'
  | 'transport'
  | 'utility';

export interface TokenDefinition {
  id: TokenId;
  name: string;
  title: string;
  defaultColor: string;
}

export interface BoardCell {
  index: number;
  name: string;
  shortName: string;
  subtitle?: string;
  type: CellType;
  sector?: SectorId;
  sectorName?: string;
  color?: string;
  brandKey: string;
  price?: number;
  /**
   * For 'company': [base, 1branch, 2branches, 3branches, 4branches, holding]
   * For 'transport': [1owned, 2owned, 3owned, 4owned]
   */
  rent?: number[];
  branchCost?: number;
  taxAmount?: number;
  description: string;
}

export interface PropertyState {
  cellIndex: number;
  ownerId: string | null;
  /** 0 = no branches, 1..4 = Філії, 5 = Головний Холдинг */
  branches: number;
  isMortgaged: boolean;
}

export interface Player {
  id: string;
  name: string;
  token: TokenId;
  color: string;
  teamId?: TeamId;
  money: number;
  position: number;
  isBot: boolean;
  botPersonality?: string;
  isConnected: boolean;
  isBankrupt: boolean;
  inJail: boolean;
  jailTurns: number;
  amnestyCards: number;
  doublesCount: number;
  /** Consecutive turns completed with zero manual player actions (3 -> eliminated from match) */
  missedTurns?: number;
  /** Last heartbeat/action timestamp for serverless presence detection */
  lastSeenAt?: number;
}

export interface EliminatedPlayerRecord {
  id: string;
  name: string;
  token: TokenId;
  color: string;
  teamId?: TeamId;
  reason: 'afk';
  timestamp: number;
}

export type TurnPhase =
  | 'WAITING'
  | 'PRE_ROLL'
  | 'BUY_DECISION'
  | 'AUCTION'
  | 'DEBT_RESOLUTION'
  | 'POST_ROLL'
  | 'GAME_OVER';

export interface AuctionState {
  cellIndex: number;
  currentBid: number;
  highestBidderId: string | null;
  activeParticipantIds: string[];
  endsAt: number;
}

export interface TradeOffer {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  offerProperties: number[];
  requestProperties: number[];
  offerMoney: number;
  requestMoney: number;
  createdAt: number;
  expiresAt: number;
}

export interface EventCardDisplay {
  id: string;
  deck: 'diia' | 'unity';
  title: string;
  description: string;
  badge: string;
  impactText: string;
  playerId: string;
  timestamp: number;
}

export interface DebtState {
  debtorId: string;
  creditorId: string | null;
  amount: number;
  reason: string;
  canRollAgainAfter: boolean;
  isZsu?: boolean;
  addToKarpaty?: boolean;
  pendingMoveSteps?: number;
}

export interface GameLogEntry {
  id: string;
  timestamp: number;
  type:
    | 'info'
    | 'roll'
    | 'buy'
    | 'rent'
    | 'auction'
    | 'event'
    | 'trade'
    | 'jail'
    | 'zsu'
    | 'win';
  text: string;
  playerId?: string;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  playerColor: string;
  text: string;
  isQuickReaction?: boolean;
  timestamp: number;
}

export interface RoomSettings {
  roomName: string;
  gameMode?: GameMode;
  maxPlayers: number;
  startingMoney: number;
  turnTimeSeconds: number;
  isPublic: boolean;
  karpatyBonusEnabled: boolean;
}

export interface MoveAnimationData {
  playerId: string;
  from: number;
  to: number;
  steps: number[];
  moveId: number;
  timestamp?: number;
}

export interface BotMemoryState {
  lastBotTradeTurn: number;
  lastBotAllyTradeTurn: number;
  attemptedDebtRescueKey: string | null;
  rejectedCooldowns: Record<string, number>;
}

export interface ToastTransfer {
  id: number;
  title: string;
  subtitle: string;
  amountText: string;
  variant: 'income' | 'expense' | 'info' | 'zsu';
}

export interface GameState {
  roomCode: string;
  hostId: string;
  settings: RoomSettings;
  status: 'lobby' | 'playing' | 'finished';
  phase: TurnPhase;
  turnIndex: number;
  turnNumber: number;
  turnEndsAt: number | null;
  turnDurationMs?: number | null;
  lastStepAt?: number;
  serverTime?: number;
  playerActedThisTurn?: boolean;
  eliminatedPlayers?: EliminatedPlayerRecord[];
  botMemory?: BotMemoryState;
  players: Player[];
  properties: Record<number, PropertyState>;
  lastDice: [number, number] | null;
  diceRollId: number;
  lastMove: MoveAnimationData | null;
  lastToast: ToastTransfer | null;
  auction: AuctionState | null;
  pendingTrade: TradeOffer | null;
  debt: DebtState | null;
  latestEventCard: EventCardDisplay | null;
  karpatyFund: number;
  zsuTotalDonated: number;
  winnerId: string | null;
  winningTeamId?: TeamId | null;
  logs: GameLogEntry[];
  chat: ChatMessage[];
}

export interface RoomSummary {
  roomCode: string;
  roomName: string;
  hostName: string;
  gameMode?: GameMode;
  playerCount: number;
  maxPlayers: number;
  status: 'lobby' | 'playing';
  turnTimeSeconds: number;
}

export interface PlayerMatchRecord {
  id: string;
  roomCode: string;
  gameMode: GameMode;
  finishedAt: number;
  won: boolean;
  place: number;
  totalPlayers: number;
  netWorth: number;
  zsuDonated: number;
  monopoliesCount: number;
  token: TokenId;
}

export interface UserStats {
  matchesPlayed: number;
  wins: number;
  teamWins: number;
  bestNetWorth: number;
  totalNetWorthAccumulated: number;
  totalZsuDonated: number;
  totalMonopoliesCollected: number;
  currentWinStreak: number;
  bestWinStreak: number;
  recentMatches: PlayerMatchRecord[];
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  favoriteToken: TokenId;
  motto: string;
  createdAt: number;
  updatedAt: number;
  stats: UserStats;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  displayName: string;
  favoriteToken: TokenId;
  motto: string;
  wins: number;
  matchesPlayed: number;
  bestNetWorth: number;
  totalZsuDonated: number;
}


