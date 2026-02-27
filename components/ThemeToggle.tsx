'use client';
import { useRef, useCallback } from 'react';
import { THEMES } from '@/lib/themes';
import { useTheme } from '@/app/providers';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const buttons = containerRef.current?.querySelectorAll<HTMLButtonElement>('button');
    if (!buttons || buttons.length === 0) return;

    const currentIndex = THEMES.findIndex(t => t.id === theme);

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % THEMES.length;
      setTheme(THEMES[nextIndex].id);
      buttons[nextIndex].focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + THEMES.length) % THEMES.length;
      setTheme(THEMES[prevIndex].id);
      buttons[prevIndex].focus();
    }
  }, [theme, setTheme]);

  return (
    <div style={{ padding: '8px 16px 12px' }}>
      <div style={{
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.06em',
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase' as const,
        marginBottom: '6px',
        paddingLeft: '4px',
      }}>
        THEME
      </div>
      <div
        ref={containerRef}
        className="flex gap-1.5"
        role="radiogroup"
        aria-label="Theme selection"
        onKeyDown={handleKeyDown}
      >
        {THEMES.map(t => {
          const isActive = theme === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              title={t.label}
              role="radio"
              aria-checked={isActive}
              aria-label={`${t.label} theme`}
              tabIndex={isActive ? 0 : -1}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 150ms var(--ease-spring)',
                background: isActive ? 'var(--accent-fill)' : 'var(--fill-quaternary)',
                boxShadow: isActive ? '0 0 0 1.5px var(--accent)' : 'none',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.boxShadow = isActive
                  ? '0 0 0 1.5px var(--accent), 0 0 0 3px var(--system-blue)'
                  : '0 0 0 2px var(--system-blue)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = isActive
                  ? '0 0 0 1.5px var(--accent)'
                  : 'none';
              }}
            >
              {t.emoji}
            </button>
          );
        })}
      </div>
    </div>
  );
}
