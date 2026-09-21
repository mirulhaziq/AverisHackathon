/* ============================================================
   4. Case detail
   ============================================================ */

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  CircleCheck,
  Clock,
  ExternalLink,
  FileText,
  History,
  ListChecks,
  Paperclip,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { ComparisonTable } from '../components/ComparisonTable';
import { ConfidenceIndicator } from '../components/ConfidenceIndicator';
import { EvidenceViewer } from '../components/EvidenceViewer';
import { regionFor } from '../data/documents';
import { DOCUMENTS } from '../data/seed';
import { Banner, EmptyState } from '../components/feedback';
import { CategoryChip, ResultChip, StatusChip } from '../components/chips';
import { TabPanel, Tabs } from '../components/Tabs';
import { useStore } from '../state/store';
import { FIELD_LABELS, type Attachment, type EmailCase, type FieldKey, type TimelineStep } from '../types';

export function CaseDetail() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const { getCase, can, retryCase, taskForCase, thresholds, loadCaseDetail } = useStore();
  const [tab, setTab] = useState('documents');
  const [selectedField, setSelectedField] = useState<FieldKey | null>(null);

  const c = caseId ? getCase(caseId) : undefined;

  useEffect(() => {
    if (caseId) void loadCaseDetail(caseId);
  }, [caseId, loadCaseDetail]);

  // the page is reused across cases, so a field picked on the last one must not carry over
  useEffect(() => setSelectedField(null), [caseId]);

  if (!c) {
    return (
      <div className="page">
        <EmptyState
          title="That case is not here"
          body={`No case with the ID ${caseId ?? ''} exists in this report. It may have been in an earlier batch.`}
          action={{ label: 'Back to the inbox report', to: '/inbox' }}
        />
      </div>
    );
  }

  const task = taskForCase(c.id);
  const allMatch = c.comparison.length > 0 && c.comparison.every((r) => r.result === 'Match');
  const mismatches = c.comparison.filter((r) => r.result === 'Mismatch');
  const needsReview = c.comparison.filter((r) => r.result === 'Needs review');

  return (
    <div className="page page--case">
      <div className="page__back">
        <Link to="/inbox" className="backlink">
          <ArrowLeft size={14} aria-hidden="true" /> All emails
        </Link>
      </div>

      {/* ---------- header ---------- */}
      <header className="case-head">
        <div className="case-head__main">
          <p className="case-head__id mono">{c.id}</p>
          <h2 className="case-head__subject">{c.subject}</h2>
          <p className="case-head__sender">
            {c.senderName} <span className="mono">&lt;{c.sender}&gt;</span>
          </p>
          <p className="case-head__times muted">
            Received {c.receivedAt} · Updated {c.updatedAt}
            {c.batchId && (
              <>
                {' '}
                · Batch <Link to={`/batches?batch=${c.batchId}`} className="mono">{c.batchId}</Link>
              </>
            )}
          </p>
        </div>

        <div className="case-head__facts">
          <div className="case-head__fact">
            <span className="label">Category</span>
            <CategoryChip category={c.category} />
            <div className="case-head__conf">
              <ConfidenceIndicator
                value={c.categoryConfidence}
                accept={thresholds.acceptConfidence}
                review={thresholds.categoryMinConfidence}
              />
            </div>
            <p className="case-head__reason">{c.categoryReason}</p>
          </div>
          <div className="case-head__fact">
            <span className="label">Status</span>
            <StatusChip status={c.status} />
          </div>
          <div className="case-head__fact">
            <span className="label">Result</span>
            <ResultChip result={c.result} />
          </div>
        </div>
      </header>

      {/* ---------- failure ---------- */}
      {c.failure && (
        <Banner
          tone="error"
          title="This document check could not finish"
          actions={
            can('retryCase') ? (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<RefreshCw size={14} />}
                  loading={c.status === 'Processing'}
                  onClick={() => retryCase(c.id, 'fromFailedStep')}
                >
                  Try again
                </Button>
                <Button
                  size="sm"
                  icon={<RotateCcw size={14} />}
                  disabled={c.status === 'Processing'}
                  onClick={() => retryCase(c.id, 'restart')}
                >
                  Check from the beginning
                </Button>
              </>
            ) : undefined
          }
        >
          <p className="banner__line">
            <span className="mono">{c.failure.code}</span> after {c.failure.attempts} attempt
            {c.failure.attempts === 1 ? '' : 's'}.
          </p>
          <p className="banner__line">{c.failure.message}</p>
          <p className="banner__line">
            <strong>What to do next.</strong> {c.failure.nextAction}
          </p>
        </Banner>
      )}

      {/* ---------- result banner ---------- */}
      {allMatch && (
        <div className="result-banner result-banner--match" role="status">
          <span className="result-banner__icon" aria-hidden="true">
            <CircleCheck size={20} />
          </span>
          <div>
            <p className="result-banner__title">No differences found</p>
            <p className="result-banner__body">
              All seven fields agree between the shipping instruction and the draft bill of lading.
              {c.comparison.some((r) => r.normalizationNote) &&
                ' Two values matched after normalization, noted under the value.'}
            </p>
          </div>
        </div>
      )}

      {mismatches.length > 0 && (
        <div className="result-banner result-banner--mismatch" role="status">
          <span className="result-banner__icon" aria-hidden="true">
            <Ban size={20} />
          </span>
          <div>
            <p className="result-banner__title">
              Differences found in {mismatches.length} field{mismatches.length === 1 ? '' : 's'}
            </p>
            <p className="result-banner__body">
              {mismatches.map((m) => FIELD_LABELS[m.field]).join(', ')} differ{mismatches.length === 1 ? 's' : ''}{' '}
              between the two documents. Both values are shown in full below. Send the draft back to the carrier
              or amend the instruction.
            </p>
          </div>
        </div>
      )}

      {needsReview.length > 0 && (
        <div className="result-banner result-banner--review" role="status">
          <span className="result-banner__icon" aria-hidden="true">
            <Clock size={20} />
          </span>
          <div>
            <p className="result-banner__title">
              {needsReview.length} field{needsReview.length === 1 ? ' needs' : 's need'} review
            </p>
            <p className="result-banner__body">
              Tidemark is not sure of {needsReview.map((m) => FIELD_LABELS[m.field].toLowerCase()).join(', ')}, so it
              has not guessed. The case resumes once a reviewer confirms or corrects the values.
            </p>
          </div>
          {task && can('resolveTask') && (
            <Link to={`/review/${task.id}`} className="btn btn--primary btn--sm result-banner__action">
              <span className="btn__label">Open review task</span>
            </Link>
          )}
        </div>
      )}

      {/* ---------- comparison ---------- */}
      <section className="panel" aria-labelledby="cmp-title">
        <header className="panel__head">
          <h3 id="cmp-title" className="panel__title">
            Compare document details
          </h3>
          <span className="panel__meta">
            {c.comparison.length > 0
              ? `${c.comparison.filter((r) => r.result === 'Match').length} of 7 fields match`
              : 'Not run'}
          </span>
        </header>
        {c.comparison.length === 0 ? (
          <div className="panel__body">
            <EmptyState
              title={
                c.category === 'Document comparison request'
                  ? 'Nothing was compared'
                  : `Not applicable for a ${c.category.toLowerCase()}`
              }
              body={
                c.attachments.length === 0
                  ? 'This email has no documents attached, so there was nothing to read. Ask the sender to resend with the shipping instruction and the draft bill of lading attached.'
                  : c.failure
                    ? 'The documents could not be read, so no field was compared. Fix the cause above, then retry the case.'
                    : `Tidemark only compares fields for a document comparison request. This email was classified as ${c.category.toLowerCase()}, so no comparison was run.`
              }
              action={
                c.attachments.length === 0 && task && can('resolveTask')
                  ? { label: 'Open review task', to: `/review/${task.id}` }
                  : undefined
              }
            />
          </div>
        ) : (
          <ComparisonTable
            rows={c.comparison}
            selectedField={selectedField}
            onFieldClick={(f) => setSelectedField((cur) => (cur === f ? null : f))}
          />
        )}
      </section>

      {c.attachments.length > 0 && <SourceDocuments c={c} field={selectedField} />}

      {/* ---------- tabs ---------- */}
      <section className="panel panel--tabs">
        <Tabs
          label="Case detail sections"
          active={tab}
          onChange={setTab}
          items={[
            { id: 'documents', label: 'Documents', count: c.attachments.length, icon: <Paperclip size={14} /> },
            { id: 'fields', label: 'Extracted fields', count: c.comparison.length * 2, icon: <FileText size={14} /> },
            { id: 'timeline', label: 'Timeline', count: c.timeline.length, icon: <ListChecks size={14} /> },
            { id: 'history', label: 'Review history', count: c.reviewHistory.length, icon: <History size={14} /> },
          ]}
        />

        <TabPanel id="documents" active={tab}>
          <DocumentsTab c={c} />
        </TabPanel>
        <TabPanel id="fields" active={tab}>
          <FieldsTab c={c} />
        </TabPanel>
        <TabPanel id="timeline" active={tab}>
          <TimelineTab steps={c.timeline} />
        </TabPanel>
        <TabPanel id="history" active={tab}>
          <HistoryTab c={c} />
        </TabPanel>
      </section>

      <div className="page__foot-actions">
        <Button icon={<ArrowLeft size={15} />} onClick={() => navigate('/inbox')}>
          Back to the inbox report
        </Button>
      </div>
    </div>
  );
}

