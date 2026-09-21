/* ============================================================
   Comparison table. Always reads Field, SI value, BL value, Result.
   Matched rows stay quiet. A mismatch row is marked with the yellow
   highlighter and shows both values in full. An uncertain row says
   Needs review and gives its reason.
   ============================================================ */

import { Highlighter } from 'lucide-react';
import { FIELD_LABELS, type ComparisonRow } from '../types';
import { FieldResultChip } from './chips';

function Value({
  extraction,
  marked,
}: {
  extraction: ComparisonRow['si'];
  marked: boolean;
}) {
  if (extraction.value == null) {
    return (
      <span className="cmp__value cmp__value--missing">
        Not stated on the document
      </span>
    );
  }
  const raw = extraction.raw ?? extraction.value;
  const display = extraction.normalizedFrom ?? raw;
  return (
    <span className={`cmp__value${marked ? ' is-marked' : ''}`}>
      {display}
    </span>
  );
}

export function ComparisonTable({
  rows,
  caption = 'Seven field comparison of the shipping instruction against the draft bill of lading',
  onFieldClick,
  selectedField,
}: {
  rows: ComparisonRow[];
  caption?: string;
  onFieldClick?: (field: ComparisonRow['field']) => void;
  selectedField?: string | null;
}) {
  return (
    <div className="table-wrap">
      <table className="table table--comparison">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="cmp__col-field">
              Field
            </th>
            <th scope="col">Shipping instruction</th>
            <th scope="col">Draft bill of lading</th>
            <th scope="col" className="cmp__col-result">
              Result
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const mismatch = r.result === 'Mismatch';
            const review = r.result === 'Needs review';
            const selected = selectedField === r.field;
            return (
              <tr
                key={r.field}
                className={`cmp__row${mismatch ? ' cmp__row--mismatch' : ''}${review ? ' cmp__row--review' : ''}${selected ? ' is-selected' : ''}${onFieldClick ? ' is-clickable' : ''}`}
                onClick={onFieldClick ? () => onFieldClick(r.field) : undefined}
              >
                <th scope="row" className="cmp__field">
                  {mismatch && (
                    <span className="cmp__marker" aria-hidden="true">
                      <Highlighter size={13} />
                    </span>
                  )}
                  {FIELD_LABELS[r.field]}
                </th>
                <td>
                  <Value extraction={r.si} marked={mismatch} />
                  {r.si.normalizedFrom && (
                    <p className="cmp__note">Read as {r.si.value} after normalization.</p>
                  )}
                </td>
                <td>
                  <Value extraction={r.bl} marked={mismatch} />
                  {r.bl.normalizedFrom && (
                    <p className="cmp__note">Read as {r.bl.value} after normalization.</p>
                  )}
                  {r.normalizationNote && !r.bl.normalizedFrom && (
                    <p className="cmp__note">{r.normalizationNote}</p>
                  )}
                  {r.bl.normalizedFrom && r.normalizationNote && (
                    <p className="cmp__note">{r.normalizationNote}</p>
                  )}
                  {review && r.reviewReason && (
                    <p className="cmp__reason">{r.reviewReason}</p>
                  )}
                </td>
                <td className="cmp__result">
                  <FieldResultChip result={r.result} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
