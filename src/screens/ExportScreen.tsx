/* ============================================================
   8. Export
   ============================================================ */

import { useMemo, useState } from 'react';
import { Download, FileJson, FileSpreadsheet, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Banner, EmptyState } from '../components/feedback';
import { ResultChip } from '../components/chips';
import { useStore } from '../state/store';
import { FIELD_LABELS, type EmailCase, type MappingRow } from '../types';

function buildRows(cases: EmailCase[], mapping: MappingRow[]) {
  return cases.map((c) => {
    const out: Record<string, string> = {};
    for (const m of mapping) {
      if (m.field === 'caseId') out[m.exportColumn] = c.id;
      else if (m.field === 'result') out[m.exportColumn] = c.result;
      else {
        const row = c.comparison.find((r) => r.field === m.field);
        out[m.exportColumn] = row?.bl.value ?? row?.si.value ?? '';
      }
    }
    return out;
  });
}

function toCsv(rows: Array<Record<string, string>>): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c] ?? '')).join(','))].join('\n');
}

function download(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportScreen() {
  const { cases, exports, mapping, addExport, updateExport, can, pushToast } = useStore();
  const [format, setFormat] = useState<'Submission JSON' | 'CSV'>('CSV');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftScore, setDraftScore] = useState('');
  const [draftNotes, setDraftNotes] = useState('');

  const waiting = useMemo(() => cases.filter((c) => c.status === 'Waiting for review'), [cases]);
  const exportable = cases.length;

  function generate() {
    setBusy(true);
    window.setTimeout(() => {
      const rows = buildRows(cases, mapping);
      const record = addExport(format, waiting.length, exportable);
      if (format === 'CSV') {
        download(record.filename, toCsv(rows), 'text/csv;charset=utf-8');
      } else {
        download(
          record.filename,
          JSON.stringify(
            {
              generatedAt: record.createdAt,
              generatedBy: record.createdBy,
              caseCount: rows.length,
              waitingForReview: waiting.length,
              cases: rows,
            },
            null,
            2,
          ),
          'application/json',
        );
      }
      setBusy(false);
      pushToast({
        tone: 'success',
        title: 'Your file is ready',
        body: `${record.filename} with ${rows.length} cases. Record the score and notes in the history below once you have the result.`,
      });
    }, 800);
  }

  function startEdit(id: string, score: string, notes: string) {
    setEditing(id);
    setDraftScore(score);
    setDraftNotes(notes);
  }

  function saveEdit(id: string) {
    updateExport(id, { score: draftScore.trim(), notes: draftNotes.trim() });
    setEditing(null);
    pushToast({ tone: 'success', title: 'Export notes saved' });
  }

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h2 className="page__title">Download your results</h2>
          <p className="page__sub">
            Choose a file type below. Use a spreadsheet to read the results in Excel, or a submission file if another system requires it.
          </p>
        </div>
      </header>

      {waiting.length > 0 && (
        <Banner
          tone="warning"
          title={`${waiting.length} case${waiting.length === 1 ? '' : 's'} still waiting for review`}
        >
          <p className="banner__line">
            These cases will be exported with the result <strong>Needs review</strong> and their uncertain values
            left as Tidemark read them. Resolve them first if the submission should carry confirmed values.
          </p>
          <ul className="export__waiting">
            {waiting.map((c) => (
              <li key={c.id}>
                <Link to={`/cases/${c.id}`} className="mono">
                  {c.id}
                </Link>
                <span className="export__waiting-subject truncate">{c.subject}</span>
                <ResultChip result={c.result} />
              </li>
            ))}
          </ul>
          <p className="banner__line">
            <Link to="/review">Open the review queue</Link> to clear them.
          </p>
        </Banner>
      )}

      <section className="panel panel--pad export__generate">
        <h3 className="panel__title">Choose your download</h3>
        <fieldset className="export__formats">
          <legend className="label">Format</legend>
          <label className={`radio-card${format === 'Submission JSON' ? ' is-on' : ''}`}>
            <input
              type="radio"
              name="format"
              checked={format === 'Submission JSON'}
              onChange={() => setFormat('Submission JSON')}
            />
            <FileJson size={16} aria-hidden="true" />
            <span className="radio-card__body">
              <span className="radio-card__title">System submission (JSON)</span>
              <span className="radio-card__note">
                For submitting results to another system. Choose this when a JSON file is requested.
              </span>
            </span>
          </label>
          <label className={`radio-card${format === 'CSV' ? ' is-on' : ''}`}>
            <input type="radio" name="format" checked={format === 'CSV'} onChange={() => setFormat('CSV')} />
            <FileSpreadsheet size={16} aria-hidden="true" />
            <span className="radio-card__body">
              <span className="radio-card__title">Spreadsheet (CSV)</span>
              <span className="radio-card__note">
                Opens in Excel or other spreadsheet apps. Recommended for reading and sharing results.
              </span>
            </span>
          </label>
        </fieldset>

        <dl className="kv kv--inline">
          <div>
            <dt>Cases in this export</dt>
            <dd className="num">{exportable}</dd>
          </div>
          <div>
            <dt>Waiting for review</dt>
            <dd className={`num${waiting.length > 0 ? ' is-warn' : ''}`}>{waiting.length}</dd>
          </div>
          <div>
            <dt>Columns</dt>
            <dd className="num">{mapping.length}</dd>
          </div>
        </dl>

        <div className="export__actions">
          <Button
            variant="primary"
            size="lg"
            icon={<Download size={16} />}
            loading={busy}
            disabled={!can('export')}
            onClick={generate}
          >
            {format === 'CSV' ? 'Download spreadsheet' : 'Download submission file'}
          </Button>
          {waiting.length > 0 && (
            <p className="export__warn">
              <TriangleAlert size={14} aria-hidden="true" />
              {waiting.length} case{waiting.length === 1 ? '' : 's'} will carry Needs review.
            </p>
          )}
        </div>

        <details className="export__preview">
          <summary>Preview the first record</summary>
          <pre className="codeblock">
            {JSON.stringify(buildRows(cases, mapping)[0] ?? {}, null, 2)}
          </pre>
          <p className="muted">
            Column names come from the export field mapping. Fields:{' '}
            {mapping
              .filter((m) => m.field !== 'caseId' && m.field !== 'result')
              .map((m) => FIELD_LABELS[m.field as keyof typeof FIELD_LABELS])
              .join(', ')}
            .
          </p>
        </details>
      </section>

      <section className="panel" aria-labelledby="export-history">
        <header className="panel__head">
          <h3 id="export-history" className="panel__title">
            Past exports
          </h3>
          <span className="panel__meta num">{exports.length}</span>
        </header>
        {exports.length === 0 ? (
          <EmptyState
            title="No exports yet"
            body="Generate a submission file above. Each one is listed here so the team can record the score it earned."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Export</th>
                  <th scope="col">When</th>
                  <th scope="col">By</th>
                  <th scope="col">Format</th>
                  <th scope="col">Cases</th>
                  <th scope="col">Waiting</th>
                  <th scope="col">Score</th>
                  <th scope="col">Notes</th>
                  {can('editExportNotes') && <th scope="col" className="ta-right">Action</th>}
                </tr>
              </thead>
              <tbody>
                {exports.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <span className="mono">{x.id}</span>
                      <p className="cell-sub mono muted">{x.filename}</p>
                    </td>
                    <td className="num muted">{x.createdAt}</td>
                    <td>{x.createdBy}</td>
                    <td>{x.format}</td>
                    <td className="num">{x.caseCount}</td>
                    <td className={`num${x.pendingReviewCount > 0 ? ' is-warn' : ''}`}>{x.pendingReviewCount}</td>
                    <td>
                      {editing === x.id ? (
                        <input
                          className="input input--sm"
                          value={draftScore}
                          aria-label={`Score for ${x.id}`}
                          placeholder="0.000"
                          onChange={(e) => setDraftScore(e.target.value)}
                        />
                      ) : x.score ? (
                        <span className="num">{x.score}</span>
                      ) : (
                        <span className="muted">Not recorded</span>
                      )}
                    </td>
                    <td className="cell-wrap">
                      {editing === x.id ? (
                        <textarea
                          className="input textarea textarea--sm"
                          rows={3}
                          value={draftNotes}
                          aria-label={`Notes for ${x.id}`}
                          placeholder="Explain any disagreement with the reference set."
                          onChange={(e) => setDraftNotes(e.target.value)}
                        />
                      ) : x.notes ? (
                        x.notes
                      ) : (
                        <span className="muted">No notes</span>
                      )}
                    </td>
                    {can('editExportNotes') && (
                      <td className="ta-right">
                        {editing === x.id ? (
                          <div className="cell-actions">
                            <Button size="sm" variant="primary" onClick={() => saveEdit(x.id)}>
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => startEdit(x.id, x.score, x.notes)}>
                            Edit score and notes
                          </Button>
                        )}
                      </td>
                    )}
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
