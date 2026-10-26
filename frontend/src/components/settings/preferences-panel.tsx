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
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useMounted } from "@/hooks/use-debounce";
import { usePWA } from "@/components/providers/pwa-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { exportLibraryData, importLibraryData, parseImport } from "@/lib/library";
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
          </div>
        ) : (
          <div className="flex flex-col gap-4 rounded-xl border border-glass-border bg-black/20 p-4">
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

      {/* 3. Local Data Backup & Restore */}
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
