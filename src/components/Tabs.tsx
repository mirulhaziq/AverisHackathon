/* ============================================================
   Tabs, keyboard operable with the arrow keys.
   ============================================================ */

import { useRef, type ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: ReactNode;
}

export function Tabs({
  items,
  active,
  onChange,
  label,
  size = 'md',
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  const ref = useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent) {
    const i = items.findIndex((t) => t.id === active);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % items.length;
    if (e.key === 'ArrowLeft') next = (i - 1 + items.length) % items.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = items.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(items[next].id);
      const btns = ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      btns?.[next]?.focus();
    }
  }

  return (
    <div className={`tabs tabs--${size}`} role="tablist" aria-label={label} ref={ref} onKeyDown={onKeyDown}>
      {items.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            className={`tab${selected ? ' is-active' : ''}`}
            onClick={() => onChange(t.id)}
          >
            {t.icon && (
              <span className="tab__icon" aria-hidden="true">
                {t.icon}
              </span>
            )}
            <span>{t.label}</span>
            {t.count !== undefined && <span className="tab__count num">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  id,
  active,
  children,
}: {
  id: string;
  active: string;
  children: ReactNode;
}) {
  if (id !== active) return null;
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0} className="tab-panel">
      {children}
    </div>
  );
}