/* ---------- source documents, side by side ---------- */

function SourceDocuments({ c, field }: { c: EmailCase; field: FieldKey | null }) {
  const si = c.attachments.find((a) => a.kind === 'SI');
  const bl = c.attachments.find((a) => a.kind === 'BL');
  const row = field ? c.comparison.find((r) => r.field === field) : undefined;
  const others = c.attachments.filter((a) => a !== si && a !== bl);

  const views: Array<{ a: Attachment; heading: string; snippet?: string }> = [
    ...(si ? [{ a: si, heading: 'Shipping instruction', snippet: row?.si.snippet }] : []),
    ...(bl ? [{ a: bl, heading: 'Draft bill of lading', snippet: row?.bl.snippet }] : []),
    ...others.map((a) => ({ a, heading: 'Other attachment' })),
  ];

  return (
    <section className="panel" aria-labelledby="src-title">
      <header className="panel__head">
        <h3 id="src-title" className="panel__title">
          Source documents
        </h3>
        <span className="panel__meta">
          {field
            ? `Highlighting ${FIELD_LABELS[field].toLowerCase()}`
            : c.comparison.length > 0
              ? 'Select a field above to highlight where each value came from'
              : `${c.attachments.length} attached`}
        </span>
      </header>
      <div className="case-docs">
        {views.map(({ a, heading, snippet }) => (
          <EvidenceViewer
            key={a.id}
            doc={DOCUMENTS[a.id] ?? null}
            attachment={a}
            heading={heading}
            snippet={snippet}
            highlightField={field}
            highlight={field && a.kind !== 'Other' ? regionFor(a.kind, field) : null}
            compact
          />
        ))}
      </div>
    </section>
  );
}

