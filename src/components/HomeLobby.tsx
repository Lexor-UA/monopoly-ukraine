import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Bot,
  Building2,
  Check,
  Copy,
  Crown,
  Gavel,
  Globe,
  Handshake,
  Heart,
  Lock,
  LogOut,
  Moon,
  Plus,
  Rocket,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  Sun,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  Zap,
} from 'lucide-react';
import React, { useState } from 'react';
import {
  BOARD_CELLS,
  QUICK_REACTIONS,
  TEAM_META,
  TOKENS,
  formatMoney,
  isPurchasableCell,
  parseRoomCodeInput,
} from '../shared/boardData';
import {
  GameMode,
  GameState,
  RoomSettings,
  RoomSummary,
  TeamId,
  TokenId,
} from '../shared/types';
import { TransportMode } from '../utils/gameClient';
import {
  BrandEmblem,
  MagnatBrandIcon,
  MagnatWordmark,
  TokenAvatar,
  TryzubLogo,
} from './UkrainianArtwork';

interface HomeLobbyProps {
  connected: boolean;
  transportMode: TransportMode;
  roomBusy: boolean;
  shareOrigin: string;
  playerId: string;
  playerName: string;
  setPlayerName: (v: string) => void;
  selectedToken: TokenId;
  setSelectedToken: (t: TokenId) => void;
  publicRooms: RoomSummary[];
  gameState: GameState | null;
  errorMsg: string | null;
  soundEnabled: boolean;
  onToggleSound: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenRules: () => void;
  onQuickBots: (botCount: number, gameMode?: GameMode) => void;
  onCreateRoom: (settings: Partial<RoomSettings>) => void;
  onJoinRoom: (roomCode: string) => void;
  onLeaveRoom: () => void;
  onSelectLobbyToken: (token: TokenId) => void;
  onUpdateLobbyName: (name: string) => void;
  onAddBot: (teamId?: TeamId) => void;
  onSetGameMode: (gameMode: GameMode) => void;
  onSwitchTeam: (targetId?: string, teamId?: TeamId) => void;
  onRemovePlayer: (targetId: string) => void;
  onStartGame: () => void;
  onSendChat: (text: string, isQuick?: boolean) => void;
}

