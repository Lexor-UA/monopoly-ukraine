import {
  BOARD_CELLS,
  calculatePlayerNetWorth,
  hasFullSectorMonopoly,
} from '../shared/boardData';
import {
  GameState,
  LeaderboardEntry,
  PlayerMatchRecord,
  SectorId,
  TokenId,
  UserProfile,
  UserStats,
} from '../shared/types';
import {
  applyMatchToStats,
  createEmptyUserStats,
  normalizeUserStats,
} from '../shared/userProfileUtils';

const STORAGE_AUTH_TOKEN = 'magnat_auth_token_v1';
const STORAGE_AUTH_PROFILE = 'magnat_auth_profile_v1';
const STORAGE_GUEST_STATS = 'magnat_guest_stats_v1';
const STORAGE_RECORDED_MATCHES = 'magnat_recorded_match_ids_v1';

const COMPANY_SECTORS: SectorId[] = [
  'fintech',
  'tech',
  'telecom',
  'ecommerce',
  'fuel',
  'delivery',
  'retail',
  'coffee',
];

export function loadStoredAuthSession(): {
  authToken: string | null;
  profile: UserProfile | null;
} {
  try {
    const authToken = window.localStorage.getItem(STORAGE_AUTH_TOKEN);
    const rawProfile = window.localStorage.getItem(STORAGE_AUTH_PROFILE);
    if (!authToken || !rawProfile) {
      return { authToken: null, profile: null };
    }
    const parsed = JSON.parse(rawProfile) as UserProfile;
    if (!parsed || !parsed.id || !parsed.username) {
      return { authToken: null, profile: null };
    }
    parsed.stats = normalizeUserStats(parsed.stats);
    return { authToken, profile: parsed };
  } catch {
    return { authToken: null, profile: null };
  }
}

export function saveStoredAuthSession(
  authToken: string,
  profile: UserProfile
): void {
  try {
    profile.stats = normalizeUserStats(profile.stats);
    window.localStorage.setItem(STORAGE_AUTH_TOKEN, authToken);
    window.localStorage.setItem(STORAGE_AUTH_PROFILE, JSON.stringify(profile));
  } catch {
    // Ignore storage quota
  }
}

export function clearStoredAuthSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_AUTH_TOKEN);
    window.localStorage.removeItem(STORAGE_AUTH_PROFILE);
  } catch {
    // Ignore
  }
}

export function loadGuestStats(): UserStats {
  try {
    const raw = window.localStorage.getItem(STORAGE_GUEST_STATS);
    if (!raw) return createEmptyUserStats();
    return normalizeUserStats(JSON.parse(raw) as Partial<UserStats>);
  } catch {
    return createEmptyUserStats();
  }
}

export function saveGuestStats(stats: UserStats): void {
  try {
    window.localStorage.setItem(
      STORAGE_GUEST_STATS,
      JSON.stringify(normalizeUserStats(stats))
    );
  } catch {
    // Ignore
  }
}

export function hasRecordedMatchLocally(matchId: string): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_RECORDED_MATCHES);
    if (!raw) return false;
    const list = JSON.parse(raw) as string[];
    return Array.isArray(list) && list.includes(matchId);
  } catch {
    return false;
  }
}

export function markMatchRecordedLocally(matchId: string): void {
  try {
    const raw = window.localStorage.getItem(STORAGE_RECORDED_MATCHES);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    const safeList = Array.isArray(list) ? list : [];
    if (!safeList.includes(matchId)) {
      const next = [matchId, ...safeList].slice(0, 50);
      window.localStorage.setItem(
        STORAGE_RECORDED_MATCHES,
        JSON.stringify(next)
      );
    }
  } catch {
    // Ignore
  }
}

