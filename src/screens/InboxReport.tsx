/* ============================================================
   3. Inbox report
   ============================================================ */

import { useEffect, useMemo, useState } from 'react';
import { Inbox, Paperclip, RefreshCw } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { FilterBar, SearchInput, Select } from '../components/FilterBar';
import { EmptyState, TableSkeleton } from '../components/feedback';
import { CategoryChip, ResultChip, StatusChip } from '../components/chips';
import { useStore } from '../state/store';
import type { CaseResult, CaseStatus, Category } from '../types';

const CATEGORIES: Category[] = [
  'Document comparison request',
  'New SI request',
  'Invoice query',
  'General message',
  'Spam',
];
const STATUSES: CaseStatus[] = ['Queued', 'Processing', 'Waiting for review', 'Completed', 'Failed'];
const RESULTS: CaseResult[] = [
  'No mismatch detected',
  'Mismatch found',
  'Needs review',
  'Not applicable',
  'Failed',
];

export function InboxReport() {
  const { cases, batches } = useStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<Category | 'all'>((params.get('category') as Category) ?? 'all');
  const [status, setStatus] = useState<CaseStatus | 'all'>((params.get('status') as CaseStatus) ?? 'all');
  const [result, setResult] = useState<CaseResult | 'all'>((params.get('result') as CaseResult) ?? 'all');
  const [batch, setBatch] = useState<string | 'all'>((params.get('batch') as string) ?? 'all');

  useEffect(() => {
    const id = window.setTimeout(() => setLoading(false), 620);
    return () => window.clearTimeout(id);
  }, []);

  /* keep the address bar in step so a filtered report can be shared */
  useEffect(() => {
    const next = new URLSearchParams();
    if (category !== 'all') next.set('category', category);
    if (status !== 'all') next.set('status', status);
    if (result !== 'all') next.set('result', result);
    if (batch !== 'all') next.set('batch', batch);
    setParams(next, { replace: true });
  }, [batch, category, result, setParams, status]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cases.filter((c) => {
      if (category !== 'all' && c.category !== category) return false;
      if (status !== 'all' && c.status !== status) return false;
      if (result !== 'all' && c.result !== result) return false;
      if (batch !== 'all' && c.batchId !== batch) return false;
      if (needle) {
        const hay = `${c.id} ${c.subject} ${c.sender} ${c.senderName}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [batch, cases, category, q, result, status]);

  const activeCount =
    (category !== 'all' ? 1 : 0) +
    (status !== 'all' ? 1 : 0) +
    (result !== 'all' ? 1 : 0) +
    (batch !== 'all' ? 1 : 0) +
    (q.trim() ? 1 : 0);

  function clearAll() {
    setCategory('all');
    setStatus('all');
    setResult('all');
    setBatch('all');
    setQ('');
  }

  function reload() {
    setLoading(true);
    window.setTimeout(() => setLoading(false), 620);
  }

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h2 className="page__title">Find an email and see its results</h2>
          <p className="page__sub">
            Select an email subject to see its documents and what needs attention. Use the filters to narrow the list.
          </p>
        </div>
        <Button icon={<RefreshCw size={15} />} onClick={reload} loading={loading}>
          Refresh list
        </Button>
      </header>

      <FilterBar
        activeCount={activeCount}
        onClear={clearAll}
        resultLabel={
          loading ? 'Loading' : `${rows.length} of ${cases.length} email${cases.length === 1 ? '' : 's'}`
        }
      >
        <SearchInput
          value={q}
          onChange={setQ}
          label="Search email ID, subject or sender"
          placeholder="Search ID, subject or sender"
          width={280}
        />
        <Select label="Result" value={result} options={RESULTS} onChange={setResult} />
        <details className="extra-filters" open={category !== 'all' || status !== 'all' || batch !== 'all' || undefined}>
          <summary>More filters{category !== 'all' || status !== 'all' || batch !== 'all' ? ' (active)' : ''}</summary>
          <div className="extra-filters__body">
            <Select label="Category" value={category} options={CATEGORIES} onChange={setCategory} />
            <Select label="Status" value={status} options={STATUSES} onChange={setStatus} />
            <Select label="Email import" value={batch} options={batches.map((b) => b.id)} onChange={setBatch} />
          </div>
        </details>
      </FilterBar>

      <section className="panel">
        {loading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Inbox size={22} />}
            title="No emails match these filters"
            body="Nothing in this batch matches what you asked for. Clear the filters to see the whole report, or widen one of them."
            action={{ label: 'Clear filters', onClick: clearAll }}
          />
        ) : (
          <div className="table-wrap">
            <table className="table table--dense table--rows readable-table">
              <caption className="sr-only">
                Emails read by SDVS with category, status and comparison result
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="col-id">
                    Email ID
                  </th>
                  <th scope="col">Subject</th>
                  <th scope="col">Sender</th>
                  <th scope="col">Category</th>
                  <th scope="col">Status</th>
                  <th scope="col">Result</th>
                  <th scope="col" className="col-time">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr
                    key={c.id}
                    className="is-clickable"
                    tabIndex={0}
                    role="link"
                    aria-label={`Open case ${c.id}, ${c.subject}`}
                    onClick={() => navigate(`/cases/${c.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/cases/${c.id}`);
                      }
                    }}
                  >
                    <td className="col-id" data-label="Reference">
                      <span className="mono">{c.id}</span>
                    </td>
                    <td className="cell-subject" data-label="Email">
                      <Link to={`/cases/${c.id}`} onClick={(e) => e.stopPropagation()}>
                        {c.subject}
                      </Link>
                      {c.attachments.length > 0 && (
                        <span className="cell-attach" title={`${c.attachments.length} attachments`}>
                          <Paperclip size={12} aria-hidden="true" />
                          <span className="num">{c.attachments.length}</span>
                        </span>
                      )}
                    </td>
                    <td className="cell-sender" data-label="From">
                      <span className="mono">{c.sender}</span>
                    </td>
                    <td data-label="Category">
                      <CategoryChip category={c.category} confidence={c.categoryConfidence} />
                    </td>
                    <td data-label="Progress">
                      <StatusChip status={c.status} />
                    </td>
                    <td data-label="Result">
                      <ResultChip result={c.result} />
                    </td>
                    <td className="col-time num muted" data-label="Updated">{c.updatedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
