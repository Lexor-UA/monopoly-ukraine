import {
  Award,
  Check,
  Crown,
  Eye,
  EyeOff,
  Flame,
  KeyRound,
  LogIn,
  LogOut,
  RefreshCw,
  Settings,
  Shield,
  Sparkles,
  TrendingUp,
  Trophy,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import React, { useEffect, useState } from 'react';
import { formatMoney, TOKENS } from '../shared/boardData';
import {
  LeaderboardEntry,
  TokenId,
  UserProfile,
  UserStats,
} from '../shared/types';
import { getMagnateRank } from '../shared/userProfileUtils';
import {
  clearStoredAuthSession,
  fetchMagnateLeaderboard,
  loadGuestStats,
  loginUserAccount,
  registerUserAccount,
  updateUserProfileRemote,
} from '../utils/authClient';
import { sound } from '../utils/sound';
import { MagnatBrandIcon, TokenAvatar } from './UkrainianArtwork';

interface ProfileModalProps {
  open: boolean;
  initialTab?: 'profile' | 'register' | 'login' | 'leaderboard' | 'settings';
  userProfile: UserProfile | null;
  currentPlayerName: string;
  currentSelectedToken: TokenId;
  onClose: () => void;
  onAuthSuccess: (profile: UserProfile) => void;
  onLogout: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  open,
  initialTab,
  userProfile,
  currentPlayerName,
  currentSelectedToken,
  onClose,
  onAuthSuccess,
  onLogout,
}) => {
  const [guestTab, setGuestTab] = useState<
    'register' | 'login' | 'leaderboard'
  >('register');
  const [userTab, setUserTab] = useState<
    'overview' | 'settings' | 'leaderboard'
  >('overview');

  // Auth form fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState(currentPlayerName);
  const [favoriteToken, setFavoriteToken] =
    useState<TokenId>(currentSelectedToken);
  const [motto, setMotto] = useState('Будую українську бізнес-імперію!');
  const [newPassword, setNewPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(false);

  const guestStats: UserStats = React.useMemo(
    () => (open ? loadGuestStats() : loadGuestStats()),
    [open]
  );

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    if (userProfile) {
      setDisplayName(userProfile.displayName);
      setFavoriteToken(userProfile.favoriteToken);
      setMotto(userProfile.motto || 'Будую українську бізнес-імперію!');
      setNewPassword('');
      if (initialTab === 'leaderboard') {
        setUserTab('leaderboard');
      } else if (initialTab === 'settings') {
        setUserTab('settings');
      } else {
        setUserTab('overview');
      }
    } else {
      setDisplayName(
        currentPlayerName && currentPlayerName !== 'Магнат України'
          ? currentPlayerName
          : ''
      );
      setFavoriteToken(currentSelectedToken);
      if (initialTab === 'login') {
        setGuestTab('login');
      } else if (initialTab === 'leaderboard') {
        setGuestTab('leaderboard');
      } else {
        setGuestTab('register');
      }
    }
  }, [open, userProfile, initialTab, currentPlayerName, currentSelectedToken]);

  const loadLeaderboard = async () => {
    setLoadingBoard(true);
    const list = await fetchMagnateLeaderboard();
    setLeaderboard(list);
    setLoadingBoard(false);
  };

  useEffect(() => {
    if (!open) return;
    if (
      (userProfile && userTab === 'leaderboard') ||
      (!userProfile && guestTab === 'leaderboard')
    ) {
      void loadLeaderboard();
    }
  }, [open, userProfile, userTab, guestTab]);

  if (!open) return null;

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusy(true);
    sound.playClick();

    const finalDisplay =
      displayName.trim() || username.trim().split('@')[0] || 'Магнат України';
    const res = await registerUserAccount({
      username: username.trim(),
      password,
      displayName: finalDisplay,
      favoriteToken,
      motto: motto.trim(),
    });
    setBusy(false);

    if (!res.ok || !res.profile) {
      setErrorMsg(res.error || 'Помилка реєстрації');
      sound.playClick();
      return;
    }

    sound.playPurchase();
    setPassword('');
    onAuthSuccess(res.profile);
    setSuccessMsg('Акаунт успішно створено! Ласкаво просимо до ліги магнатів.');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusy(true);
    sound.playClick();

    const res = await loginUserAccount({
      username: username.trim(),
      password,
    });
    setBusy(false);

    if (!res.ok || !res.profile) {
      setErrorMsg(res.error || 'Невірний логін або пароль');
      sound.playClick();
      return;
    }

    sound.playPurchase();
    setPassword('');
    onAuthSuccess(res.profile);
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !userProfile) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusy(true);
    sound.playClick();

    const res = await updateUserProfileRemote({
      displayName: displayName.trim() || userProfile.displayName,
      favoriteToken,
      motto: motto.trim(),
      newPassword: newPassword.trim() ? newPassword : undefined,
    });
    setBusy(false);

    if (!res.ok || !res.profile) {
      setErrorMsg(res.error || 'Не вдалося зберегти налаштування');
      sound.playClick();
      return;
    }

    sound.playPurchase();
    setNewPassword('');
    onAuthSuccess(res.profile);
    setSuccessMsg('Профіль магната успішно оновлено!');
  };

  const handleLogoutClick = () => {
    sound.playClick();
    clearStoredAuthSession();
    onLogout();
  };

  const activeStats = userProfile ? userProfile.stats : guestStats;
  const rankInfo = getMagnateRank(activeStats);
  const winratePct =
    activeStats.matchesPlayed > 0
      ? Math.round((activeStats.wins / activeStats.matchesPlayed) * 100)
      : 0;
  const activeTokenDef =
    TOKENS.find(
      (t) => t.id === (userProfile?.favoriteToken ?? favoriteToken)
    ) ?? TOKENS[0];

  const renderLeaderboardSection = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-display font-extrabold text-sm sm:text-base flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>Топ Магнатів КАБЗДА.UA</span>
          </h3>
          <p className="text-[11px] font-semibold text-[var(--text-secondary)]">
            Глобальний рейтинг зареєстрованих гравців за перемогами та капіталом
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadLeaderboard()}
          className="px-2.5 py-1.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-strong)] text-[11px] font-extrabold inline-flex items-center gap-1.5 hover:border-blue-500 transition cursor-pointer"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${loadingBoard ? 'animate-spin' : ''}`}
          />
          <span>Оновити</span>
        </button>
      </div>

      {loadingBoard ? (
        <div className="py-10 text-center text-xs font-bold text-[var(--text-secondary)]">
          Завантаження рейтингу магнатів...
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="p-6 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] text-center space-y-2">
          <Trophy className="w-8 h-8 text-amber-400 mx-auto opacity-80" />
          <div className="font-display font-extrabold text-sm">
            Рейтинг очікує на перших чемпіонів!
          </div>
          <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
            Зареєструйте профіль та виграйте свій перший матч, щоб очолити
            загальнонаціональний список магнатів КАБЗДА.UA.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--border-glass)] bg-[var(--surface-subtle)] overflow-hidden divide-y divide-[var(--border-glass)]">
          {leaderboard.map((entry, idx) => {
            const tok =
              TOKENS.find((t) => t.id === entry.favoriteToken) ?? TOKENS[0];
            const entryWinrate =
              entry.matchesPlayed > 0
                ? Math.round((entry.wins / entry.matchesPlayed) * 100)
                : 0;
            const isMe = userProfile?.id === entry.userId;

            return (
              <div
                key={entry.userId}
                className={`px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2.5 ${
                  isMe ? 'bg-amber-400/12' : ''
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center shrink-0 ${
                      idx === 0
                        ? 'bg-amber-400 text-slate-950 shadow-sm'
                        : idx === 1
                          ? 'bg-slate-300 text-slate-950'
                          : idx === 2
                            ? 'bg-amber-700 text-amber-100'
                            : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <TokenAvatar
                    token={entry.favoriteToken}
                    color={tok.defaultColor}
                    size={32}
                  />
                  <div className="min-w-0">
                    <div className="font-extrabold text-xs sm:text-sm truncate flex items-center gap-1.5">
                      <span className="truncate">{entry.displayName}</span>
                      {isMe && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[9px] font-black shrink-0">
                          ВИ
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-semibold text-[var(--text-secondary)] truncate">
                      Матчів: {entry.matchesPlayed} • Winrate: {entryWinrate}%
                      {entry.totalZsuDonated > 0
                        ? ` • ЗСУ: ${formatMoney(entry.totalZsuDonated)}`
                        : ''}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-display font-extrabold text-xs sm:text-sm text-amber-500 dark:text-amber-300 tabular-nums">
                    🏆 {entry.wins}{' '}
                    {entry.wins === 1
                      ? 'перемога'
                      : entry.wins >= 2 && entry.wins <= 4
                        ? 'перемоги'
                        : 'перемог'}
                  </div>
                  <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    Рекорд: {formatMoney(entry.bestNetWorth)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div
      onClick={onClose}
      className="@container fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-2 sm:p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl glass-panel !bg-[var(--surface-solid)] rounded-[24px] sm:rounded-[30px] overflow-hidden shadow-[0_28px_80px_-12px_rgba(0,0,0,0.85)] border border-[var(--border-strong)] max-h-[calc(100dvh-16px)] flex flex-col"
      >
        {/* === TOP MODAL HEADER === */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-[var(--border-glass)] flex items-center justify-between gap-3 shrink-0 bg-gradient-to-r from-blue-600/10 via-amber-400/8 to-transparent">
          <div className="flex items-center gap-2.5 min-w-0">
            <MagnatBrandIcon size="sm" />
            <div className="min-w-0">
              <div className="font-display font-black text-sm sm:text-base flex items-center gap-2">
                <span>
                  {userProfile
                    ? 'Особистий Кабінет Магната'
                    : 'Профіль та Реєстрація КАБЗДА.UA'}
                </span>
                {userProfile && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-emerald-600 dark:text-emerald-300 text-[10px] font-extrabold inline-flex items-center gap-1">
                    <UserCheck className="w-3 h-3" /> Онлайн-акаунт
                  </span>
                )}
              </div>
              <p className="text-[11px] font-semibold text-[var(--text-secondary)] truncate">
                {userProfile
                  ? `Логін: @${userProfile.username} • Статистика синхронізована у хмарі`
                  : 'Зберігайте перемоги, звання магната та рекорди на всіх пристроях'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-500/15 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* === NAVIGATION TABS === */}
        <div className="px-4 sm:px-6 pt-3 shrink-0">
          {userProfile ? (
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)]">
              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  setUserTab('overview');
                }}
                className={`py-2 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  userTab === 'overview'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Award className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Досьє та Статистика</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  setUserTab('leaderboard');
                }}
                className={`py-2 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  userTab === 'leaderboard'
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Trophy className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Рейтинг Топ-15</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  setUserTab('settings');
                }}
                className={`py-2 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  userTab === 'settings'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Settings className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Налаштування</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)]">
              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  setErrorMsg(null);
                  setGuestTab('register');
                }}
                className={`py-2 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  guestTab === 'register'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Реєстрація</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  setErrorMsg(null);
                  setGuestTab('login');
                }}
                className={`py-2 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  guestTab === 'login'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <LogIn className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Вхід в акаунт</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  setErrorMsg(null);
                  setGuestTab('leaderboard');
                }}
                className={`py-2 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  guestTab === 'leaderboard'
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Trophy className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Рейтинг</span>
              </button>
            </div>
          )}
        </div>

        {/* === SCROLLABLE CONTENT BODY === */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 min-h-0">
          {errorMsg && (
            <div className="px-4 py-2.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-600 dark:text-rose-300 text-xs font-extrabold">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="px-4 py-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {userProfile ? (
            /* ================================================================
               LOGGED-IN MAGNATE CABINET
               ================================================================ */
            userTab === 'leaderboard' ? (
              renderLeaderboardSection()
            ) : userTab === 'settings' ? (
              <form onSubmit={handleUpdateSettings} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                      Ваше ім’я за столом (Нікнейм)
                    </label>
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      maxLength={22}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl premium-input text-sm font-extrabold outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                      Девіз вашого холдингу
                    </label>
                    <input
                      value={motto}
                      onChange={(e) => setMotto(e.target.value)}
                      maxLength={80}
                      placeholder="Напр. Купую все від Подолу до Карпат!"
                      className="w-full px-3.5 py-2.5 rounded-xl premium-input text-sm font-bold outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                    Улюблена 3D-фішка за замовчуванням
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {TOKENS.map((t) => {
                      const active = favoriteToken === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setFavoriteToken(t.id)}
                          className={`p-2 rounded-xl border-2 flex items-center gap-2 text-left transition cursor-pointer ${
                            active
                              ? 'border-blue-600 bg-blue-500/12 shadow-2xs'
                              : 'border-[var(--border-glass)] bg-[var(--surface-subtle)] hover:border-blue-500/40'
                          }`}
                        >
                          <TokenAvatar
                            token={t.id}
                            color={t.defaultColor}
                            size={28}
                          />
                          <span className="text-[11px] font-extrabold leading-tight truncate">
                            {t.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                    Новий пароль (залиште порожнім, якщо не змінюєте)
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Мінімум 4 символи..."
                      className="w-full px-3.5 py-2.5 pr-10 rounded-xl premium-input text-sm font-bold outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border-glass)]">
                  <button
                    type="button"
                    onClick={handleLogoutClick}
                    className="px-4 py-2.5 rounded-2xl bg-rose-500/12 hover:bg-rose-500/22 border border-rose-500/35 text-rose-600 dark:text-rose-300 text-xs font-extrabold inline-flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Вийти з акаунту</span>
                  </button>

                  <button
                    type="submit"
                    disabled={busy}
                    className="px-6 py-2.5 rounded-2xl mono-cta-btn font-display font-bold text-xs inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    <Check className="w-4 h-4" />
                    <span>{busy ? 'Збереження...' : 'Зберегти зміни'}</span>
                  </button>
                </div>
              </form>
            ) : (
              /* === PROFILE OVERVIEW & CAREER STATS === */
              <div className="space-y-4">
                {/* Hero Magnate Identity Card + Rank Progress */}
                <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 text-white border border-amber-400/35 shadow-xl relative overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="relative shrink-0">
                        <div className="p-1 rounded-full bg-gradient-to-b from-amber-300 via-amber-500 to-yellow-600 shadow-[0_0_24px_rgba(251,191,36,0.45)]">
                          <TokenAvatar
                            token={userProfile.favoriteToken}
                            color={activeTokenDef.defaultColor}
                            size={56}
                          />
                        </div>
                        <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[9px] border border-slate-950 shadow">
                          LVL {rankInfo.level}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-display font-black text-lg sm:text-xl text-white truncate">
                            {userProfile.displayName}
                          </h2>
                          <span className="text-xs font-bold text-slate-400">
                            @{userProfile.username}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-amber-200/90 italic mt-0.5 truncate">
                          «{userProfile.motto || 'Будую українську бізнес-імперію!'}»
                        </p>
                        <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-extrabold bg-amber-400/15 border-amber-300/40 text-amber-200">
                          <span>{rankInfo.badge}</span>
                          <span>{rankInfo.title}</span>
                        </div>
                      </div>
                    </div>

                    <div className="sm:text-right shrink-0 bg-white/[0.06] border border-white/12 rounded-2xl px-3.5 py-2.5">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-300">
                        Рейтинг Досвіду (XP)
                      </div>
                      <div className="font-display font-black text-lg text-amber-300 tabular-nums">
                        {rankInfo.pointsCurrent} XP
                      </div>
                      <div className="text-[10px] font-semibold text-slate-400">
                        {rankInfo.nextTitle
                          ? `До «${rankInfo.nextTitle}»: ${Math.max(0, (rankInfo.pointsNext ?? 0) - rankInfo.pointsCurrent)} XP`
                          : 'Максимальний титул досягнуто!'}
                      </div>
                    </div>
                  </div>

                  {/* Progress bar to next rank */}
                  <div className="mt-3.5">
                    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                      <div
                        style={{ width: `${rankInfo.progressPct}%` }}
                        className="h-full rounded-full bg-gradient-to-r from-sky-400 via-amber-300 to-amber-500 transition-all duration-500"
                      />
                    </div>
                  </div>
                </div>

                {/* 6-Card Career Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)]">
                    <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                      <span>Перемоги</span>
                      <Trophy className="w-3.5 h-3.5 text-amber-500" />
                    </div>
                    <div className="font-display font-black text-lg sm:text-xl text-amber-500 dark:text-amber-300 tabular-nums mt-0.5">
                      {activeStats.wins}
                    </div>
                    <div className="text-[10px] font-semibold text-[var(--text-muted)]">
                      Зіграно матчів: {activeStats.matchesPlayed}
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)]">
                    <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                      <span>Winrate (%)</span>
                      <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                    </div>
                    <div className="font-display font-black text-lg sm:text-xl text-blue-600 dark:text-sky-300 tabular-nums mt-0.5">
                      {winratePct}%
                    </div>
                    <div className="text-[10px] font-semibold text-[var(--text-muted)]">
                      Командних 2×2: {activeStats.teamWins}
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)]">
                    <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                      <span>Рекорд капіталу</span>
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                    </div>
                    <div className="font-display font-black text-lg sm:text-xl text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                      {formatMoney(activeStats.bestNetWorth)}
                    </div>
                    <div className="text-[10px] font-semibold text-[var(--text-muted)]">
                      Сумарно: {formatMoney(activeStats.totalNetWorthAccumulated)}
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)]">
                    <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                      <span>Передано на ЗСУ</span>
                      <Shield className="w-3.5 h-3.5 text-amber-500" />
                    </div>
                    <div className="font-display font-black text-lg sm:text-xl text-amber-600 dark:text-amber-300 tabular-nums mt-0.5">
                      {formatMoney(activeStats.totalZsuDonated)}
                    </div>
                    <div className="text-[10px] font-semibold text-[var(--text-muted)]">
                      Фонд Оборони України 🇺🇦
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)]">
                    <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                      <span>Монополії</span>
                      <Crown className="w-3.5 h-3.5 text-purple-400" />
                    </div>
                    <div className="font-display font-black text-lg sm:text-xl tabular-nums mt-0.5">
                      {activeStats.totalMonopoliesCollected}
                    </div>
                    <div className="text-[10px] font-semibold text-[var(--text-muted)]">
                      Повних галузевих секторів
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)]">
                    <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                      <span>Серія перемог</span>
                      <Flame className="w-3.5 h-3.5 text-orange-500" />
                    </div>
                    <div className="font-display font-black text-lg sm:text-xl text-orange-500 tabular-nums mt-0.5">
                      {activeStats.currentWinStreak} 🔥
                    </div>
                    <div className="text-[10px] font-semibold text-[var(--text-muted)]">
                      Найкраща серія: {activeStats.bestWinStreak}
                    </div>
                  </div>
                </div>

                {/* Recent Match History */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                      Історія останніх матчів ({activeStats.recentMatches.length})
                    </h3>
                  </div>

                  {activeStats.recentMatches.length === 0 ? (
                    <div className="p-5 rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-glass)] text-center text-xs font-semibold text-[var(--text-secondary)]">
                      У вас ще немає завершених партій. Зіграйте швидкий матч з
                      AI-ботами або з друзями — кожна гра автоматично збережеться у
                      вашому профілі!
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-[var(--border-glass)] bg-[var(--surface-subtle)] divide-y divide-[var(--border-glass)] overflow-hidden">
                      {activeStats.recentMatches.slice(0, 8).map((m) => {
                        const tok =
                          TOKENS.find((t) => t.id === m.token) ?? TOKENS[0];
                        const dateStr = new Date(
                          m.finishedAt
                        ).toLocaleDateString('uk-UA', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                        return (
                          <div
                            key={m.id}
                            className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <TokenAvatar
                                token={m.token}
                                color={tok.defaultColor}
                                size={28}
                              />
                              <div className="min-w-0">
                                <div className="font-extrabold flex items-center gap-1.5 truncate">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                      m.won
                                        ? 'bg-amber-400 text-slate-950'
                                        : 'bg-slate-500/20 text-[var(--text-secondary)]'
                                    }`}
                                  >
                                    {m.won
                                      ? '🏆 #1 Перемога'
                                      : `#${m.place} з ${m.totalPlayers}`}
                                  </span>
                                  <span className="truncate">
                                    Стіл {m.roomCode}
                                  </span>
                                  <span className="text-[10px] font-bold text-[var(--text-muted)]">
                                    ({m.gameMode === 'team2v2' ? '2×2' : 'Класика'})
                                  </span>
                                </div>
                                <div className="text-[10px] font-semibold text-[var(--text-secondary)] mt-0.5">
                                  {dateStr} • Монополій: {m.monopoliesCount} • На
                                  ЗСУ: {formatMoney(m.zsuDonated)}
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0 font-display font-extrabold text-amber-500 dark:text-amber-300 tabular-nums">
                              {formatMoney(m.netWorth)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          ) : /* ================================================================
             GUEST VIEW: REGISTER / LOGIN / LEADERBOARD
             ================================================================ */
          guestTab === 'leaderboard' ? (
            renderLeaderboardSection()
          ) : guestTab === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="p-4 rounded-2xl bg-blue-500/8 border border-blue-500/25 text-xs font-medium text-[var(--text-secondary)] leading-relaxed">
                Увійдіть у свій акаунт <strong>КАБЗДА.UA</strong>, щоб відновити
                звання магната, статистику перемог, улюблену 3D-фішку та історію
                матчів.
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
                  Логін або Email
                </label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder="Введіть ваш логін або email..."
                  className="w-full px-4 py-3 rounded-xl premium-input text-sm font-extrabold outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
                  Пароль
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="Введіть пароль..."
                    className="w-full px-4 py-3 pr-11 rounded-xl premium-input text-sm font-extrabold outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3.5 rounded-2xl mono-cta-btn font-display font-bold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <LogIn className="w-4 h-4" />
                <span>
                  {busy ? 'Вхід в кабінет...' : 'Увійти в Кабінет Магната'}
                </span>
              </button>
            </form>
          ) : (
            /* === REGISTRATION FORM === */
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              {guestStats.matchesPlayed > 0 && (
                <div className="p-3.5 rounded-2xl bg-amber-400/15 border border-amber-400/40 flex items-center justify-between gap-3">
                  <div className="text-xs font-bold">
                    <div className="font-extrabold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                      <Trophy className="w-4 h-4 shrink-0" />
                      <span>
                        Знайдено статистику гостя: {guestStats.matchesPlayed}{' '}
                        матчів ({guestStats.wins} перемог)
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                      Після реєстрації всі ваші зіграні матчі та рекорди
                      автоматично перенесуться у новий профіль!
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                    Логін або Email *
                  </label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    minLength={3}
                    maxLength={42}
                    autoComplete="username"
                    placeholder="Напр. alex_ua або email"
                    className="w-full px-3.5 py-2.5 rounded-xl premium-input text-sm font-extrabold outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                    Пароль (мін. 4 символи) *
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={4}
                      autoComplete="new-password"
                      placeholder="Надійний пароль..."
                      className="w-full px-3.5 py-2.5 pr-10 rounded-xl premium-input text-sm font-extrabold outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                    Ваше ім’я в грі (на картці) *
                  </label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    maxLength={22}
                    placeholder="Напр. Олександр"
                    className="w-full px-3.5 py-2.5 rounded-xl premium-input text-sm font-extrabold outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
                    Девіз магната
                  </label>
                  <input
                    value={motto}
                    onChange={(e) => setMotto(e.target.value)}
                    maxLength={80}
                    placeholder="Будую українську бізнес-імперію!"
                    className="w-full px-3.5 py-2.5 rounded-xl premium-input text-sm font-bold outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
                  Оберіть вашу фірмову 3D-фішку:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                  {TOKENS.map((t) => {
                    const active = favoriteToken === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setFavoriteToken(t.id)}
                        className={`p-2 rounded-xl border-2 flex items-center gap-2 text-left transition cursor-pointer ${
                          active
                            ? 'border-blue-600 bg-blue-500/12 shadow-2xs'
                            : 'border-[var(--border-glass)] bg-[var(--surface-subtle)] hover:border-blue-500/40'
                        }`}
                      >
                        <TokenAvatar
                          token={t.id}
                          color={t.defaultColor}
                          size={26}
                        />
                        <span className="text-[10.5px] font-extrabold leading-tight truncate">
                          {t.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3.5 rounded-2xl mono-cta-btn font-display font-bold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shadow-lg"
              >
                <KeyRound className="w-4 h-4" />
                <span>
                  {busy
                    ? 'Створення профілю...'
                    : 'Зареєструвати Профіль Магната'}
                </span>
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
};
