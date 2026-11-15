"use client";

import { useEffect, useState } from "react";
import {
  Monitor,
  Moon,
  Sun,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  User,
  RefreshCw,
  LogOut,
  Layers,
  BookOpen,
  Sparkles,
  Sliders,
  FastForward,
  Link2,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useMounted } from "@/hooks/use-debounce";
import { usePWA } from "@/components/providers/pwa-provider";
import { useAuth } from "@/components/providers/auth-provider";
import {
  fetchLinkedAccounts,
  unlinkOAuthAccount,
  getGoogleOAuthUrl,
  getAnilistOAuthUrl,
  type LinkedAccountItem,
} from "@/lib/api/auth";
import { exportLibraryData, importLibraryData, parseImport } from "@/lib/library";
import { usePlayerStore } from "@/stores/player";
import {
  getDevicePreferences,
  setCardDensity,
  setReaderLayout,
  setMotionPreference,
  type CardDensity,
  type ReaderLayout,
  type MotionPreference,
} from "@/lib/preferences";
import { cn } from "@/lib/utils";

const THEMES = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
];

const CARD_DENSITIES: Array<{ value: CardDensity; label: string; desc: string }> = [
  { value: "comfortable", label: "Comfortable", desc: "Spacious layout with rich previews" },
  { value: "compact", label: "Compact", desc: "Dense grid showing more titles" },
];

const READER_MODES: Array<{ value: ReaderLayout; label: string; desc: string }> = [
  { value: "rtl", label: "Right to Left", desc: "Traditional Japanese manga flow" },
  { value: "ltr", label: "Left to Right", desc: "Standard comic & book flow" },
  { value: "vertical", label: "Vertical Scroll", desc: "Continuous Webtoon & Manhwa flow" },
];

const MOTION_OPTIONS: Array<{ value: MotionPreference; label: string }> = [
  { value: "system", label: "System default" },
  { value: "reduced", label: "Reduce motion" },
  { value: "full", label: "Full animation" },
];

type DataStatus = "idle" | "busy" | "ok" | "error";

