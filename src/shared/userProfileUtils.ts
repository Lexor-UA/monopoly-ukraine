import {
  LeaderboardEntry,
  PlayerMatchRecord,
  TokenId,
  UserProfile,
  UserStats,
} from './types';

export interface MagnateRankInfo {
  level: number;
  title: string;
  badge: string;
  subtitle: string;
  colorClass: string;
  nextTitle: string | null;
  progressPct: number;
  pointsCurrent: number;
  pointsNext: number | null;
}

const VALID_TOKENS: TokenId[] = [
  'tryzub',
  'mriya',
  'kozak',
  'patron',
  'kashtan',
  'bulava',
  'kotyk',
  'paddington',
  'potter',
  'mickey',
];

export function sanitizeTokenId(raw: unknown): TokenId {
  const str = String(raw || '').trim() as TokenId;
  return VALID_TOKENS.includes(str) ? str : 'tryzub';
}

export function createEmptyUserStats(): UserStats {
  return {
    matchesPlayed: 0,
    wins: 0,
    teamWins: 0,
    bestNetWorth: 0,
    totalNetWorthAccumulated: 0,
    totalZsuDonated: 0,
    totalMonopoliesCollected: 0,
    currentWinStreak: 0,
    bestWinStreak: 0,
    recentMatches: [],
  };
}

export function normalizeUserStats(raw?: Partial<UserStats> | null): UserStats {
  const empty = createEmptyUserStats();
  if (!raw || typeof raw !== 'object') return empty;
  const recentMatches = Array.isArray(raw.recentMatches)
    ? raw.recentMatches
        .filter((m) => m && typeof m.id === 'string')
        .slice(0, 15)
        .map((m) => ({
          id: String(m.id).slice(0, 80),
          roomCode: String(m.roomCode || 'UA-0000').slice(0, 20),
          gameMode: (m.gameMode === 'team2v2' ? 'team2v2' : 'classic') as
            | 'classic'
            | 'team2v2',
          finishedAt: Number(m.finishedAt) || Date.now(),
          won: Boolean(m.won),
          place: Math.max(1, Math.min(4, Number(m.place) || 1)),
          totalPlayers: Math.max(2, Math.min(4, Number(m.totalPlayers) || 2)),
          netWorth: Math.max(0, Math.round(Number(m.netWorth) || 0)),
          zsuDonated: Math.max(0, Math.round(Number(m.zsuDonated) || 0)),
          monopoliesCount: Math.max(
            0,
            Math.round(Number(m.monopoliesCount) || 0)
          ),
          token: sanitizeTokenId(m.token),
        }))
    : [];

  return {
    matchesPlayed: Math.max(0, Math.round(Number(raw.matchesPlayed) || 0)),
    wins: Math.max(0, Math.round(Number(raw.wins) || 0)),
    teamWins: Math.max(0, Math.round(Number(raw.teamWins) || 0)),
    bestNetWorth: Math.max(0, Math.round(Number(raw.bestNetWorth) || 0)),
    totalNetWorthAccumulated: Math.max(
      0,
      Math.round(Number(raw.totalNetWorthAccumulated) || 0)
    ),
    totalZsuDonated: Math.max(0, Math.round(Number(raw.totalZsuDonated) || 0)),
    totalMonopoliesCollected: Math.max(
      0,
      Math.round(Number(raw.totalMonopoliesCollected) || 0)
    ),
    currentWinStreak: Math.max(
      0,
      Math.round(Number(raw.currentWinStreak) || 0)
    ),
    bestWinStreak: Math.max(0, Math.round(Number(raw.bestWinStreak) || 0)),
    recentMatches,
  };
}

export function applyMatchToStats(
  current: UserStats,
  match: PlayerMatchRecord
): { stats: UserStats; added: boolean } {
  const norm = normalizeUserStats(current);
  if (norm.recentMatches.some((m) => m.id === match.id)) {
    return { stats: norm, added: false };
  }

  const cleanMatch: PlayerMatchRecord = {
    id: String(match.id).slice(0, 80),
    roomCode: String(match.roomCode || 'UA-0000').slice(0, 20),
    gameMode: match.gameMode === 'team2v2' ? 'team2v2' : 'classic',
    finishedAt: Number(match.finishedAt) || Date.now(),
    won: Boolean(match.won),
    place: Math.max(1, Math.min(4, Number(match.place) || 1)),
    totalPlayers: Math.max(2, Math.min(4, Number(match.totalPlayers) || 2)),
    netWorth: Math.max(0, Math.round(Number(match.netWorth) || 0)),
    zsuDonated: Math.max(0, Math.round(Number(match.zsuDonated) || 0)),
    monopoliesCount: Math.max(
      0,
      Math.round(Number(match.monopoliesCount) || 0)
    ),
    token: sanitizeTokenId(match.token),
  };

  const nextStreak = cleanMatch.won ? norm.currentWinStreak + 1 : 0;
  const nextStats: UserStats = {
    matchesPlayed: norm.matchesPlayed + 1,
    wins: norm.wins + (cleanMatch.won ? 1 : 0),
    teamWins:
      norm.teamWins +
      (cleanMatch.won && cleanMatch.gameMode === 'team2v2' ? 1 : 0),
    bestNetWorth: Math.max(norm.bestNetWorth, cleanMatch.netWorth),
    totalNetWorthAccumulated:
      norm.totalNetWorthAccumulated + cleanMatch.netWorth,
    totalZsuDonated: norm.totalZsuDonated + cleanMatch.zsuDonated,
    totalMonopoliesCollected:
      norm.totalMonopoliesCollected + cleanMatch.monopoliesCount,
    currentWinStreak: nextStreak,
    bestWinStreak: Math.max(norm.bestWinStreak, nextStreak),
    recentMatches: [cleanMatch, ...norm.recentMatches].slice(0, 15),
  };

  return { stats: nextStats, added: true };
}