export const HomeLobby: React.FC<HomeLobbyProps> = ({
  connected,
  transportMode,
  roomBusy,
  shareOrigin,
  playerId,
  playerName,
  setPlayerName,
  selectedToken,
  setSelectedToken,
  publicRooms,
  gameState,
  errorMsg,
  soundEnabled,
  onToggleSound,
  darkMode,
  onToggleDarkMode,
  onOpenRules,
  onQuickBots,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onSelectLobbyToken,
  onUpdateLobbyName,
  onAddBot,
  onSetGameMode,
  onSwitchTeam,
  onRemovePlayer,
  onStartGame,
  onSendChat,
}) => {
  const [botCount, setBotCount] = useState(3);
  const [quickGameMode, setQuickGameMode] = useState<GameMode>('classic');
  const [joinCode, setJoinCode] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      const params = new URLSearchParams(window.location.search);
      return (
        parseRoomCodeInput(params.get('room') || '') ||
        parseRoomCodeInput(
          window.sessionStorage.getItem('magnat_active_room') ||
            window.localStorage.getItem('magnat_active_room') ||
            ''
        ) ||
        ''
      );
    } catch {
      return '';
    }
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [createGameMode, setCreateGameMode] = useState<GameMode>('classic');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [turnTimeSeconds, setTurnTimeSeconds] = useState(90);
  const [isPublic, setIsPublic] = useState(true);
  const [karpatyBonus, setKarpatyBonus] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [lobbyChatText, setLobbyChatText] = useState('');

  const allBrands = BOARD_CELLS.filter((c) => isPurchasableCell(c));
  const activeTokenDef =
    TOKENS.find((t) => t.id === selectedToken) ?? TOKENS[0];

  const baseShareOrigin =
    shareOrigin || (typeof window !== 'undefined' ? window.location.origin : '');
  const isLocalLanOrigin =
    /\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(
      baseShareOrigin
    );

  const inviteUrl = gameState
    ? `${baseShareOrigin}${window.location.pathname}?room=${gameState.roomCode}`
    : '';

  const copyTextToClipboard = (text: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  const handleCopyInvite = () => {
    if (!gameState) return;
    copyTextToClipboard(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const handleCopyRoomCode = () => {
    if (!gameState) return;
    copyTextToClipboard(gameState.roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  return (
    <div className="min-h-dvh overflow-x-hidden diia-mesh-bg vyshyvanka-pattern flex flex-col pb-10">
      {/* FLOATING CAPSULE HEADER */}
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 pt-2.5 sm:pt-4">
        <header className="glass-panel rounded-2xl px-2.5 sm:px-6 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3.5 min-w-0">
            <div className="sm:hidden shrink-0">
              <MagnatBrandIcon size="sm" />
            </div>
            <div className="hidden sm:block shrink-0">
              <MagnatBrandIcon size="lg" />
            </div>
            <div className="min-w-0">
              <div className="sm:hidden">
                <MagnatWordmark size="sm" showCountryBadge />
              </div>
              <div className="hidden sm:block">
                <MagnatWordmark size="lg" showCountryBadge />
              </div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] hidden sm:block truncate mt-0.5">
                Перша українська преміальна економічна онлайн-стратегія
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <div
              className={`hidden md:flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold border ${
                connected
                  ? 'bg-emerald-500/14 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-500/14 border-amber-500/30 text-amber-700 dark:text-amber-300'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              {connected
                ? transportMode === 'cloud'
                  ? 'Онлайн • База даних активна'
                  : transportMode === 'p2p'
                    ? 'Онлайн • P2P Хмара активна'
                    : 'Онлайн • Сервер активний'
                : 'Підключення...'}
            </div>

            <button
              onClick={onOpenRules}
              title="Правила гри"
              className="px-2.5 sm:px-3.5 py-2 rounded-xl bg-white dark:bg-[var(--surface-subtle)] border border-slate-200/90 dark:border-[var(--border-strong)] shadow-2xs text-xs font-extrabold flex items-center gap-1.5 hover:border-blue-500 transition cursor-pointer"
            >
              <BookOpen className="w-4 h-4 text-blue-600 dark:text-amber-400" />
              <span className="hidden sm:inline">Правила</span>
            </button>

            <button
              onClick={onToggleSound}
              title={soundEnabled ? 'Вимкнути звук' : 'Увімкнути звук'}
              className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-[var(--surface-subtle)] border border-slate-200/90 dark:border-[var(--border-strong)] shadow-2xs hover:border-blue-500 transition cursor-pointer"
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4 opacity-50" />
              )}
            </button>

            <button
              onClick={onToggleDarkMode}
              title={
                darkMode
                  ? 'Увімкнути світлу тему Аврора'
                  : 'Увімкнути темну тему Obsidian'
              }
              className="px-2.5 sm:px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-white/12 dark:hover:bg-white/20 text-slate-800 dark:text-white border border-slate-200/90 dark:border-white/20 text-xs font-extrabold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
            >
              {darkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Світла тема</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-blue-600" />
                  <span className="hidden sm:inline">Темна тема</span>
                </>
              )}
            </button>
          </div>
        </header>
      </div>

      {/* ERROR BANNER */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="max-w-xl mx-auto mt-3 px-5 py-2.5 rounded-2xl bg-rose-600 text-white text-xs font-extrabold shadow-xl"
          >
            {errorMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* === WAITING ROOM LOBBY === */}
      {gameState && gameState.status === 'lobby' ? (
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-[28px] p-6 sm:p-8"
          >
            <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-[var(--border-glass)]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-3.5 py-1 rounded-full text-xs font-extrabold bg-blue-600 text-white tracking-wider shadow-xs">
                    {gameState.roomCode}
                  </span>
                  {gameState.settings.gameMode === 'team2v2' ? (
                    <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-amber-400/20 text-amber-700 dark:text-amber-300 border border-amber-400/45 inline-flex items-center gap-1">
                      <Handshake className="w-3.5 h-3.5" /> Командна 2 на 2
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-slate-500/12 text-[var(--text-secondary)] border border-[var(--border-glass)] inline-flex items-center gap-1">
                      <Trophy className="w-3.5 h-3.5 text-amber-500" /> Класика (до 4)
                    </span>
                  )}
                  <span className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                    {gameState.settings.isPublic ? (
                      <>
                        <Globe className="w-3.5 h-3.5 text-blue-500" /> Відкрита кімната
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5 text-amber-500" /> Приватна кімната
                      </>
                    )}
                  </span>
                </div>
                <h1 className="font-display font-extrabold text-2xl sm:text-3xl mt-2">
                  {gameState.settings.roomName}
                </h1>
                <p className="text-xs font-semibold text-[var(--text-secondary)] mt-1">
                  Стартовий капітал: {formatMoney(gameState.settings.startingMoney)} •
                  Таймер ходу: {gameState.settings.turnTimeSeconds} сек • Учасників:{' '}
                  {gameState.players.length}/{gameState.settings.maxPlayers}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  onClick={handleCopyInvite}
                  className="px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold flex items-center gap-2 shadow-md transition cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-4 h-4" /> Посилання скопійовано!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" /> Запросити друзів за посиланням
                    </>
                  )}
                </button>

                <button
                  onClick={onLeaveRoom}
                  className="px-4 py-2.5 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-strong)] text-xs font-extrabold flex items-center gap-1.5 hover:bg-rose-500/15 hover:text-rose-500 hover:border-rose-500/40 transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4" /> Вийти
                </button>
              </div>
            </div>

            {/* Live Player Name & Wi-Fi Invite Bar inside Waiting Room */}
            <div className="py-4 border-b border-[var(--border-glass)] grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="p-3.5 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] flex flex-col justify-center gap-1.5">
                <label className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                  Ваше ім’я за ігровим столом
                </label>
                <input
                  value={playerName}
                  maxLength={22}
                  onChange={(e) => onUpdateLobbyName(e.target.value)}
                  placeholder="Напр. Олександр або Кохана"
                  className="w-full px-3.5 py-2 rounded-xl premium-input text-sm font-extrabold outline-none"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-blue-500/8 dark:bg-sky-500/10 border border-blue-500/25 flex flex-col justify-center gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-700 dark:text-sky-300 flex items-center gap-1.5">
                    {isLocalLanOrigin ? (
                      <>
                        <Wifi className="w-3.5 h-3.5" />
                        Посилання для локальної мережі (Wi-Fi)
                      </>
                    ) : (
                      <>
                        <Globe className="w-3.5 h-3.5" />
                        Пряме онлайн-посилання для друзів
                      </>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyRoomCode}
                    title="Скопіювати код кімнати"
                    className="text-[11px] font-black text-blue-700 dark:text-amber-300 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>
                      {copiedCode
                        ? 'Код скопійовано!'
                        : `Код: ${gameState.roomCode}`}
                    </span>
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={inviteUrl}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[var(--surface-solid)] border border-[var(--border-strong)] text-xs font-bold tabular-nums outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopyInvite}
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Скопійовано
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Копіювати
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Token Picker inside Lobby */}
            <div className="py-5 border-b border-[var(--border-glass)]">
              <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
                Оберіть вашу фішку на полі ({TOKENS.length} колекційних фішок)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                {TOKENS.map((t) => {
                  const me = gameState.players.find((p) => p.id === playerId);
                  const isMine = me?.token === t.id;
                  const takenByHuman = gameState.players.find(
                    (p) => p.id !== playerId && !p.isBot && p.token === t.id
                  );
                  return (
                    <button
                      key={t.id}
                      disabled={Boolean(takenByHuman)}
                      onClick={() => onSelectLobbyToken(t.id)}
                      className={`p-2.5 rounded-2xl border-2 text-left transition flex items-center gap-2 min-w-0 overflow-hidden cursor-pointer ${
                        isMine
                          ? 'border-blue-500 bg-blue-500/15 shadow-sm'
                          : takenByHuman
                            ? 'opacity-40 cursor-not-allowed border-transparent bg-[var(--surface-subtle)]'
                            : 'border-[var(--border-glass)] bg-[var(--surface-solid)] hover:border-blue-500/50'
                      }`}
                    >
                      <TokenAvatar
                        token={t.id}
                        color={t.defaultColor}
                        size={34}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11.5px] font-extrabold leading-tight break-words">
                          {t.name}
                        </div>
                        <div className="text-[10px] font-semibold text-[var(--text-muted)] truncate mt-0.5">
                          {takenByHuman
                            ? `Зайнято (${takenByHuman.name})`
                            : isMine
                              ? 'Обрано вами'
                              : 'Вільна'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Players Grid & Lobby Chat */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-6">
              <div className="lg:col-span-2 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-sm font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                      Учасники матчу ({gameState.players.length}/
                      {gameState.settings.maxPlayers})
                    </h2>

                    {gameState.hostId === playerId && (
                      <div className="inline-flex items-center p-1 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-strong)]">
                        <button
                          type="button"
                          onClick={() => onSetGameMode('classic')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold inline-flex items-center gap-1 transition cursor-pointer ${
                            gameState.settings.gameMode !== 'team2v2'
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          <Trophy className="w-3 h-3" /> Класика
                        </button>
                        <button
                          type="button"
                          onClick={() => onSetGameMode('team2v2')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold inline-flex items-center gap-1 transition cursor-pointer ${
                            gameState.settings.gameMode === 'team2v2'
                              ? 'bg-amber-400 text-slate-950 shadow-2xs'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          <Handshake className="w-3 h-3" /> 2 на 2
                        </button>
                      </div>
                    )}
                  </div>

                  {gameState.hostId === playerId &&
                    gameState.players.length <
                      gameState.settings.maxPlayers && (
                      <button
                        onClick={() => onAddBot()}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#0057B8] to-[#2563EB] hover:from-[#1D4ED8] hover:to-[#3B82F6] dark:bg-none dark:bg-white text-white dark:text-slate-950 text-xs font-extrabold flex items-center gap-1.5 hover:opacity-95 transition shadow-sm cursor-pointer"
                      >
                        <Bot className="w-4 h-4" /> + Додати AI-бота
                      </button>
                    )}
                </div>

                {gameState.settings.gameMode === 'team2v2' ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {(['A', 'B'] as TeamId[]).map((teamKey) => {
                        const meta = TEAM_META[teamKey];
                        const isTeamA = teamKey === 'A';
                        const teamPlayers = gameState.players.filter(
                          (p) => (p.teamId ?? 'A') === teamKey
                        );
                        const me = gameState.players.find(
                          (p) => p.id === playerId
                        );
                        const amInThisTeam =
                          (me?.teamId ?? 'A') === teamKey;
                        const otherTeam: TeamId = teamKey === 'A' ? 'B' : 'A';

                        return (
                          <div
                            key={teamKey}
                            className={`rounded-2xl border-2 p-3.5 flex flex-col gap-2.5 ${
                              isTeamA
                                ? 'border-sky-500/45 bg-sky-500/[0.06]'
                                : 'border-amber-400/45 bg-amber-400/[0.06]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[var(--border-glass)]">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-wide shrink-0 ${
                                    isTeamA
                                      ? 'bg-sky-500 text-slate-950'
                                      : 'bg-amber-400 text-slate-950'
                                  }`}
                                >
                                  {meta.badge}
                                </span>
                                <span className="font-display font-extrabold text-xs sm:text-sm truncate">
                                  {meta.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {!amInThisTeam && me && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onSwitchTeam(playerId, teamKey)
                                    }
                                    className={`px-2 py-0.5 rounded-lg text-[10.5px] font-extrabold inline-flex items-center gap-1 transition cursor-pointer ${
                                      isTeamA
                                        ? 'bg-sky-500/20 hover:bg-sky-500 hover:text-slate-950 text-sky-600 dark:text-sky-300 border border-sky-400/40'
                                        : 'bg-amber-400/20 hover:bg-amber-400 hover:text-slate-950 text-amber-700 dark:text-amber-300 border border-amber-400/40'
                                    }`}
                                  >
                                    <ArrowLeftRight className="w-3 h-3" /> Сюди
                                  </button>
                                )}
                                <span className="text-[11px] font-black text-[var(--text-secondary)] tabular-nums">
                                  {teamPlayers.length}/2
                                </span>
                              </div>
                            </div>

                            {teamPlayers.map((p) => {
                              const tokenDef = TOKENS.find(
                                (t) => t.id === p.token
                              );
                              const isMe = p.id === playerId;
                              return (
                                <div
                                  key={p.id}
                                  className="p-3 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-solid)] flex items-center justify-between gap-2 shadow-xs"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <TokenAvatar
                                      token={p.token}
                                      color={p.color}
                                      size={40}
                                    />
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-extrabold text-xs sm:text-sm truncate max-w-[120px]">
                                          {p.name}
                                        </span>
                                        {isMe && (
                                          <span className="px-1.5 py-0.2 rounded-full bg-white text-slate-950 border border-emerald-400 text-[9px] font-black">
                                            ВИ
                                          </span>
                                        )}
                                        {p.id === gameState.hostId && (
                                          <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                        )}
                                        {p.isBot && (
                                          <span className="px-1.5 py-0.2 rounded text-[9.5px] font-extrabold bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">
                                            AI
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11px] font-medium text-[var(--text-muted)] truncate">
                                        {p.botPersonality || tokenDef?.name}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0">
                                    {(gameState.hostId === playerId || isMe) && (
                                      <button
                                        type="button"
                                        title={`Перевести до «${TEAM_META[otherTeam].name}»`}
                                        onClick={() =>
                                          onSwitchTeam(p.id, otherTeam)
                                        }
                                        className="p-1.5 rounded-lg bg-[var(--surface-subtle)] hover:bg-blue-500/15 border border-[var(--border-glass)] text-[var(--text-secondary)] hover:text-blue-600 dark:hover:text-sky-300 transition cursor-pointer"
                                      >
                                        <ArrowLeftRight className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    {gameState.hostId === playerId &&
                                      p.id !== playerId && (
                                        <button
                                          type="button"
                                          onClick={() => onRemovePlayer(p.id)}
                                          className="text-[11px] font-extrabold text-rose-500 hover:underline px-1.5 py-1 cursor-pointer"
                                        >
                                          ✕
                                        </button>
                                      )}
                                  </div>
                                </div>
                              );
                            })}

                            {Array.from({
                              length: Math.max(0, 2 - teamPlayers.length),
                            }).map((_, idx) => (
                              <div
                                key={`empty_${teamKey}_${idx}`}
                                className="p-3.5 rounded-xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-solid)]/45 flex items-center justify-between gap-2"
                              >
                                <span className="text-xs font-bold text-[var(--text-muted)] truncate">
                                  Вільне місце в альянсі...
                                </span>
                                <div className="flex items-center gap-2 shrink-0">
                                  {!amInThisTeam && me && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onSwitchTeam(playerId, teamKey)
                                      }
                                      className="text-[11px] font-extrabold text-sky-600 dark:text-sky-300 hover:underline cursor-pointer"
                                    >
                                      Зайняти
                                    </button>
                                  )}
                                  {gameState.hostId === playerId &&
                                    gameState.players.length < 4 && (
                                      <button
                                        type="button"
                                        onClick={() => onAddBot(teamKey)}
                                        className="text-[11px] font-extrabold text-blue-600 dark:text-amber-400 hover:underline cursor-pointer"
                                      >
                                        + AI-бот
                                      </button>
                                    )}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>

                    <div className="px-3.5 py-2.5 rounded-xl bg-amber-400/10 border border-amber-400/30 text-[11.5px] font-semibold text-[var(--text-secondary)] flex items-center gap-2">
                      <Handshake className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>
                        <strong className="text-[var(--text-primary)]">
                          Правила 2 на 2:
                        </strong>{' '}
                        оренда на клітинках напарника — <strong>0 ₴</strong> •
                        вільний обмін компаніями й капіталом через Смарт-Угоди •
                        альянс програє лише після вибуття обох напарників.
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {gameState.players.map((p) => {
                      const tokenDef = TOKENS.find((t) => t.id === p.token);
                      return (
                        <div
                          key={p.id}
                          className="p-4 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-solid)] flex items-center justify-between gap-3 shadow-xs"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <TokenAvatar
                              token={p.token}
                              color={p.color}
                              size={46}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-sm truncate">
                                  {p.name}
                                </span>
                                {p.id === gameState.hostId && (
                                  <Crown className="w-4 h-4 text-amber-500 shrink-0" />
                                )}
                                {p.isBot && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">
                                    AI
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-medium text-[var(--text-muted)] truncate">
                                {p.botPersonality || tokenDef?.name}
                              </p>
                            </div>
                          </div>

                          {gameState.hostId === playerId &&
                            p.id !== playerId && (
                              <button
                                onClick={() => onRemovePlayer(p.id)}
                                className="text-xs font-extrabold text-rose-500 hover:underline px-2 py-1 cursor-pointer"
                              >
                                Прибрати
                              </button>
                            )}
                        </div>
                      );
                    })}

                    {Array.from({
                      length: Math.max(
                        0,
                        gameState.settings.maxPlayers - gameState.players.length
                      ),
                    }).map((_, idx) => (
                      <div
                        key={`empty_${idx}`}
                        className="p-4 rounded-2xl border-2 border-dashed border-[var(--border-strong)] flex items-center justify-between"
                      >
                        <span className="text-xs font-bold text-[var(--text-muted)]">
                          Вільний слот для друга або AI...
                        </span>
                        {gameState.hostId === playerId && (
                          <button
                            onClick={() => onAddBot()}
                            className="text-xs font-extrabold text-blue-600 dark:text-amber-400 hover:underline cursor-pointer"
                          >
                            + AI-бот
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Start Game CTA */}
                <div className="pt-2">
                  {gameState.hostId === playerId ? (
                    <button
                      disabled={
                        gameState.settings.gameMode === 'team2v2'
                          ? gameState.players.length < 4
                          : gameState.players.length < 2
                      }
                      onClick={onStartGame}
                      className="w-full py-4 rounded-2xl mono-cta-btn disabled:opacity-40 font-display font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 transition cursor-pointer"
                    >
                      <Rocket className="w-5 h-5" />
                      {gameState.settings.gameMode === 'team2v2'
                        ? gameState.players.length < 4
                          ? `Додайте учасників або AI для 2 на 2 (${gameState.players.length}/4)`
                          : 'Розпочати командний матч 2 на 2!'
                        : gameState.players.length < 2
                          ? 'Додайте гравця або AI-бота для старту'
                          : 'Розпочати матч МАГНАТ.UA!'}
                    </button>
                  ) : (
                    <div className="w-full py-4 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-strong)] text-center text-sm font-extrabold">
                      Очікуємо, поки власник кімнати розпочне гру...
                    </div>
                  )}
                </div>
              </div>

              {/* Lobby Chat */}
              <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-subtle)] p-4 flex flex-col h-76">
                <div className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] pb-2 border-b border-[var(--border-glass)]">
                  Чат кімнати 💬
                </div>
                <div className="flex-1 overflow-y-auto py-2.5 space-y-2 text-xs">
                  {gameState.chat.length === 0 ? (
                    <p className="text-[var(--text-muted)] font-semibold text-center py-10">
                      Привітайтеся з учасниками кімнати! 🇺🇦
                    </p>
                  ) : (
                    gameState.chat.map((m) => (
                      <div
                        key={m.id}
                        className="px-2.5 py-1.5 rounded-xl bg-[var(--surface-solid)] shadow-2xs"
                      >
                        <span
                          style={{ color: m.playerColor }}
                          className="font-extrabold"
                        >
                          {m.playerName}:{' '}
                        </span>
                        <span className="font-medium">{m.text}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-2">
                  {QUICK_REACTIONS.slice(0, 4).map((r) => (
                    <button
                      key={r}
                      onClick={() => onSendChat(r, true)}
                      className="px-2.5 py-1 rounded-lg bg-[var(--surface-solid)] border border-[var(--border-glass)] hover:border-blue-500 text-[11px] font-bold whitespace-nowrap cursor-pointer"
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!lobbyChatText.trim()) return;
                    onSendChat(lobbyChatText);
                    setLobbyChatText('');
                  }}
                  className="flex gap-1.5"
                >
                  <input
                    value={lobbyChatText}
                    onChange={(e) => setLobbyChatText(e.target.value)}
                    placeholder="Написати повідомлення..."
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl premium-input text-xs font-semibold outline-none"
                  />
                  <button
                    type="submit"
                    className="p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </div>
          </motion.div>
        </main>
      ) : (
        /* === FLAGSHIP LANDING PORTAL === */
        <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 pt-4 sm:pt-5 flex flex-col gap-5 sm:gap-6">
          {/* TOP BENTO GRID: HERO (7 COLS) + GAME LAUNCHERS (5 COLS) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-stretch">
            {/* LEFT 7 COLS: HERO + 3D GOLDEN LION MAGNATE + PLATINUM BANK CARD */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="lg:col-span-7 glass-panel rounded-[24px] sm:rounded-[30px] p-4 sm:p-8 flex flex-col justify-between gap-5 sm:gap-6 relative overflow-hidden"
            >
              {/* Hero Top Split: Copy + 3D Golden Lion Magnate */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
                <div className="sm:col-span-7 space-y-3.5">
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full diia-gradient-pill text-[11px] font-extrabold shadow-xs">
                    <Sparkles className="w-3.5 h-3.5 text-blue-800" />
                    <span>100% Українська Стратегія • Авторський Всесвіт</span>
                  </div>

                  <h1 className="font-display font-extrabold text-2xl sm:text-3xl xl:text-[35px] leading-[1.14] tracking-tight">
                    Перша українська{' '}
                    <span className="bg-gradient-to-r from-[#0057B8] via-[#2563EB] to-[#4F46E5] dark:from-[#60A5FA] dark:via-[#93C5FD] dark:to-[#FBBF24] bg-clip-text text-transparent">
                      економічна онлайн-гра
                    </span>{' '}
                    нового покоління
                  </h1>

                  <p className="text-xs sm:text-sm font-medium text-[var(--text-secondary)] leading-relaxed">
                    Об’єднуйте 28 українських компаній — від{' '}
                    <strong>Необанку Лев</strong>, <strong>Блискавка Пошти</strong> та{' '}
                    <strong>Залізного Експресу</strong> до{' '}
                    <strong>Оберіг Системс</strong> і <strong>Кави Подолу</strong>.
                    Торгуйтеся на живих аукціонах, укладайте{' '}
                    <strong>Смарт-Угоди</strong> та ставайте головним магнатом країни!
                  </p>
                </div>

                {/* 3D Golden Lion Magnate Studio Render Showcase */}
                <div className="sm:col-span-5 relative group">
                  <div className="relative rounded-3xl overflow-hidden border-2 border-blue-500/20 dark:border-amber-400/45 shadow-xl dark:shadow-2xl aspect-square max-w-[235px] mx-auto bg-sky-100 dark:bg-[#080d1a]">
                    <img
                      src={
                        darkMode
                          ? '/images/hero-lion-magnate.jpg'
                          : '/images/hero-lion-daylight.jpg'
                      }
                      alt="Пан Лев — Золотий Галицький Магнат"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/38 to-transparent p-3.5">
                      <div className="flex items-center justify-between text-white">
                        <div>
                          <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
                            Гранд-Суперник AI
                          </div>
                          <div className="font-display font-bold text-xs">
                            Пан Лев • Фінтех
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-400 text-slate-950 text-[10px] font-black shadow">
                          LIVE
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Animated Ukrainian Companies Marquee with Smooth Edge Fade */}
              <div className="relative overflow-hidden py-2.5 -mx-4 sm:-mx-8 border-y border-[var(--border-glass)] bg-[var(--surface-subtle)]/80">
                <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
                  <div className="animate-marquee gap-2.5 px-3">
                    {[...allBrands, ...allBrands].map((b, idx) => (
                      <div
                        key={`${b.index}_${idx}`}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--surface-solid)] border border-[var(--border-glass)] text-xs font-extrabold shadow-2xs shrink-0"
                      >
                        <BrandEmblem brandKey={b.brandKey} size="sm" />
                        <span>{b.shortName}</span>
                        {b.price && (
                          <span className="text-[10px] font-bold text-blue-600 dark:text-amber-400 tabular-nums">
                            {b.price} ₴
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* INTERACTIVE MAGNAT.UA PLATINUM CARD (ISO 7810 1.586:1 RATIO) + 2x3 TOKEN PICKER */}
              <div className="grid grid-cols-1 md:grid-cols-[276px_minmax(0,1fr)] lg:grid-cols-1 xl:grid-cols-[282px_minmax(0,1fr)] gap-4 items-center pt-1">
                {/* Physical White/Obsidian Platinum Bank Card Preview — True 85.6×53.98mm (1.586:1) Ratio */}
                <div className="w-full max-w-[320px] md:max-w-none lg:max-w-[324px] xl:max-w-none mx-auto">
                  <div className="mono-physical-card aspect-[1.586/1] w-full rounded-[15px] px-4.5 py-3.5 sm:px-5 sm:py-4 text-slate-900 dark:text-white flex flex-col justify-between select-none">
                    {/* Top Row: Unified Cyrillic Brand Wordmark + Gold UA Ingot + Platinum Tier + NFC */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-display font-black text-[12.5px] sm:text-[13.5px] tracking-[0.04em] uppercase">
                          МАГНАТ
                        </span>
                        <span className="magnat-ua-ingot inline-flex items-center justify-center px-2 py-[2px] rounded-full text-[8.5px] font-black leading-none tracking-[0.06em]">
                          UA
                        </span>
                        <span className="ml-0.5 px-1.5 py-0.5 rounded bg-amber-500/15 dark:bg-amber-400/18 border border-amber-500/35 dark:border-amber-300/30 text-[8px] font-black uppercase tracking-[0.13em] text-amber-800 dark:text-amber-200">
                          PLATINUM
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <TryzubLogo className="w-3.5 h-3.5 text-blue-600/45 dark:text-amber-300/50" />
                        <Wifi className="w-4 h-4 text-slate-400 dark:text-slate-300 rotate-90" />
                      </div>
                    </div>

                    {/* Middle Row: Realistic Metallic Gold EMV Chip + Starting Capital */}
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-7 rounded-[6px] bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 border border-amber-100/60 shadow-inner relative overflow-hidden flex items-center justify-center">
                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-amber-950/28" />
                        <div className="absolute inset-y-0 left-1/3 w-[1px] bg-amber-950/25" />
                        <div className="absolute inset-y-0 right-1/3 w-[1px] bg-amber-950/25" />
                        <div className="w-4 h-3.5 rounded-[3px] border border-amber-950/30 bg-amber-300/45 z-10" />
                      </div>
                      <div className="text-right leading-tight">
                        <div className="text-[8.5px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300/85 font-bold">
                          Стартовий капітал
                        </div>
                        <div className="font-display font-extrabold text-[15px] sm:text-base text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                          15 000 ₴
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row: Full-Width Embossed Card Number + Cardholder & Active Token */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] sm:text-[11.5px] font-mono font-semibold tracking-[0.18em] text-slate-600 dark:text-slate-200/90 pr-1">
                        <span>5375</span>
                        <span>••••</span>
                        <span>••••</span>
                        <span>1991</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-900/10 dark:border-white/14">
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-900 dark:text-white">
                            {playerName.trim() || 'МАГНАТ УКРАЇНИ'}
                          </div>
                        </div>
                        <TokenAvatar
                          token={selectedToken}
                          color={activeTokenDef.defaultColor}
                          size={28}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Profile Input & Spacious 2-Col × 3-Row Ukrainian Tokens Selector */}
                <div className="min-w-0 space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
                      Ваше ім’я на платиновій картці
                    </label>
                    <input
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      maxLength={22}
                      placeholder="Введіть ваш нікнейм..."
                      className="w-full px-4 py-2.5 rounded-xl premium-input font-extrabold text-sm outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
                      <span className="shrink-0">Оберіть фішку на полі:</span>
                      <span className="min-w-0 truncate text-right text-blue-600 dark:text-amber-400">
                        {activeTokenDef.name}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {TOKENS.map((t) => {
                        const active = selectedToken === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setSelectedToken(t.id)}
                            className={`px-2 py-1 min-h-[38px] min-w-0 overflow-hidden rounded-xl border-2 flex items-center gap-2 text-left transition cursor-pointer ${
                              active
                                ? 'border-blue-600 bg-blue-50/90 dark:border-blue-500 dark:bg-blue-500/15 shadow-xs'
                                : 'border-slate-200/90 dark:border-[var(--border-glass)] bg-white dark:bg-[var(--surface-solid)] hover:border-blue-500/50'
                            }`}
                          >
                            <TokenAvatar
                              token={t.id}
                              color={t.defaultColor}
                              size={26}
                            />
                            <span className="min-w-0 flex-1 text-[11px] font-extrabold leading-tight break-words">
                              {t.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* RIGHT 5 COLS: TWO LUXURY GAME LAUNCHER CARDS */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="lg:col-span-5 flex flex-col gap-5"
            >
              {/* Card 1: Theme-Adaptive Featured Card — Quick AI Match */}
              <div className="aurora-featured-card rounded-[24px] sm:rounded-[30px] p-5 sm:p-7 flex flex-col justify-between gap-5 relative overflow-hidden">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/14 dark:bg-amber-400/18 border border-amber-500/30 dark:border-amber-400/35 text-[11px] font-extrabold text-amber-800 dark:text-amber-300">
                      <Zap className="w-3.5 h-3.5" /> Миттєвий старт в 1 клік
                    </span>
                    <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 dark:text-white leading-tight">
                      Швидка гра з{' '}
                      <span className="whitespace-nowrap">AI-ботами</span>
                    </h2>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
                      Розумні українські AI-магнати —{' '}
                      <span className="text-slate-900 dark:text-white font-bold">
                        Пан Лев, Леся та Тарас
                      </span>{' '}
                      — будують холдинги, грають у команді 2 на 2, змагаються на
                      аукціонах та укладають Смарт-Угоди!
                    </p>
                  </div>
                  <img
                    src="/images/showcase-auction-day.jpg"
                    alt="Живий Аукціон"
                    className="w-16 h-16 rounded-2xl object-cover border border-amber-400/45 shadow-md shrink-0 hidden sm:block"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-200 mb-2">
                    <span className="font-bold">Формат столу:</span>
                    <span className="font-extrabold text-blue-600 dark:text-amber-300">
                      {quickGameMode === 'team2v2'
                        ? 'Альянс 2×2: Ви + AI проти 2 AI'
                        : `Ви + ${botCount} ${botCount === 1 ? 'AI-магнат' : 'AI-магнати'}`}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 sm:gap-2 mb-4">
                    {[1, 2, 3].map((cnt) => {
                      const active =
                        quickGameMode === 'classic' && botCount === cnt;
                      return (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => {
                            setQuickGameMode('classic');
                            setBotCount(cnt);
                          }}
                          className={`py-2.5 px-1 rounded-xl text-[11px] sm:text-xs font-extrabold border whitespace-nowrap transition cursor-pointer ${
                            active
                              ? 'bg-blue-600 text-white border-blue-600 dark:bg-white dark:text-slate-950 dark:border-white shadow-md scale-[1.02]'
                              : 'bg-white/90 text-slate-700 border-slate-200/90 hover:border-blue-400 hover:bg-blue-50/70 dark:bg-white/10 dark:text-slate-200 dark:border-white/18 dark:hover:bg-white/18'
                          }`}
                        >
                          1 vs {cnt} AI
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        setQuickGameMode('team2v2');
                        setBotCount(3);
                      }}
                      className={`py-2.5 px-1 rounded-xl text-[11px] sm:text-xs font-extrabold border whitespace-nowrap inline-flex items-center justify-center gap-1 transition cursor-pointer ${
                        quickGameMode === 'team2v2'
                          ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-[0_6px_18px_-6px_rgba(251,191,36,0.75)] scale-[1.02]'
                          : 'bg-amber-50/95 text-amber-900 border-amber-300/80 hover:border-amber-400 hover:bg-amber-100/80 dark:bg-amber-400/14 dark:text-amber-200 dark:border-amber-400/35 dark:hover:bg-amber-400/24'
                      }`}
                    >
                      <span>🤝</span>
                      <span>2 на 2</span>
                    </button>
                  </div>

                  <button
                    disabled={roomBusy}
                    onClick={() =>
                      onQuickBots(
                        quickGameMode === 'team2v2' ? 3 : botCount,
                        quickGameMode
                      )
                    }
                    className="w-full py-4 rounded-2xl mono-cta-btn font-display font-bold text-sm flex items-center justify-center gap-2 transition active:scale-[0.99] disabled:opacity-60 cursor-pointer"
                  >
                    <Rocket className="w-4 h-4" />
                    <span>
                      {roomBusy
                        ? 'Запуск столу...'
                        : quickGameMode === 'team2v2'
                          ? 'Почати матч 2 на 2 негайно'
                          : 'Почати гру негайно'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Card 2: Multiplayer Online Room Launcher */}
              <div className="glass-panel rounded-[24px] sm:rounded-[30px] p-5 sm:p-7 flex flex-col justify-between gap-5 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600/12 border border-blue-500/25 text-blue-700 dark:text-sky-300 text-[11px] font-extrabold">
                      <Users className="w-3.5 h-3.5" /> Онлайн із друзями
                    </span>
                    <h2 className="font-display font-extrabold text-xl sm:text-2xl mt-2 leading-tight">
                      Мультиплеєр за посиланням
                    </h2>
                    <p className="text-xs font-medium text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                      Створіть власну кімнату, надішліть пряме посилання друзям
                      і додайте AI-ботів на вільні місця за столом.
                    </p>
                  </div>
                  <img
                    src="/images/cell-gov-cloud.jpg"
                    alt="Смарт-угоди та мультиплеєр"
                    decoding="async"
                    className="w-16 h-16 rounded-2xl object-cover border border-[var(--border-strong)] shadow-md shrink-0 hidden sm:block"
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border-glass)] text-[10.5px] font-bold text-[var(--text-secondary)]">
                    <Zap className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                    Без реєстрації
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-400/12 border border-amber-400/35 text-[10.5px] font-extrabold text-amber-700 dark:text-amber-300">
                    <Handshake className="w-3 h-3" />
                    Режим 2 на 2
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border-glass)] text-[10.5px] font-bold text-[var(--text-secondary)]">
                    <Bot className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                    До 4 гравців + AI
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                    <button
                      disabled={roomBusy}
                      onClick={() => {
                        setCreateGameMode('classic');
                        setShowCreateModal(true);
                      }}
                      className="py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#0057B8] to-[#2563EB] hover:from-[#1D4ED8] hover:to-[#3B82F6] dark:bg-none dark:bg-white dark:text-slate-950 dark:hover:bg-amber-300 text-white font-display font-bold text-sm flex items-center justify-center gap-2 transition shadow-md disabled:opacity-60 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      {roomBusy
                        ? 'Підключення кімнати...'
                        : 'Створити онлайн-кімнату'}
                    </button>

                    <button
                      disabled={roomBusy}
                      onClick={() => {
                        setCreateGameMode('team2v2');
                        setMaxPlayers(4);
                        setShowCreateModal(true);
                      }}
                      title="Створити командну онлайн-кімнату 2 на 2"
                      className="py-3.5 px-4 rounded-2xl bg-amber-400/16 hover:bg-amber-400 hover:text-slate-950 border border-amber-400/45 text-amber-800 dark:text-amber-200 font-display font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition shadow-2xs disabled:opacity-60 cursor-pointer whitespace-nowrap"
                    >
                      <Handshake className="w-4 h-4 shrink-0" />
                      <span>2 на 2</span>
                    </button>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (roomBusy) return;
                      onJoinRoom(joinCode);
                    }}
                    className="flex gap-2"
                  >
                    <input
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      placeholder="Код UA-4821 або посилання"
                      className="flex-1 min-w-0 px-3.5 sm:px-4 py-3 rounded-xl premium-input text-xs font-extrabold tracking-wide placeholder:uppercase outline-none"
                    />
                    <button
                      type="submit"
                      disabled={roomBusy}
                      className="px-4 sm:px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-extrabold shadow-sm transition cursor-pointer shrink-0"
                    >
                      {roomBusy ? '...' : 'Увійти'}
                    </button>
                  </form>
                </div>
              </div>
            </motion.div>
          </div>

          {/* OPEN PUBLIC ROOMS LOBBY */}
          <div className="glass-panel rounded-[28px] p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600/15 text-blue-600 dark:text-sky-400 flex items-center justify-center">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-extrabold text-base sm:text-lg">
                      Відкриті онлайн-кімнати
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-blue-600 text-white">
                      {publicRooms.length}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-[var(--text-muted)]">
                    Приєднуйтеся до відкритих столів у реальному часі
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 rounded-xl bg-blue-600/15 hover:bg-blue-600 hover:text-white text-blue-700 dark:text-sky-300 text-xs font-extrabold transition cursor-pointer"
              >
                + Відкрити свій стіл
              </button>
            </div>

            {publicRooms.length === 0 ? (
              <div className="py-7 px-4 text-center rounded-2xl bg-slate-50/90 dark:bg-[var(--surface-subtle)] border border-dashed border-slate-300/90 dark:border-[var(--border-strong)]">
                <p className="text-sm font-extrabold">
                  {transportMode === 'p2p'
                    ? 'Прямий хмарний P2P-мультиплеєр активний'
                    : 'Зараз усі грають у приватних кімнатах або з AI-ботами'}
                </p>
                <p className="text-xs font-medium text-[var(--text-secondary)] mt-1">
                  {transportMode === 'p2p'
                    ? 'Натисніть «Створити онлайн-кімнату» та надішліть пряме посилання чи код UA-XXXX друзям або коханій людині у Telegram / Viber!'
                    : 'Створіть відкриту кімнату першим або натисніть «Почати гру негайно» для миттєвого матчу!'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {publicRooms.map((r) => (
                  <div
                    key={r.roomCode}
                    className="p-4 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-solid)] flex items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-blue-600 text-white text-[10px] font-extrabold shrink-0">
                          {r.roomCode}
                        </span>
                        {r.gameMode === 'team2v2' && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-400/20 text-amber-700 dark:text-amber-300 border border-amber-400/40 text-[10px] font-extrabold shrink-0">
                            🤝 2×2
                          </span>
                        )}
                        <span className="font-extrabold text-sm truncate">
                          {r.roomName}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-[var(--text-muted)] mt-1">
                        Хост: {r.hostName} • Гравців: {r.playerCount}/
                        {r.maxPlayers} • {r.turnTimeSeconds}с
                      </p>
                    </div>
                    <button
                      onClick={() => onJoinRoom(r.roomCode)}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shrink-0 cursor-pointer"
                    >
                      Увійти
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 6-CARD 3D CINEMA SHOWCASE GALLERY */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div className="glass-panel rounded-3xl overflow-hidden flex flex-col group">
              <div className="h-48 overflow-hidden relative bg-sky-50 dark:bg-slate-900">
                <img
                  src="/images/ukraine-metropolis.jpg"
                  alt="28 Українських Компаній та Логістика"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover brightness-[0.95] saturate-[0.92] transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/22 dark:from-slate-950/35 via-transparent to-transparent" />
                <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-white/92 dark:bg-slate-950/80 backdrop-blur-md border border-white/90 dark:border-white/20 text-amber-700 dark:text-amber-300 shadow-sm text-[10px] font-extrabold flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> 28 Компаній України
                </span>
              </div>
              <div className="p-5 flex-1">
                <h4 className="font-display font-extrabold text-sm sm:text-base">
                  Економіка Незламної Країни
                </h4>
                <p className="text-xs font-medium text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  Об’єднуйте кав’ярні Подолу, експрес-пошту, швидкісні залізниці,
                  чорноморські порти та енергомережі в єдину бізнес-імперію.
                </p>
              </div>
            </div>

            <div className="glass-panel rounded-3xl overflow-hidden flex flex-col group">
              <div className="h-48 overflow-hidden relative bg-sky-50 dark:bg-slate-900">
                <img
                  src={
                    darkMode
                      ? '/images/card-fintech-towers.jpg'
                      : '/images/cell-start-gate.jpg'
                  }
                  alt="Фінтех-Імперія та Головні Холдинги"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover brightness-[0.97] saturate-[0.92] transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/22 dark:from-slate-950/35 via-transparent to-transparent" />
                <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-white/92 dark:bg-slate-950/80 backdrop-blur-md border border-white/90 dark:border-white/20 text-blue-700 dark:text-sky-300 shadow-sm text-[10px] font-extrabold flex items-center gap-1.5">
                  <Building2 className="w-3 h-3" /> Філії та Холдинги
                </span>
              </div>
              <div className="p-5 flex-1">
                <h4 className="font-display font-extrabold text-sm sm:text-base">
                  Від Стартапу до Холдингу 👑
                </h4>
                <p className="text-xs font-medium text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  Зберіть монополію сектору, відкривайте від 1 до 4 регіональних
                  філій та зводьте п’ятизірковий Головний Холдинг із рекордною
                  орендою.
                </p>
              </div>
            </div>

            <div className="glass-panel rounded-3xl overflow-hidden flex flex-col group">
              <div className="h-48 overflow-hidden relative bg-sky-50 dark:bg-slate-900">
                <img
                  src="/images/cell-gov-cloud.jpg"
                  alt="Смарт-угоди з Цифровим Підписом"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover object-center brightness-[0.97] saturate-[0.95] transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/22 dark:from-slate-950/35 via-transparent to-transparent" />
                <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-white/92 dark:bg-slate-950/80 backdrop-blur-md border border-white/90 dark:border-white/20 text-emerald-700 dark:text-emerald-300 shadow-sm text-[10px] font-extrabold flex items-center gap-1.5">
                  <Handshake className="w-3 h-3" /> Смарт-Угода • КЕП
                </span>
              </div>
              <div className="p-5 flex-1">
                <h4 className="font-display font-extrabold text-sm sm:text-base">
                  Миттєві Смарт-Угоди
                </h4>
                <p className="text-xs font-medium text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  Формуйте прозорі контракти обміну компаніями та капіталом із
                  друзями або AI-магнатами, які прораховують цінність монополій.
                </p>
              </div>
            </div>

            <div className="glass-panel rounded-3xl overflow-hidden flex flex-col group">
              <div className="h-48 overflow-hidden relative bg-sky-50 dark:bg-slate-900">
                <img
                  src="/images/showcase-auction-day.jpg"
                  alt="Живі Аукціони в реальному часі"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover brightness-[0.97] saturate-[0.95] transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/22 dark:from-slate-950/35 via-transparent to-transparent" />
                <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-white/92 dark:bg-slate-950/80 backdrop-blur-md border border-white/90 dark:border-white/20 text-amber-700 dark:text-amber-300 shadow-sm text-[10px] font-extrabold flex items-center gap-1.5">
                  <Gavel className="w-3 h-3" /> Живі Аукціони
                </span>
              </div>
              <div className="p-5 flex-1">
                <h4 className="font-display font-extrabold text-sm sm:text-base">
                  Азартні Відкриті Торги
                </h4>
                <p className="text-xs font-medium text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  Кожен непридбаний актив миттєво виходить на живий аукціон від
                  25% вартості — перебивайте ставки суперників за секунду до
                  удару молотка!
                </p>
              </div>
            </div>

            <div className="glass-panel rounded-3xl overflow-hidden flex flex-col group">
              <div className="h-48 overflow-hidden relative bg-sky-50 dark:bg-slate-900">
                <img
                  src="/images/card-karpaty.jpg"
                  alt="Карпатський Курорт та Регіональний Грант"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover brightness-[0.95] saturate-[0.92] transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/22 dark:from-slate-950/35 via-transparent to-transparent" />
                <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-white/92 dark:bg-slate-950/80 backdrop-blur-md border border-white/90 dark:border-white/20 text-emerald-700 dark:text-emerald-300 shadow-sm text-[10px] font-extrabold">
                  🏔️ Карпатський Курорт
                </span>
              </div>
              <div className="p-5 flex-1">
                <h4 className="font-display font-extrabold text-sm sm:text-base">
                  Карпатський Фонд Підтримки
                </h4>
                <p className="text-xs font-medium text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  Зупиняйтеся на гірському ретриті в українських Карпатах та
                  отримуйте накопичений регіональний грант на масштабування.
                </p>
              </div>
            </div>

            <div className="glass-panel rounded-3xl overflow-hidden flex flex-col group">
              <div className="h-48 overflow-hidden relative bg-sky-50 dark:bg-slate-900">
                <img
                  src="/images/cell-defense-fund.jpg"
                  alt="Оборонний Щит та Фонд Єдності"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover brightness-[0.96] saturate-[0.95] transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/22 dark:from-slate-950/35 via-transparent to-transparent" />
                <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-white/92 dark:bg-slate-950/80 backdrop-blur-md border border-white/90 dark:border-white/20 text-amber-700 dark:text-amber-300 shadow-sm text-[10px] font-extrabold flex items-center gap-1.5">
                  <Shield className="w-3 h-3" />
                  <span>Єдність та Оборона</span>
                  <span
                    aria-hidden="true"
                    className="w-3.5 h-2.5 rounded-[2.5px] overflow-hidden inline-flex flex-col shrink-0 ring-1 ring-black/15 dark:ring-white/25"
                  >
                    <span className="w-full h-1/2 bg-[#0057B8]" />
                    <span className="w-full h-1/2 bg-[#FFD700]" />
                  </span>
                </span>
              </div>
              <div className="p-5 flex-1">
                <h4 className="font-display font-extrabold text-sm sm:text-base">
                  Патріотичний Дух та Події
                </h4>
                <p className="text-xs font-medium text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  Гранти «Власна Справа», Національний кешбек, Облігації Перемоги,
                  спільні Мегазбори на дрони та антимонопольні розслідування.
                </p>
              </div>
            </div>
          </section>

          {/* FLAGSHIP PORTAL FOOTER & AUTHORIAL IP CAPSTONE */}
          <footer className="glass-panel rounded-[26px] sm:rounded-[30px] p-5 sm:p-7 relative overflow-hidden">
            {/* Subtle Ukrainian Blue-Gold Top Rim Accent */}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#0057B8]/70 to-transparent dark:via-amber-400/55"
            />

            {/* Row 1: Spacious Brand Identity & Quick Action Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 pb-5 border-b border-[var(--border-glass)]">
              {/* Brand Block — Generous Horizontal Width (Never Crushed by Sibling Pills!) */}
              <div className="flex items-start sm:items-center gap-3.5 sm:gap-4 min-w-0 max-w-2xl">
                <MagnatBrandIcon size="lg" />
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <MagnatWordmark size="lg" showCountryBadge />
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold border whitespace-nowrap shrink-0 ${
                        connected
                          ? 'bg-emerald-500/12 border-emerald-500/25 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-500/12 border-amber-500/25 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          connected
                            ? 'bg-emerald-500 animate-pulse'
                            : 'bg-amber-500'
                        }`}
                      />
                      {connected
                        ? transportMode === 'p2p'
                          ? 'P2P Online'
                          : 'Live Server'
                        : 'З’єднання...'}
                    </span>
                  </div>
                  <p className="text-xs sm:text-[13px] font-medium text-[var(--text-secondary)] leading-relaxed">
                    Українська економічна онлайн-стратегія нового покоління —
                    грайте на ПК, ноутбуці чи смартфоні без реєстрації.
                  </p>
                </div>
              </div>

              {/* Quick Actions Bar */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={roomBusy}
                  onClick={() =>
                    onQuickBots(
                      quickGameMode === 'team2v2' ? 3 : botCount,
                      quickGameMode
                    )
                  }
                  className="px-4 py-2.5 rounded-xl mono-cta-btn text-xs font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer disabled:opacity-60"
                >
                  <Rocket className="w-3.5 h-3.5 shrink-0" />
                  <span>Швидка гра</span>
                </button>
                <button
                  type="button"
                  disabled={roomBusy}
                  onClick={() => setShowCreateModal(true)}
                  className="px-3.5 py-2.5 rounded-xl bg-[var(--surface-subtle)] hover:bg-[var(--surface-solid)] border border-[var(--border-strong)] hover:border-blue-500/60 text-xs font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer disabled:opacity-60"
                >
                  <Plus className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400 shrink-0" />
                  <span>Створити стіл</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenRules}
                  className="px-3.5 py-2.5 rounded-xl bg-[var(--surface-subtle)] hover:bg-[var(--surface-solid)] border border-[var(--border-strong)] hover:border-blue-500/60 text-xs font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-amber-400 shrink-0" />
                  <span>Правила</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }
                  title="Прокрутити на початок сторінки"
                  className="p-2.5 rounded-xl bg-[var(--surface-subtle)] hover:bg-[var(--surface-solid)] border border-[var(--border-strong)] hover:border-blue-500/60 text-xs font-extrabold inline-flex items-center justify-center transition cursor-pointer"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Row 2: Balanced Full-Width 4-Column Game Universe Key Specs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 py-4 border-b border-[var(--border-glass)]">
              <div className="px-3.5 py-2.5 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-500/12 border border-blue-500/25 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-blue-600 dark:text-sky-300" />
                </div>
                <div className="min-w-0">
                  <div className="font-display font-extrabold text-xs sm:text-[13.5px] text-blue-600 dark:text-sky-300 tabular-nums truncate">
                    28 компаній
                  </div>
                  <div className="text-[10.5px] font-semibold text-[var(--text-muted)] truncate">
                    8 монополій • 2 спецмережі
                  </div>
                </div>
              </div>

              <div className="px-3.5 py-2.5 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500/12 border border-amber-500/25 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-300" />
                </div>
                <div className="min-w-0">
                  <div className="font-display font-extrabold text-xs sm:text-[13.5px] text-amber-600 dark:text-amber-300 tabular-nums truncate">
                    32 картки подій
                  </div>
                  <div className="text-[10.5px] font-semibold text-[var(--text-muted)] truncate">
                    Цифровий Пуш і Фонд Єдності
                  </div>
                </div>
              </div>

              <div className="px-3.5 py-2.5 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/12 border border-emerald-500/25 flex items-center justify-center shrink-0">
                  <Handshake className="w-4 h-4 text-emerald-600 dark:text-emerald-300" />
                </div>
                <div className="min-w-0">
                  <div className="font-display font-extrabold text-xs sm:text-[13.5px] text-emerald-600 dark:text-emerald-300 tabular-nums truncate">
                    Смарт-Угоди
                  </div>
                  <div className="text-[10.5px] font-semibold text-[var(--text-muted)] truncate">
                    Живі торги й відкриті аукціони
                  </div>
                </div>
              </div>

              <div className="px-3.5 py-2.5 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-500/12 border border-purple-500/25 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-purple-600 dark:text-purple-300" />
                </div>
                <div className="min-w-0">
                  <div className="font-display font-extrabold text-xs sm:text-[13.5px] text-purple-600 dark:text-purple-300 tabular-nums truncate">
                    2–4 гравці • 2×2
                  </div>
                  <div className="text-[10.5px] font-semibold text-[var(--text-muted)] truncate">
                    Класика та режим 2 на 2
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Tier: Independent Authorial IP Notice & Ukrainian Craft Badge */}
            <div className="pt-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 text-[11px] text-[var(--text-muted)]">
              <div className="flex items-start gap-3 max-w-4xl">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/12 border border-emerald-500/25 flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="leading-relaxed font-medium">
                  <strong className="font-extrabold text-[var(--text-primary)]">
                    МАГНАТ.UA — незалежна авторська онлайн-гра.
                  </strong>{' '}
                  Усі назви компаній, логотипи, ігрові картки, персонажі та події у
                  грі є оригінальними художніми образами. Проєкт є повністю
                  самостійним і не пов’язаний із жодними реальними банками,
                  державними порталами, комерційними корпораціями чи сторонніми
                  торговельними марками.
                </p>
              </div>

              {/* Crafted Ukrainian Emblem Pill (crisp vector flag — zero Windows 'UA' emoji fallback) */}
              <div className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-strong)] shadow-2xs shrink-0 self-start lg:self-auto">
                <TryzubLogo className="w-4 h-4 shrink-0" />
                <span className="font-extrabold text-[11.5px] text-[var(--text-primary)] inline-flex items-center gap-1.5">
                  <span>Зроблено з</span>
                  <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500 inline shrink-0" />
                  <span>для українців</span>
                </span>
                <span
                  aria-hidden="true"
                  className="w-4.5 h-3 rounded-[3px] overflow-hidden flex flex-col shrink-0 ring-1 ring-black/15 dark:ring-white/25 shadow-2xs"
                >
                  <span className="w-full h-1/2 bg-[#0057B8]" />
                  <span className="w-full h-1/2 bg-[#FFD700]" />
                </span>
              </div>
            </div>
          </footer>
        </main>
      )}

      {/* CREATE ROOM MODAL */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md glass-panel !bg-[var(--surface-solid)] rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-3.5 sm:space-y-4 shadow-2xl max-h-[calc(100dvh-24px)] overflow-y-auto"
            >
              <h3 className="font-display font-extrabold text-xl">
                Нова онлайн-кімната 🇺🇦
              </h3>

              <div>
                <label className="block text-xs font-extrabold text-[var(--text-secondary)] mb-1">
                  Назва кімнати
                </label>
                <input
                  value={roomName}
                  maxLength={32}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder={
                    createGameMode === 'team2v2'
                      ? `Альянс 2×2 • ${playerName || 'Магнат'}`
                      : `Кімната ${playerName || 'Магната'}`
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl premium-input text-sm font-bold outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-[var(--text-secondary)] mb-1.5">
                  Режим гри
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setCreateGameMode('classic')}
                    className={`p-3 rounded-2xl border-2 text-left transition cursor-pointer ${
                      createGameMode === 'classic'
                        ? 'border-blue-600 bg-blue-500/12 shadow-xs'
                        : 'border-[var(--border-glass)] bg-[var(--surface-subtle)] hover:border-blue-500/40'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-extrabold text-xs">
                      <Trophy className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />
                      <span>Класика</span>
                    </div>
                    <div className="text-[10.5px] font-medium text-[var(--text-muted)] mt-0.5">
                      Кожен сам за себе (2–4)
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCreateGameMode('team2v2');
                      setMaxPlayers(4);
                    }}
                    className={`p-3 rounded-2xl border-2 text-left transition cursor-pointer ${
                      createGameMode === 'team2v2'
                        ? 'border-amber-400 bg-amber-400/14 shadow-xs'
                        : 'border-[var(--border-glass)] bg-[var(--surface-subtle)] hover:border-amber-400/50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-extrabold text-xs text-amber-800 dark:text-amber-300">
                      <Handshake className="w-3.5 h-3.5" />
                      <span>Командна 2 на 2</span>
                    </div>
                    <div className="text-[10.5px] font-medium text-[var(--text-muted)] mt-0.5">
                      2 альянси • своїм 0 ₴ оренди
                    </div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold text-[var(--text-secondary)] mb-1">
                    Макс. гравців
                  </label>
                  {createGameMode === 'team2v2' ? (
                    <div className="w-full px-3 py-2.5 rounded-xl bg-amber-400/12 border border-amber-400/40 text-sm font-extrabold text-amber-800 dark:text-amber-200 flex items-center justify-between">
                      <span>4 гравці</span>
                      <span className="text-[10.5px] font-black uppercase">
                        2 × 2
                      </span>
                    </div>
                  ) : (
                    <select
                      value={maxPlayers}
                      onChange={(e) => setMaxPlayers(Number(e.target.value))}
                      className="w-full px-3 py-2.5 rounded-xl premium-input text-sm font-bold outline-none"
                    >
                      {[2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n} гравці
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-[var(--text-secondary)] mb-1">
                    Таймер ходу
                  </label>
                  <select
                    value={turnTimeSeconds}
                    onChange={(e) => setTurnTimeSeconds(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl premium-input text-sm font-bold outline-none"
                  >
                    <option value={60}>60 сек (Динамічно)</option>
                    <option value={90}>90 сек (Оптимально)</option>
                    <option value={120}>120 сек (Комфортно)</option>
                    <option value={180}>180 сек (Сімейна гра)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] cursor-pointer">
                  <div>
                    <div className="text-xs font-extrabold">
                      Показувати у відкритому лобі
                    </div>
                    <div className="text-[11px] font-medium text-[var(--text-muted)]">
                      {transportMode === 'p2p'
                        ? 'Видно у вкладках цього браузера; з інших пристроїв вхід за посиланням або кодом'
                        : 'Вимкніть для гри суто за приватним посиланням'}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 shrink-0"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] cursor-pointer">
                  <div>
                    <div className="text-xs font-extrabold">
                      Регіональний грант у Карпатах 🏔️
                    </div>
                    <div className="text-[11px] font-medium text-[var(--text-muted)]">
                      Частина штрафів накопичується як бонус на клітинці Карпати
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={karpatyBonus}
                    onChange={(e) => setKarpatyBonus(e.target.checked)}
                    className="w-4 h-4 accent-blue-600"
                  />
                </label>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-3 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-strong)] text-xs font-extrabold cursor-pointer"
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    onCreateRoom({
                      roomName:
                        roomName.trim() ||
                        (createGameMode === 'team2v2'
                          ? `Альянс 2×2 • ${playerName || 'Магнат'}`
                          : `Кімната ${playerName || 'Магната'}`),
                      gameMode: createGameMode,
                      maxPlayers: createGameMode === 'team2v2' ? 4 : maxPlayers,
                      turnTimeSeconds,
                      isPublic,
                      karpatyBonusEnabled: karpatyBonus,
                      startingMoney: 15000,
                    });
                  }}
                  className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-md cursor-pointer"
                >
                  Створити кімнату
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
