import { Database } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { API_LIST } from "@/config/api-list";

/** Renders the central API registry so it is visible and auditable in-app. */
export function ApiListPanel() {
  return (
    <section className="glass-panel flex flex-col gap-4 rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Database className="size-4 text-brand-400" />
        <h2 className="text-base font-bold tracking-tight">Data sources</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Every external API Zenkai talks to. Metadata providers are public APIs; no scraping or
        unlicensed aggregators are registered.
      </p>

      <div className="flex flex-col divide-y divide-glass-border">
        {API_LIST.map((api) => (
          <div
            key={api.id}
            className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{api.name}</span>
                <Badge
                  variant="secondary"
                  className={
                    api.status === "wired"
                      ? "rounded-lg bg-brand-500/20 text-brand-200"
                      : "rounded-lg"
                  }
                >
                  {api.status}
                </Badge>
                {api.auth === "required" ? (
                  <Badge variant="secondary" className="rounded-lg">
                    key: {api.envKey}
                  </Badge>
                ) : null}
              </div>
              <span className="text-xs text-muted-foreground">{api.purpose}</span>
            </div>
            <code className="shrink-0 truncate text-xs text-muted-foreground/70">
              {api.endpoint}
            </code>
          </div>
        ))}
      </div>
    </section>
  );
}
