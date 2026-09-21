/* ============================================================
   9. Configuration (Admin)
   ============================================================ */

import { useState } from 'react';
import { LockKeyhole, Plus, Save, Trash2, Undo2 } from 'lucide-react';
import { Button, IconButton } from '../components/Button';
import { Banner, EmptyState } from '../components/feedback';
import { useStore } from '../state/store';
import { SEED_THRESHOLDS } from '../data/seed';
import {
  FIELD_LABELS,
  FIELD_ORDER,
  type ConfigThresholds,
  type FieldKey,
  type MappingRow,
  type PortAliasRow,
  type SuffixRow,
  type SynonymRow,
} from '../types';

let n = 0;
const uid = (p: string) => `${p}-new-${n++}`;

const THRESHOLD_FIELDS: Array<{
  key: keyof ConfigThresholds;
  label: string;
  help: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}> = [
  {
    key: 'acceptConfidence',
    label: 'Accept confidence',
    help: 'At or above this, a value is used without asking a person.',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'reviewConfidence',
    label: 'Review confidence',
    help: 'Below this, Tidemark creates a review task instead of using the value.',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'ocrMinConfidence',
    label: 'OCR minimum confidence',
    help: 'A scanned value read below this is always sent for review.',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'categoryMinConfidence',
    label: 'Category minimum confidence',
    help: 'Below this, the category itself goes to a reviewer.',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'weightTolerancePct',
    label: 'Weight tolerance',
    help: 'Two gross weights within this percentage of each other count as a match.',
    min: 0,
    max: 10,
    step: 0.1,
    unit: '%',
  },
  {
    key: 'containerCountTolerance',
    label: 'Container count tolerance',
    help: 'How many containers the two documents may differ by and still match. Zero means they must agree.',
    min: 0,
    max: 5,
    step: 1,
    unit: 'containers',
  },
];

