import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crown,
  Dices,
  Handshake,
  Layers,
  Lock,
  LogOut,
  MapPin,
  Maximize2,
  MessageSquare,
  Moon,
  RefreshCw,
  ScrollText,
  Send,
  Shield,
  Smartphone,
  Sparkles,
  Sun,
  TrendingUp,
  Unlock,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BOARD_CELLS,
  QUICK_REACTIONS,
  SECTOR_COLORS,
  TEAM_META,
  areTeammates,
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
} from '../shared/boardData';
import { ChatMessage, GameState, SectorId } from '../shared/types';
import { sound } from '../utils/sound';
import {
  CardVisualBanner,
  MagnatBrandIcon,
  MagnatWordmark,
  TokenAvatar,
  TokenEmblemSvg,
  getCellVisualArtwork,
  getImageExposureClass,
} from './UkrainianArtwork';

function getShortPlayerLabel(
  player: { id: string; name: string },
  myPlayerId?: string
): string {
  if (myPlayerId && player.id === myPlayerId) return 'ВИ';
  const cleaned = player.name
    .replace(/\s*\(AI\)\s*/gi, '')
    .replace(/^Пан\s+/i, '')
    .trim();
  const firstWord = cleaned.split(/\s+/)[0] || cleaned;
  return firstWord.length > 8 ? `${firstWord.slice(0, 7)}.` : firstWord;
}

function getSlotOwnerLabel(
  player: { id: string; name: string },
  myPlayerId: string | undefined,
  ultraCompact: boolean
): string {
  const base = getShortPlayerLabel(player, myPlayerId);
  if (base === 'ВИ') return 'ВИ';
  const maxLen = ultraCompact ? 5 : 7;
  return base.length > maxLen ? `${base.slice(0, maxLen - 1)}.` : base;
}

function formatCompactSlotPrice(price?: number): string {
  if (!price) return '';
  if (price < 1000) return `${price}`;
  const k = price / 1000;
  return Number.isInteger(k) ? `${k}к` : `${k.toFixed(1).replace('.0', '')}к`;
}

const SECTOR_OVERVIEW: {
  id: SectorId;
  label: string;
  shortLabel: string;
  color: string;
  isSpecialNetwork?: boolean;
}[] = [
  {
    id: 'fintech',
    label: 'Банки та Фінанси',
    shortLabel: 'Банки',
    color: SECTOR_COLORS.fintech,
  },
  {
    id: 'tech',
    label: 'ІТ та Технології',
    shortLabel: 'ІТ',
    color: SECTOR_COLORS.tech,
  },
  {
    id: 'telecom',
    label: 'Зв’язок та Інтернет',
    shortLabel: 'Зв’язок',
    color: SECTOR_COLORS.telecom,
  },
  {
    id: 'ecommerce',
    label: 'Торгівля та Гіпермаркети',
    shortLabel: 'Торгівля',
    color: SECTOR_COLORS.ecommerce,
  },
  {
    id: 'fuel',
    label: 'Пальне та Заправки',
    shortLabel: 'Пальне',
    color: SECTOR_COLORS.fuel,
  },
  {
    id: 'delivery',
    label: 'Пошта та Доставка',
    shortLabel: 'Пошта',
    color: SECTOR_COLORS.delivery,
  },
  {
    id: 'retail',
    label: 'Магазини та Супермаркети',
    shortLabel: 'Магазини',
    color: SECTOR_COLORS.retail,
  },
  {
    id: 'coffee',
    label: 'Кав’ярні та Пекарні',
    shortLabel: 'Кав’ярні',
    color: SECTOR_COLORS.coffee,
  },
  {
    id: 'transport',
    label: 'Транспорт (×4)',
    shortLabel: 'Транспорт',
    color: SECTOR_COLORS.transport,
    isSpecialNetwork: true,
  },
  {
    id: 'utility',
    label: 'Інфраструктура',
    shortLabel: 'Інфраструктура',
    color: SECTOR_COLORS.utility,
    isSpecialNetwork: true,
  },
];

function useViewportHeight(): number {
  const [vh, setVh] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerHeight : 940
  );

  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return vh;
}

function usePlayerRankings(gameState: GameState) {
  const netWorthByPlayer = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of gameState.players) {
      map[p.id] = p.isBankrupt
        ? 0
        : calculatePlayerNetWorth(p.id, p.money, gameState.properties);
    }
    return map;
  }, [gameState.players, gameState.properties]);

  const rankByPlayer = useMemo(() => {
    const sorted = [...gameState.players].sort(
      (a, b) => (netWorthByPlayer[b.id] ?? 0) - (netWorthByPlayer[a.id] ?? 0)
    );
    const ranks: Record<string, number> = {};
    sorted.forEach((p, i) => {
      ranks[p.id] = i + 1;
    });
    return ranks;
  }, [gameState.players, netWorthByPlayer]);

  return { netWorthByPlayer, rankByPlayer };
}

// ============================================================================
// SHARED SUB-VIEWS (Used across Desktop Command Deck & Mobile/Tablet Shell)
// ============================================================================