async function postAuthApi(
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch('/api/cloud-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as Record<string, unknown>;
}

export async function registerUserAccount(params: {
  username: string;
  password: string;
  displayName: string;
  favoriteToken: TokenId;
  motto?: string;
}): Promise<{
  ok: boolean;
  profile?: UserProfile;
  authToken?: string;
  error?: string;
}> {
  try {
    const guestStats = loadGuestStats();
    const data = await postAuthApi({
      action: 'auth:register',
      username: params.username,
      password: params.password,
      displayName: params.displayName,
      favoriteToken: params.favoriteToken,
      motto: params.motto,
      initialStats: guestStats.matchesPlayed > 0 ? guestStats : undefined,
    });
    if (data.ok && data.profile && data.authToken) {
      const profile = data.profile as UserProfile;
      const authToken = String(data.authToken);
      saveStoredAuthSession(authToken, profile);
      return { ok: true, profile, authToken };
    }
    return {
      ok: false,
      error: String(data.error || 'Не вдалося зареєструвати акаунт'),
    };
  } catch {
    return {
      ok: false,
      error: 'Помилка з’єднання із сервером. Спробуйте ще раз.',
    };
  }
}

export async function loginUserAccount(params: {
  username: string;
  password: string;
}): Promise<{
  ok: boolean;
  profile?: UserProfile;
  authToken?: string;
  error?: string;
}> {
  try {
    const data = await postAuthApi({
      action: 'auth:login',
      username: params.username,
      password: params.password,
    });
    if (data.ok && data.profile && data.authToken) {
      const profile = data.profile as UserProfile;
      const authToken = String(data.authToken);
      saveStoredAuthSession(authToken, profile);
      return { ok: true, profile, authToken };
    }
    return {
      ok: false,
      error: String(data.error || 'Невірний логін або пароль'),
    };
  } catch {
    return {
      ok: false,
      error: 'Помилка з’єднання із сервером. Спробуйте ще раз.',
    };
  }
}

export async function verifyStoredUserSession(): Promise<UserProfile | null> {
  const { authToken, profile } = loadStoredAuthSession();
  if (!authToken || !profile) return null;
  try {
    const data = await postAuthApi({
      action: 'auth:me',
      userId: profile.id,
      authToken,
    });
    if (data.ok && data.profile) {
      const freshProfile = data.profile as UserProfile;
      saveStoredAuthSession(authToken, freshProfile);
      return freshProfile;
    }
    if (data.expired) {
      clearStoredAuthSession();
      return null;
    }
    return profile;
  } catch {
    return profile;
  }
}

export async function updateUserProfileRemote(params: {
  displayName?: string;
  favoriteToken?: TokenId;
  motto?: string;
  newPassword?: string;
}): Promise<{
  ok: boolean;
  profile?: UserProfile;
  error?: string;
}> {
  const { authToken, profile } = loadStoredAuthSession();
  if (!authToken || !profile) {
    return { ok: false, error: 'Ви не авторизовані' };
  }
  try {
    const data = await postAuthApi({
      action: 'auth:update_profile',
      userId: profile.id,
      authToken,
      ...params,
    });
    if (data.ok && data.profile) {
      const nextToken = data.authToken ? String(data.authToken) : authToken;
      const nextProfile = data.profile as UserProfile;
      saveStoredAuthSession(nextToken, nextProfile);
      return { ok: true, profile: nextProfile };
    }
    return {
      ok: false,
      error: String(data.error || 'Не вдалося оновити профіль'),
    };
  } catch {
    return {
      ok: false,
      error: 'Помилка з’єднання із сервером',
    };
  }
}

export async function recordCompletedMatch(
  match: PlayerMatchRecord
): Promise<UserProfile | null> {
  if (hasRecordedMatchLocally(match.id)) {
    return loadStoredAuthSession().profile;
  }
  markMatchRecordedLocally(match.id);

  // Always update local guest stats as well
  const currentGuest = loadGuestStats();
  const { stats: updatedGuest } = applyMatchToStats(currentGuest, match);
  saveGuestStats(updatedGuest);

  const { authToken, profile } = loadStoredAuthSession();
  if (!authToken || !profile) {
    return null;
  }

  // Optimistic local profile update
  const { stats: optimisticStats } = applyMatchToStats(profile.stats, match);
  const optimisticProfile: UserProfile = {
    ...profile,
    updatedAt: Date.now(),
    stats: optimisticStats,
  };
  saveStoredAuthSession(authToken, optimisticProfile);

  try {
    const data = await postAuthApi({
      action: 'auth:record_match',
      userId: profile.id,
      authToken,
      match,
    });
    if (data.ok && data.profile) {
      const serverProfile = data.profile as UserProfile;
      saveStoredAuthSession(authToken, serverProfile);
      return serverProfile;
    }
  } catch {
    // Keep optimistic local update
  }
  return optimisticProfile;
}

export async function fetchMagnateLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const data = await postAuthApi({ action: 'auth:leaderboard' });
    if (data.ok && Array.isArray(data.leaderboard)) {
      return data.leaderboard as LeaderboardEntry[];
    }
  } catch {
    // Ignore
  }
  return [];
}

