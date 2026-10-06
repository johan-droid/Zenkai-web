"use client";

import { useState } from "react";
import { Monitor, Moon, Sun, Download, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { useMounted } from "@/hooks/use-debounce";
import { exportData, importData } from "@/lib/db/progress";
import { cn } from "@/lib/utils";

const THEMES = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
];

type DataStatus = "idle" | "busy" | "ok" | "error";

export function PreferencesPanel() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const [exportStatus, setExportStatus] = useState<DataStatus>("idle");
  const [importStatus, setImportStatus] = useState<DataStatus>("idle");

  async function handleExport() {
    setExportStatus("busy");
    try {
      const data = await exportData();
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
        const data = JSON.parse(text);
        await importData(data);
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
    <section className="glass-panel flex flex-col gap-5 rounded-2xl p-5 sm:p-6">
      <h2 className="text-base font-bold tracking-tight">Appearance</h2>

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
                  active && "border-brand-400/60 bg-brand-500/20",
                )}
              >
                <Icon />
                {option.label}
              </Button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Zenkai is dark-first; the glass surfaces are tuned for the dark palette.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Data
        </span>

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
                  : "Export all data"}
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
                  : "Import JSON"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Export saves all your watch history, reading progress, and library lists as a JSON file.
          Import merges it back — nothing is deleted.
        </p>
      </div>
    </section>
  );
}
