/* ============================================================
   5. Review queue
   ============================================================ */

import { useMemo, useState } from 'react';
import { ArrowRight, ListChecks } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { FilterBar, Select } from '../components/FilterBar';
import { EmptyState } from '../components/feedback';
import { ClaimChip } from '../components/chips';
import { useStore } from '../state/store';
import { REASON_TEXT, type TaskClaimState } from '../types';

const STATES: TaskClaimState[] = ['Open', 'Claimed', 'Overdue'];

export function ReviewQueue() {
  const { tasks, user, can, claimTask } = useStore();
  const navigate = useNavigate();
  const [state, setState] = useState<TaskClaimState | 'all'>('all');

  const rows = useMemo(
    () => [...tasks].filter((t) => state === 'all' || t.claimState === state).sort((a, b) => b.ageMinutes - a.ageMinutes),
    [state, tasks],
  );

  const oldest = rows[0];

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h2 className="page__title">A few details need a closer look</h2>
          <p className="page__sub">
            Choose “Start review” to check an email. Compare the highlighted details in the documents,
            then confirm or correct each one. The oldest reviews are shown first.
          </p>
        </div>
        <dl className="head-stats">
          <div>
            <dt>Waiting</dt>
            <dd className="num">{tasks.length}</dd>
          </div>
          <div>
            <dt>Oldest</dt>
            <dd className="num">{oldest?.ageLabel ?? '—'}</dd>
          </div>
          <div>
            <dt>Overdue</dt>
            <dd className="num">{tasks.filter((t) => t.claimState === 'Overdue').length}</dd>
          </div>
        </dl>
      </header>

      <FilterBar
        activeCount={state !== 'all' ? 1 : 0}
        onClear={() => setState('all')}
        resultLabel={`${rows.length} of ${tasks.length} task${tasks.length === 1 ? '' : 's'}`}
      >
        <Select label="Status" value={state} options={STATES} onChange={setState} />
      </FilterBar>

      <section className="panel">
        {rows.length === 0 ? (
          <EmptyState
            icon={<ListChecks size={22} />}
            title={tasks.length === 0 ? 'The review queue is empty' : 'No tasks match this filter'}
            body={
              tasks.length === 0
                ? 'Every value SDVS was unsure about has been confirmed or corrected. New tasks appear here as batches run.'
                : 'No task has that status right now. Clear the filter to see the whole queue.'
            }
            action={
              tasks.length === 0
                ? { label: 'Open the inbox report', to: '/inbox' }
                : { label: 'Clear filter', onClick: () => setState('all') }
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table table--rows readable-table">
              <caption className="sr-only">Review tasks with their reason, age and claim state</caption>
              <thead>
                <tr>
                  <th scope="col" className="col-id">
                    Task
                  </th>
                  <th scope="col">What needs checking</th>
                  <th scope="col">Email subject</th>
                  <th scope="col" className="col-age">
                    Waiting for
                  </th>
                  <th scope="col">Who is reviewing</th>
                  <th scope="col" className="ta-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const mine = t.claimedBy?.name === user?.name;
                  const claimable = t.claimState !== 'Claimed';
                  return (
                    <tr key={t.id} className={t.claimState === 'Overdue' ? 'row--warn' : undefined}>
                      <td className="col-id" data-label="Reference">
                        <span className="mono">{t.id}</span>
                        <p className="cell-sub mono">{t.caseId}</p>
                      </td>
                      <td className="cell-wrap" data-label="Check">
                        {REASON_TEXT[t.reasonCodes[0]]}
                        {t.reasonCodes.length > 1 && (
                          <span className="muted">
                            {' '}
                            And {t.reasonCodes.length - 1} more reason{t.reasonCodes.length - 1 === 1 ? '' : 's'}.
                          </span>
                        )}
                        <p className="cell-sub muted">
                          {t.questions.length} field{t.questions.length === 1 ? '' : 's'} in question
                        </p>
                      </td>
                      <td className="cell-subject" data-label="Email">
                        <Link to={`/cases/${t.caseId}`}>{t.subject}</Link>
                      </td>
                      <td className="col-age" data-label="Waiting">
                        <span className="num">{t.ageLabel}</span>
                        {t.dueInLabel && <p className="cell-sub muted">{t.dueInLabel}</p>}
                      </td>
                      <td data-label="Reviewer">
                        <ClaimChip state={t.claimState} claimedBy={t.claimedBy} />
                      </td>
                      <td className="ta-right" data-label="Next step">
                        {!can('claimTask') ? (
                          <Link to={`/cases/${t.caseId}`} className="quiet-link">
                            View case
                          </Link>
                        ) : claimable ? (
                          <Button
                            size="sm"
                            variant="primary"
                            iconEnd={<ArrowRight size={14} />}
                            onClick={() => {
                              claimTask(t.id);
                              navigate(`/review/${t.id}`);
                            }}
                          >
                            Start review
                          </Button>
                        ) : mine ? (
                          <Button size="sm" iconEnd={<ArrowRight size={14} />} onClick={() => navigate(`/review/${t.id}`)}>
                            Continue review
                          </Button>
                        ) : can('configure') ? (
                          <Button size="sm" variant="ghost" onClick={() => navigate(`/review/${t.id}`)}>
                            Open task
                          </Button>
                        ) : (
                          <span className="muted">With {t.claimedBy?.name}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
