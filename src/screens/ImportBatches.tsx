/* ============================================================
   7. Import batches
   ============================================================ */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Layers, RefreshCw, TriangleAlert } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { BatchProgressBar } from '../components/BatchProgressBar';
import { Banner, EmptyState } from '../components/feedback';
import { useStore } from '../state/store';

export function ImportBatches() {
  const { batches, can, reprocessBatch } = useStore();
  const [params] = useSearchParams();
  const [open, setOpen] = useState<string[]>(params.get('batch') ? [params.get('batch')!] : [batches[0]?.id]);

  function toggle(id: string) {
    setOpen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const totalDeadLetter = batches.reduce((n, b) => n + b.deadLetterCount, 0);

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h2 className="page__title">See how your email imports are progressing</h2>
          <p className="page__sub">
            Emails arrive in groups called imports. Open an import to see which emails arrived and which need another attempt.
          </p>
        </div>
      </header>

      {totalDeadLetter > 0 && (
        <Banner tone="warning" title={`${totalDeadLetter} emails could not be imported`}>
          These emails could not arrive after five attempts and are kept for 14 days.
          Use “Try import again” on the affected import below. If the button is unavailable, ask an administrator for help.
        </Banner>
      )}

      {batches.length === 0 ? (
        <section className="panel">
          <EmptyState
            icon={<Layers size={22} />}
            title="No imports yet"
            body="The inbox has not been read yet. The first import starts at 03:00, or an admin can start one from Settings."
          />
        </section>
      ) : (
        <div className="batch-list">
          {batches.map((b) => {
            const isOpen = open.includes(b.id);
            return (
              <section key={b.id} className={`panel batch${isOpen ? ' is-open' : ''}`}>
                <header className="batch__head">
                  <button
                    type="button"
                    className="batch__toggle"
                    aria-expanded={isOpen}
                    aria-controls={`batch-${b.id}`}
                    onClick={() => toggle(b.id)}
                  >
                    {isOpen ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
                    <span className="batch__id mono">{b.id}</span>
                    <span className="batch__label">{b.label}</span>
                  </button>
                  <span className={`batch__state batch__state--${b.state.replace(/\s+/g, '-').toLowerCase()}`}>
                    {b.state}
                  </span>
                  {can('reprocessBatch') && (
                    <Button
                      size="sm"
                      icon={<RefreshCw size={14} />}
                      onClick={() => reprocessBatch(b.id)}
                      disabled={b.state === 'Complete'}
                      title={
                        b.state === 'Complete'
                          ? 'Nothing to try again. This import finished with nothing rejected.'
                          : 'Try the rejected emails and the ones that could not arrive again'
                      }
                    >
                      Try import again
                    </Button>
                  )}
                </header>

                <div className="batch__summary">
                  <dl className="batch__counts">
                    <div>
                      <dt>Expected</dt>
                      <dd className="num">{b.expected}</dd>
                    </div>
                    <div>
                      <dt>Received</dt>
                      <dd className="num">{b.received}</dd>
                    </div>
                    <div>
                      <dt>Accepted</dt>
                      <dd className="num">{b.accepted}</dd>
                    </div>
                    <div>
                      <dt>Rejected</dt>
                      <dd className={`num${b.rejected > 0 ? ' is-warn' : ''}`}>{b.rejected}</dd>
                    </div>
                    <div>
                      <dt>Could not arrive</dt>
                      <dd className={`num${b.deadLetterCount > 0 ? ' is-warn' : ''}`}>{b.deadLetterCount}</dd>
                    </div>
                  </dl>
                  <BatchProgressBar
                    expected={b.expected}
                    accepted={b.accepted}
                    rejected={b.rejected}
                    state={b.finishedAt ? `Finished ${b.finishedAt}` : `Started ${b.startedAt}`}
                  />
                </div>

                {isOpen && (
                  <div className="batch__detail" id={`batch-${b.id}`}>
                    {b.deadLetterNote && (
                      <p className="batch__dlq">
                        <TriangleAlert size={14} aria-hidden="true" />
                        <span>{b.deadLetterNote}</span>
                      </p>
                    )}

                    <h4 className="batch__sub">
                      Rejected records <span className="num muted">({b.rejectedRecords.length})</span>
                    </h4>
                    {b.rejectedRecords.length === 0 ? (
                      <p className="batch__none">
                        No record was rejected in this batch. Every message was read and classified.
                      </p>
                    ) : (
                      <div className="table-wrap">
                        <table className="table table--dense">
                          <thead>
                            <tr>
                              <th scope="col">Message ID</th>
                              <th scope="col">Subject</th>
                              <th scope="col">Code</th>
                              <th scope="col">Reason</th>
                              <th scope="col">When</th>
                            </tr>
                          </thead>
                          <tbody>
                            {b.rejectedRecords.map((r) => (
                              <tr key={r.id}>
                                <td className="mono">{r.messageId}</td>
                                <td className="cell-subject">{r.subject}</td>
                                <td className="mono">{r.code}</td>
                                <td className="cell-wrap">{r.reason}</td>
                                <td className="num muted">{r.at}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
