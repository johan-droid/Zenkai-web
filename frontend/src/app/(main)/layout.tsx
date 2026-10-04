import { AuroraBackground } from "@/components/layout/aurora-background";
import { Footer } from "@/components/layout/footer";
import { MobileNav } from "@/components/layout/mobile-nav";
import { HyprlandDock } from "@/components/layout/hyprland-dock";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col antialiased">
      <AuroraBackground />
      <HyprlandDock />
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 px-4 sm:px-6">
        <main className="min-w-0 flex-1 py-6">{children}</main>
      </div>
      <Footer />
      <MobileNav />
    </div>
  );
}
