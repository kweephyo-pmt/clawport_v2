import type { Metadata } from "next";
import "./globals.css";
import { NavLinks } from "@/components/NavLinks";
import { ThemeProvider } from "./providers";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileSidebar } from "@/components/MobileSidebar";

export const metadata: Metadata = {
  title: "Manor — Command Centre",
  description: "AI Agent Management Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
            {/* Desktop sidebar — hidden on mobile */}
            <aside
              className="hidden md:flex w-[220px] flex-shrink-0 flex-col"
              style={{
                background: 'var(--sidebar-bg)',
                backdropFilter: 'var(--sidebar-backdrop)',
                WebkitBackdropFilter: 'var(--sidebar-backdrop)',
                borderRight: '1px solid var(--separator)',
              }}
            >
              {/* App icon + title */}
              <div className="px-4 pt-5 pb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 flex items-center justify-center text-lg"
                    style={{
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #f5c518, #e8b800)',
                      boxShadow: 'var(--shadow-card)',
                    }}
                  >
                    🏰
                  </div>
                  <div>
                    <div style={{
                      fontSize: '17px',
                      fontWeight: 600,
                      letterSpacing: '-0.3px',
                      color: 'var(--text-primary)',
                    }}>
                      Manor
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      letterSpacing: '0.01em',
                    }}>
                      Command Centre
                    </div>
                  </div>
                </div>
              </div>

              <NavLinks />
              <ThemeToggle />
            </aside>

            {/* Mobile sidebar */}
            <MobileSidebar />

            <main className="flex-1 overflow-hidden relative">
              {/* Glass background orbs — only visible in glass theme */}
              <div className="pointer-events-none fixed inset-0 overflow-hidden glass-orbs" aria-hidden="true">
                <div style={{
                  position: 'absolute', top: '15%', left: '20%',
                  width: 400, height: 400, borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
                  filter: 'blur(40px)',
                }} />
                <div style={{
                  position: 'absolute', top: '55%', right: '15%',
                  width: 320, height: 320, borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(245,197,24,0.08) 0%, transparent 70%)',
                  filter: 'blur(40px)',
                }} />
                <div style={{
                  position: 'absolute', bottom: '20%', left: '40%',
                  width: 280, height: 280, borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(59,158,255,0.09) 0%, transparent 70%)',
                  filter: 'blur(40px)',
                }} />
              </div>
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
