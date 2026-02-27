'use client';
import { useState, useEffect, useCallback } from 'react';
import { NavLinks } from '@/components/NavLinks';
import { ThemeToggle } from '@/components/ThemeToggle';
import { usePathname } from 'next/navigation';

export function MobileSidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close sidebar on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const toggle = useCallback(() => setOpen(prev => !prev), []);

  return (
    <>
      {/* Hamburger button — visible only on mobile */}
      <button
        onClick={toggle}
        className="md:hidden fixed top-3 left-3 z-[60]"
        aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={open}
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          background: 'var(--material-regular)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--separator)',
          cursor: 'pointer',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <span
          style={{
            display: 'block',
            width: 16,
            height: 1.5,
            borderRadius: 1,
            background: 'var(--text-secondary)',
            transition: 'transform 200ms ease, opacity 200ms ease',
            transform: open ? 'translateY(2.75px) rotate(45deg)' : 'none',
          }}
        />
        <span
          style={{
            display: 'block',
            width: 16,
            height: 1.5,
            borderRadius: 1,
            background: 'var(--text-secondary)',
            transition: 'transform 200ms ease, opacity 200ms ease',
            opacity: open ? 0 : 1,
          }}
        />
        <span
          style={{
            display: 'block',
            width: 16,
            height: 1.5,
            borderRadius: 1,
            background: 'var(--text-secondary)',
            transition: 'transform 200ms ease, opacity 200ms ease',
            transform: open ? 'translateY(-2.75px) rotate(-45deg)' : 'none',
          }}
        />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-[50]"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-out sidebar */}
      <aside
        className="md:hidden fixed top-0 left-0 bottom-0 z-[55] flex flex-col"
        style={{
          width: 260,
          background: 'var(--sidebar-bg)',
          backdropFilter: 'var(--sidebar-backdrop)',
          WebkitBackdropFilter: 'var(--sidebar-backdrop)',
          borderRight: '1px solid var(--separator)',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 250ms var(--ease-smooth)',
          boxShadow: open ? 'var(--shadow-overlay)' : 'none',
        }}
        aria-hidden={!open}
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
    </>
  );
}
