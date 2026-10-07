"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Download,
  HardDriveDownload,
  Library,
  Play,
  Upload,
  X,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  exportLibraryData,
  getLibraryCount,
  getLibraryEntries,
  importLibraryData,
  libraryState,
  parseImport,
  removeLibraryEntry,
  LIBRARY_STATUSES,
  type LibraryEntry,
  type LibraryStatus,
} from "@/lib/library";

/**
 * A library read that reports its own failure.
 *
 * `useLiveQuery` rethrows a rejected query, which would need an error boundary
 * to surface. Resolving to a result object instead keeps the failure as data,
 * so it can be rendered as a state rather than crashing the page — and so an
 * unreadable store is never mistaken for an empty library.
 */
type Read<T> = { ok: true; value: T } | { ok: false; error: unknown };

async function readOrFail<T>(load: () => Promise<T>): Promise<Read<T>> {
  try {
    return { ok: true, value: await load() };
  } catch (error) {
    return { ok: false, error };
  }
}

function LibraryCard({
  record,
  onRemove,
}: {
  record: LibraryEntry;
  onRemove: (record: LibraryEntry) => void;
}) {
  const href =
    record.kind === "anime" ? `/anime/${record.mediaId}` : `/manga/${record.mediaId}`;

  return (
    <div className="group glass-panel relative flex gap-3 rounded-2xl p-3 transition-all hover:bg-white/5">
      <Link href={href} className="flex min-w-0 flex-1 gap-3">
        <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-xl bg-white/5">
          {record.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={record.coverUrl} alt={record.title} className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center">
              {record.kind === "anime" ? (
                <Play className="size-5 text-muted-foreground" />
              ) : (
                <BookOpen className="size-5 text-muted-foreground" />
              )}
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <p className="truncate text-sm font-semibold">{record.title}</p>
          <Badge variant="secondary" className="w-fit rounded-lg px-2 py-0.5 text-xs capitalize">
            {record.kind}
          </Badge>
        </div>
      </Link>
      {/* P16: removal semantics. P11 records this as a requirement, and a list
          you can only add to is not a list.

          Always visible rather than hover-only: a hover-revealed control is
          invisible on a touch device, where there is no hover to reveal it. */}
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${record.title} from library`}
        title="Remove from library"
        className="absolute top-1.5 right-1.5 size-9 shrink-0 rounded-lg text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100"
        onClick={() => onRemove(record)}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

function LibraryTabContent({
  status,
  onRemove,
}: {
  status: LibraryStatus;
  onRemove: (record: LibraryEntry) => void;
}) {
  const read = useLiveQuery<Read<LibraryEntry[]>>(
    () => readOrFail(() => getLibraryEntries(status)),
    [status],
  );

  const state = libraryState({
    flags: {
      isLoading: read === undefined,
      isError: read !== undefined && !read.ok,
      error: read !== undefined && !read.ok ? read.error : undefined,
    },
    items: read !== undefined && read.ok ? read.value : undefined,
  });

  if (state.kind === "loading") {
    return (
      <div className="flex flex-col gap-3 pt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/5" />
        ))}
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="pt-8">
        <EmptyState
          icon={HardDriveDownload}
          title="Your library could not be read"
          description={state.message}
        />
      </div>
    );
  }

  if (state.kind === "empty") {
    return (
      <div className="pt-8">
        <EmptyState
          icon={Library}
          title="This list is empty"
          description="Visit any anime or manga detail page to add titles to your library."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pt-4">
      {state.items.map((record) => (
        <LibraryCard key={record.id} record={record} onRemove={onRemove} />
      ))}
    </div>
  );
}

export default function LibraryPage() {
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const totalCount = useLiveQuery(() => readOrFail(() => getLibraryCount()), []);

  async function handleRemove(record: LibraryEntry) {
    setNotice(null);
    try {
      await removeLibraryEntry({ kind: record.kind, mediaId: record.mediaId });
    } catch {
      // Never pretend it worked. A swallowed failure leaves the title on screen
      // looking like it was removed, which is worse than an error message.
      setNotice(`${record.title} could not be removed from your library.`);
    }
  }

  async function handleExport() {
    setExporting(true);
    setNotice(null);
    try {
      const data = await exportLibraryData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `zenkai-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setNotice("Your library could not be exported.");
    } finally {
      setExporting(false);
    }
  }

  async function handleImport() {
    setNotice(null);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        // Validated, never cast: an export file is untrusted, hand-editable
        // input and the one place a stream URL could reach storage.
        const payload = parseImport(JSON.parse(await file.text()));
        await importLibraryData(payload);
        setNotice(null);
      } catch {
        setNotice(
          "That file is not a Zenkai export, or it came from a different version. Nothing was imported.",
        );
      }
    };
    input.click();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Library"
        description={
          totalCount?.ok && totalCount.value
            ? `${totalCount.value} title${totalCount.value !== 1 ? "s" : ""} in your library · stored on this device`
            : "Your lists live on this device. No account needed."
        }
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="glass rounded-xl gap-2"
              onClick={handleExport}
              disabled={exporting}
            >
              <Download className="size-4" />
              {exporting ? "Exporting…" : "Export"}
            </Button>
            <Button variant="outline" className="glass rounded-xl gap-2" onClick={handleImport}>
              <Upload className="size-4" />
              Import
            </Button>
          </div>
        }
      />

      {notice ? (
        <p role="alert" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      <Tabs defaultValue="watching">
        <TabsList className="glass rounded-xl">
          {LIBRARY_STATUSES.map(({ value, label }) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {LIBRARY_STATUSES.map(({ value }) => (
          <TabsContent key={value} value={value}>
            <LibraryTabContent status={value} onRemove={handleRemove} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}