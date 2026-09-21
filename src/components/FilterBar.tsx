/* ============================================================
   Filter bar: a text search, a set of selects, and a clear action.
   ============================================================ */

import { Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { friendlyLabel } from '../data/labels';

export function FilterBar({
  children,
  activeCount,
  onClear,
  resultLabel,
}: {
  children: ReactNode;
  activeCount: number;
  onClear: () => void;
  resultLabel: string;
}) {
  return (
    <div className="filter-bar">
      <div className="filter-bar__controls">{children}</div>
      <div className="filter-bar__meta">
        <span className="filter-bar__count">{resultLabel}</span>
        {activeCount > 0 && (
          <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={onClear}>
            Clear {activeCount} filter{activeCount === 1 ? '' : 's'}
          </Button>
        )}
      </div>
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  width = 260,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  width?: number;
}) {
  return (
    <div className="search-field" style={{ width }}>
      <Search size={14} className="search-field__icon" aria-hidden="true" />
      <input
        type="search"
        className="input search-field__input"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  width,
}: {
  label: string;
  value: T | 'all';
  options: readonly T[];
  onChange: (v: T | 'all') => void;
  width?: number;
}) {
  const id = `sel-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="select-field" style={width ? { width } : undefined}>
      <label className="select-field__label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="input select"
        value={value}
        onChange={(e) => onChange(e.target.value as T | 'all')}
      >
        <option value="all">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {friendlyLabel(o)}
          </option>
        ))}
      </select>
    </div>
  );
}