/**
 * Extracts a PlayerMatchRecord for `myPlayerId` when a match reaches `status === 'finished'`.
 */
export function buildMatchRecordFromGameState(
  gameState: GameState,
  myPlayerId: string
): PlayerMatchRecord | null {
  if (gameState.status !== 'finished') return null;

  const meActive = gameState.players.find((p) => p.id === myPlayerId);
  const meEliminated = gameState.eliminatedPlayers?.find(
    (p) => p.id === myPlayerId
  );
  if (!meActive && !meEliminated) return null;

  const isTeamVictory =
    gameState.settings.gameMode === 'team2v2' &&
    Boolean(gameState.winningTeamId);
  const winningTeamId = gameState.winningTeamId ?? null;
  const myTeamId = meActive?.teamId ?? meEliminated?.teamId;

  const won = isTeamVictory
    ? Boolean(winningTeamId && myTeamId === winningTeamId)
    : Boolean(gameState.winnerId === myPlayerId);

  const allStandings = [
    ...gameState.players.map((p) => {
      const worth = p.isBankrupt
        ? 0
        : calculatePlayerNetWorth(p.id, p.money, gameState.properties);
      const isChamp = isTeamVictory
        ? p.teamId === winningTeamId
        : p.id === gameState.winnerId;
      return {
        id: p.id,
        isChamp,
        isBankrupt: p.isBankrupt,
        netWorth: worth,
      };
    }),
    ...(gameState.eliminatedPlayers ?? [])
      .filter((ep) => !gameState.players.some((p) => p.id === ep.id))
      .map((ep) => ({
        id: ep.id,
        isChamp: Boolean(isTeamVictory && ep.teamId === winningTeamId),
        isBankrupt: true,
        netWorth: 0,
      })),
  ].sort((a, b) => {
    if (a.isChamp !== b.isChamp) return a.isChamp ? -1 : 1;
    if (a.isBankrupt !== b.isBankrupt) return a.isBankrupt ? 1 : -1;
    return b.netWorth - a.netWorth;
  });

  const placeIdx = allStandings.findIndex((s) => s.id === myPlayerId);
  const place = placeIdx >= 0 ? placeIdx + 1 : allStandings.length;

  const myNetWorth =
    meActive && !meActive.isBankrupt
      ? calculatePlayerNetWorth(
          myPlayerId,
          meActive.money,
          gameState.properties
        )
      : 0;

  // Count how many full sector monopolies this player (or their team) controlled at the end
  const ownerIdsToCheck = new Set<string>([myPlayerId]);
  if (isTeamVictory && myTeamId) {
    for (const p of gameState.players) {
      if (p.teamId === myTeamId) ownerIdsToCheck.add(p.id);
    }
  }
  const monopoliesCount = COMPANY_SECTORS.filter((sec) =>
    Array.from(ownerIdsToCheck).some((oid) =>
      hasFullSectorMonopoly(oid, sec, gameState.properties, false)
    )
  ).length;

  // Estimate player's share of ZSU donations or attribute match ZSU total if winner
  const humanOrTotalCount = Math.max(1, allStandings.length);
  const myZsuContribution = won
    ? Math.max(
        Math.round(gameState.zsuTotalDonated / humanOrTotalCount),
        Math.min(gameState.zsuTotalDonated, 2000)
      )
    : Math.round(gameState.zsuTotalDonated / humanOrTotalCount);

  // Deterministic match ID per room + turnNumber + winnerId so rematches in the same room get a new ID
  const matchSignature = `${gameState.roomCode}_t${gameState.turnNumber}_w${gameState.winnerId || gameState.winningTeamId || 'fin'}_${BOARD_CELLS.length}`;

  return {
    id: matchSignature,
    roomCode: gameState.roomCode,
    gameMode: gameState.settings.gameMode ?? 'classic',
    finishedAt: Date.now(),
    won,
    place,
    totalPlayers: Math.max(2, allStandings.length),
    netWorth: myNetWorth,
    zsuDonated: myZsuContribution,
    monopoliesCount,
    token: meActive?.token ?? meEliminated?.token ?? 'tryzub',
  };
}