export const PlayersCardsList: React.FC<{
  gameState: GameState;
  myPlayerId: string;
  selectedCellIndex?: number;
  hoveredSector?: SectorId | null;
  recentReactions: Record<string, ChatMessage>;
  compact?: boolean;
  onSelectCell: (idx: number) => void;
  onHoverSector?: (sector: SectorId | null) => void;
  onOpenTradeWith: (targetPlayerId: string) => void;
}> = ({
  gameState,
  myPlayerId,
  selectedCellIndex,
  hoveredSector = null,
  recentReactions,
  compact = false,
  onSelectCell,
  onHoverSector,
  onOpenTradeWith,
}) => {
  const { netWorthByPlayer, rankByPlayer } = usePlayerRankings(gameState);
  const activePlayer = gameState.players[gameState.turnIndex];
  const isMyTurn =
    activePlayer?.id === myPlayerId &&
    (gameState.phase === 'PRE_ROLL' ||
      gameState.phase === 'POST_ROLL' ||
      gameState.phase === 'DEBT_RESOLUTION');
  const selectedBoardSector =
    selectedCellIndex !== undefined
      ? BOARD_CELLS[selectedCellIndex]?.sector ?? null
      : null;
  const isTeamMode = gameState.settings.gameMode === 'team2v2';
  const mePlayer = gameState.players.find((pl) => pl.id === myPlayerId);
  const teamANetWorth = isTeamMode
    ? gameState.players
        .filter((pl) => pl.teamId === 'A' && !pl.isBankrupt)
        .reduce((sum, pl) => sum + (netWorthByPlayer[pl.id] ?? pl.money), 0)
    : 0;
  const teamBNetWorth = isTeamMode
    ? gameState.players
        .filter((pl) => pl.teamId === 'B' && !pl.isBankrupt)
        .reduce((sum, pl) => sum + (netWorthByPlayer[pl.id] ?? pl.money), 0)
    : 0;

  return (
    <div className="flex flex-col gap-2">
      {isTeamMode && (
        <div className="glass-panel rounded-xl px-2.5 py-1.5 grid grid-cols-2 gap-1.5 text-[9.5px] font-extrabold tabular-nums">
          <div
            className={`px-2 py-1 rounded-lg border flex items-center justify-between gap-1 ${
              mePlayer?.teamId === 'A'
                ? 'bg-sky-500/16 border-sky-400/50 text-sky-700 dark:text-sky-200'
                : 'bg-[var(--surface-subtle)] border-[var(--border-glass)] text-[var(--text-secondary)]'
            }`}
          >
            <span className="truncate flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
              <span>{TEAM_META.A.name}</span>
            </span>
            <span className="font-black text-[var(--text-primary)] shrink-0">
              {formatMoney(teamANetWorth)}
            </span>
          </div>
          <div
            className={`px-2 py-1 rounded-lg border flex items-center justify-between gap-1 ${
              mePlayer?.teamId === 'B'
                ? 'bg-amber-400/18 border-amber-400/50 text-amber-800 dark:text-amber-200'
                : 'bg-[var(--surface-subtle)] border-[var(--border-glass)] text-[var(--text-secondary)]'
            }`}
          >
            <span className="truncate flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              <span>{TEAM_META.B.name}</span>
            </span>
            <span className="font-black text-[var(--text-primary)] shrink-0">
              {formatMoney(teamBNetWorth)}
            </span>
          </div>
        </div>
      )}

      {gameState.players.map((p, idx) => {
        const isTurn =
          idx === gameState.turnIndex && gameState.status === 'playing';
        const isMe = p.id === myPlayerId;
        const isMyTeammate = areTeammates(
          gameState.settings.gameMode,
          mePlayer,
          p
        );
        const ownedCells = BOARD_CELLS.filter(
          (c) => gameState.properties[c.index]?.ownerId === p.id
        ).sort((a, b) => {
          const sa = a.sector
            ? SECTOR_OVERVIEW.findIndex((s) => s.id === a.sector)
            : 99;
          const sb = b.sector
            ? SECTOR_OVERVIEW.findIndex((s) => s.id === b.sector)
            : 99;
          return sa !== sb ? sa - sb : a.index - b.index;
        });
        const netWorth = netWorthByPlayer[p.id] ?? p.money;
        const rank = rankByPlayer[p.id] ?? idx + 1;
        const currentCell = BOARD_CELLS[p.position] ?? BOARD_CELLS[0];
        const bubble = recentReactions[p.id];

        return (
          <div
            key={p.id}
            style={{
              borderColor: isTurn ? p.color : undefined,
              boxShadow: isTurn ? `0 10px 26px -10px ${p.color}77` : undefined,
            }}
            className={`relative rounded-2xl overflow-hidden ${
              compact ? 'py-2.5 pr-2.5 pl-3.5' : 'py-3 pr-3 pl-4'
            } transition-all ${
              p.isBankrupt
                ? 'opacity-40 grayscale glass-panel'
                : isTurn
                  ? 'glass-panel border-2'
                  : 'glass-panel'
            }`}
          >
            {/* Player Territory Signature Color Strip — Matches Their Owned Cards on the Board 1:1 */}
            {!p.isBankrupt && (
              <span
                style={{ backgroundColor: p.color }}
                className="pointer-events-none absolute left-0 top-2 bottom-2 w-[4px] rounded-r-full opacity-95"
              />
            )}
            <AnimatePresence>
              {bubble && (
                <motion.div
                  key={bubble.id}
                  initial={{ opacity: 0, y: 8, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="absolute -top-2.5 right-3 z-20 px-2.5 py-0.5 rounded-full bg-blue-600 text-white dark:bg-white dark:text-slate-950 text-[10.5px] font-extrabold shadow-lg max-w-[200px] truncate"
                >
                  {bubble.text}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-start gap-2.5">
              <div className="relative shrink-0 mt-0.5">
                <TokenAvatar
                  token={p.token}
                  color={p.color}
                  size={compact ? 34 : 40}
                />
                <span
                  className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full text-[8.5px] font-black flex items-center justify-center border ${
                    rank === 1
                      ? 'bg-amber-400 text-slate-950 border-white dark:border-slate-950'
                      : 'bg-slate-200 text-slate-800 border-white dark:bg-slate-900 dark:text-slate-200 dark:border-white/20'
                  }`}
                >
                  #{rank}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1.5 min-w-0">
                  <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                    <span className="font-extrabold text-[11.5px] xl:text-xs 2xl:text-[13px] truncate">
                      {p.isBot ? p.name.replace(/\s*\(AI\)$/i, '') : p.name}
                    </span>
                    {isMe && (
                      <span className="px-1.5 py-0.2 rounded-full bg-white text-slate-950 border border-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.4)] text-[8px] 2xl:text-[8.5px] font-black shrink-0">
                        ВИ
                      </span>
                    )}
                    {isMyTeammate && (
                      <span
                        title="Ваш напарник у режимі 2 на 2 — оренда між вами 0 ₴!"
                        className="px-1.5 py-0.2 rounded-full bg-sky-400/20 text-sky-700 dark:text-sky-200 border border-sky-400/50 text-[8px] 2xl:text-[8.5px] font-black shrink-0"
                      >
                        🤝 НАПАРНИК
                      </span>
                    )}
                    {isTeamMode && p.teamId && !isMyTeammate && (
                      <span
                        className={`px-1.5 py-0.2 rounded text-[8px] font-black shrink-0 ${
                          p.teamId === 'A'
                            ? 'bg-sky-500/18 text-sky-700 dark:text-sky-300 border border-sky-400/35'
                            : 'bg-amber-400/20 text-amber-800 dark:text-amber-300 border border-amber-400/35'
                        }`}
                      >
                        {p.teamId === 'A' ? 'АЛЬЯНС А' : 'АЛЬЯНС Б'}
                      </span>
                    )}
                    {p.isBot && (
                      <span className="px-1 py-0.2 rounded bg-slate-500/20 text-[8px] 2xl:text-[8.5px] font-extrabold shrink-0">
                        AI
                      </span>
                    )}
                    {isTurn && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-600 dark:text-amber-300 text-[8px] 2xl:text-[8.5px] font-black shrink-0">
                        ХІД
                      </span>
                    )}
                    {!p.isBot && !p.isConnected && !p.isBankrupt && (
                      <span className="px-1.5 py-0.2 rounded bg-rose-500/18 text-rose-600 dark:text-rose-300 text-[8px] 2xl:text-[8.5px] font-extrabold shrink-0">
                        ОФЛАЙН
                      </span>
                    )}
                    {!p.isBot && !p.isBankrupt && (p.missedTurns ?? 0) > 0 && (
                      <span
                        title="Пропущено ходів без дій (3 поспіль — виліт із гри)"
                        className={`px-1.5 py-0.2 rounded text-[8px] 2xl:text-[8.5px] font-black shrink-0 tabular-nums ${
                          (p.missedTurns ?? 0) >= 2
                            ? 'bg-rose-500/22 text-rose-600 dark:text-rose-300 border border-rose-500/40 animate-pulse'
                            : 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        ⏱ {p.missedTurns}/3
                      </span>
                    )}
                  </div>

                  <div className="font-display font-extrabold text-xs 2xl:text-sm tabular-nums whitespace-nowrap shrink-0">
                    {formatMoney(p.money)}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-1.5 mt-1 min-w-0">
                  <div className="flex items-center gap-1 text-[9.5px] 2xl:text-[10px] text-[var(--text-muted)] font-semibold tabular-nums min-w-0">
                    <span className="whitespace-nowrap shrink-0">
                      {p.isBankrupt ? (
                        'Банкрут'
                      ) : (
                        <>
                          <span className="hidden 2xl:inline">Капітал: </span>
                          <span className="2xl:hidden">Кап. </span>
                          {formatMoney(netWorth)}
                        </>
                      )}
                    </span>
                    {!p.isBankrupt && (
                      <>
                        <span className="shrink-0">•</span>
                        <button
                          onClick={() => {
                            sound.playClick();
                            onSelectCell(p.position);
                          }}
                          className="inline-flex items-center gap-0.5 text-[var(--text-secondary)] hover:text-sky-400 truncate min-w-0 cursor-pointer"
                          title={`Позиція: ${currentCell.name}`}
                        >
                          <MapPin className="w-2.5 h-2.5 shrink-0 text-amber-400" />
                          <span className="truncate">
                            {currentCell.shortName}
                          </span>
                        </button>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-1 shrink-0">
                    {p.inJail && (
                      <span className="px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-500 text-[8.5px] font-extrabold whitespace-nowrap">
                        ⚖️ Ізолятор
                      </span>
                    )}
                    {!isMe && !p.isBankrupt && isMyTurn ? (
                      <button
                        onClick={() => onOpenTradeWith(p.id)}
                        className={`px-2 py-0.5 rounded-lg text-[9.5px] font-extrabold flex items-center gap-1 transition cursor-pointer whitespace-nowrap ${
                          isMyTeammate
                            ? 'bg-sky-500/20 hover:bg-sky-500 hover:text-slate-950 text-sky-700 dark:text-sky-200 border border-sky-400/40'
                            : 'bg-blue-600/15 hover:bg-blue-600 hover:text-white text-blue-700 dark:text-sky-300'
                        }`}
                      >
                        <Handshake className="w-3 h-3" />{' '}
                        {isMyTeammate ? 'Обмін' : 'Угода'}
                      </button>
                    ) : (
                      !p.isBankrupt && (
                        <span className="text-[9.5px] font-bold text-[var(--text-muted)] whitespace-nowrap">
                          Активів: {ownedCells.length}
                        </span>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>

            {ownedCells.length > 0 && !p.isBankrupt && (
              <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-[var(--border-glass)]">
                {ownedCells.map((c) => {
                  const pr = gameState.properties[c.index];
                  const sectorColor = c.color || '#38BDF8';
                  const isSelected = selectedCellIndex === c.index;
                  const isSameSector = Boolean(
                    !isSelected &&
                      (hoveredSector
                        ? c.sector === hoveredSector
                        : selectedBoardSector &&
                          c.sector === selectedBoardSector)
                  );
                  const isMortgaged = Boolean(pr?.isMortgaged);
                  const hasSectorMonopoly = Boolean(
                    c.type === 'company' &&
                      c.sector &&
                      hasFullSectorMonopoly(
                        p.id,
                        c.sector,
                        gameState.properties,
                        false
                      )
                  );

                  return (
                    <button
                      key={c.index}
                      onClick={() => {
                        sound.playClick();
                        onSelectCell(c.index);
                      }}
                      onMouseEnter={() => {
                        if (c.sector) onHoverSector?.(c.sector);
                      }}
                      onMouseLeave={() => {
                        if (c.sector) onHoverSector?.(null);
                      }}
                      title={`${c.name}${c.sectorName ? ` • ${c.sectorName}` : ''}${hasSectorMonopoly ? ' [МОНОПОЛІЯ 👑]' : ''}${pr?.branches ? ` (${pr.branches >= 5 ? 'Холдинг 👑' : `${pr.branches} філії ★`})` : ''}${isMortgaged ? ' [У заставі]' : ''}`}
                      style={
                        isMortgaged
                          ? undefined
                          : {
                              backgroundColor: `color-mix(in srgb, ${sectorColor} ${hasSectorMonopoly ? '22%' : '15%'}, var(--surface-solid))`,
                              borderColor: isSelected
                                ? '#38BDF8'
                                : isSameSector
                                  ? sectorColor
                                  : hasSectorMonopoly
                                    ? `color-mix(in srgb, ${sectorColor} 72%, #FBBF24)`
                                    : `color-mix(in srgb, ${sectorColor} 54%, var(--border-strong))`,
                            }
                      }
                      className={`relative overflow-hidden inline-flex items-center gap-1 pl-3 pr-2 py-[3px] rounded-md text-[10px] 2xl:text-[10.5px] font-semibold tracking-[0.012em] leading-snug border shadow-2xs hover:brightness-110 transition cursor-pointer ${
                        isSelected
                          ? 'ring-1 ring-sky-400'
                          : isSameSector
                            ? 'ring-1 ring-white/45'
                            : ''
                      } ${
                        isMortgaged
                          ? 'bg-slate-500/15 text-[var(--text-muted)] border-slate-500/30 line-through opacity-75'
                          : 'text-[var(--text-primary)]'
                      }`}
                    >
                      <span
                        style={{
                          backgroundColor: isMortgaged ? '#64748B' : sectorColor,
                        }}
                        className="pointer-events-none absolute left-0 top-0 bottom-0 w-[5.5px]"
                      />
                      <span className="whitespace-nowrap">{c.shortName}</span>
                      {pr?.branches ? (
                        pr.branches >= 5 ? (
                          <span className="text-[9.5px] leading-none shrink-0">
                            👑
                          </span>
                        ) : (
                          <span className="text-[9px] font-extrabold text-amber-600 dark:text-amber-300 leading-none shrink-0">
                            ★{pr.branches}
                          </span>
                        )
                      ) : hasSectorMonopoly ? (
                        <span className="text-[9px] leading-none shrink-0">
                          👑
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const SectorsControlGrid: React.FC<{
  gameState: GameState;
  myPlayerId?: string;
  selectedCellIndex: number;
  hoveredSector?: SectorId | null;
  onSelectCell: (idx: number) => void;
  onHoverSector?: (sector: SectorId | null) => void;
}> = ({
  gameState,
  myPlayerId,
  selectedCellIndex,
  hoveredSector = null,
  onSelectCell,
  onHoverSector,
}) => {
  const selectedBoardSector = BOARD_CELLS[selectedCellIndex]?.sector;
  const [manualSectorId, setManualSectorId] = useState<SectorId>(
    selectedBoardSector ?? 'fintech'
  );

  useEffect(() => {
    if (selectedBoardSector) {
      setManualSectorId(selectedBoardSector);
    }
  }, [selectedBoardSector]);

  const focusedSectorId: SectorId = selectedBoardSector ?? manualSectorId;
  const focusedSectorMeta =
    SECTOR_OVERVIEW.find((s) => s.id === focusedSectorId) ?? SECTOR_OVERVIEW[0];
  const focusedSectorCells = getSectorCells(focusedSectorMeta.id);
  const isFourCardGrid = focusedSectorCells.length === 4;
  const focusedMonopolyOwner = gameState.players.find(
    (pl) =>
      !pl.isBankrupt &&
      focusedSectorCells.every(
        (c) => gameState.properties[c.index]?.ownerId === pl.id
      )
  );
  const mePlayer = myPlayerId
    ? gameState.players.find((pl) => pl.id === myPlayerId)
    : undefined;
  const myTeammate = mePlayer
    ? gameState.players.find(
        (pl) =>
          !pl.isBankrupt &&
          areTeammates(gameState.settings.gameMode, mePlayer, pl)
      )
    : undefined;

  const allProperties = Object.values(gameState.properties);
  const totalOwned = allProperties.filter((pr) => Boolean(pr?.ownerId)).length;
  const totalBranches = allProperties.reduce(
    (acc, pr) => acc + (pr?.branches ?? 0),
    0
  );
  const activeMonopolies = SECTOR_OVERVIEW.filter(
    (sec) =>
      !sec.isSpecialNetwork &&
      gameState.players.some(
        (pl) =>
          !pl.isBankrupt &&
          getSectorCells(sec.id).every(
            (c) => gameState.properties[c.index]?.ownerId === pl.id
          )
      )
  ).length;
  const activePlayersWithCounts = gameState.players
    .filter((pl) => !pl.isBankrupt)
    .map((pl) => ({
      player: pl,
      count: allProperties.filter((pr) => pr?.ownerId === pl.id).length,
    }));
  const playerAssetShares = activePlayersWithCounts.filter(
    (entry) => entry.count > 0
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Compact Executive Header */}
      <div className="mb-1.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11.5px] 2xl:text-xs font-extrabold tracking-tight">
            <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-amber-400 shrink-0" />
            <span>Монополії за секторами</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {totalBranches > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-400/18 text-amber-600 dark:text-amber-300 border border-amber-400/35 text-[9px] font-extrabold tabular-nums">
                ★{totalBranches}
              </span>
            )}
            <span
              className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold tabular-nums ${
                activeMonopolies > 0
                  ? 'bg-amber-400/20 text-amber-600 dark:text-amber-300 border border-amber-400/40'
                  : 'bg-[var(--surface-subtle)] text-[var(--text-muted)] border border-[var(--border-glass)]'
              }`}
            >
              Зібрано: {activeMonopolies}/8
            </span>
          </div>
        </div>
        <p className="mt-0.5 text-[9px] font-medium text-[var(--text-muted)] truncate">
          Наведіть для радару на полі • Повний колір дає оренду ×2 і філії ★
        </p>
      </div>

      {/* Sectors Radar Grid + Focused Sector Breakdown */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5">
        <div className="grid grid-cols-2 content-start gap-1.5">
          {SECTOR_OVERVIEW.map((sec, idx) => {
            const cells = getSectorCells(sec.id);
            const firstIdx = cells[0]?.index ?? 0;
            const isFocusedSector = focusedSectorMeta.id === sec.id;
            const isHoveredSector = hoveredSector === sec.id;
            const isActiveTile = isFocusedSector || isHoveredSector;
            const ultraCompactSlots = cells.length === 4;

            const monopolyOwner = gameState.players.find(
              (pl) =>
                !pl.isBankrupt &&
                cells.every(
                  (c) => gameState.properties[c.index]?.ownerId === pl.id
                )
            );

            const ownedCount = cells.filter((c) =>
              Boolean(gameState.properties[c.index]?.ownerId)
            ).length;

            const myCount = myPlayerId
              ? cells.filter(
                  (c) => gameState.properties[c.index]?.ownerId === myPlayerId
                ).length
              : 0;
            const allyCount = myTeammate
              ? cells.filter(
                  (c) =>
                    gameState.properties[c.index]?.ownerId === myTeammate.id
                ).length
              : 0;

            const rivalCounts = gameState.players
              .filter((pl) => !pl.isBankrupt && pl.id !== myPlayerId)
              .map((pl) => ({
                player: pl,
                count: cells.filter(
                  (c) => gameState.properties[c.index]?.ownerId === pl.id
                ).length,
              }))
              .filter((item) => item.count > 0)
              .sort((a, b) => b.count - a.count);

            const topRival = rivalCounts[0] ?? null;
            const rivalTotalCount = rivalCounts.reduce(
              (sum, item) => sum + item.count,
              0
            );
            const distinctOwnerCount =
              (myCount > 0 ? 1 : 0) + rivalCounts.length;
            const isAllianceReadyToUnite =
              !sec.isSpecialNetwork &&
              myCount > 0 &&
              allyCount > 0 &&
              myCount + allyCount === cells.length;

            let statusNode: React.ReactNode;
            if (monopolyOwner) {
              const isMyMonopoly = monopolyOwner.id === myPlayerId;
              const isAllyMonopoly = Boolean(
                myTeammate && monopolyOwner.id === myTeammate.id
              );
              const label = getSlotOwnerLabel(monopolyOwner, myPlayerId, true);
              statusNode = isMyMonopoly ? (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-[1px] rounded-full bg-white text-slate-950 border border-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.35)] text-[8.5px] font-black shrink-0">
                  <span>{sec.isSpecialNetwork ? '⚡' : '👑'}</span>
                  <span>ВИ</span>
                </span>
              ) : isAllyMonopoly ? (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-[1px] rounded-full bg-sky-400/20 text-sky-700 dark:text-sky-200 border border-sky-400/50 text-[8.5px] font-extrabold shrink-0">
                  <span>🤝</span>
                  <span>{label}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-[1px] rounded-full bg-amber-400/20 text-amber-600 dark:text-amber-300 border border-amber-400/45 text-[8.5px] font-extrabold shrink-0">
                  <span>{sec.isSpecialNetwork ? '⚡' : '👑'}</span>
                  <span>{label}</span>
                </span>
              );
            } else if (isAllianceReadyToUnite) {
              statusNode = (
                <span
                  title="Ви та ваш напарник тримаєте весь сектор — об'єднайте через Смарт-Угоду для монополії ×2!"
                  className="inline-flex items-center gap-0.5 px-1.5 py-[0.5px] rounded-full bg-sky-400/22 text-sky-700 dark:text-sky-200 border border-sky-400/55 text-[8.5px] font-black shrink-0"
                >
                  <span>🤝</span>
                  <span>Разом!</span>
                </span>
              );
            } else if (ownedCount === 0) {
              statusNode = (
                <span className="text-[8.5px] font-bold text-emerald-600/90 dark:text-emerald-400/85 shrink-0">
                  Вільно
                </span>
              );
            } else if (!sec.isSpecialNetwork && distinctOwnerCount >= 2) {
              statusNode = (
                <span
                  title="Сектор поділено між гравцями — потрібна Смарт-Угода"
                  className="inline-flex items-center gap-0.5 px-1.5 py-[0.5px] rounded bg-slate-500/14 dark:bg-white/[0.08] text-[var(--text-secondary)] border border-slate-400/25 dark:border-white/10 text-[8.5px] font-extrabold tabular-nums shrink-0"
                >
                  <span>⇄</span>
                  <span>
                    {ownedCount}/{cells.length}
                  </span>
                </span>
              );
            } else if (myCount > 0 && rivalTotalCount === 0) {
              const oneAway =
                !sec.isSpecialNetwork && cells.length - myCount === 1;
              statusNode = oneAway ? (
                <span
                  title="Залишилась 1 вільна компанія до вашої монополії!"
                  className="inline-flex items-center gap-0.5 px-1.5 py-[0.5px] rounded-full bg-emerald-500/18 text-emerald-700 dark:text-emerald-300 border border-emerald-400/45 text-[8.5px] font-black tabular-nums shrink-0"
                >
                  <span>
                    Ви {myCount}/{cells.length}
                  </span>
                </span>
              ) : (
                <span className="text-[8.5px] font-extrabold text-emerald-600 dark:text-emerald-300 tabular-nums shrink-0">
                  Ви {myCount}/{cells.length}
                </span>
              );
            } else if (
              !sec.isSpecialNetwork &&
              myCount === 0 &&
              topRival &&
              cells.length - topRival.count === 1
            ) {
              statusNode = (
                <span
                  title={`${topRival.player.name} за 1 крок від монополії!`}
                  className="inline-flex items-center gap-0.5 px-1.5 py-[0.5px] rounded-full bg-amber-500/18 text-amber-700 dark:text-amber-300 border border-amber-400/45 text-[8.5px] font-black tabular-nums shrink-0"
                >
                  <span>⚡</span>
                  <span>
                    {topRival.count}/{cells.length}
                  </span>
                </span>
              );
            } else if (sec.isSpecialNetwork && myCount > 0) {
              statusNode = (
                <span className="text-[8.5px] font-extrabold text-blue-600 dark:text-sky-300 tabular-nums shrink-0">
                  Ви {myCount}/{cells.length}
                </span>
              );
            } else {
              statusNode = (
                <span className="px-1.5 py-[0.5px] rounded bg-slate-500/12 dark:bg-white/[0.07] text-[var(--text-secondary)] text-[8.5px] font-bold tabular-nums shrink-0">
                  {ownedCount}/{cells.length}
                </span>
              );
            }

            const handleTileActivate = () => {
              sound.playClick();
              setManualSectorId(sec.id);
              if (isFocusedSector) {
                const curIdx = cells.findIndex(
                  (c) => c.index === selectedCellIndex
                );
                const nextCell =
                  cells[(curIdx + 1) % cells.length] ?? cells[0];
                onSelectCell(nextCell?.index ?? firstIdx);
              } else {
                onSelectCell(firstIdx);
              }
            };

            return (
              <React.Fragment key={sec.id}>
                {idx === 8 && (
                  <div className="col-span-2 pt-0.5 flex items-center gap-1.5 text-[8.5px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] select-none">
                    <span>Спецмережі • Оренда за кількість</span>
                    <span className="flex-1 h-[1px] bg-[var(--border-glass)]" />
                  </div>
                )}
                <div
                  role="button"
                  tabIndex={0}
                  onMouseEnter={() => onHoverSector?.(sec.id)}
                  onMouseLeave={() => onHoverSector?.(null)}
                  onClick={handleTileActivate}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleTileActivate();
                    }
                  }}
                  style={{
                    borderColor: monopolyOwner
                      ? `color-mix(in srgb, ${sec.color} 55%, #FBBF24)`
                      : isActiveTile
                        ? `color-mix(in srgb, ${sec.color} 78%, #FFFFFF)`
                        : undefined,
                    background: isActiveTile
                      ? `linear-gradient(95deg, color-mix(in srgb, ${sec.color} 22%, var(--surface-solid)) 0%, color-mix(in srgb, ${sec.color} 7%, var(--surface-solid)) 100%)`
                      : `linear-gradient(95deg, color-mix(in srgb, ${sec.color} 8%, var(--surface-subtle)) 0%, var(--surface-subtle) 68%)`,
                    boxShadow: isActiveTile
                      ? `0 8px 18px -10px color-mix(in srgb, ${sec.color} 70%, transparent)`
                      : undefined,
                  }}
                  className={`group relative rounded-xl border pl-2.5 pr-2 py-1.5 text-left transition-all flex flex-col justify-between gap-1 cursor-pointer overflow-hidden select-none ${
                    isActiveTile
                      ? 'ring-1 ring-white/20'
                      : 'border-[var(--border-glass)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  {/* Sculpted Full-Height Monopoly Color Spine */}
                  <span
                    className="pointer-events-none absolute left-0 top-0 bottom-0 w-[4px]"
                    style={
                      sec.isSpecialNetwork
                        ? {
                            backgroundImage:
                              sec.id === 'transport'
                                ? 'linear-gradient(180deg, #FFFFFF 0%, #CBD5E1 52%, #94A3B8 100%)'
                                : 'linear-gradient(180deg, #FEF3C7 0%, #D6D3D1 52%, #A8A29E 100%)',
                          }
                        : { backgroundColor: sec.color }
                    }
                  />

                  <div className="relative z-10 flex items-center justify-between gap-1 w-full">
                    <span
                      title={sec.label}
                      className="text-[10px] 2xl:text-[10.5px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)] truncate"
                    >
                      {sec.shortLabel}
                    </span>
                    {statusNode}
                  </div>

                  {/* Individually Clickable Mini-Card Company Slots (ВИ / Rival Name / Price) */}
                  <div className="relative z-10 flex items-center gap-1 w-full">
                    {cells.map((c) => {
                      const pr = gameState.properties[c.index];
                      const owId = pr?.ownerId;
                      const ow = owId
                        ? gameState.players.find((pl) => pl.id === owId)
                        : null;
                      const isMine = Boolean(ow && ow.id === myPlayerId);
                      const isAllySlot = Boolean(
                        ow && myTeammate && ow.id === myTeammate.id
                      );
                      const isCellActive = selectedCellIndex === c.index;
                      const slotOwnerLabel = ow
                        ? getSlotOwnerLabel(ow, myPlayerId, ultraCompactSlots)
                        : '';

                      return (
                        <button
                          key={c.index}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            sound.playClick();
                            setManualSectorId(sec.id);
                            onSelectCell(c.index);
                          }}
                          title={`${c.shortName} — ${
                            ow
                              ? `${ow.name}${isAllySlot ? ' (Напарник • оренда 0 ₴)' : ''}${pr?.isMortgaged ? ' (У заставі)' : ''}`
                              : `Вільно (${formatMoney(c.price ?? 0)})`
                          }`}
                          style={
                            ow
                              ? isMine
                                ? {
                                    background:
                                      'linear-gradient(180deg, #FFFFFF 0%, #E2E8F0 100%)',
                                    borderColor: '#10B981',
                                  }
                                : {
                                    background: `linear-gradient(180deg, color-mix(in srgb, ${ow.color} 90%, #FFFFFF) 0%, color-mix(in srgb, ${ow.color} 78%, #020617) 100%)`,
                                    borderColor: isAllySlot
                                      ? '#38BDF8'
                                      : `color-mix(in srgb, ${ow.color} 68%, rgba(255,255,255,0.48))`,
                                  }
                              : undefined
                          }
                          className={`h-[17px] 2xl:h-[18px] flex-1 min-w-0 px-0.5 rounded-[5px] flex items-center justify-center gap-[1px] leading-none transition-all cursor-pointer ${
                            ultraCompactSlots ? 'text-[7.2px]' : 'text-[8px]'
                          } ${
                            isCellActive
                              ? 'ring-[1.5px] ring-sky-400 dark:ring-white z-10 scale-[1.02]'
                              : 'hover:brightness-110'
                          } ${
                            pr?.isMortgaged ? 'opacity-60' : ''
                          } ${
                            ow
                              ? isMine
                                ? 'border-[1.25px] font-black text-slate-950 shadow-[0_0_7px_rgba(16,185,129,0.32)]'
                                : 'border font-extrabold text-white shadow-2xs [text-shadow:0_1px_1.5px_rgba(2,6,23,0.65)]'
                              : 'bg-slate-900/[0.045] dark:bg-slate-950/55 hover:bg-emerald-500/12 border border-slate-400/35 dark:border-white/[0.11] hover:border-emerald-400/55 font-bold text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-300 tabular-nums'
                          }`}
                        >
                          {ow ? (
                            <>
                              <span className="truncate">{slotOwnerLabel}</span>
                              {pr?.branches ? (
                                <span className="shrink-0 text-[7px]">
                                  {pr.branches >= 5 ? '👑' : `★${pr.branches}`}
                                </span>
                              ) : null}
                            </>
                          ) : (
                            <span className="truncate">
                              {formatCompactSlotPrice(c.price)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Live Focused Sector Breakdown — Compact 1-Line Header + Live Rent & Owner Rows */}
        <div
          style={{
            borderColor: `color-mix(in srgb, ${focusedSectorMeta.color} 44%, var(--border-strong))`,
            background: `linear-gradient(135deg, color-mix(in srgb, ${focusedSectorMeta.color} 11%, var(--surface-subtle)) 0%, color-mix(in srgb, ${focusedSectorMeta.color} 4%, var(--surface-subtle)) 100%)`,
          }}
          className="rounded-xl border p-2 space-y-1.5"
        >
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                style={{ backgroundColor: focusedSectorMeta.color }}
                className="w-1.5 h-3.5 rounded-full shrink-0 shadow-2xs"
              />
              <span className="text-[10.5px] font-extrabold text-[var(--text-primary)] truncate">
                {focusedSectorCells[0]?.sectorName || focusedSectorMeta.label}
              </span>
            </div>
            <span className="px-1.5 py-0.5 rounded-md bg-black/5 dark:bg-white/[0.07] border border-black/5 dark:border-white/10 text-[8.5px] font-bold text-[var(--text-secondary)] whitespace-nowrap shrink-0 tabular-nums">
              {focusedSectorMeta.id === 'transport'
                ? '1–4 хаби: 250–2 000 ₴'
                : focusedSectorMeta.id === 'utility'
                  ? 'Кубики ×40 / ×100'
                  : focusedMonopolyOwner
                    ? `👑 ${getShortPlayerLabel(focusedMonopolyOwner, myPlayerId)} • ×2`
                    : `Усі ${focusedSectorCells.length} = ×2 + ★`}
            </span>
          </div>

          <div
            className={
              isFourCardGrid
                ? 'grid grid-cols-2 gap-1'
                : 'flex flex-col gap-1'
            }
          >
            {focusedSectorCells.map((c) => {
              const pr = gameState.properties[c.index];
              const ow = pr?.ownerId
                ? gameState.players.find((pl) => pl.id === pr.ownerId)
                : null;
              const isSelected = selectedCellIndex === c.index;
              const { imageSrc, objectPosition } = getCellVisualArtwork(c);
              const exposureClass = getImageExposureClass(imageSrc);

              let liveRentTag = '';
              if (ow) {
                if (pr?.isMortgaged) {
                  liveRentTag = isFourCardGrid ? 'Заст.' : 'Застава';
                } else if (c.type === 'utility') {
                  const ownedUtils = BOARD_CELLS.filter(
                    (uc) =>
                      uc.type === 'utility' &&
                      gameState.properties[uc.index]?.ownerId === ow.id &&
                      !gameState.properties[uc.index]?.isMortgaged
                  ).length;
                  liveRentTag = ownedUtils >= 2 ? '×100' : '×40';
                } else {
                  const rentVal = calculateRent(
                    c.index,
                    gameState.properties,
                    7
                  );
                  liveRentTag = isFourCardGrid
                    ? formatMoney(rentVal)
                    : `Оренда ${formatMoney(rentVal)}`;
                }
              }

              return (
                <button
                  key={c.index}
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    onSelectCell(c.index);
                  }}
                  style={
                    isSelected
                      ? {
                          borderColor: `color-mix(in srgb, ${focusedSectorMeta.color} 76%, #FFFFFF)`,
                          backgroundColor: `color-mix(in srgb, ${focusedSectorMeta.color} 16%, var(--surface-solid))`,
                        }
                      : undefined
                  }
                  className={`flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg border text-left transition cursor-pointer min-w-0 ${
                    isSelected
                      ? 'shadow-2xs'
                      : 'bg-[var(--surface-solid)]/88 hover:bg-[var(--cell-hover)] border-[var(--border-glass)]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <img
                      src={imageSrc}
                      alt={c.shortName}
                      style={{ objectPosition }}
                      className={`w-5 h-5 rounded-[5px] object-cover border border-white/15 shrink-0 ${exposureClass}`}
                    />
                    <span
                      className={`text-[10px] font-semibold tracking-[-0.01em] truncate ${
                        pr?.isMortgaged
                          ? 'line-through text-[var(--text-muted)]'
                          : 'text-[var(--text-primary)]'
                      }`}
                    >
                      {c.shortName}
                    </span>
                    {pr?.branches ? (
                      pr.branches >= 5 ? (
                        <span className="text-[9.5px] leading-none shrink-0">
                          👑
                        </span>
                      ) : (
                        <span className="text-[9px] font-extrabold text-amber-500 dark:text-amber-300 leading-none shrink-0">
                          ★{pr.branches}
                        </span>
                      )
                    ) : null}
                  </div>

                  {ow ? (
                    <span
                      style={
                        ow.id === myPlayerId
                          ? {
                              background:
                                'linear-gradient(180deg, #FFFFFF 0%, #E2E8F0 100%)',
                              borderColor: '#10B981',
                            }
                          : {
                              background: `linear-gradient(180deg, color-mix(in srgb, ${ow.color} 88%, #FFFFFF) 0%, color-mix(in srgb, ${ow.color} 78%, #020617) 100%)`,
                              borderColor: `color-mix(in srgb, ${ow.color} 70%, rgba(255,255,255,0.45))`,
                            }
                      }
                      className={`inline-flex items-center gap-1 px-1.5 py-[1.5px] rounded-full border text-[8.8px] font-extrabold shrink-0 tabular-nums shadow-2xs ${
                        ow.id === myPlayerId
                          ? 'text-slate-950'
                          : 'text-white [text-shadow:0_1px_1px_rgba(2,6,23,0.55)]'
                      }`}
                    >
                      <span>
                        {getSlotOwnerLabel(ow, myPlayerId, isFourCardGrid)}
                        {liveRentTag ? ` • ${liveRentTag}` : ''}
                      </span>
                    </span>
                  ) : (
                    <span className="px-1.5 py-[1.5px] rounded-full bg-emerald-500/14 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300 text-[8.8px] font-bold tabular-nums whitespace-nowrap shrink-0">
                      {isFourCardGrid
                        ? formatMoney(c.price ?? 0)
                        : `Вільно • ${formatMoney(c.price ?? 0)}`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Market Privatization Bar + Unified Player Ownership Chips */}
      <div className="mt-1.5 pt-2 border-t border-[var(--border-glass)] space-y-1.5 shrink-0 tabular-nums">
        <div className="flex items-center justify-between text-[9.5px] font-bold text-[var(--text-secondary)]">
          <span>Викуплено компаній на полі</span>
          <span className="text-[var(--text-primary)] font-extrabold">
            {totalOwned} із 28 ({Math.round((totalOwned / 28) * 100)}%)
          </span>
        </div>

        <div className="h-1.5 w-full rounded-full bg-slate-200/85 dark:bg-slate-800/90 overflow-hidden flex gap-[1px]">
          {playerAssetShares.map(({ player, count }) => (
            <div
              key={player.id}
              title={`${player.name}: ${count} із 28 компаній`}
              style={{
                width: `${(count / 28) * 100}%`,
                backgroundColor: player.color,
              }}
              className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1 text-[9px] font-bold">
          {activePlayersWithCounts.map(({ player, count }) => {
            const isMe = Boolean(myPlayerId && player.id === myPlayerId);
            return isMe ? (
              <span
                key={player.id}
                className="inline-flex items-center gap-1 px-1.5 py-[1px] rounded-full bg-white text-slate-950 border border-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.28)] font-black whitespace-nowrap"
              >
                <span
                  style={{ backgroundColor: player.color }}
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                />
                <span>ВИ: {count}</span>
              </span>
            ) : (
              <span
                key={player.id}
                className="inline-flex items-center gap-1 px-1.5 py-[1px] rounded-full bg-[var(--surface-subtle)] border border-[var(--border-glass)] text-[var(--text-secondary)] whitespace-nowrap"
              >
                <span
                  style={{ backgroundColor: player.color }}
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                />
                <span>
                  {getShortPlayerLabel(player, myPlayerId)}:{' '}
                  <strong className="text-[var(--text-primary)]">{count}</strong>
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const NationalFundsWidget: React.FC<{
  gameState: GameState;
  onSelectCell: (idx: number) => void;
}> = ({ gameState, onSelectCell }) => (
  <div className="glass-panel rounded-2xl p-2 grid grid-cols-2 gap-1.5 shrink-0">
    <button
      onClick={() => {
        sound.playClick();
        onSelectCell(4);
      }}
      title="Сумарні донати всіх гравців на Сили Оборони за поточний матч"
      className="flex flex-col justify-between gap-0.5 p-2 rounded-xl bg-[var(--surface-subtle)]/80 hover:bg-[var(--cell-hover)] border border-[var(--border-glass)] text-left transition cursor-pointer min-w-0"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="w-5 h-5 rounded-md bg-amber-500/14 border border-amber-500/30 flex items-center justify-center shrink-0">
          <Shield className="w-3 h-3 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="text-[9.5px] 2xl:text-[10px] font-extrabold text-[var(--text-secondary)] truncate">
          Фонд Оборони
        </div>
      </div>
      <div className="font-display font-extrabold text-xs 2xl:text-[13px] text-amber-600 dark:text-amber-300 tabular-nums whitespace-nowrap truncate mt-0.5">
        {formatMoney(gameState.zsuTotalDonated)}
      </div>
      <div className="text-[8.5px] 2xl:text-[9px] font-medium text-[var(--text-muted)] truncate">
        Донати за матч
      </div>
    </button>

    <button
      onClick={() => {
        sound.playClick();
        onSelectCell(20);
      }}
      title="Накопичений бонусний фонд: гравець забирає його, коли стає на клітинку «Карпатський Курорт»"
      className="flex flex-col justify-between gap-0.5 p-2 rounded-xl bg-[var(--surface-subtle)]/80 hover:bg-[var(--cell-hover)] border border-[var(--border-glass)] text-left transition cursor-pointer min-w-0"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="w-5 h-5 rounded-md bg-emerald-500/14 border border-emerald-500/30 flex items-center justify-center shrink-0">
          <TrendingUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="text-[9.5px] 2xl:text-[10px] font-extrabold text-[var(--text-secondary)] truncate">
          Банк «Карпати»
        </div>
      </div>
      <div className="font-display font-extrabold text-xs 2xl:text-[13px] text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap truncate mt-0.5">
        {gameState.settings.karpatyBonusEnabled
          ? formatMoney(gameState.karpatyFund)
          : 'Вимкнено'}
      </div>
      <div className="text-[8.5px] 2xl:text-[9px] font-medium text-[var(--text-muted)] truncate">
        Бонус у Карпатах
      </div>
    </button>
  </div>
);

export const CompanyInspectorContent: React.FC<{
  gameState: GameState;
  myPlayerId: string;
  selectedCellIndex: number;
  compactBanner?: boolean;
  ultraCompact?: boolean;
  onSelectCell?: (idx: number) => void;
  onBuildBranch: (cellIndex: number) => void;
  onSellBranch: (cellIndex: number) => void;
  onMortgage: (cellIndex: number) => void;
  onUnmortgage: (cellIndex: number) => void;
}> = ({
  gameState,
  myPlayerId,
  selectedCellIndex,
  compactBanner = false,
  ultraCompact = false,
  onSelectCell,
  onBuildBranch,
  onSellBranch,
  onMortgage,
  onUnmortgage,
}) => {
  const cell = BOARD_CELLS[selectedCellIndex] ?? BOARD_CELLS[0];
  const prop = gameState.properties[cell.index];
  const owner = prop?.ownerId
    ? gameState.players.find((p) => p.id === prop.ownerId)
    : null;
  const me = gameState.players.find((p) => p.id === myPlayerId);
  const activePlayer = gameState.players[gameState.turnIndex];
  const canManageNow =
    activePlayer?.id === myPlayerId &&
    (gameState.phase === 'PRE_ROLL' ||
      gameState.phase === 'BUY_DECISION' ||
      gameState.phase === 'POST_ROLL' ||
      gameState.phase === 'DEBT_RESOLUTION');

  const isOwnedByMe = prop?.ownerId === myPlayerId;
  const buildCheck =
    isOwnedByMe && me
      ? canBuildBranch(myPlayerId, cell.index, me.money, gameState.properties)
      : { ok: false };
  const sellCheck = isOwnedByMe
    ? canSellBranch(myPlayerId, cell.index, gameState.properties)
    : { ok: false };
  const mortgageCheck = isOwnedByMe
    ? canMortgageProperty(myPlayerId, cell.index, gameState.properties)
    : { ok: false };

  const currentRent = isPurchasableCell(cell)
    ? calculateRent(cell.index, gameState.properties, 7)
    : 0;

  const sectorCells = cell.sector ? getSectorCells(cell.sector) : [];
  const myOwnedInSector = sectorCells.filter(
    (c) => gameState.properties[c.index]?.ownerId === myPlayerId
  ).length;
  const ownerHasFullSector =
    owner && cell.sector && cell.type === 'company'
      ? hasFullSectorMonopoly(owner.id, cell.sector, gameState.properties, false)
      : false;

  const art = getCellVisualArtwork(cell);

  const managementControls = isOwnedByMe ? (
    <div className={ultraCompact ? 'space-y-1.5' : 'pt-1 space-y-1.5'}>
      {cell.type === 'company' && (
        <div className="grid grid-cols-2 gap-1.5">
          <button
            disabled={!canManageNow || !buildCheck.ok}
            title={buildCheck.reason || 'Побудувати нову філію'}
            onClick={() => onBuildBranch(cell.index)}
            className={`${
              ultraCompact ? 'py-1.5 px-1.5 text-[10px]' : 'py-2 px-2 text-[10.5px] 2xl:text-[11px]'
            } min-w-0 overflow-hidden rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-35 text-white font-extrabold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap`}
          >
            <Building2 className="w-3 h-3 shrink-0" />
            <span className="truncate">
              + Філія ({formatMoney(cell.branchCost ?? 0)})
            </span>
          </button>
          <button
            disabled={!canManageNow || !sellCheck.ok}
            title={sellCheck.reason || 'Продати філію за 50%'}
            onClick={() => onSellBranch(cell.index)}
            className={`${
              ultraCompact ? 'py-1.5 px-1.5 text-[10px]' : 'py-2 px-2 text-[10.5px] 2xl:text-[11px]'
            } min-w-0 overflow-hidden rounded-xl bg-amber-400 hover:bg-amber-500 disabled:opacity-35 text-slate-950 font-extrabold transition cursor-pointer whitespace-nowrap truncate`}
          >
            - Філія
          </button>
        </div>
      )}

      {!prop?.isMortgaged ? (
        <button
          disabled={!canManageNow || !mortgageCheck.ok}
          title={
            mortgageCheck.reason || 'Отримати 50% вартості під заставу'
          }
          onClick={() => onMortgage(cell.index)}
          className={`w-full ${
            ultraCompact ? 'py-1.5 text-[10px]' : 'py-2 text-[11px]'
          } rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-strong)] hover:border-blue-500 disabled:opacity-35 font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer`}
        >
          <Lock className="w-3 h-3 shrink-0" />
          У заставу (+{formatMoney(getMortgageValue(cell.index))})
        </button>
      ) : (
        <button
          disabled={
            !canManageNow || (me?.money ?? 0) < getUnmortgageCost(cell.index)
          }
          onClick={() => onUnmortgage(cell.index)}
          className={`w-full ${
            ultraCompact ? 'py-1.5 text-[10px]' : 'py-2 text-[11px]'
          } rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-35 text-white font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer`}
        >
          <Unlock className="w-3 h-3 shrink-0" />
          Викупити (-{formatMoney(getUnmortgageCost(cell.index))})
        </button>
      )}

      {!buildCheck.ok &&
        buildCheck.reason &&
        cell.type === 'company' &&
        !prop?.isMortgaged && (
          <p className="text-[9.5px] font-semibold text-[var(--text-muted)] text-center leading-tight">
            {buildCheck.reason}
          </p>
        )}
    </div>
  ) : null;

  return (
    <div className={ultraCompact ? 'space-y-1.5' : 'space-y-2.5'}>
      {ultraCompact ? (
        <div className="flex items-center justify-between gap-1.5 p-1.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-glass)]">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-[var(--border-strong)] shrink-0 bg-slate-950">
              <img
                src={art.imageSrc}
                alt={cell.name}
                style={{ objectPosition: art.objectPosition }}
                className={`w-full h-full object-cover ${getImageExposureClass(art.imageSrc)}`}
              />
              {cell.color && (
                <span
                  style={{ backgroundColor: cell.color }}
                  className="absolute bottom-0 inset-x-0 h-1.5"
                />
              )}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="flex items-center gap-1">
                <span className="font-display font-extrabold text-[11px] truncate">
                  {cell.name}
                </span>
                {prop && prop.branches > 0 && (
                  <span className="px-1 py-0.2 rounded bg-amber-400 text-slate-950 text-[8.5px] font-black shrink-0">
                    {prop.branches >= 5 ? '👑' : `★${prop.branches}`}
                  </span>
                )}
              </div>
              <div className="text-[9.5px] font-bold text-[var(--text-secondary)] truncate mt-0.5 tabular-nums">
                {cell.sectorName
                  ? `${cell.sectorName} • `
                  : ''}
                {cell.price
                  ? formatMoney(cell.price)
                  : cell.subtitle || 'Подія поля'}
              </div>
            </div>
          </div>

          {onSelectCell && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  onSelectCell((selectedCellIndex + 39) % 40);
                }}
                className="p-1 rounded-lg bg-[var(--surface-solid)] border border-[var(--border-strong)] cursor-pointer"
                title="Попередня клітинка"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  onSelectCell((selectedCellIndex + 1) % 40);
                }}
                className="p-1 rounded-lg bg-[var(--surface-solid)] border border-[var(--border-strong)] cursor-pointer"
                title="Наступна клітинка"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <CardVisualBanner
          cell={cell}
          heightClass={compactBanner ? 'h-28 2xl:h-36' : 'h-34 2xl:h-40'}
        />
      )}

      <div className="flex items-center justify-between text-[11px] pt-0.5 gap-2">
        <span className="text-[var(--text-muted)] font-bold whitespace-nowrap">
          {cell.price
            ? `Ціна: ${formatMoney(cell.price)}`
            : 'Спеціальна клітинка'}
        </span>
        {isPurchasableCell(cell) &&
          (owner ? (
            <span
              style={{ color: owner.color }}
              className="font-extrabold flex items-center gap-1 truncate"
            >
              ● {owner.id === myPlayerId ? 'ВИ' : owner.name}
              {areTeammates(gameState.settings.gameMode, me, owner)
                ? ' (🤝 0 ₴)'
                : ''}
              {prop?.isMortgaged
                ? ' (Застава)'
                : ownerHasFullSector
                  ? ' 👑'
                  : ''}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-extrabold text-[10px] whitespace-nowrap">
              Вільно
            </span>
          ))}
      </div>

      {/* Surface instant +Філія / Застава actions right at the top in mobile landscape! */}
      {ultraCompact && managementControls}

      {sectorCells.length > 0 && (
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] text-[10.5px]">
          <span className="font-bold text-[var(--text-secondary)]">
            Контроль сектору:
          </span>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1">
              {sectorCells.map((sc) => {
                const scOwnerId = gameState.properties[sc.index]?.ownerId;
                const scOwner = scOwnerId
                  ? gameState.players.find((pl) => pl.id === scOwnerId)
                  : null;
                return (
                  <span
                    key={sc.index}
                    title={`${sc.name}: ${scOwner ? scOwner.name : 'Вільно'}`}
                    style={{
                      backgroundColor: scOwner ? scOwner.color : undefined,
                    }}
                    className={`w-3.5 h-2 rounded-full ${
                      scOwner ? '' : 'bg-slate-400/30 dark:bg-white/15'
                    }`}
                  />
                );
              })}
            </div>
            <span className="font-extrabold tabular-nums">
              {myOwnedInSector}/{sectorCells.length}
            </span>
          </div>
        </div>
      )}

      {!ultraCompact && (
        <p className="text-[11px] font-medium text-[var(--text-secondary)] leading-relaxed">
          {cell.description}
        </p>
      )}

      {isPurchasableCell(cell) && (
        <div className="space-y-1.5 pt-1 border-t border-[var(--border-glass)]">
          {cell.type === 'company' && cell.rent && (
            <div
              className={`rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] ${
                ultraCompact ? 'p-1.5 text-[9.5px]' : 'p-2.5 space-y-0.5 text-[11px]'
              } tabular-nums`}
            >
              <div className={ultraCompact ? 'grid grid-cols-2 gap-1' : 'space-y-0.5'}>
                {[
                  {
                    label: ultraCompact ? 'Базова' : 'Базова оренда',
                    val: cell.rent[0],
                    lvl: 0,
                  },
                  {
                    label: ultraCompact ? '1 філія ★' : '1 Філія ★',
                    val: cell.rent[1],
                    lvl: 1,
                  },
                  {
                    label: ultraCompact ? '2 філії ★★' : '2 Філії ★★',
                    val: cell.rent[2],
                    lvl: 2,
                  },
                  {
                    label: ultraCompact ? '3 філії ★★★' : '3 Філії ★★★',
                    val: cell.rent[3],
                    lvl: 3,
                  },
                  {
                    label: ultraCompact ? '4 філії ★4' : '4 Філії ★★★★',
                    val: cell.rent[4],
                    lvl: 4,
                  },
                  {
                    label: ultraCompact ? '👑 Холдинг' : '👑 Головний Холдинг',
                    val: cell.rent[5],
                    lvl: 5,
                  },
                ].map((row) => {
                  const active =
                    (prop?.branches ?? -1) === row.lvl && Boolean(owner);
                  return (
                    <div
                      key={row.lvl}
                      className={`flex items-center justify-between gap-1 px-1.5 py-0.5 rounded ${
                        active
                          ? 'bg-blue-600 text-white font-extrabold'
                          : 'font-semibold'
                      }`}
                    >
                      <span className="truncate">{row.label}</span>
                      <span className="whitespace-nowrap font-bold">
                        {row.lvl === 0 && owner && currentRent === row.val * 2
                          ? ultraCompact
                            ? `${formatCompactSlotPrice(row.val * 2)}×2`
                            : `${formatMoney(row.val * 2)} (×2)`
                          : ultraCompact
                            ? `${formatCompactSlotPrice(row.val)} ₴`
                            : formatMoney(row.val)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between pt-1 mt-1 border-t border-[var(--border-glass)] text-[9.5px] font-bold text-[var(--text-muted)]">
                <span>Філія: {formatMoney(cell.branchCost ?? 0)}</span>
                <span>Застава: {formatMoney(getMortgageValue(cell.index))}</span>
              </div>
            </div>
          )}

          {cell.type === 'transport' && cell.rent && (
            <div className="rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] p-2.5 space-y-0.5 text-[11px] tabular-nums">
              {(() => {
                const ownerActiveTransports =
                  owner && !prop?.isMortgaged
                    ? BOARD_CELLS.filter(
                        (c) =>
                          c.type === 'transport' &&
                          gameState.properties[c.index]?.ownerId === owner.id &&
                          !gameState.properties[c.index]?.isMortgaged
                      ).length
                    : 0;
                const labels = [
                  '1 транспортний хаб',
                  '2 транспортні хаби',
                  '3 транспортні хаби',
                  '4 транспортні хаби',
                ];
                return cell.rent.map((r, i) => {
                  const active = ownerActiveTransports === i + 1;
                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between px-1.5 py-0.5 rounded ${
                        active
                          ? 'bg-blue-600 text-white font-extrabold'
                          : 'font-semibold'
                      }`}
                    >
                      <span>{labels[i] ?? `${i + 1} транспортні хаби`}</span>
                      <span className="font-extrabold whitespace-nowrap">
                        {formatMoney(r)}
                      </span>
                    </div>
                  );
                });
              })()}
              <div className="flex items-center justify-end pt-1 mt-1 border-t border-[var(--border-glass)] text-[10px] font-bold text-[var(--text-muted)]">
                <span>Застава: {formatMoney(getMortgageValue(cell.index))}</span>
              </div>
            </div>
          )}

          {cell.type === 'utility' && (
            <div className="rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] p-2.5 space-y-0.5 text-[11px]">
              {(() => {
                const ownerActiveUtilities =
                  owner && !prop?.isMortgaged
                    ? BOARD_CELLS.filter(
                        (c) =>
                          c.type === 'utility' &&
                          gameState.properties[c.index]?.ownerId === owner.id &&
                          !gameState.properties[c.index]?.isMortgaged
                      ).length
                    : 0;
                return (
                  <>
                    <div
                      className={`flex justify-between gap-2 px-1.5 py-0.5 rounded ${
                        ownerActiveUtilities === 1
                          ? 'bg-blue-600 text-white font-extrabold'
                          : 'font-semibold'
                      }`}
                    >
                      <span>1 об’єкт інфраструктури</span>
                      <span className="font-extrabold whitespace-nowrap">
                        ×40 від суми кубиків
                      </span>
                    </div>
                    <div
                      className={`flex justify-between gap-2 px-1.5 py-0.5 rounded ${
                        ownerActiveUtilities >= 2
                          ? 'bg-blue-600 text-white font-extrabold'
                          : 'font-semibold'
                      }`}
                    >
                      <span>Хмара + Енерго Мережа</span>
                      <span className="font-extrabold whitespace-nowrap">
                        ×100 від суми кубиків
                      </span>
                    </div>
                  </>
                );
              })()}
              <div className="flex items-center justify-end pt-1 mt-1 border-t border-[var(--border-glass)] text-[10px] font-bold text-[var(--text-muted)] tabular-nums">
                <span>Застава: {formatMoney(getMortgageValue(cell.index))}</span>
              </div>
            </div>
          )}

          {!ultraCompact && managementControls}
        </div>
      )}
    </div>
  );
};

export const ChatFeedContent: React.FC<{
  gameState: GameState;
  onSendChat: (text: string, isQuick?: boolean) => void;
}> = ({ gameState, onSendChat }) => {
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gameState.chat.length]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 text-xs">
        {gameState.chat.length === 0 ? (
          <div className="h-full min-h-[110px] flex flex-col items-center justify-center text-center p-3 rounded-xl bg-[var(--surface-subtle)]/70 border border-dashed border-[var(--border-glass)] gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-500 dark:text-amber-300">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <div className="font-extrabold text-xs">
                Стіл переговорів відкрито! 🇺🇦
              </div>
              <p className="text-[11px] text-[var(--text-muted)] font-medium max-w-[230px]">
                Привітайте суперників, обговоріть Смарт-Угоди або надішліть
                швидку реакцію в 1 клік:
              </p>
            </div>
          </div>
        ) : (
          gameState.chat.map((msg) => (
            <div
              key={msg.id}
              className="px-2.5 py-2 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] break-words"
            >
              <span
                style={{ color: msg.playerColor }}
                className="font-extrabold"
              >
                {msg.playerName}:{' '}
              </span>
              <span className="font-medium">{msg.text}</span>
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="pt-2 mt-1 border-t border-[var(--border-glass)] shrink-0 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_REACTIONS.slice(0, 4).map((reaction) => (
            <button
              key={reaction}
              onClick={() => onSendChat(reaction, true)}
              className="px-2 py-1 rounded-lg bg-blue-600/15 hover:bg-blue-600 hover:text-white text-[10px] font-extrabold whitespace-nowrap transition cursor-pointer"
            >
              {reaction}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!chatInput.trim()) return;
            onSendChat(chatInput);
            setChatInput('');
          }}
          className="flex gap-1.5"
        >
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Написати в чат столу..."
            className="flex-1 min-w-0 px-3 py-2 rounded-xl premium-input text-xs font-semibold outline-none"
          />
          <button
            type="submit"
            className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition cursor-pointer shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// DESKTOP LEFT SIDEBAR (xl+ : 276px on compact laptops, 356px on 2xl+)
// ============================================================================

interface LeftPanelProps {
  gameState: GameState;
  myPlayerId: string;
  selectedCellIndex: number;
  hoveredSector?: SectorId | null;
  soundEnabled: boolean;
  darkMode: boolean;
  shareOrigin?: string;
  recentReactions: Record<string, ChatMessage>;
  onToggleSound: () => void;
  onToggleDarkMode: () => void;
  onOpenRules: () => void;
  onSelectCell: (idx: number) => void;
  onHoverSector?: (sector: SectorId | null) => void;
  onOpenTradeWith: (targetPlayerId: string) => void;
  onLeaveGame: () => void;
}

export const LeftPlayersPanel: React.FC<LeftPanelProps> = ({
  gameState,
  myPlayerId,
  selectedCellIndex,
  hoveredSector = null,
  soundEnabled,
  darkMode,
  shareOrigin,
  recentReactions,
  onToggleSound,
  onToggleDarkMode,
  onOpenRules,
  onSelectCell,
  onHoverSector,
  onOpenTradeWith,
  onLeaveGame,
}) => {
  const [copied, setCopied] = useState(false);
  const [leftTab, setLeftTab] = useState<'players' | 'sectors'>('players');
  const vh = useViewportHeight();

  // On laptop screens shorter than 880px, use a crisp segmented toggle so Players & Sectors NEVER crush each other!
  const isCompactHeight = vh < 880;

  const copyRoomLink = () => {
    const base = shareOrigin || window.location.origin;
    const url = `${base}${window.location.pathname}?room=${gameState.roomCode}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).catch(() => {});
    } else {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <aside className="hidden lg:flex lg:w-[252px] xl:w-[276px] 2xl:w-[356px] lg:h-full shrink-0 flex-col gap-2 overflow-hidden">
      {/* Compact Header Card */}
      <div className="glass-panel rounded-2xl p-2 2xl:p-3 flex items-center justify-between gap-1.5 shrink-0">
        <div className="flex items-center gap-2 2xl:gap-2.5 min-w-0 overflow-hidden">
          <MagnatBrandIcon size="sm" />
          <div className="min-w-0 overflow-hidden">
            <MagnatWordmark
              size="sm"
              ingotClassName="hidden 2xl:inline-flex"
            />
            <button
              onClick={copyRoomLink}
              title="Скопіювати посилання на кімнату"
              className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-extrabold text-blue-600 dark:text-sky-400 hover:underline cursor-pointer whitespace-nowrap"
            >
              <span>
                {gameState.settings.gameMode === 'team2v2' ? '2×2 • ' : 'Стіл '}
                {gameState.roomCode}
              </span>
              {copied ? (
                <Check className="w-3 h-3 text-emerald-500" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onOpenRules}
            title="Правила гри"
            className="p-1.5 2xl:p-2 rounded-xl hover:bg-slate-500/15 transition cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleSound}
            title={soundEnabled ? 'Вимкнути звук' : 'Увімкнути звук'}
            className="p-1.5 2xl:p-2 rounded-xl hover:bg-slate-500/15 transition cursor-pointer"
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4 opacity-50" />
            )}
          </button>
          <button
            onClick={onToggleDarkMode}
            title="Перемкнути тему Obsidian / Аврора"
            className="p-1.5 2xl:p-2 rounded-xl hover:bg-slate-500/15 transition cursor-pointer"
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={onLeaveGame}
            title="Вийти в головне меню"
            className="p-1.5 2xl:p-2 rounded-xl hover:bg-rose-500/15 text-rose-500 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isCompactHeight ? (
        /* COMPACT LAPTOP HEIGHT (<880px): Crisp 2-Tab Switcher so neither Players nor Sectors ever squash! */
        <>
          <div className="glass-panel rounded-xl p-1 grid grid-cols-2 gap-1 shrink-0">
            <button
              onClick={() => setLeftTab('players')}
              className={`py-1.5 rounded-lg text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                leftTab === 'players'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:bg-slate-500/10'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Магнати ({gameState.players.length})
            </button>
            <button
              onClick={() => setLeftTab('sectors')}
              className={`py-1.5 rounded-lg text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                leftTab === 'sectors'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:bg-slate-500/10'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Сектори (10)
            </button>
          </div>

          {leftTab === 'players' ? (
            <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
              <PlayersCardsList
                gameState={gameState}
                myPlayerId={myPlayerId}
                selectedCellIndex={selectedCellIndex}
                hoveredSector={hoveredSector}
                recentReactions={recentReactions}
                compact
                onSelectCell={onSelectCell}
                onHoverSector={onHoverSector}
                onOpenTradeWith={onOpenTradeWith}
              />
            </div>
          ) : (
            <div className="flex-1 min-h-0 glass-panel rounded-2xl p-2.5 flex flex-col overflow-hidden">
              <SectorsControlGrid
                gameState={gameState}
                myPlayerId={myPlayerId}
                selectedCellIndex={selectedCellIndex}
                hoveredSector={hoveredSector}
                onSelectCell={onSelectCell}
                onHoverSector={onHoverSector}
              />
            </div>
          )}
        </>
      ) : (
        /* TALL DESKTOP (>=880px): Both Players & All 10 Illustrated Sectors Visible Simultaneously! */
        <>
          <div className="overflow-y-auto pr-0.5 shrink-0 max-h-[42vh]">
            <PlayersCardsList
              gameState={gameState}
              myPlayerId={myPlayerId}
              selectedCellIndex={selectedCellIndex}
              hoveredSector={hoveredSector}
              recentReactions={recentReactions}
              onSelectCell={onSelectCell}
              onHoverSector={onHoverSector}
              onOpenTradeWith={onOpenTradeWith}
            />
          </div>

          <div className="flex-1 min-h-0 glass-panel rounded-2xl p-2.5 2xl:p-3 flex flex-col overflow-hidden">
            <SectorsControlGrid
              gameState={gameState}
              myPlayerId={myPlayerId}
              selectedCellIndex={selectedCellIndex}
              hoveredSector={hoveredSector}
              onSelectCell={onSelectCell}
              onHoverSector={onHoverSector}
            />
          </div>
        </>
      )}

      <NationalFundsWidget gameState={gameState} onSelectCell={onSelectCell} />
    </aside>
  );
};

// ============================================================================
// DESKTOP RIGHT SIDEBAR (xl+ : 292px on compact laptops, 380px on 2xl+)
// ============================================================================

interface RightPanelProps {
  gameState: GameState;
  myPlayerId: string;
  selectedCellIndex: number;
  onBuildBranch: (cellIndex: number) => void;
  onSellBranch: (cellIndex: number) => void;
  onMortgage: (cellIndex: number) => void;
  onUnmortgage: (cellIndex: number) => void;
  onSendChat: (text: string, isQuick?: boolean) => void;
}

export const RightInspectorAndChat: React.FC<RightPanelProps> = ({
  gameState,
  myPlayerId,
  selectedCellIndex,
  onBuildBranch,
  onSellBranch,
  onMortgage,
  onUnmortgage,
  onSendChat,
}) => {
  const hasHumanOpponents = gameState.players.some(
    (p) => !p.isBot && p.id !== myPlayerId
  );
  const [bottomTab, setBottomTab] = useState<'chat' | 'logs'>(() =>
    hasHumanOpponents ? 'chat' : 'logs'
  );
  const [compactTab, setCompactTab] = useState<'inspector' | 'chat' | 'logs'>(
    'inspector'
  );
  const [seenChatCount, setSeenChatCount] = useState(gameState.chat.length);
  const prevSelectedCellRef = useRef<number>(selectedCellIndex);
  const lastRoomCodeRef = useRef<string>(gameState.roomCode);
  const vh = useViewportHeight();

  // On laptop viewports shorter than 860px, switch to 3-tab full-height card so Chat input is NEVER clipped off-screen!
  const isCompactHeight = vh < 860;

  useEffect(() => {
    if (lastRoomCodeRef.current !== gameState.roomCode) {
      lastRoomCodeRef.current = gameState.roomCode;
      setBottomTab(hasHumanOpponents ? 'chat' : 'logs');
      setSeenChatCount(gameState.chat.length);
    }
  }, [gameState.roomCode, hasHumanOpponents, gameState.chat.length]);

  useEffect(() => {
    if (prevSelectedCellRef.current !== selectedCellIndex) {
      prevSelectedCellRef.current = selectedCellIndex;
      setCompactTab('inspector');
    }
  }, [selectedCellIndex]);

  const isChatOpenNow = isCompactHeight
    ? compactTab === 'chat'
    : bottomTab === 'chat';

  useEffect(() => {
    if (isChatOpenNow) {
      setSeenChatCount(gameState.chat.length);
    }
  }, [gameState.chat.length, isChatOpenNow]);

  const unreadChat = Math.max(0, gameState.chat.length - seenChatCount);

  return (
    <aside className="hidden lg:flex lg:w-[264px] xl:w-[292px] 2xl:w-[380px] lg:h-full shrink-0 flex-col gap-2 overflow-hidden">
      {isCompactHeight ? (
        /* COMPACT LAPTOP HEIGHT (<860px): 3-Tab Unified Full-Height Card (Zero Off-Screen Clipping!) */
        <div className="flex-1 min-h-0 glass-panel rounded-2xl p-2.5 flex flex-col overflow-hidden">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] mb-2.5 shrink-0">
            <button
              onClick={() => setCompactTab('inspector')}
              className={`py-1.5 rounded-lg text-[10.5px] xl:text-[11px] font-extrabold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap ${
                compactTab === 'inspector'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span>Актив</span>
            </button>
            <button
              onClick={() => {
                setCompactTab('chat');
                setSeenChatCount(gameState.chat.length);
              }}
              className={`relative py-1.5 rounded-lg text-[10.5px] xl:text-[11px] font-extrabold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap ${
                compactTab === 'chat'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              <span>Чат ({gameState.chat.length})</span>
              {unreadChat > 0 && compactTab !== 'chat' && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setCompactTab('logs')}
              className={`py-1.5 rounded-lg text-[10.5px] xl:text-[11px] font-extrabold flex items-center justify-center gap-1 transition cursor-pointer whitespace-nowrap ${
                compactTab === 'logs'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <ScrollText className="w-3.5 h-3.5 shrink-0" />
              <span>Хід гри ({gameState.logs.length})</span>
            </button>
          </div>

          {compactTab === 'inspector' && (
            <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
              <CompanyInspectorContent
                gameState={gameState}
                myPlayerId={myPlayerId}
                selectedCellIndex={selectedCellIndex}
                compactBanner
                onBuildBranch={onBuildBranch}
                onSellBranch={onSellBranch}
                onMortgage={onMortgage}
                onUnmortgage={onUnmortgage}
              />
            </div>
          )}

          {compactTab === 'chat' && (
            <ChatFeedContent gameState={gameState} onSendChat={onSendChat} />
          )}

          {compactTab === 'logs' && (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 text-[11px]">
              {gameState.logs.map((entry) => (
                <div
                  key={entry.id}
                  className="px-2.5 py-1.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] leading-snug font-semibold"
                >
                  {entry.text}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* TALL DESKTOP (>=860px): Split View — Inspector on Top + Full Live Chat Below! */
        <>
          <div className="glass-panel rounded-2xl p-3.5 max-h-[55%] overflow-y-auto shrink-0">
            <CompanyInspectorContent
              gameState={gameState}
              myPlayerId={myPlayerId}
              selectedCellIndex={selectedCellIndex}
              onBuildBranch={onBuildBranch}
              onSellBranch={onSellBranch}
              onMortgage={onMortgage}
              onUnmortgage={onUnmortgage}
            />
          </div>

          <div className="flex-1 min-h-[230px] glass-panel rounded-2xl p-3.5 flex flex-col overflow-hidden">
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] mb-2.5 shrink-0">
              <button
                onClick={() => {
                  setBottomTab('chat');
                  setSeenChatCount(gameState.chat.length);
                }}
                className={`relative py-1.5 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  bottomTab === 'chat'
                    ? 'bg-[var(--surface-solid)] shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Чат ({gameState.chat.length})</span>
                {unreadChat > 0 && bottomTab !== 'chat' && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                )}
              </button>
              <button
                onClick={() => setBottomTab('logs')}
                className={`py-1.5 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  bottomTab === 'logs'
                    ? 'bg-[var(--surface-solid)] shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <ScrollText className="w-3.5 h-3.5" />
                <span>Хід гри ({gameState.logs.length})</span>
              </button>
            </div>

            {bottomTab === 'chat' ? (
              <ChatFeedContent gameState={gameState} onSendChat={onSendChat} />
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 text-[11px]">
                {gameState.logs.map((entry) => (
                  <div
                    key={entry.id}
                    className="px-2.5 py-1.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] leading-snug font-semibold"
                  >
                    {entry.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
};

// ============================================================================
// MOBILE & TABLET NATIVE APP SHELL COMPONENTS (< 1280px, 360px..1279px)
// ============================================================================

export type MobileMatchTab = 'board' | 'inspector' | 'players' | 'chat';

export const MobileMatchHeader: React.FC<{
  gameState: GameState;
  soundEnabled: boolean;
  darkMode: boolean;
  shareOrigin?: string;
  onToggleSound: () => void;
  onToggleDarkMode: () => void;
  onOpenRules: () => void;
  onOpenTradeModal: () => void;
  onLeaveGame: () => void;
  canTradeNow: boolean;
  onSwitchToLandscape?: () => void;
}> = ({
  gameState,
  soundEnabled,
  darkMode,
  shareOrigin,
  onToggleSound,
  onToggleDarkMode,
  onOpenRules,
  onOpenTradeModal,
  onLeaveGame,
  canTradeNow,
  onSwitchToLandscape,
}) => {
  const [copied, setCopied] = useState(false);

  const copyRoomLink = () => {
    const base = shareOrigin || window.location.origin;
    const url = `${base}${window.location.pathname}?room=${gameState.roomCode}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).catch(() => {});
    } else {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="glass-panel rounded-xl sm:rounded-2xl px-2 sm:px-3.5 py-1.5 flex items-center justify-between gap-1.5 shrink-0 overflow-hidden">
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 overflow-hidden">
        <MagnatBrandIcon size="xs" />
        <div className="min-w-0 flex-1 overflow-hidden flex items-center gap-1.5 flex-nowrap">
          <div className="hidden sm:flex items-center shrink-0">
            <MagnatWordmark size="xs" />
          </div>
          <button
            onClick={copyRoomLink}
            title="Скопіювати посилання на стіл"
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-blue-600/15 text-blue-700 dark:text-sky-300 text-[10px] font-black cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>{gameState.roomCode}</span>
            {copied ? (
              <Check className="w-2.5 h-2.5 text-emerald-500" />
            ) : (
              <Copy className="w-2.5 h-2.5" />
            )}
          </button>
          <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400 whitespace-nowrap tabular-nums">
            🛡 {formatMoney(gameState.zsuTotalDonated)}
          </span>
          {gameState.settings.karpatyBonusEnabled && (
            <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 whitespace-nowrap tabular-nums hidden sm:inline">
              🏔 {formatMoney(gameState.karpatyFund)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        {canTradeNow && (
          <button
            onClick={onOpenTradeModal}
            title="Смарт-Угода"
            className="hidden sm:flex px-2 py-1 rounded-xl bg-amber-400/20 text-amber-600 dark:text-amber-300 border border-amber-400/35 text-[10px] font-extrabold items-center gap-1 cursor-pointer"
          >
            <Handshake className="w-3.5 h-3.5" />
            <span>Угода</span>
          </button>
        )}
        {onSwitchToLandscape && (
          <button
            onClick={onSwitchToLandscape}
            title="Повернути інтерфейс горизонтально (альбомний режим)"
            className="px-2 py-1 rounded-xl bg-blue-600/16 hover:bg-blue-600 hover:text-white text-blue-600 dark:text-sky-300 border border-blue-500/30 text-[10px] font-extrabold flex items-center gap-1 cursor-pointer transition"
          >
            <Smartphone className="w-3.5 h-3.5 rotate-90 shrink-0" />
            <span>Альбом</span>
          </button>
        )}
        <button
          onClick={onOpenRules}
          title="Правила гри"
          className="p-1.5 rounded-xl hover:bg-slate-500/15 transition cursor-pointer"
        >
          <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
        <button
          onClick={onToggleSound}
          title={soundEnabled ? 'Вимкнути звук' : 'Увімкнути звук'}
          className="p-1.5 rounded-xl hover:bg-slate-500/15 transition cursor-pointer"
        >
          {soundEnabled ? (
            <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          ) : (
            <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-50" />
          )}
        </button>
        <button
          onClick={onToggleDarkMode}
          title="Перемкнути тему"
          className="p-1.5 rounded-xl hover:bg-slate-500/15 transition cursor-pointer"
        >
          {darkMode ? (
            <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
          ) : (
            <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          )}
        </button>
        <button
          onClick={onLeaveGame}
          title="Вийти в головне меню"
          className="p-1.5 rounded-xl hover:bg-rose-500/15 text-rose-500 transition cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>
    </header>
  );
};

export const MobilePlayerStrip: React.FC<{
  gameState: GameState;
  myPlayerId: string;
  canTradeNow?: boolean;
  recentReactions: Record<string, ChatMessage>;
  onSelectPlayerCell: (pos: number) => void;
  onSwitchToPlayersTab: () => void;
  onOpenTradeWith?: (targetPlayerId: string) => void;
}> = ({
  gameState,
  myPlayerId,
  canTradeNow = false,
  recentReactions,
  onSelectPlayerCell,
  onSwitchToPlayersTab,
  onOpenTradeWith,
}) => {
  const { rankByPlayer } = usePlayerRankings(gameState);
  const mePlayer = gameState.players.find((pl) => pl.id === myPlayerId);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 shrink-0">
      {gameState.players.map((p, idx) => {
        const isTurn =
          idx === gameState.turnIndex && gameState.status === 'playing';
        const isMe = p.id === myPlayerId;
        const isAlly = areTeammates(
          gameState.settings.gameMode,
          mePlayer,
          p
        );
        const rank = rankByPlayer[p.id] ?? idx + 1;
        const bubble = recentReactions[p.id];
        const ownedCells = BOARD_CELLS.filter(
          (c) => gameState.properties[c.index]?.ownerId === p.id
        );

        return (
          <div
            key={p.id}
            onClick={() => {
              sound.playClick();
              onSelectPlayerCell(p.position);
            }}
            onDoubleClick={onSwitchToPlayersTab}
            style={{
              borderColor: isTurn ? p.color : undefined,
              boxShadow: isTurn ? `0 4px 14px -5px ${p.color}88` : undefined,
            }}
            className={`relative flex items-center justify-between gap-1.5 pl-2.5 pr-1.5 py-1 rounded-xl min-w-0 overflow-hidden text-left transition cursor-pointer ${
              p.isBankrupt
                ? 'opacity-40 grayscale glass-panel'
                : isTurn
                  ? 'glass-panel border-2'
                  : 'glass-panel'
            }`}
          >
            {!p.isBankrupt && (
              <span
                style={{ backgroundColor: p.color }}
                className="pointer-events-none absolute left-0 top-1.5 bottom-1.5 w-[3.5px] rounded-r-full opacity-95"
              />
            )}
            {bubble && (
              <span className="absolute -top-1.5 right-1 z-20 px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[8px] font-black shadow max-w-[100px] truncate">
                {bubble.text}
              </span>
            )}

            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <div className="relative shrink-0">
                <TokenAvatar token={p.token} color={p.color} size={22} />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full text-[7px] font-black flex items-center justify-center ${
                    rank === 1
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-slate-200 text-slate-800 dark:bg-slate-900 dark:text-white'
                  }`}
                >
                  {rank}
                </span>
              </div>

              <div className="min-w-0 flex-1 leading-tight">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-[10.5px] font-extrabold truncate">
                    {getShortPlayerLabel(p)}
                  </span>
                  {isMe && (
                    <span className="px-1 rounded bg-blue-600 text-white text-[7px] font-black shrink-0">
                      ВИ
                    </span>
                  )}
                  {!isMe && isAlly && (
                    <span
                      title="Ваш напарник"
                      className="px-1 rounded bg-sky-500/20 text-sky-600 dark:text-sky-300 border border-sky-400/40 text-[7px] font-black shrink-0"
                    >
                      🤝
                    </span>
                  )}
                  {isTurn && (
                    <span className="px-1 rounded bg-amber-400/25 text-amber-600 dark:text-amber-300 text-[7px] font-black shrink-0">
                      ХІД
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-1 mt-0.5">
                  <span className="text-[10px] font-black text-emerald-600 dark:text-amber-300 tabular-nums whitespace-nowrap">
                    {p.isBankrupt ? 'Банкрут' : formatMoney(p.money)}
                  </span>
                  {!p.isBankrupt && ownedCells.length > 0 && (
                    <div className="flex items-center gap-0.5 overflow-hidden shrink-0">
                      {ownedCells.slice(0, 4).map((c) => (
                        <span
                          key={c.index}
                          style={{ backgroundColor: c.color ?? '#94A3B8' }}
                          className="w-1.5 h-1.5 rounded-full shrink-0 ring-[0.5px] ring-black/30"
                        />
                      ))}
                      {ownedCells.length > 4 && (
                        <span className="text-[8px] font-extrabold text-[var(--text-muted)] tabular-nums">
                          +{ownedCells.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {canTradeNow && !isMe && !p.isBankrupt && onOpenTradeWith && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  sound.playClick();
                  onOpenTradeWith(p.id);
                }}
                title={`Смарт-Угода з ${p.name}`}
                className="p-1.5 rounded-lg bg-amber-400/20 hover:bg-amber-400 hover:text-slate-950 text-amber-600 dark:text-amber-300 transition cursor-pointer shrink-0"
              >
                <Handshake className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const MobileSelectedCellBar: React.FC<{
  gameState: GameState;
  myPlayerId: string;
  selectedCellIndex: number;
  onSelectCell?: (idx: number) => void;
  onOpenFullInspector: () => void;
  onBuildBranch: (cellIndex: number) => void;
  onSellBranch?: (cellIndex: number) => void;
  onMortgage?: (cellIndex: number) => void;
  onUnmortgage?: (cellIndex: number) => void;
}> = ({
  gameState,
  myPlayerId,
  selectedCellIndex,
  onSelectCell,
  onOpenFullInspector,
  onBuildBranch,
  onSellBranch,
  onMortgage,
  onUnmortgage,
}) => {
  const cell = BOARD_CELLS[selectedCellIndex] ?? BOARD_CELLS[0];
  const prop = gameState.properties[cell.index];
  const owner = prop?.ownerId
    ? gameState.players.find((p) => p.id === prop.ownerId)
    : null;
  const me = gameState.players.find((p) => p.id === myPlayerId);
  const activePlayer = gameState.players[gameState.turnIndex];
  const isOwnedByMe = prop?.ownerId === myPlayerId;
  const canManageNow =
    activePlayer?.id === myPlayerId &&
    (gameState.phase === 'PRE_ROLL' ||
      gameState.phase === 'BUY_DECISION' ||
      gameState.phase === 'POST_ROLL' ||
      gameState.phase === 'DEBT_RESOLUTION');

  const buildCheck =
    isOwnedByMe && me && cell.type === 'company'
      ? canBuildBranch(myPlayerId, cell.index, me.money, gameState.properties)
      : { ok: false };
  const sellCheck =
    isOwnedByMe && cell.type === 'company'
      ? canSellBranch(myPlayerId, cell.index, gameState.properties)
      : { ok: false };
  const mortgageCheck = isOwnedByMe
    ? canMortgageProperty(myPlayerId, cell.index, gameState.properties)
    : { ok: false };

  const currentRent = isPurchasableCell(cell)
    ? calculateRent(cell.index, gameState.properties, 7)
    : 0;

  const art = getCellVisualArtwork(cell);

  return (
    <div className="glass-panel rounded-xl sm:rounded-2xl px-2 py-1.5 flex flex-col gap-1.5 shrink-0">
      <div className="flex items-center justify-between gap-1.5">
        {onSelectCell && (
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              onSelectCell((selectedCellIndex + 39) % 40);
            }}
            className="p-1.5 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border-strong)] cursor-pointer shrink-0"
            title="Попередня клітинка"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        )}

        <div
          onClick={onOpenFullInspector}
          className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
        >
          <div className="relative w-9 h-9 rounded-lg overflow-hidden border border-[var(--border-strong)] shrink-0 bg-slate-950">
            <img
              src={art.imageSrc}
              alt={cell.name}
              style={{ objectPosition: art.objectPosition }}
              className={`w-full h-full object-cover ${getImageExposureClass(art.imageSrc)}`}
            />
            {cell.color && (
              <span
                style={{ backgroundColor: cell.color }}
                className="absolute bottom-0 inset-x-0 h-1.5"
              />
            )}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-display font-extrabold text-[11.5px] truncate">
                {cell.name}
              </span>
              {prop && prop.branches > 0 && (
                <span className="px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 text-[8.5px] font-black shrink-0">
                  {prop.branches >= 5 ? '👑 Холдинг' : `★${prop.branches}`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--text-secondary)] tabular-nums mt-0.5 truncate">
              {cell.price ? (
                <span className="whitespace-nowrap">
                  {formatMoney(cell.price)}
                </span>
              ) : (
                <span className="truncate">{cell.subtitle || 'Подія поля'}</span>
              )}
              {isPurchasableCell(cell) && (
                <>
                  <span>•</span>
                  {owner ? (
                    <span
                      style={{ color: owner.color }}
                      className="font-extrabold truncate"
                    >
                      ● {owner.id === myPlayerId ? 'ВИ' : owner.name}
                      {prop?.isMortgaged
                        ? ' (Застава)'
                        : currentRent > 0
                          ? ` • Ор. ${formatMoney(currentRent)}`
                          : ''}
                    </span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400 font-extrabold whitespace-nowrap">
                      Вільно
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onSelectCell && (
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                onSelectCell((selectedCellIndex + 1) % 40);
              }}
              className="p-1.5 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border-strong)] cursor-pointer shrink-0"
              title="Наступна клітинка"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onOpenFullInspector}
            className="px-2.5 py-1.5 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border-strong)] text-[10.5px] font-extrabold hover:border-blue-500 transition cursor-pointer whitespace-nowrap"
          >
            Деталі →
          </button>
        </div>
      </div>

      {/* Instant Property Management OR Compact Live Rent Strip right below the board! */}
      {isOwnedByMe && canManageNow ? (
        <div className="flex items-center gap-1.5 pt-0.5 border-t border-[var(--border-glass)]">
          {cell.type === 'company' && (
            <>
              <button
                type="button"
                disabled={!buildCheck.ok}
                onClick={() => onBuildBranch(cell.index)}
                className="flex-1 py-1.5 px-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-35 text-white text-[10px] font-extrabold flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Building2 className="w-3 h-3 shrink-0" />
                <span>+ Філія ({formatCompactSlotPrice(cell.branchCost)} ₴)</span>
              </button>
              {prop && prop.branches > 0 && onSellBranch && (
                <button
                  type="button"
                  disabled={!sellCheck.ok}
                  onClick={() => onSellBranch(cell.index)}
                  className="py-1.5 px-2 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-35 text-slate-950 text-[10px] font-extrabold cursor-pointer whitespace-nowrap"
                >
                  - Філія
                </button>
              )}
            </>
          )}
          {!prop?.isMortgaged
            ? onMortgage && (
                <button
                  type="button"
                  disabled={!mortgageCheck.ok}
                  onClick={() => onMortgage(cell.index)}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border-strong)] disabled:opacity-35 text-[10px] font-extrabold flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Lock className="w-3 h-3 shrink-0" />
                  <span>Застава (+{formatCompactSlotPrice(getMortgageValue(cell.index))} ₴)</span>
                </button>
              )
            : onUnmortgage && (
                <button
                  type="button"
                  disabled={(me?.money ?? 0) < getUnmortgageCost(cell.index)}
                  onClick={() => onUnmortgage(cell.index)}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-35 text-white text-[10px] font-extrabold flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Unlock className="w-3 h-3 shrink-0" />
                  <span>Викуп (-{formatCompactSlotPrice(getUnmortgageCost(cell.index))} ₴)</span>
                </button>
              )}
        </div>
      ) : (
        cell.type === 'company' &&
        cell.rent && (
          <div className="grid grid-cols-5 gap-1 pt-0.5 border-t border-[var(--border-glass)] text-[9px] tabular-nums">
            {[
              { lbl: 'Баз', val: cell.rent[0], lvl: 0 },
              { lbl: '★1', val: cell.rent[1], lvl: 1 },
              { lbl: '★2', val: cell.rent[2], lvl: 2 },
              { lbl: '★3', val: cell.rent[3], lvl: 3 },
              { lbl: '👑', val: cell.rent[5], lvl: 5 },
            ].map((tier) => {
              const isActive =
                Boolean(owner) && (prop?.branches ?? 0) === tier.lvl;
              return (
                <div
                  key={tier.lvl}
                  className={`px-1 py-0.5 rounded flex items-center justify-between gap-0.5 ${
                    isActive
                      ? 'bg-blue-600 text-white font-black'
                      : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] font-bold'
                  }`}
                >
                  <span>{tier.lbl}</span>
                  <span className="font-extrabold text-[var(--text-primary)]">
                    {formatCompactSlotPrice(tier.val)}
                  </span>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
};

export const MobileInspectorNavHeader: React.FC<{
  selectedCellIndex: number;
  onSelectCell: (idx: number) => void;
  onBackToBoard: () => void;
}> = ({ selectedCellIndex, onSelectCell, onBackToBoard }) => {
  const prevIdx = (selectedCellIndex + 39) % 40;
  const nextIdx = (selectedCellIndex + 1) % 40;

  return (
    <div className="flex items-center justify-between gap-2 pb-1">
      <button
        onClick={onBackToBoard}
        className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer shadow-xs"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        До поля
      </button>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => {
            sound.playClick();
            onSelectCell(prevIdx);
          }}
          className="p-1.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-strong)] cursor-pointer"
          title="Попередня клітинка"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-[11px] font-extrabold text-[var(--text-secondary)] tabular-nums px-1">
          #{selectedCellIndex + 1} / 40
        </span>
        <button
          onClick={() => {
            sound.playClick();
            onSelectCell(nextIdx);
          }}
          className="p-1.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-strong)] cursor-pointer"
          title="Наступна клітинка"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export const MobileBottomNav: React.FC<{
  activeTab: MobileMatchTab;
  onSelectTab: (tab: MobileMatchTab) => void;
  isMyTurn: boolean;
  playersCount: number;
  unreadChatCount: number;
  selectedCellColor?: string;
}> = ({
  activeTab,
  onSelectTab,
  isMyTurn,
  playersCount,
  unreadChatCount,
  selectedCellColor,
}) => {
  const items: {
    id: MobileMatchTab;
    label: string;
    icon: React.ReactNode;
    badge?: React.ReactNode;
  }[] = [
    {
      id: 'board',
      label: 'Поле',
      icon: <Dices className="w-4 h-4" />,
      badge:
        isMyTurn && activeTab !== 'board' ? (
          <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-amber-400 animate-ping" />
        ) : null,
    },
    {
      id: 'inspector',
      label: 'Актив',
      icon: <Building2 className="w-4 h-4" />,
      badge: selectedCellColor ? (
        <span
          style={{ backgroundColor: selectedCellColor }}
          className="w-2 h-2 rounded-full inline-block ml-1 ring-1 ring-white/50"
        />
      ) : null,
    },
    {
      id: 'players',
      label: `Магнати (${playersCount})`,
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: 'chat',
      label: 'Чат',
      icon: <MessageSquare className="w-4 h-4" />,
      badge:
        unreadChatCount > 0 && activeTab !== 'chat' ? (
          <span className="ml-1 px-1.5 py-0.1 rounded-full bg-rose-500 text-white text-[9px] font-black tabular-nums">
            {unreadChatCount}
          </span>
        ) : null,
    },
  ];

  return (
    <nav className="glass-panel rounded-xl sm:rounded-2xl p-1 grid grid-cols-4 gap-1 shrink-0">
      {items.map((item) => {
        const active = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => {
              sound.playClick();
              onSelectTab(item.id);
            }}
            className={`relative py-1.5 px-1 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-extrabold flex flex-row items-center justify-center gap-1 transition cursor-pointer ${
              active
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-[var(--text-secondary)] hover:bg-slate-500/10'
            }`}
          >
            <div className="flex items-center shrink-0">
              {item.icon}
              {item.id === 'chat' || item.id === 'inspector' ? item.badge : null}
            </div>
            <span className="truncate max-w-full">{item.label}</span>
            {item.id === 'board' ? item.badge : null}
          </button>
        );
      })}
    </nav>
  );
};

// ============================================================================
// DEDICATED MOBILE HORIZONTAL (LANDSCAPE) PRO COCKPIT
// Maximizes board to 100% of vertical phone height with zero top/bottom bars!
// - Wide Mobile Landscape (>= 760px): [ Left Players + Controls | Full-Height Board | Right Inspector / Sectors / Chat ]
// - Compact Mobile Landscape (< 760px): [ Full-Height Board | Unified Cockpit: Controls + 2×2 Live Players + Tabs ]
// ============================================================================

type CockpitSideTab = 'inspector' | 'sectors' | 'chat';

export interface MobileLandscapeCockpitProps {
  gameState: GameState;
  myPlayerId: string;
  selectedCellIndex: number;
  stageWidth: number;
  stageHeight: number;
  isCssRotatedLandscape: boolean;
  isPhysicalPortrait: boolean;
  soundEnabled: boolean;
  darkMode: boolean;
  shareOrigin?: string;
  canTradeNow: boolean;
  unreadChatCount: number;
  recentReactions: Record<string, ChatMessage>;
  renderBoard: (boardSizePx: {
    width: number;
    height: number;
  }) => React.ReactNode;
  onSelectCell: (idx: number) => void;
  onHoverSector?: (sector: SectorId | null) => void;
  onBuildBranch: (cellIndex: number) => void;
  onSellBranch: (cellIndex: number) => void;
  onMortgage: (cellIndex: number) => void;
  onUnmortgage: (cellIndex: number) => void;
  onSendChat: (text: string, isQuick?: boolean) => void;
  onOpenTradeWith: (targetPlayerId: string | null) => void;
  onToggleSound: () => void;
  onToggleDarkMode: () => void;
  onOpenRules: () => void;
  onFlipRotationDir: () => void;
  onSwitchToPortrait: () => void;
  onRequestFullscreen: () => void;
  onMarkChatSeen: () => void;
  onLeaveGame: () => void;
}

export const MobileLandscapeCockpit: React.FC<MobileLandscapeCockpitProps> = ({
  gameState,
  myPlayerId,
  selectedCellIndex,
  stageWidth,
  stageHeight,
  isCssRotatedLandscape,
  isPhysicalPortrait,
  soundEnabled,
  darkMode,
  shareOrigin,
  canTradeNow,
  unreadChatCount,
  recentReactions,
  renderBoard,
  onSelectCell,
  onHoverSector,
  onBuildBranch,
  onSellBranch,
  onMortgage,
  onUnmortgage,
  onSendChat,
  onOpenTradeWith,
  onToggleSound,
  onToggleDarkMode,
  onOpenRules,
  onFlipRotationDir,
  onSwitchToPortrait,
  onRequestFullscreen,
  onMarkChatSeen,
  onLeaveGame,
}) => {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [measuredInner, setMeasuredInner] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [sideTab, setSideTab] = useState<CockpitSideTab>('inspector');
  const [chatSubTab, setChatSubTab] = useState<'chat' | 'logs'>('chat');
  const [copied, setCopied] = useState(false);

  const { rankByPlayer, netWorthByPlayer } = usePlayerRankings(gameState);
  const mePlayer = gameState.players.find((p) => p.id === myPlayerId);
  const selectedCellDef = BOARD_CELLS[selectedCellIndex] ?? BOARD_CELLS[0];

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.round(el.offsetWidth || el.clientWidth);
      const h = Math.round(el.offsetHeight || el.clientHeight);
      if (w > 100 && h > 100) {
        setMeasuredInner((prev) =>
          prev && prev.w === w && prev.h === h ? prev : { w, h }
        );
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stageWidth, stageHeight, isCssRotatedLandscape]);

  const usableW = measuredInner?.w ?? Math.max(460, stageWidth - 12);
  const usableH = measuredInner?.h ?? Math.max(260, stageHeight - 10);

  const isThreeCol = usableW >= 760;
  const leftColW = usableW >= 880 ? 204 : 182;
  const minRightW = isThreeCol
    ? usableW >= 880
      ? 224
      : 194
    : usableW < 610
      ? 202
      : 232;
  const gapsPx = isThreeCol ? 12 : 6;

  const boardH = Math.max(248, usableH);
  const maxBoardW = Math.max(
    260,
    usableW - (isThreeCol ? leftColW : 0) - minRightW - gapsPx
  );
  const boardW = Math.min(Math.round(boardH * 1.07), maxBoardW);

  const copyRoomLink = () => {
    const base = shareOrigin || window.location.origin;
    const url = `${base}${window.location.pathname}?room=${gameState.roomCode}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).catch(() => {});
    } else {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelectSideTab = (tab: CockpitSideTab) => {
    sound.playClick();
    setSideTab(tab);
    if (tab === 'chat') {
      onMarkChatSeen();
    }
  };

  const utilityControlsBar = (
    <div className="glass-panel rounded-xl px-1.5 py-1 flex items-center justify-between gap-1 shrink-0 overflow-hidden">
      <button
        type="button"
        onClick={copyRoomLink}
        title="Скопіювати посилання на стіл"
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-blue-600/15 text-blue-700 dark:text-sky-300 text-[9.5px] font-black cursor-pointer whitespace-nowrap shrink-0"
      >
        <span>{gameState.roomCode}</span>
        {copied ? (
          <Check className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
        ) : (
          <Copy className="w-2.5 h-2.5 shrink-0" />
        )}
      </button>

      <div className="flex items-center gap-0.5 shrink-0">
        {isCssRotatedLandscape ? (
          <>
            <button
              type="button"
              onClick={onFlipRotationDir}
              title="Перевернути екран на 180° (під іншу руку)"
              className="p-0.5 rounded-lg bg-blue-500/12 hover:bg-blue-500/25 text-blue-600 dark:text-sky-300 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            {isPhysicalPortrait && (
              <button
                type="button"
                onClick={onSwitchToPortrait}
                title="Повернути у зручний вертикальний режим"
                className="px-1.5 py-0.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[9.5px] font-extrabold inline-flex items-center gap-0.5 transition cursor-pointer"
              >
                <Smartphone className="w-3 h-3 shrink-0" />
                <span>Вертик.</span>
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={onRequestFullscreen}
            title="На весь екран"
            className="p-1 rounded-lg hover:bg-slate-500/15 transition cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={onOpenRules}
          title="Правила гри"
          className="p-0.5 rounded-lg hover:bg-slate-500/15 transition cursor-pointer"
        >
          <BookOpen className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onToggleSound}
          title={soundEnabled ? 'Вимкнути звук' : 'Увімкнути звук'}
          className="p-0.5 rounded-lg hover:bg-slate-500/15 transition cursor-pointer"
        >
          {soundEnabled ? (
            <Volume2 className="w-3.5 h-3.5" />
          ) : (
            <VolumeX className="w-3.5 h-3.5 opacity-50" />
          )}
        </button>

        <button
          type="button"
          onClick={onToggleDarkMode}
          title="Перемкнути тему"
          className="p-0.5 rounded-lg hover:bg-slate-500/15 transition cursor-pointer"
        >
          {darkMode ? (
            <Sun className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <Moon className="w-3.5 h-3.5" />
          )}
        </button>

        <button
          type="button"
          onClick={onLeaveGame}
          title="Вийти в головне меню"
          className="p-0.5 rounded-lg hover:bg-rose-500/15 text-rose-500 transition cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  const segmentedTabsBar = (
    <div className="glass-panel rounded-xl p-0.5 grid grid-cols-3 gap-0.5 shrink-0">
      <button
        type="button"
        onClick={() => handleSelectSideTab('inspector')}
        className={`py-1.5 px-1 rounded-lg text-[10px] font-extrabold flex items-center justify-center gap-1 transition cursor-pointer ${
          sideTab === 'inspector'
            ? 'bg-blue-600 text-white shadow-xs'
            : 'text-[var(--text-secondary)] hover:bg-slate-500/10'
        }`}
      >
        <Building2 className="w-3 h-3 shrink-0" />
        <span className="truncate">Актив</span>
        {selectedCellDef.color && (
          <span
            style={{ backgroundColor: selectedCellDef.color }}
            className="w-1.5 h-1.5 rounded-full shrink-0 ring-1 ring-white/50"
          />
        )}
      </button>

      <button
        type="button"
        onClick={() => handleSelectSideTab('sectors')}
        className={`py-1.5 px-1 rounded-lg text-[10px] font-extrabold flex items-center justify-center gap-1 transition cursor-pointer ${
          sideTab === 'sectors'
            ? 'bg-blue-600 text-white shadow-xs'
            : 'text-[var(--text-secondary)] hover:bg-slate-500/10'
        }`}
      >
        <Layers className="w-3 h-3 shrink-0" />
        <span className="truncate">Сектори</span>
      </button>

      <button
        type="button"
        onClick={() => handleSelectSideTab('chat')}
        className={`relative py-1.5 px-1 rounded-lg text-[10px] font-extrabold flex items-center justify-center gap-1 transition cursor-pointer ${
          sideTab === 'chat'
            ? 'bg-blue-600 text-white shadow-xs'
            : 'text-[var(--text-secondary)] hover:bg-slate-500/10'
        }`}
      >
        <MessageSquare className="w-3 h-3 shrink-0" />
        <span className="truncate">Чат</span>
        {unreadChatCount > 0 && sideTab !== 'chat' && (
          <span className="px-1 rounded-full bg-rose-500 text-white text-[8.5px] font-black tabular-nums">
            {unreadChatCount}
          </span>
        )}
      </button>
    </div>
  );

  const sideTabBody = (
    <div className="flex-1 min-h-0 glass-panel rounded-xl p-2 overflow-y-auto overscroll-contain flex flex-col">
      {sideTab === 'inspector' && (
        <CompanyInspectorContent
          gameState={gameState}
          myPlayerId={myPlayerId}
          selectedCellIndex={selectedCellIndex}
          ultraCompact
          onSelectCell={onSelectCell}
          onBuildBranch={onBuildBranch}
          onSellBranch={onSellBranch}
          onMortgage={onMortgage}
          onUnmortgage={onUnmortgage}
        />
      )}

      {sideTab === 'sectors' && (
        <div className="space-y-2">
          <SectorsControlGrid
            gameState={gameState}
            myPlayerId={myPlayerId}
            selectedCellIndex={selectedCellIndex}
            onHoverSector={onHoverSector}
            onSelectCell={(idx) => {
              onSelectCell(idx);
              setSideTab('inspector');
            }}
          />
          {!isThreeCol && (
            <>
              <NationalFundsWidget
                gameState={gameState}
                onSelectCell={(idx) => onSelectCell(idx)}
              />
              <PlayersCardsList
                gameState={gameState}
                myPlayerId={myPlayerId}
                selectedCellIndex={selectedCellIndex}
                recentReactions={recentReactions}
                onSelectCell={(idx) => {
                  onSelectCell(idx);
                  setSideTab('inspector');
                }}
                onOpenTradeWith={(targetId) => onOpenTradeWith(targetId)}
              />
            </>
          )}
        </div>
      )}

      {sideTab === 'chat' && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border-glass)] mb-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setChatSubTab('chat')}
              className={`py-1 rounded-md text-[10px] font-extrabold flex items-center justify-center gap-1 transition cursor-pointer ${
                chatSubTab === 'chat'
                  ? 'bg-[var(--surface-solid)] shadow-2xs'
                  : 'text-[var(--text-muted)]'
              }`}
            >
              <MessageSquare className="w-3 h-3" />
              <span>Чат ({gameState.chat.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setChatSubTab('logs')}
              className={`py-1 rounded-md text-[10px] font-extrabold flex items-center justify-center gap-1 transition cursor-pointer ${
                chatSubTab === 'logs'
                  ? 'bg-[var(--surface-solid)] shadow-2xs'
                  : 'text-[var(--text-muted)]'
              }`}
            >
              <ScrollText className="w-3 h-3" />
              <span>Ходи ({gameState.logs.length})</span>
            </button>
          </div>

          {chatSubTab === 'chat' ? (
            <ChatFeedContent
              gameState={gameState}
              onSendChat={onSendChat}
            />
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-0.5 text-[10px]">
              {gameState.logs.map((entry) => (
                <div
                  key={entry.id}
                  className="px-2 py-1 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border-glass)] leading-snug font-semibold"
                >
                  {entry.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div
      className={`w-full h-full overflow-hidden ${
        isCssRotatedLandscape
          ? 'p-1.5'
          : 'pl-[max(6px,env(safe-area-inset-left))] pr-[max(6px,env(safe-area-inset-right))] pt-[max(5px,env(safe-area-inset-top))] pb-[max(5px,env(safe-area-inset-bottom))]'
      }`}
    >
      <div
        ref={innerRef}
        className="w-full h-full min-w-0 min-h-0 flex flex-row items-stretch justify-between gap-1.5"
      >
        {isThreeCol ? (
          /* ================================================================
             3-COLUMN WIDE MOBILE LANDSCAPE COCKPIT (760px..1279px)
             [ Left Players + Controls | Full-Height Board | Right Inspector/Sectors/Chat ]
             ================================================================ */
          <>
            <aside
              style={{ width: `${leftColW}px` }}
              className="shrink-0 h-full flex flex-col gap-1.5 overflow-hidden"
            >
              {utilityControlsBar}

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-1.5 pr-0.5">
                {gameState.players.map((p, idx) => {
                  const isTurn =
                    idx === gameState.turnIndex &&
                    gameState.status === 'playing';
                  const isMe = p.id === myPlayerId;
                  const isAlly = areTeammates(
                    gameState.settings.gameMode,
                    mePlayer,
                    p
                  );
                  const rank = rankByPlayer[p.id] ?? idx + 1;
                  const worth = netWorthByPlayer[p.id] ?? p.money;
                  const bubble = recentReactions[p.id];
                  const ownedCells = BOARD_CELLS.filter(
                    (c) => gameState.properties[c.index]?.ownerId === p.id
                  );

                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        sound.playClick();
                        onSelectCell(p.position);
                      }}
                      style={{
                        borderColor: isTurn ? p.color : undefined,
                        boxShadow: isTurn
                          ? `0 4px 14px -4px ${p.color}77`
                          : undefined,
                      }}
                      className={`relative glass-panel rounded-xl p-1.5 transition cursor-pointer ${
                        p.isBankrupt
                          ? 'opacity-40 grayscale'
                          : isTurn
                            ? 'border-2'
                            : ''
                      }`}
                    >
                      {bubble && (
                        <span className="absolute -top-1.5 right-1 z-20 px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[8px] font-black shadow max-w-[115px] truncate">
                          {bubble.text}
                        </span>
                      )}

                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="relative shrink-0">
                            <TokenAvatar
                              token={p.token}
                              color={p.color}
                              size={24}
                            />
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full text-[7px] font-black flex items-center justify-center ${
                                rank === 1
                                  ? 'bg-amber-400 text-slate-950'
                                  : 'bg-slate-200 text-slate-800 dark:bg-slate-900 dark:text-white'
                              }`}
                            >
                              {rank}
                            </span>
                          </div>
                          <div className="min-w-0 leading-tight">
                            <div className="flex items-center gap-1">
                              <span className="text-[10.5px] font-extrabold truncate">
                                {getShortPlayerLabel(p)}
                              </span>
                              {isMe && (
                                <span className="px-1 rounded bg-blue-600 text-white text-[7px] font-black shrink-0">
                                  ВИ
                                </span>
                              )}
                              {!isMe && isAlly && (
                                <span className="px-1 rounded bg-sky-500/20 text-sky-600 dark:text-sky-300 border border-sky-400/40 text-[7px] font-black shrink-0">
                                  🤝
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-black text-emerald-600 dark:text-amber-300 tabular-nums whitespace-nowrap">
                              {p.isBankrupt ? 'Банкрут' : formatMoney(p.money)}
                            </div>
                          </div>
                        </div>

                        {canTradeNow && !isMe && !p.isBankrupt && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              sound.playClick();
                              onOpenTradeWith(p.id);
                            }}
                            title={`Смарт-Угода з ${p.name}`}
                            className="p-1.5 rounded-lg bg-amber-400/18 hover:bg-amber-400 hover:text-slate-950 text-amber-600 dark:text-amber-300 transition cursor-pointer shrink-0"
                          >
                            <Handshake className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {!p.isBankrupt && (
                        <div className="mt-1 pt-1 border-t border-[var(--border-glass)] flex items-center justify-between gap-1 text-[8.5px]">
                          <div className="flex items-center gap-0.5 overflow-hidden">
                            {ownedCells.length === 0 ? (
                              <span className="text-[var(--text-muted)] font-semibold">
                                0 активів
                              </span>
                            ) : (
                              <>
                                {ownedCells.slice(0, 7).map((c) => (
                                  <span
                                    key={c.index}
                                    style={{
                                      backgroundColor: c.color ?? '#94A3B8',
                                    }}
                                    className="w-2 h-2 rounded-full shrink-0 ring-[0.5px] ring-black/25"
                                  />
                                ))}
                                {ownedCells.length > 7 && (
                                  <span className="font-bold text-[var(--text-muted)]">
                                    +{ownedCells.length - 7}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                          <span className="font-bold text-[var(--text-muted)] tabular-nums shrink-0">
                            Σ {formatMoney(worth)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="glass-panel rounded-xl px-2 py-1 flex items-center justify-between gap-1 text-[9px] font-extrabold tabular-nums shrink-0">
                <span
                  onClick={() => onSelectCell(4)}
                  className="text-amber-600 dark:text-amber-300 cursor-pointer truncate"
                  title="Передано на Оборону за матч"
                >
                  🛡 {formatMoney(gameState.zsuTotalDonated)}
                </span>
                {gameState.settings.karpatyBonusEnabled && (
                  <span
                    onClick={() => onSelectCell(20)}
                    className="text-emerald-600 dark:text-emerald-400 cursor-pointer truncate"
                    title="Бонусний банк у Карпатах"
                  >
                    🏔 {formatMoney(gameState.karpatyFund)}
                  </span>
                )}
              </div>
            </aside>

            <main className="shrink-0 h-full flex items-center justify-center">
              {renderBoard({ width: boardW, height: boardH })}
            </main>

            <aside className="flex-1 min-w-0 h-full flex flex-col gap-1.5 overflow-hidden">
              {segmentedTabsBar}
              {sideTabBody}
            </aside>
          </>
        ) : (
          /* ================================================================
             2-COLUMN COMPACT MOBILE LANDSCAPE COCKPIT (< 760px, e.g. 568..759px)
             [ Full-Height Board | Unified Right Cockpit: Controls + 2×2 Players + Tabs ]
             ================================================================ */
          <>
            <main className="shrink-0 h-full flex items-center justify-center">
              {renderBoard({ width: boardW, height: boardH })}
            </main>

            <aside className="flex-1 min-w-0 h-full flex flex-col gap-1.5 overflow-hidden">
              {utilityControlsBar}

              {/* Always-Visible 2×2 Mini Magnates Grid */}
              <div className="grid grid-cols-2 gap-1 shrink-0">
                {gameState.players.map((p, idx) => {
                  const isTurn =
                    idx === gameState.turnIndex &&
                    gameState.status === 'playing';
                  const isMe = p.id === myPlayerId;
                  const isAlly = areTeammates(
                    gameState.settings.gameMode,
                    mePlayer,
                    p
                  );
                  const ownedCount = BOARD_CELLS.filter(
                    (c) => gameState.properties[c.index]?.ownerId === p.id
                  ).length;

                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        sound.playClick();
                        onSelectCell(p.position);
                      }}
                      style={{
                        borderColor: isTurn ? p.color : undefined,
                      }}
                      className={`glass-panel rounded-lg px-1.5 py-1 flex items-center justify-between gap-1 min-w-0 overflow-hidden cursor-pointer ${
                        p.isBankrupt
                          ? 'opacity-40 grayscale'
                          : isTurn
                            ? 'border-2'
                            : ''
                      }`}
                    >
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        <TokenAvatar
                          token={p.token}
                          color={p.color}
                          size={19}
                        />
                        <div className="min-w-0 flex-1 leading-none">
                          <div className="flex items-center gap-0.5">
                            <span className="text-[9.5px] font-extrabold truncate">
                              {getShortPlayerLabel(p, myPlayerId)}
                            </span>
                            {!isMe && isAlly && (
                              <span className="text-[8px]">🤝</span>
                            )}
                          </div>
                          <div className="text-[9px] font-black text-emerald-600 dark:text-amber-300 tabular-nums whitespace-nowrap mt-0.5">
                            {p.isBankrupt ? 'Вибув' : formatMoney(p.money)}
                            {!p.isBankrupt && ownedCount > 0
                              ? ` • ${ownedCount}`
                              : ''}
                          </div>
                        </div>
                      </div>

                      {canTradeNow && !isMe && !p.isBankrupt && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            sound.playClick();
                            onOpenTradeWith(p.id);
                          }}
                          title={`Угода з ${p.name}`}
                          className="p-1 rounded bg-amber-400/20 text-amber-600 dark:text-amber-300 shrink-0 cursor-pointer"
                        >
                          <Handshake className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {segmentedTabsBar}
              {sideTabBody}
            </aside>
          </>
        )}
      </div>
    </div>
  );
};