export function PreferencesPanel() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const { isInstallable, isStandalone, installPWA } = usePWA();
  const { user, isAuthenticated, isSyncing, lastSyncedAt, login, register, logout, syncNow } = useAuth();

  // Playback Automation preferences (Phase 1)
  const autoSkipIntro = usePlayerStore((s) => s.autoSkipIntro);
  const setAutoSkipIntro = usePlayerStore((s) => s.setAutoSkipIntro);
  const autoSkipOutro = usePlayerStore((s) => s.autoSkipOutro);
  const setAutoSkipOutro = usePlayerStore((s) => s.setAutoSkipOutro);
  const autoplayNext = usePlayerStore((s) => s.autoplayNext);
  const setAutoplayNext = usePlayerStore((s) => s.setAutoplayNext);
  const nextEpisodeCountdown = usePlayerStore((s) => s.nextEpisodeCountdown);
  const setNextEpisodeCountdown = usePlayerStore((s) => s.setNextEpisodeCountdown);
  const showSkipButtons = usePlayerStore((s) => s.showSkipButtons);
  const setShowSkipButtons = usePlayerStore((s) => s.setShowSkipButtons);

  // Local device preferences
  const [density, setDensityState] = useState<CardDensity>("comfortable");
  const [readerLayout, setReaderLayoutState] = useState<ReaderLayout>("rtl");
  const [motion, setMotionState] = useState<MotionPreference>("system");

  // Export / Import state
  const [exportStatus, setExportStatus] = useState<DataStatus>("idle");
  const [importStatus, setImportStatus] = useState<DataStatus>("idle");

  // Auth Form State (when guest)
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authLogin, setAuthLogin] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regDisplayName, setRegDisplayName] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // External Linked Accounts
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccountItem[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      setLoadingAccounts(true);
      fetchLinkedAccounts()
        .then((res) => setLinkedAccounts(res.accounts || []))
        .catch(() => setLinkedAccounts([]))
        .finally(() => setLoadingAccounts(false));
    } else {
      setLinkedAccounts([]);
    }
  }, [isAuthenticated]);

  const handleUnlink = async (provider: string) => {
    try {
      await unlinkOAuthAccount(provider);
      setLinkedAccounts((prev) => prev.filter((a) => a.provider !== provider));
      toast.success(`${provider === "google" ? "Google" : "AniList"} account disconnected`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Failed to disconnect ${provider}`;
      toast.error(msg);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const prefs = getDevicePreferences();
      // Hydrate from localStorage after mount; reading it during render would
      // cause an SSR/client mismatch.
      /* eslint-disable react-hooks/set-state-in-effect */
      setDensityState(prefs.cardDensity);
      setReaderLayoutState(prefs.readerLayout);
      setMotionState(prefs.motionPreference);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, []);

  const handleDensityChange = (val: CardDensity) => {
    setDensityState(val);
    setCardDensity(val);
  };

  const handleReaderChange = (val: ReaderLayout) => {
    setReaderLayoutState(val);
    setReaderLayout(val);
  };

  const handleMotionChange = (val: MotionPreference) => {
    setMotionState(val);
    setMotionPreference(val);
  };

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    try {
      if (authMode === "login") {
        if (!authLogin || !authPassword) {
          throw new Error("Please enter both username/email and password");
        }
        await login({ login: authLogin, password: authPassword });
        setAuthPassword("");
      } else {
        if (!regUsername || !regEmail || !authPassword) {
          throw new Error("Username, email, and password are required");
        }
        await register({
          username: regUsername,
          email: regEmail,
          password: authPassword,
          displayName: regDisplayName || undefined,
        });
        setAuthPassword("");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleExport() {
    setExportStatus("busy");
    try {
      const data = await exportLibraryData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zenkai-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportStatus("ok");
      setTimeout(() => setExportStatus("idle"), 3000);
    } catch {
      setExportStatus("error");
      setTimeout(() => setExportStatus("idle"), 3000);
    }
  }

  async function handleImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setImportStatus("busy");
      try {
        const text = await file.text();
        const data = parseImport(JSON.parse(text));
        await importLibraryData(data);
        setImportStatus("ok");
        setTimeout(() => setImportStatus("idle"), 3000);
      } catch {
        setImportStatus("error");
        setTimeout(() => setImportStatus("idle"), 3000);
      }
    };
    input.click();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Account & Cross-Device Cloud Sync */}
      <section className="glass-panel flex flex-col gap-5 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl border border-glass-border bg-[#c8102e]/10 text-[#ff4d6a]">
              <User className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Account & Cloud Sync</h2>
              <p className="text-xs text-muted-foreground">
                Synchronize your library and watch progress with your official Zenkai account.
              </p>
            </div>
          </div>
          {isAuthenticated ? (
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              Synced
            </Badge>
          ) : (
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400">
              Local Only
            </Badge>
          )}
        </div>

        {isAuthenticated && user ? (
          <div className="flex flex-col gap-4 rounded-xl border border-glass-border bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">
                  {user.displayName || user.username}
                </p>
                <p className="text-xs text-muted-foreground">
                  @{user.username} · {user.email}
                </p>
                {lastSyncedAt ? (
                  <p className="mt-1 text-[0.7rem] text-muted-foreground">
                    Last synchronized: {lastSyncedAt.toLocaleTimeString()} ({lastSyncedAt.toLocaleDateString()})
                  </p>
                ) : (
                  <p className="mt-1 text-[0.7rem] text-muted-foreground">Not synchronized yet</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void syncNow()}
                  disabled={isSyncing}
                  className="glass gap-2 rounded-xl border-glass-border hover:bg-white/10"
                >
                  <RefreshCw className={cn("size-3.5", isSyncing && "animate-spin text-[#ff4d6a]")} />
                  <span>{isSyncing ? "Syncing…" : "Sync Now"}</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void logout()}
                  className="gap-2 rounded-xl text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                >
                  <LogOut className="size-3.5" />
                  <span>Log out</span>
                </Button>
              </div>
            </div>

            {/* Connected Identities (Google & AniList) */}
            <div className="flex flex-col gap-2.5 border-t border-glass-border pt-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Connected Identities
              </span>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {/* Google Account */}
                {(() => {
                  const google = linkedAccounts.find((a) => a.provider === "google");
                  return (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-glass-border bg-white/[0.03] p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-md bg-white/10 font-bold text-xs text-white">
                          G
                        </span>
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-foreground">Google</span>
                          <span className="text-[0.65rem] text-muted-foreground truncate max-w-[120px]">
                            {google ? (google.providerEmail || "Connected") : "Not linked"}
                          </span>
                        </div>
                      </div>
                      {google ? (
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[0.65rem]">
                          Linked
                        </Badge>
                      ) : (
                        <a
                          href={getGoogleOAuthUrl()}
                          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[0.7rem] font-medium text-foreground hover:bg-white/10 transition-colors"
                        >
                          <Link2 className="size-3" />
                          Link
                        </a>
                      )}
                    </div>
                  );
                })()}

                {/* AniList Account */}
                {(() => {
                  const anilist = linkedAccounts.find((a) => a.provider === "anilist");
                  return (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-glass-border bg-white/[0.03] p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-md bg-[#02A9FF]/20 font-bold text-xs text-[#02A9FF]">
                          AL
                        </span>
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-foreground">AniList</span>
                          <span className="text-[0.65rem] text-muted-foreground truncate max-w-[120px]">
                            {anilist ? `@${anilist.providerUsername || anilist.providerUserId}` : "Not linked"}
                          </span>
                        </div>
                      </div>
                      {anilist ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleUnlink("anilist")}
                          className="h-6 gap-1 px-2 text-[0.65rem] text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                        >
                          <Unlink className="size-3" />
                          Unlink
                        </Button>
                      ) : (
                        <a
                          href={getAnilistOAuthUrl()}
                          className="inline-flex items-center gap-1 rounded-md border border-[#02A9FF]/30 bg-[#02A9FF]/10 px-2 py-1 text-[0.7rem] font-medium text-[#02A9FF] hover:bg-[#02A9FF]/20 transition-colors"
                        >
                          <Link2 className="size-3" />
                          Connect
                        </a>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 rounded-xl border border-glass-border bg-black/20 p-4">
            {/* Google Fast Sign-in */}
            <a
              href={getGoogleOAuthUrl()}
              className="flex items-center justify-center gap-2.5 rounded-xl border border-white/20 bg-white/10 py-2.5 text-xs font-semibold text-white transition-all hover:bg-white/15 active:scale-[0.99]"
            >
              <svg className="size-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
            </a>

            <div className="relative flex items-center justify-center my-1">
              <span className="w-full border-t border-glass-border" />
              <span className="absolute bg-[#0c0c14] px-2 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                or with email
              </span>
            </div>
            <div className="flex gap-2 border-b border-glass-border pb-3">
              <Button
                variant={authMode === "login" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => {
                  setAuthMode("login");
                  setAuthError(null);
                }}
                className={cn("rounded-lg text-xs font-semibold", authMode === "login" && "bg-white/10")}
              >
                Sign In
              </Button>
              <Button
                variant={authMode === "register" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => {
                  setAuthMode("register");
                  setAuthError(null);
                }}
                className={cn("rounded-lg text-xs font-semibold", authMode === "register" && "bg-white/10")}
              >
                Create Account
              </Button>
            </div>

            <form onSubmit={handleAuthSubmit} className="flex flex-col gap-3">
              {authError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
                  <AlertCircle className="size-4 shrink-0 text-red-400" />
                  <span>{authError}</span>
                </div>
              )}

              {authMode === "login" ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Username or Email</label>
                    <Input
                      type="text"
                      placeholder="e.g. goku or goku@dbz.com"
                      value={authLogin}
                      onChange={(e) => setAuthLogin(e.target.value)}
                      required
                      className="glass rounded-xl"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Password</label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      required
                      className="glass rounded-xl"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Username</label>
                      <Input
                        type="text"
                        placeholder="goku"
                        value={regUsername}
                        onChange={(e) => setRegUsername(e.target.value)}
                        required
                        className="glass rounded-xl"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Display Name</label>
                      <Input
                        type="text"
                        placeholder="Son Goku (optional)"
                        value={regDisplayName}
                        onChange={(e) => setRegDisplayName(e.target.value)}
                        className="glass rounded-xl"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Email</label>
                    <Input
                      type="email"
                      placeholder="goku@example.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      required
                      className="glass rounded-xl"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Password (min 8 chars)</label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      required
                      className="glass rounded-xl"
                    />
                  </div>
                </>
              )}

              <Button
                type="submit"
                disabled={authLoading}
                className="mt-2 w-full rounded-xl bg-[#c8102e] font-semibold text-white hover:bg-[#a00d24] sm:w-auto"
              >
                {authLoading ? "Authenticating…" : authMode === "login" ? "Sign In & Merge Data" : "Register & Start Syncing"}
              </Button>
            </form>
          </div>
        )}
      </section>

      {/* 2. Device-Specific Preferences */}
      <section className="glass-panel flex flex-col gap-6 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl border border-glass-border bg-white/5 text-foreground">
            <Sliders className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight">Device Preferences</h2>
            <p className="text-xs text-muted-foreground">
              These settings control presentation on this device only and do not leak across devices.
            </p>
          </div>
        </div>

        {/* Theme */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Theme
          </span>
          <div className="flex gap-2">
            {THEMES.map((option) => {
              const Icon = option.icon;
              const active = mounted && theme === option.value;
              return (
                <Button
                  key={option.value}
                  variant="outline"
                  onClick={() => setTheme(option.value)}
                  aria-pressed={active}
                  className={cn(
                    "glass rounded-xl",
                    active && "border-[#c8102e]/60 bg-[#c8102e]/20 text-white font-medium",
                  )}
                >
                  <Icon className="size-4" />
                  {option.label}
                </Button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Zenkai is dark-first; the glass surfaces are tuned for the dark palette.
          </p>
        </div>

        {/* Card Density */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Card Density
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CARD_DENSITIES.map((opt) => {
              const active = density === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleDensityChange(opt.value)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-xl border border-glass-border p-3 text-left transition-all",
                    active
                      ? "border-[#c8102e]/60 bg-[#c8102e]/10 text-foreground"
                      : "bg-black/20 text-muted-foreground hover:bg-white/5 hover:text-foreground",
                  )}
                >
                  <span className="text-sm font-semibold">{opt.label}</span>
                  <span className="text-xs text-muted-foreground">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Manga Reader Default */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Manga / Comic Reader Default
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {READER_MODES.map((opt) => {
              const active = readerLayout === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleReaderChange(opt.value)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-xl border border-glass-border p-3 text-left transition-all",
                    active
                      ? "border-[#c8102e]/60 bg-[#c8102e]/10 text-foreground"
                      : "bg-black/20 text-muted-foreground hover:bg-white/5 hover:text-foreground",
                  )}
                >
                  <span className="text-sm font-semibold">{opt.label}</span>
                  <span className="text-xs text-muted-foreground">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Motion & Accessibility */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Motion & Accessibility
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {MOTION_OPTIONS.map((opt) => {
              const active = motion === opt.value;
              return (
                <Button
                  key={opt.value}
                  variant="outline"
                  size="sm"
                  onClick={() => handleMotionChange(opt.value)}
                  className={cn(
                    "glass rounded-xl",
                    active && "border-[#c8102e]/60 bg-[#c8102e]/20 text-white font-medium",
                  )}
                >
                  {opt.label}
                </Button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Respects system accessibility settings. Setting to &ldquo;Reduce motion&rdquo; disables nonessential backdrop animations and carousels.
          </p>
        </div>
      </section>

      {/* 3. Playback Automation Preferences (Phase 1) */}
      <section className="glass-panel flex flex-col gap-6 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl border border-glass-border bg-[#c8102e]/10 text-[#ff4d6a]">
            <FastForward className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight">Playback Automation</h2>
            <p className="text-xs text-muted-foreground">
              Intelligent intro, outro, and next episode transitions for supported video providers.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Auto Skip Intro */}
          <div className="flex flex-col justify-between rounded-xl border border-glass-border bg-black/20 p-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-foreground">Auto Skip Intro</span>
              <p className="text-xs text-muted-foreground">
                Skip verified opening intro automatically when detected.
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between pt-2 border-t border-glass-border">
              <span className="text-xs font-medium text-muted-foreground">
                Status: {mounted ? (autoSkipIntro ? "Enabled" : "Disabled") : "—"}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoSkipIntro(!autoSkipIntro)}
                className={cn(
                  "glass rounded-xl text-xs font-semibold",
                  autoSkipIntro && "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                )}
              >
                {autoSkipIntro ? "ON" : "OFF"}
              </Button>
            </div>
          </div>

          {/* Auto Skip Outro */}
          <div className="flex flex-col justify-between rounded-xl border border-glass-border bg-black/20 p-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-foreground">Auto Skip Outro</span>
              <p className="text-xs text-muted-foreground">
                Skip verified ending credits or outro when detected.
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between pt-2 border-t border-glass-border">
              <span className="text-xs font-medium text-muted-foreground">
                Status: {mounted ? (autoSkipOutro ? "Enabled" : "Disabled") : "—"}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoSkipOutro(!autoSkipOutro)}
                className={cn(
                  "glass rounded-xl text-xs font-semibold",
                  autoSkipOutro && "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                )}
              >
                {autoSkipOutro ? "ON" : "OFF"}
              </Button>
            </div>
          </div>

          {/* Auto Play Next Episode */}
          <div className="flex flex-col justify-between rounded-xl border border-glass-border bg-black/20 p-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-foreground">Auto Play Next Episode</span>
              <p className="text-xs text-muted-foreground">
                Automatically queue and play the next canonical episode upon completion.
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between pt-2 border-t border-glass-border">
              <span className="text-xs font-medium text-muted-foreground">
                Status: {mounted ? (autoplayNext ? "Enabled" : "Disabled") : "—"}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoplayNext(!autoplayNext)}
                className={cn(
                  "glass rounded-xl text-xs font-semibold",
                  autoplayNext && "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                )}
              >
                {autoplayNext ? "ON" : "OFF"}
              </Button>
            </div>
          </div>

          {/* Manual Skip Buttons */}
          <div className="flex flex-col justify-between rounded-xl border border-glass-border bg-black/20 p-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-foreground">Manual Skip Buttons</span>
              <p className="text-xs text-muted-foreground">
                Display floating &ldquo;Skip Intro&rdquo; and &ldquo;Skip Outro&rdquo; buttons when auto-skip is disabled.
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between pt-2 border-t border-glass-border">
              <span className="text-xs font-medium text-muted-foreground">
                Status: {mounted ? (showSkipButtons ? "Visible" : "Hidden") : "—"}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSkipButtons(!showSkipButtons)}
                className={cn(
                  "glass rounded-xl text-xs font-semibold",
                  showSkipButtons && "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                )}
              >
                {showSkipButtons ? "ON" : "OFF"}
              </Button>
            </div>
          </div>
        </div>

        {/* Countdown Duration */}
        <div className="flex flex-col gap-2 rounded-xl border border-glass-border bg-black/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-semibold text-foreground">Next Episode Countdown</span>
              <p className="text-xs text-muted-foreground">
                Delay duration before automatically launching the next episode.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            {[
              { label: "Instant (0s)", value: 0 },
              { label: "5 seconds", value: 5 },
              { label: "10 seconds (Default)", value: 10 },
              { label: "15 seconds", value: 15 },
            ].map((option) => {
              const active = mounted && nextEpisodeCountdown === option.value;
              return (
                <Button
                  key={option.value}
                  variant="outline"
                  size="sm"
                  onClick={() => setNextEpisodeCountdown(option.value)}
                  className={cn(
                    "glass rounded-xl text-xs font-semibold",
                    active && "border-[#c8102e]/60 bg-[#c8102e]/20 text-white font-medium"
                  )}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. Local Data Backup & Restore */}
      <section className="glass-panel flex flex-col gap-5 rounded-2xl p-5 sm:p-6">
        <h2 className="text-base font-bold tracking-tight">Backup & Restore</h2>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="glass rounded-xl gap-2"
              onClick={handleExport}
              disabled={exportStatus === "busy"}
            >
              {exportStatus === "ok" ? (
                <CheckCircle2 className="size-4 text-green-400" />
              ) : exportStatus === "error" ? (
                <AlertCircle className="size-4 text-red-400" />
              ) : (
                <Download className="size-4" />
              )}
              {exportStatus === "busy"
                ? "Exporting…"
                : exportStatus === "ok"
                  ? "Exported!"
                  : exportStatus === "error"
                    ? "Failed"
                    : "Export JSON Backup"}
            </Button>

            <Button
              variant="outline"
              className="glass rounded-xl gap-2"
              onClick={handleImport}
              disabled={importStatus === "busy"}
            >
              {importStatus === "ok" ? (
                <CheckCircle2 className="size-4 text-green-400" />
              ) : importStatus === "error" ? (
                <AlertCircle className="size-4 text-red-400" />
              ) : (
                <Upload className="size-4" />
              )}
              {importStatus === "busy"
                ? "Importing…"
                : importStatus === "ok"
                  ? "Imported!"
                  : importStatus === "error"
                    ? "Invalid file"
                    : "Import JSON Backup"}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Export saves all your watch history, reading progress, and library lists as a JSON file.
            Import merges it back — nothing is deleted.
          </p>
        </div>
      </section>

      {/* 4. Application / PWA */}
      <section className="glass-panel flex flex-col gap-5 rounded-2xl p-5 sm:p-6">
        <h2 className="text-base font-bold tracking-tight">Application</h2>

        {isStandalone ? (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <CheckCircle2 className="size-4" />
            <span>Zenkai is running as an installed PWA.</span>
          </div>
        ) : isInstallable ? (
          <Button
            variant="outline"
            className="glass w-fit gap-2 rounded-xl border-[#c8102e]/40 text-[#ff4d6a] hover:bg-[#c8102e]/10 hover:text-white"
            onClick={installPWA}
          >
            <Download className="size-4" />
            Install Zenkai App
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Progressive Web App installation is supported on Chromium and WebKit browsers.
          </p>
        )}
      </section>
    </div>
  );
}
