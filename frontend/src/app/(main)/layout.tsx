import { AuroraBackground } from "@/components/layout/aurora-background";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { IntroAnimation } from "@/components/intro/IntroAnimation";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-surface-0 text-ink-1">
      <IntroAnimation />
      <AuroraBackground />
      <Navbar />
      <main className="container-page relative z-10 min-w-0 flex-1 pb-28 pt-4 md:pb-16">
        {children}
      </main>
      <Footer />
      <MobileNav />
    </div>
  );
}
