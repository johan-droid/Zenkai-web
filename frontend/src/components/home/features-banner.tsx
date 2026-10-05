"use client";

import { Zap, Cpu, PlayCircle, Sparkles, Layers } from "lucide-react";

const FEATURES = [
  {
    icon: Zap,
    title: "Instant Streaming",
    description: "Ultra-fast playback with auto source resolution & fallback servers.",
    color: "from-amber-500/20 to-orange-500/20 text-amber-400 border-amber-500/30",
  },
  {
    icon: PlayCircle,
    title: "Skip Controls",
    description: "Intro and outro skip markers for uninterrupted binge watching.",
    color: "from-purple-500/20 to-indigo-500/20 text-purple-400 border-purple-500/30",
  },
  {
    icon: Cpu,
    title: "Local DB Sync",
    description: "Your watch progress & bookmark history saved securely on your device.",
    color: "from-blue-500/20 to-cyan-500/20 text-cyan-400 border-cyan-500/30",
  },
  {
    icon: Layers,
    title: "Canonical Metadata",
    description: "Scores, episode listings and status from the Zenkai backend's validated catalogue.",
    color: "from-emerald-500/20 to-teal-500/20 text-emerald-400 border-emerald-500/30",
  },
];

export function FeaturesBanner() {
  return (
    <section id="features" className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-purple-950/20 via-background to-background p-6 sm:p-10">
      <div className="absolute -right-20 -top-20 size-72 rounded-full bg-purple-600/10 blur-3xl" />
      <div className="absolute -left-20 -bottom-20 size-72 rounded-full bg-indigo-600/10 blur-3xl" />

      <div className="relative flex flex-col gap-8">
        <div className="flex flex-col items-start gap-2 max-w-2xl">
          <div className="flex items-center gap-2 rounded-full bg-purple-500/10 px-3 py-1 text-xs font-semibold text-purple-300 ring-1 ring-purple-500/20">
            <Sparkles className="size-3.5" />
            <span>Next-Gen Platform</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
            Built for modern anime & manga enthusiasts
          </h2>
          <p className="text-sm text-muted-foreground sm:text-base">
            Enjoy zero ads, high bitrate video playback, seamless subtitle toggling, and fast local progress tracking.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <div
                key={idx}
                className="group relative flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-purple-500/40 hover:bg-white/10 hover:shadow-xl hover:shadow-purple-500/10"
              >
                <div className={`flex size-11 items-center justify-center rounded-xl bg-gradient-to-br border ${feature.color}`}>
                  <Icon className="size-5" />
                </div>
                <h3 className="text-base font-bold text-foreground">{feature.title}</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