export function validateUsernameInput(raw: string): {
  ok: boolean;
  cleaned: string;
  lower: string;
  error?: string;
} {
  const cleaned = String(raw || '').trim();
  if (cleaned.length < 3) {
    return {
      ok: false,
      cleaned,
      lower: cleaned.toLowerCase(),
      error: 'Логін або Email має містити щонайменше 3 символи',
    };
  }
  if (cleaned.length > 42) {
    return {
      ok: false,
      cleaned,
      lower: cleaned.toLowerCase(),
      error: 'Логін занадто довгий (максимум 42 символи)',
    };
  }
  if (/\s/.test(cleaned)) {
    return {
      ok: false,
      cleaned,
      lower: cleaned.toLowerCase(),
      error: 'Логін або Email не повинен містити пробілів',
    };
  }
  return {
    ok: true,
    cleaned,
    lower: cleaned.toLowerCase(),
  };
}

export function validatePasswordInput(raw: string): {
  ok: boolean;
  error?: string;
} {
  const pwd = String(raw || '');
  if (pwd.length < 4) {
    return {
      ok: false,
      error: 'Пароль має містити щонайменше 4 символи',
    };
  }
  if (pwd.length > 100) {
    return {
      ok: false,
      error: 'Пароль занадто довгий',
    };
  }
  return { ok: true };
}

export function toLeaderboardEntry(profile: UserProfile): LeaderboardEntry {
  return {
    userId: profile.id,
    username: profile.username,
    displayName: profile.displayName,
    favoriteToken: profile.favoriteToken,
    motto: profile.motto || '',
    wins: profile.stats.wins,
    matchesPlayed: profile.stats.matchesPlayed,
    bestNetWorth: profile.stats.bestNetWorth,
    totalZsuDonated: profile.stats.totalZsuDonated,
  };
}

/**
 * Computes Magnate Experience Points & Rank Tier from a player's career stats.
 * Every match played = +100 XP, every win = +250 XP, every monopoly = +40 XP,
 * every 10,000 ₴ donated to Defense = +50 XP.
 */
export function getMagnateRank(stats: UserStats): MagnateRankInfo {
  const points =
    stats.matchesPlayed * 100 +
    stats.wins * 250 +
    stats.totalMonopoliesCollected * 40 +
    Math.floor(stats.totalZsuDonated / 10000) * 50;

  const tiers: Array<{
    minPoints: number;
    level: number;
    title: string;
    badge: string;
    subtitle: string;
    colorClass: string;
  }> = [
    {
      minPoints: 0,
      level: 1,
      title: 'Стартапер Подолу',
      badge: '🌱',
      subtitle: 'Перші інвестиції в економіку України',
      colorClass: 'text-emerald-400 border-emerald-400/35 bg-emerald-500/12',
    },
    {
      minPoints: 300,
      level: 2,
      title: 'Підприємець Бізнес-Ліги',
      badge: '💼',
      subtitle: 'Впевнений гравець українського ринку',
      colorClass: 'text-sky-300 border-sky-400/35 bg-sky-500/12',
    },
    {
      minPoints: 900,
      level: 3,
      title: 'Регіональний Директор',
      badge: '🏢',
      subtitle: 'Будівничий мережевих філій та корпорацій',
      colorClass: 'text-indigo-300 border-indigo-400/35 bg-indigo-500/14',
    },
    {
      minPoints: 2000,
      level: 4,
      title: 'Індустріальний Магнат',
      badge: '🏛️',
      subtitle: 'Володар стратегічних секторів держави',
      colorClass: 'text-purple-300 border-purple-400/40 bg-purple-500/15',
    },
    {
      minPoints: 4000,
      level: 5,
      title: 'Титан Незламної Економіки',
      badge: '💎',
      subtitle: 'Фінансова імперія національного масштабу',
      colorClass: 'text-amber-300 border-amber-400/45 bg-amber-500/15',
    },
    {
      minPoints: 7500,
      level: 6,
      title: 'Легенда КАБЗДА.UA',
      badge: '👑',
      subtitle: 'Верховний архітектор українських холдингів',
      colorClass: 'text-amber-200 border-amber-300/60 bg-amber-400/20',
    },
  ];

  let activeIdx = 0;
  for (let i = 0; i < tiers.length; i++) {
    if (points >= tiers[i].minPoints) {
      activeIdx = i;
    }
  }

  const currentTier = tiers[activeIdx];
  const nextTier = tiers[activeIdx + 1] ?? null;
  const progressPct = nextTier
    ? Math.min(
        100,
        Math.max(
          4,
          Math.round(
            ((points - currentTier.minPoints) /
              (nextTier.minPoints - currentTier.minPoints)) *
              100
          )
        )
      )
    : 100;

  return {
    level: currentTier.level,
    title: currentTier.title,
    badge: currentTier.badge,
    subtitle: currentTier.subtitle,
    colorClass: currentTier.colorClass,
    nextTitle: nextTier ? `${nextTier.badge} ${nextTier.title}` : null,
    progressPct,
    pointsCurrent: points,
    pointsNext: nextTier ? nextTier.minPoints : null,
  };
}
