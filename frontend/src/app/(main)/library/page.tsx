"use client";

import { useState } from "react";
import Link from "next/link";
import { Library, Play, BookOpen, Download, Upload, Plus } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { db, type LibraryRecord, type LibraryStatus } from "@/lib/db/dexie";
import { exportData, importData } from "@/lib/db/progress";

const LISTS: { value: LibraryStatus; label: string }[] = [
  { value: "watching", label: "Watching" },
  { value: "plan", label: "Plan to watch" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

function LibraryCard({ record }: { record: LibraryRecord }) {
  const href =
    record.kind === "anime"
      ? `/anime/${record.mediaId}`
      : `/manga/${record.mediaId}`;

  return (
    <Link
      href={href}
      className="group glass-panel flex gap-3 rounded-2xl p-3 transition-all hover:bg-white/5 hover:scale-[1.01]"
    >
      <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-xl bg-white/5">
        {record.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={record.coverUrl}
            alt={record.title}
            className="size-full object-cover"
          />
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
        <Badge
          variant="secondary"
          className="w-fit rounded-lg px-2 py-0.5 text-xs capitalize"
        >
          {record.kind}
        </Badge>
      </div>
    </Link>
  );
}

function LibraryTabContent({ status }: { status: LibraryStatus }) {
  const records = useLiveQuery(
    () => db.library.where("status").equals(status).toArray(),
    [status],
  );

  if (records === undefined) {
    return (
      <div className="flex flex-col gap-3 pt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/5" />
        ))}
      </div>
    );
  }

  if (records.length === 0) {
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
      {records.map((record) => (
        <LibraryCard key={record.id} record={record} />
      ))}
    </div>
  );
}

export default function LibraryPage() {
  const [exporting, setExporting] = useState(false);
  const totalCount = useLiveQuery(() => db.library.count(), []);

  async function handleExport() {
    setExporting(true);
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
    } finally {
      setExporting(false);
    }
  }

  async function handleImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const data = JSON.parse(text);
        await importData(data);
      } catch {
        alert("Invalid export file.");
      }
    };
    input.click();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Library"
        description={
          totalCount
            ? `${totalCount} title${totalCount !== 1 ? "s" : ""} in your library · stored on this device`
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
            <Button
              variant="outline"
              className="glass rounded-xl gap-2"
              onClick={handleImport}
            >
              <Upload className="size-4" />
              Import
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="watching">
        <TabsList className="glass rounded-xl">
          {LISTS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {LISTS.map(({ value }) => (
          <TabsContent key={value} value={value}>
            <LibraryTabContent status={value} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
