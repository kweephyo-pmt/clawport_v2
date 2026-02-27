"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "@/app/providers";

const NAV_ITEMS = [
  { href: "/", icon: "🗺️", label: "Manor Map" },
  { href: "/chat", icon: "💬", label: "Messages" },
  { href: "/crons", icon: "⏰", label: "Cron Monitor" },
  { href: "/memory", icon: "🧠", label: "Memory" },
];

export function NavLinks() {
  const pathname = usePathname();
  const { theme } = useTheme();
  const [agentCount, setAgentCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setAgentCount(data.length);
        }
        // If the response is an error object, leave agentCount as null
        // so the badge simply won't render.
      })
      .catch(() => {
        // On failure, ensure we don't show a broken badge.
        // agentCount stays null, so the count badge is hidden.
        setAgentCount(null);
      });
  }, []);

  function getActiveStyle() {
    if (theme === "light") {
      return {
        background: 'rgba(0,122,255,0.10)',
        color: '#007AFF',
        boxShadow: 'inset 2px 0 0 #007AFF',
      };
    }
    if (theme === "color") {
      return {
        background: 'rgba(139,92,246,0.18)',
        color: '#C084FC',
        boxShadow: 'inset 2px 0 0 #C084FC',
      };
    }
    return {
      background: 'rgba(255,255,255,0.12)',
      color: '#FFFFFF',
      boxShadow: 'inset 2px 0 0 var(--accent)',
    };
  }

  return (
    <nav className="flex-1 flex flex-col">
      <div className="px-3 pt-2 pb-3">
        {/* Section header */}
        <div style={{
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.06em',
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase' as const,
          padding: '0 8px',
          marginBottom: '4px',
        }}>
          WORKSPACE
        </div>

        <div className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 no-underline"
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                style={{
                  height: '34px',
                  padding: '0 8px 0 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? getActiveStyle().color : 'var(--text-secondary)',
                  background: isActive ? getActiveStyle().background : 'transparent',
                  boxShadow: isActive ? getActiveStyle().boxShadow : 'none',
                  transition: 'all 100ms var(--ease-spring)',
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'var(--material-ultra-thin)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <span style={{
                  width: '20px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  flexShrink: 0,
                }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {item.href === "/" && agentCount !== null && (
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--fill-quaternary)',
                    color: 'var(--text-tertiary)',
                  }}>
                    {agentCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex-1" />

      {/* User footer */}
      <div style={{
        borderTop: '1px solid var(--separator)',
        padding: '10px 16px',
      }}>
        <div className="flex items-center gap-2.5">
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '7px',
            background: 'var(--fill-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            flexShrink: 0,
          }}>
            JR
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              John Rice
            </div>
            <div style={{
              fontSize: '11px',
              color: 'var(--text-tertiary)',
            }}>
              Owner
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
