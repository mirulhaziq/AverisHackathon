/* ============================================================
   App shell: left navigation rail, top bar with global search and
   the signed-in user, and a bottom bar on phones.
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Download,
  History,
  Inbox,
  Layers,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Monitor,
  Moon,
  CircleHelp,
  Search,
  Settings2,
  Sun,
  Undo2,
  X,
} from 'lucide-react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useStore, type Capability, type ThemePref } from '../state/store';
import type { Role } from '../types';
import { IconButton } from './Button';
import { ToastStack } from './feedback';
import { friendlyLabel } from '../data/labels';
import { TideMark } from './Brand';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: number;
  capability?: Capability;
}

export function AppShell({ children, title }: { children: React.ReactNode; title: string }) {
  const { user, tasks, can, signOut, themePref, setThemePref, switchRole, resetSampleData } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const openTasks = tasks.length;

  const mainNav: NavItem[] = [
    { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { to: '/inbox', label: 'All emails', icon: Inbox },
    { to: '/review', label: 'Needs review', icon: ListChecks, badge: openTasks },
    { to: '/batches', label: 'Email imports', icon: Layers },
    { to: '/export', label: 'Download results', icon: Download },
  ];

  const adminNav: NavItem[] = [
    { to: '/configuration', label: 'Settings', icon: Settings2, capability: 'configure' },
    { to: '/audit', label: 'Activity history', icon: History, capability: 'viewAudit' },
  ];

  const visibleAdmin = adminNav.filter((n) => !n.capability || can(n.capability));

  useEffect(() => {
    setMenuOpen(false);
    setSheetOpen(false);
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    if (!sheetOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = sheetRef.current;
    const controls = () => panel?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)');
    controls()?.[0]?.focus();
    function trapFocus(event: KeyboardEvent) {
      if (event.key !== 'Tab') return;
      const items = controls();
      if (!items?.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
    panel?.addEventListener('keydown', trapFocus);
    return () => { panel?.removeEventListener('keydown', trapFocus); previous?.focus(); };
  }, [sheetOpen]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setSheetOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const themeOptions: Array<{ id: ThemePref; label: string; icon: typeof Sun }> = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      {/* ---------- rail ---------- */}
      <nav className="rail" aria-label="Sections">
        <Link to="/dashboard" className="rail__brand">
          <span className="rail__mark" aria-hidden="true">
            <TideMark />
          </span>
          <span className="rail__brand-text">
            <strong>Tidemark</strong>
            <span>DOCUMENT INTELLIGENCE</span>
          </span>
        </Link>

        <div className="rail__workspace"><span className="workspace-dot" /> Shipping workspace <span className="mono">01</span></div>
        <p className="rail__group-title">WORKSPACE</p>
        <ul className="rail__list">
          {mainNav.map((n) => (
            <li key={n.to}>
              <NavLink to={n.to} className={({ isActive }) => `rail__link${isActive ? ' is-active' : ''}`}>
                <n.icon size={16} aria-hidden="true" />
                <span>{n.label}</span>
                {n.badge !== undefined && n.badge > 0 && (
                  <span className="rail__badge num" aria-label={`${n.badge} open tasks`}>
                    {n.badge}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        {visibleAdmin.length > 0 && (
          <div className="rail__group">
            <p className="rail__group-title">Admin</p>
            <ul className="rail__list">
              {visibleAdmin.map((n) => (
                <li key={n.to}>
                  <NavLink to={n.to} className={({ isActive }) => `rail__link${isActive ? ' is-active' : ''}`}>
                    <n.icon size={16} aria-hidden="true" />
                    <span>{n.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rail__foot">
          <div className="rail__manifesto"><TideMark /><p>Clear documents.<br />Confident departures.</p></div>
          <NavLink to="/help" className={({ isActive }) => `rail__link rail__link--quiet${isActive ? ' is-active' : ''}`}>
            <CircleHelp size={18} aria-hidden="true" />
            <span>Help & guidance</span>
          </NavLink>
          <p className="rail__demo">Demo workspace · Sample data</p>
        </div>
      </nav>

      {/* ---------- top bar ---------- */}
      <header className="topbar">
        <div className="topbar__left">
          <IconButton label="Open navigation" className="topbar__menu" onClick={() => setSheetOpen(true)}>
            <Menu size={18} />
          </IconButton>
          <span className="topbar__context">Workspace <span>/</span></span><h1 className="topbar__title">{title}</h1>
        </div>

        <GlobalSearch />

        <div className="topbar__right">
          <div className="theme-switch" role="group" aria-label="Colour theme">
            {themeOptions.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`theme-switch__btn${themePref === o.id ? ' is-active' : ''}`}
                aria-pressed={themePref === o.id}
                title={`${o.label} theme`}
                onClick={() => setThemePref(o.id)}
              >
                <o.icon size={14} aria-hidden="true" />
                <span className="sr-only">{o.label} theme</span>
              </button>
            ))}
          </div>

          <div className="usermenu" ref={menuRef}>
            <button
              type="button"
              className="usermenu__trigger"
              aria-label={`Account menu for ${user?.name}`}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="avatar" aria-hidden="true">
                {user?.initials}
              </span>
              <span className="usermenu__who">
                <span className="usermenu__name">{user?.name}</span>
                <span className="usermenu__role">{user?.role}</span>
              </span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>

            {menuOpen && (
              <div className="usermenu__panel" role="menu">
                <div className="usermenu__head">
                  <p className="usermenu__head-name">{user?.name}</p>
                  <p className="usermenu__head-mail mono">{user?.email}</p>
                  <p className="usermenu__head-role">
                    Signed in as <strong>{user?.role}</strong>
                  </p>
                </div>
                <div className="usermenu__section">
                  <p className="usermenu__section-title">Preview another role</p>
                  <p className="usermenu__section-note">
                    Switching role changes which actions are shown. This is a prototype control, not access
                    control.
                  </p>
                  <div className="usermenu__roles">
                    {(['Operator', 'Reviewer', 'Admin'] as Role[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        role="menuitemradio"
                        aria-checked={user?.role === r}
                        className={`usermenu__role-btn${user?.role === r ? ' is-active' : ''}`}
                        onClick={() => switchRole(r)}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="usermenu__section">
                  <button type="button" role="menuitem" className="usermenu__item" onClick={resetSampleData}>
                    <Undo2 size={15} aria-hidden="true" /> Reset sample data
                  </button>
                  <button type="button" role="menuitem" className="usermenu__item" onClick={signOut}>
                    <LogOut size={15} aria-hidden="true" /> Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ---------- main ---------- */}
      <main ref={mainRef} className="main" id="main" tabIndex={-1}>
        {children}
      </main>

      {/* ---------- phone bottom bar ---------- */}
      <nav className="bottombar" aria-label="Sections">
        {mainNav.slice(0, 4).map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `bottombar__link${isActive ? ' is-active' : ''}`}>
            <n.icon size={19} aria-hidden="true" />
            <span>{n.label.replace(' report', '').replace('Import ', '')}</span>
            {n.badge !== undefined && n.badge > 0 && <span className="bottombar__badge num">{n.badge}</span>}
          </NavLink>
        ))}
        <button type="button" className="bottombar__link" onClick={() => setSheetOpen(true)}>
          <Menu size={19} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>

      {/* ---------- slide-in sheet for narrow screens ---------- */}
      {sheetOpen && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="sheet__scrim" onClick={() => setSheetOpen(false)} />
          <div ref={sheetRef} className="sheet__panel">
            <div className="sheet__head">
              <span className="sheet__brand">
                <TideMark /> Tidemark
              </span>
              <IconButton label="Close navigation" onClick={() => setSheetOpen(false)}>
                <X size={18} />
              </IconButton>
            </div>
            <ul className="sheet__list">
              {[...mainNav, ...visibleAdmin, { to: '/help', label: 'Help & guidance', icon: CircleHelp }].map(
                (n) => (
                  <li key={n.to}>
                    <NavLink
                      to={n.to}
                      className={({ isActive }) => `sheet__link${isActive ? ' is-active' : ''}`}
                      onClick={() => setSheetOpen(false)}
                    >
                      <n.icon size={17} aria-hidden="true" />
                      <span>{n.label}</span>
                      {'badge' in n && n.badge !== undefined && n.badge > 0 && (
                        <span className="rail__badge num">{n.badge}</span>
                      )}
                    </NavLink>
                  </li>
                ),
              )}
            </ul>
            <div className="sheet__foot">
              <p className="sheet__user">
                {user?.name} — {user?.role}
              </p>
              <button type="button" className="usermenu__item" onClick={signOut}>
                <LogOut size={15} aria-hidden="true" /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastStack />
    </div>
  );
}

/* ---------- global search ---------- */

function GlobalSearch() {
  const { cases } = useStore();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    return cases
      .filter(
        (c) =>
          c.id.toLowerCase().includes(needle) ||
          c.subject.toLowerCase().includes(needle) ||
          c.sender.toLowerCase().includes(needle),
      )
      .slice(0, 7);
  }, [cases, q]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  return (
    <div className="gsearch" ref={boxRef}>
      <Search size={15} className="gsearch__icon" aria-hidden="true" />
      <input
        type="search"
        className="gsearch__input"
        placeholder="Find an email…"
        aria-label="Find an email by subject, sender or reference"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) {
            navigate(`/cases/${matches[0].id}`);
            setOpen(false);
            setQ('');
          }
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && q.trim().length >= 2 && (
        <div className="gsearch__panel">
          {matches.length === 0 ? (
            <p className="gsearch__none">
              Nothing matches “{q}”. Try an email ID such as E-1042, or part of a subject.
            </p>
          ) : (
            <ul>
              {matches.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/cases/${c.id}`}
                    className="gsearch__hit"
                    onClick={() => {
                      setOpen(false);
                      setQ('');
                    }}
                  >
                    <span className="gsearch__id mono">{c.id}</span>
                    <span className="gsearch__subject truncate">{c.subject}</span>
                    <span className="gsearch__result">{friendlyLabel(c.result)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
