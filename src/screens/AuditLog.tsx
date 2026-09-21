/* ============================================================
   10. Audit log (Admin)
   ============================================================ */

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, History, LockKeyhole } from 'lucide-react';
import { EmptyState } from '../components/feedback';
import { FilterBar, SearchInput, Select } from '../components/FilterBar';
import { useStore } from '../state/store';

export function AuditLog() {
  const { audit, can, switchRole } = useStore();
  const [actor, setActor] = useState<string | 'all'>('all');
  const [action, setAction] = useState<string | 'all'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string[]>([]);

  const actors = useMemo(() => Array.from(new Set(audit.map((a) => a.actor))).sort(), [audit]);
  const actions = useMemo(() => Array.from(new Set(audit.map((a) => a.action))).sort(), [audit]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return audit.filter((a) => {
      if (actor !== 'all' && a.actor !== actor) return false;
      if (action !== 'all' && a.action !== action) return false;
      const day = a.at.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (needle) {
        const hay = `${a.actor} ${a.action} ${a.target} ${Object.entries(a.detail).flat().join(' ')}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [action, actor, audit, from, q, to]);

  if (!can('viewAudit')) {
    return (
      <div className="page">
        <section className="panel">
          <EmptyState
            icon={<LockKeyhole size={22} />}
            title="Activity history is for admins"
            body="Your role does not include activity history. Ask an admin if you need to trace a change, or preview the admin role in this demo."
            action={{ label: 'Preview as Admin', onClick: () => switchRole('Admin') }}
            secondaryAction={{ label: 'Back to the overview', to: '/dashboard' }}
          />
        </section>
      </div>
    );
  }

  const activeCount =
    (actor !== 'all' ? 1 : 0) + (action !== 'all' ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0) + (q.trim() ? 1 : 0);

  function clearAll() {
    setActor('all');
    setAction('all');
    setFrom('');
    setTo('');
    setQ('');
  }

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h2 className="page__title">Every change, and who made it</h2>
          <p className="page__sub">
            Entries are kept for 24 months. Open a row for the full detail of what changed. Entries cannot be
            edited or removed.
          </p>
        </div>
      </header>

      <FilterBar
        activeCount={activeCount}
        onClear={clearAll}
        resultLabel={`${rows.length} of ${audit.length} entr${audit.length === 1 ? 'y' : 'ies'}`}
      >
        <SearchInput value={q} onChange={setQ} label="Search activity history" placeholder="Search target or detail" width={240} />
        <Select label="Actor" value={actor} options={actors} onChange={setActor} width={170} />
        <Select label="Action" value={action} options={actions} onChange={setAction} width={190} />
        <div className="select-field">
          <label className="select-field__label" htmlFor="audit-from">
            From
          </label>
          <input
            id="audit-from"
            type="date"
            className={`input input--date${from ? '' : ' is-empty'}`}
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="select-field">
          <label className="select-field__label" htmlFor="audit-to">
            To
          </label>
          <input
            id="audit-to"
            type="date"
            className={`input input--date${to ? '' : ' is-empty'}`}
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </FilterBar>

      <section className="panel">
        {rows.length === 0 ? (
          <EmptyState
            icon={<History size={22} />}
            title="No entries match these filters"
            body="Nothing was recorded for that actor, action or date range. Widen the dates or clear the filters."
            action={{ label: 'Clear filters', onClick: clearAll }}
          />
        ) : (
          <div className="table-wrap">
            <table className="table table--dense">
              <caption className="sr-only">Audit entries with actor, action and target</caption>
              <thead>
                <tr>
                  <th scope="col" className="col-expand">
                    <span className="sr-only">Expand</span>
                  </th>
                  <th scope="col" className="col-time">
                    When
                  </th>
                  <th scope="col">Actor</th>
                  <th scope="col">Role</th>
                  <th scope="col">Action</th>
                  <th scope="col">Target</th>
                  <th scope="col">Source IP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const isOpen = open.includes(a.id);
                  return [
                    <tr key={a.id} className={isOpen ? 'is-expanded' : undefined}>
                      <td className="col-expand">
                        <button
                          type="button"
                          className="expand-btn"
                          aria-expanded={isOpen}
                          aria-controls={`audit-${a.id}`}
                          aria-label={isOpen ? `Hide detail for ${a.action}` : `Show detail for ${a.action}`}
                          onClick={() =>
                            setOpen((prev) => (prev.includes(a.id) ? prev.filter((x) => x !== a.id) : [...prev, a.id]))
                          }
                        >
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td className="col-time num muted">{a.at}</td>
                      <td>{a.actor === 'system' ? <span className="mono">system</span> : a.actor}</td>
                      <td className="muted">{a.actor === 'system' ? '—' : a.actorRole}</td>
                      <td>{a.action}</td>
                      <td className="mono">{a.target}</td>
                      <td className="mono muted">{a.ip}</td>
                    </tr>,
                    isOpen && (
                      <tr key={`${a.id}-d`} className="row--detail">
                        <td />
                        <td colSpan={6} id={`audit-${a.id}`}>
                          <dl className="kv kv--detail">
                            {Object.entries(a.detail).map(([k, v]) => (
                              <div key={k}>
                                <dt>{k}</dt>
                                <dd>{v}</dd>
                              </div>
                            ))}
                          </dl>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
