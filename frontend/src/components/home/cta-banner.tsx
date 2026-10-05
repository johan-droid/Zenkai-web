"use client";

import { Tv, BookOpen, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function CtaBanner() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-purple-500/20 bg-gradient-to-r from-purple-900/30 via-indigo-900/20 to-purple-950/40 p-8 sm:p-12">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-500/10 via-transparent to-transparent" />

      <div className="relative flex flex-col items-center justify-between gap-6 text-center md:flex-row md:text-left">
        <div className="flex max-w-xl flex-col gap-3">
          <h2 className="text-2xl font-black tracking-tight text-white sm:text-4xl">
            Ready to start your next adventure?
          </h2>
          <p className="text-sm text-purple-200/80 sm:text-base">
            Explore thousands of anime series, movies, and manga chapters. Track your history and resume instantly on any device.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" className="gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 font-semibold shadow-lg shadow-purple-600/30 hover:from-purple-500 hover:to-indigo-500" asChild>
            <Link href="/anime">
              <Tv className="size-4" />
              Browse Anime
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="glass gap-2 rounded-xl border-white/20 text-white hover:bg-white/10" asChild>
            <Link href="/manga">
              <BookOpen className="size-4" />
              Explore Manga
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