export function Configuration() {
  const { thresholds, synonyms, portAliases, suffixes, mapping, saveConfig, can, switchRole } = useStore();

  const [t, setT] = useState<ConfigThresholds>({ ...thresholds });
  const [sy, setSy] = useState<SynonymRow[]>([...synonyms]);
  const [pa, setPa] = useState<PortAliasRow[]>([...portAliases]);
  const [sf, setSf] = useState<SuffixRow[]>([...suffixes]);
  const [mp, setMp] = useState<MappingRow[]>([...mapping]);
  const [error, setError] = useState<string | null>(null);

  if (!can('configure')) {
    return (
      <div className="page">
        <section className="panel">
          <EmptyState
            icon={<LockKeyhole size={22} />}
            title="Settings are for admins"
            body="Your role does not include settings. Ask an admin to change how Tidemark reads and compares documents, or preview the admin role in this demo."
            action={{ label: 'Preview as Admin', onClick: () => switchRole('Admin') }}
            secondaryAction={{ label: 'Back to the overview', to: '/dashboard' }}
          />
        </section>
      </div>
    );
  }

  const dirty =
    JSON.stringify(t) !== JSON.stringify(thresholds) ||
    JSON.stringify(sy) !== JSON.stringify(synonyms) ||
    JSON.stringify(pa) !== JSON.stringify(portAliases) ||
    JSON.stringify(sf) !== JSON.stringify(suffixes) ||
    JSON.stringify(mp) !== JSON.stringify(mapping);

  function discard() {
    setT({ ...thresholds });
    setSy([...synonyms]);
    setPa([...portAliases]);
    setSf([...suffixes]);
    setMp([...mapping]);
    setError(null);
  }

  function save() {
    if (t.reviewConfidence > t.acceptConfidence) {
      setError(
        'Review confidence cannot be higher than accept confidence. A value would then be sent for review and accepted at the same time.',
      );
      return;
    }
    if (sy.some((r) => !r.label.trim()) || pa.some((r) => !r.alias.trim() || !r.canonical.trim())) {
      setError('Every row needs its text filled in. Remove any row you do not want to keep.');
      return;
    }
    setError(null);
    saveConfig({ thresholds: t, synonyms: sy, portAliases: pa, suffixes: sf, mapping: mp });
  }

  return (
    <div className="page cfg-page">
      {/* Saving lives in the bar at the foot of the page, which stays in view
          while the form is scrolled, so the header carries no second copy. */}
      <header className="page__head">
        <div>
          <h2 className="page__title">How Tidemark reads and compares</h2>
          <p className="page__sub">
            These settings apply to cases processed from the moment they are saved. Cases already finished are not
            re-run.
          </p>
        </div>
      </header>

      {error && <Banner tone="error" title="These changes were not saved" onDismiss={() => setError(null)}>{error}</Banner>}
      {dirty && !error && (
        <Banner tone="info" title="You have unsaved changes">
          Nothing is applied until you use Save changes.
        </Banner>
      )}

      {/* ---------- thresholds ---------- */}
      <section className="panel" aria-labelledby="cfg-thresholds">
        <header className="panel__head">
          <h3 id="cfg-thresholds" className="panel__title">
            Confidence thresholds and tolerance
          </h3>
        </header>
        <div className="panel__body cfg__grid">
          {THRESHOLD_FIELDS.map((f) => {
            const id = `thr-${f.key}`;
            const def = SEED_THRESHOLDS[f.key];
            const changed = t[f.key] !== def;
            return (
              <div className="cfg__field" key={f.key}>
                <label className="cfg__label" htmlFor={id}>
                  {f.label}
                </label>
                <div className="cfg__input-row">
                  <input
                    id={id}
                    className="input input--num"
                    type="number"
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={t[f.key]}
                    onChange={(e) => setT({ ...t, [f.key]: Number(e.target.value) })}
                  />
                  {f.unit && <span className="cfg__unit">{f.unit}</span>}
                </div>
                <p className="cfg__help">{f.help}</p>
                <p className="cfg__default">
                  Default <span className="num">{def}</span>
                  {f.unit ? ` ${f.unit}` : ''}
                  {changed && <span className="cfg__changed">changed</span>}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- label synonyms ---------- */}
      <EditableSection
        id="cfg-synonyms"
        title="Label synonyms"
        note="A label printed on a document that means one of the seven fields. Matching ignores letter case."
        columns={['Field', 'Label on the document', '']}
        rows={sy}
        onAdd={() => setSy([...sy, { id: uid('sy'), field: 'shipper', label: '' }])}
        onRemove={(id) => setSy(sy.filter((r) => r.id !== id))}
        renderRow={(r) => (
          <>
            <td>
              <select
                className="input input--sm"
                value={r.field}
                aria-label="Field"
                onChange={(e) =>
                  setSy(sy.map((x) => (x.id === r.id ? { ...x, field: e.target.value as FieldKey } : x)))
                }
              >
                {FIELD_ORDER.map((f) => (
                  <option key={f} value={f}>
                    {FIELD_LABELS[f]}
                  </option>
                ))}
              </select>
            </td>
            <td>
              <input
                className="input input--sm"
                value={r.label}
                aria-label="Label on the document"
                placeholder="For example: Also notify"
                onChange={(e) => setSy(sy.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)))}
              />
            </td>
          </>
        )}
      />

      {/* ---------- port aliases ---------- */}
      <EditableSection
        id="cfg-ports"
        title="Port aliases"
        note="A port name as it may appear on a document, and the canonical name it resolves to."
        columns={['Alias on the document', 'Canonical name', 'UN/LOCODE', '']}
        rows={pa}
        onAdd={() => setPa([...pa, { id: uid('pa'), alias: '', canonical: '', unlocode: '' }])}
        onRemove={(id) => setPa(pa.filter((r) => r.id !== id))}
        renderRow={(r) => (
          <>
            <td>
              <input
                className="input input--sm"
                value={r.alias}
                aria-label="Alias"
                placeholder="For example: JEA"
                onChange={(e) => setPa(pa.map((x) => (x.id === r.id ? { ...x, alias: e.target.value } : x)))}
              />
            </td>
            <td>
              <input
                className="input input--sm"
                value={r.canonical}
                aria-label="Canonical name"
                placeholder="For example: Jebel Ali"
                onChange={(e) => setPa(pa.map((x) => (x.id === r.id ? { ...x, canonical: e.target.value } : x)))}
              />
            </td>
            <td>
              <input
                className="input input--sm mono"
                value={r.unlocode}
                aria-label="UN/LOCODE"
                placeholder="AEJEA"
                onChange={(e) => setPa(pa.map((x) => (x.id === r.id ? { ...x, unlocode: e.target.value } : x)))}
              />
            </td>
          </>
        )}
      />

      {/* ---------- company suffixes ---------- */}
      <EditableSection
        id="cfg-suffixes"
        title="Company suffixes"
        note="Suffixes ignored when two company names are compared, so Sdn Bhd and SDN. BHD. count as the same."
        columns={['Suffix', 'Also matches', '']}
        rows={sf}
        onAdd={() => setSf([...sf, { id: uid('sf'), suffix: '', note: '' }])}
        onRemove={(id) => setSf(sf.filter((r) => r.id !== id))}
        renderRow={(r) => (
          <>
            <td>
              <input
                className="input input--sm"
                value={r.suffix}
                aria-label="Suffix"
                placeholder="For example: Pte Ltd"
                onChange={(e) => setSf(sf.map((x) => (x.id === r.id ? { ...x, suffix: e.target.value } : x)))}
              />
            </td>
            <td>
              <input
                className="input input--sm"
                value={r.note}
                aria-label="Also matches"
                placeholder="Other spellings this covers"
                onChange={(e) => setSf(sf.map((x) => (x.id === r.id ? { ...x, note: e.target.value } : x)))}
              />
            </td>
          </>
        )}
      />

      {/* ---------- export field mapping ---------- */}
      <EditableSection
        id="cfg-mapping"
        title="Export field mapping"
        note="The column name each field takes in the submission file and the CSV."
        columns={['Field', 'Export column', 'Required', '']}
        rows={mp}
        onAdd={() => setMp([...mp, { id: uid('mp'), field: 'shipper', exportColumn: '', required: false }])}
        onRemove={(id) => setMp(mp.filter((r) => r.id !== id))}
        renderRow={(r) => (
          <>
            <td>
              <select
                className="input input--sm"
                value={r.field}
                aria-label="Field"
                onChange={(e) =>
                  setMp(mp.map((x) => (x.id === r.id ? { ...x, field: e.target.value as MappingRow['field'] } : x)))
                }
              >
                <option value="caseId">Email ID</option>
                <option value="result">Case result</option>
                {FIELD_ORDER.map((f) => (
                  <option key={f} value={f}>
                    {FIELD_LABELS[f]}
                  </option>
                ))}
              </select>
            </td>
            <td>
              <input
                className="input input--sm mono"
                value={r.exportColumn}
                aria-label="Export column"
                placeholder="shipper_name"
                onChange={(e) =>
                  setMp(mp.map((x) => (x.id === r.id ? { ...x, exportColumn: e.target.value } : x)))
                }
              />
            </td>
            <td>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={r.required}
                  onChange={(e) => setMp(mp.map((x) => (x.id === r.id ? { ...x, required: e.target.checked } : x)))}
                />
                <span>Required</span>
              </label>
            </td>
          </>
        )}
      />

      <div className="cfg__foot">
        <p className="muted">
          {dirty ? 'You have unsaved changes.' : 'Everything on this page matches what is running.'}
        </p>
        <div className="page__head-actions">
          {dirty && (
            <Button icon={<Undo2 size={15} />} onClick={discard}>
              Discard changes
            </Button>
          )}
          <Button variant="primary" icon={<Save size={15} />} onClick={save} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- a table that can be edited in place ---------- */

function EditableSection<T extends { id: string }>({
  id,
  title,
  note,
  columns,
  rows,
  renderRow,
  onAdd,
  onRemove,
}: {
  id: string;
  title: string;
  note: string;
  columns: string[];
  rows: T[];
  renderRow: (r: T) => React.ReactNode;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="panel" aria-labelledby={id}>
      <header className="panel__head">
        <div>
          <h3 id={id} className="panel__title">
            {title}
          </h3>
          <p className="panel__note">{note}</p>
        </div>
        <span className="panel__meta num">{rows.length} rows</span>
      </header>
      {rows.length === 0 ? (
        <div className="panel__body">
          <EmptyState
            title={`No ${title.toLowerCase()} yet`}
            body="Add a row to start. Nothing is applied until you save changes."
            action={{ label: 'Add row', onClick: onAdd }}
          />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table table--edit">
            <thead>
              <tr>
                {columns.map((c, i) => (
                  <th key={i} scope="col" className={i === columns.length - 1 ? 'ta-right col-remove' : undefined}>
                    {c || <span className="sr-only">Remove</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {renderRow(r)}
                  <td className="ta-right col-remove">
                    <IconButton label="Remove this row" size="sm" onClick={() => onRemove(r.id)}>
                      <Trash2 size={14} />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="panel__foot">
        <Button size="sm" icon={<Plus size={14} />} onClick={onAdd}>
          Add row
        </Button>
      </div>
    </section>
  );
}