/* ---------- tabs ---------- */

function DocumentsTab({ c }: { c: EmailCase }) {
  if (c.attachments.length === 0) {
    return (
      <EmptyState
        title="No attachments"
        body="Nothing was attached to this email. Ask the sender to resend the shipping instruction and the draft bill of lading."
      />
    );
  }
  return (
    <>
      {c.attachments.some((a) => a.linkExpiresIn) && (
        <p className="tab-panel__note">
          Open links are short lived. Each one stops working after the time shown, so open the file when you need
          it rather than saving the link.
        </p>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">File</th>
              <th scope="col">Role</th>
              <th scope="col">Type</th>
              <th scope="col">Pages</th>
              <th scope="col">Size</th>
              <th scope="col">Open link</th>
            </tr>
          </thead>
          <tbody>
            {c.attachments.map((a) => (
              <tr key={a.id}>
                <td className="mono">{a.filename}</td>
                <td>
                  {a.kind === 'Other' ? (
                    <span className="muted">Not used in the comparison</span>
                  ) : (
                    <span className={`doc-kind doc-kind--${a.kind.toLowerCase()}`}>{a.kind}</span>
                  )}
                </td>
                <td>{a.fileType}</td>
                <td className="num">{a.pageCount || '—'}</td>
                <td className="num muted">{a.sizeLabel}</td>
                <td>
                  {a.fileUrl ? (
                    <a href={a.fileUrl} target="_blank" rel="noreferrer" className="doclink">
                      Open <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  ) : a.linkExpiresIn ? (
                    <a
                      href="#open-document"
                      onClick={(e) => e.preventDefault()}
                      className="doclink"
                      title={`Opens in a new tab. Expires in ${a.linkExpiresIn}.`}
                    >
                      Open <ExternalLink size={12} aria-hidden="true" />
                      <span className="doclink__expiry">expires in {a.linkExpiresIn}</span>
                    </a>
                  ) : (
                    <span className="muted">Not available</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="doc-body">
        <h4 className="doc-body__title">Email text</h4>
        <p className="doc-body__text plain-text">{c.body}</p>
      </div>
    </>
  );
}

function FieldsTab({ c }: { c: EmailCase }) {
  if (c.comparison.length === 0) {
    return (
      <EmptyState
        title="No fields were extracted"
        body="No comparison ran for this case, so there is nothing to show. The Timeline tab explains where processing stopped."
      />
    );
  }
  const rows = c.comparison.flatMap((r) => [
    { doc: 'SI' as const, field: r.field, e: r.si },
    { doc: 'BL' as const, field: r.field, e: r.bl },
  ]);
  return (
    <div className="table-wrap">
      <table className="table table--dense">
        <caption className="sr-only">Every extracted value with its method, confidence and source snippet</caption>
        <thead>
          <tr>
            <th scope="col">Document</th>
            <th scope="col">Field</th>
            <th scope="col">Value</th>
            <th scope="col">Method</th>
            <th scope="col">Confidence</th>
            <th scope="col">Source snippet</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                <span className={`doc-kind doc-kind--${r.doc.toLowerCase()}`}>{r.doc}</span>
              </td>
              <td className="field-name">{FIELD_LABELS[r.field]}</td>
              <td>
                {r.e.value ?? <span className="muted">Not stated</span>}
                {r.e.normalizedFrom && (
                  <p className="cmp__note">Raw text read as “{r.e.normalizedFrom}”.</p>
                )}
              </td>
              <td>{r.e.method}</td>
              <td>
                <ConfidenceIndicator value={r.e.confidence} size="sm" />
              </td>
              <td className="cell-snippet">
                <span className="snippet snippet--inline plain-text">{r.e.snippet}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TimelineTab({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="timeline">
      {steps.map((s, i) => (
        <li key={i} className={`timeline__item timeline__item--${s.state.toLowerCase()}`}>
          <span className="timeline__dot" aria-hidden="true" />
          <div className="timeline__body">
            <p className="timeline__head">
              <span className="timeline__step mono">{s.step}</span>
              <span className={`timeline__state timeline__state--${s.state.toLowerCase()}`}>{s.state}</span>
              <span className="timeline__at num muted">{s.at}</span>
              {s.durationMs !== undefined && (
                <span className="timeline__dur num muted">
                  {s.durationMs >= 1000 ? `${(s.durationMs / 1000).toFixed(1)} s` : `${s.durationMs} ms`}
                </span>
              )}
            </p>
            {s.detail && <p className="timeline__detail">{s.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function HistoryTab({ c }: { c: EmailCase }) {
  if (c.reviewHistory.length === 0) {
    return (
      <EmptyState
        title="No review history"
        body="No person has changed a value on this case. Every value shown came straight from the documents."
      />
    );
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Who</th>
            <th scope="col">Field</th>
            <th scope="col">Action</th>
            <th scope="col">From</th>
            <th scope="col">To</th>
            <th scope="col">Note</th>
          </tr>
        </thead>
        <tbody>
          {c.reviewHistory.map((h) => (
            <tr key={h.id}>
              <td className="num muted">{h.at}</td>
              <td>{h.actor}</td>
              <td className="field-name">{h.field ? FIELD_LABELS[h.field] : '—'}</td>
              <td>{h.action}</td>
              <td>{h.from ?? <span className="muted">—</span>}</td>
              <td>{h.to ?? <span className="muted">—</span>}</td>
              <td className="cell-wrap muted">{h.note ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
