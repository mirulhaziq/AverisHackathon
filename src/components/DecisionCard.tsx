/* ============================================================
   Decision card. One card per field in question.
   Shows the field, the SI value, the BL value, the proposed value,
   a confidence indicator with a number, and the source snippet.
   Actions: Confirm, Correct, Mark missing.
   ============================================================ */

import { useEffect, useRef, useState } from 'react';
import { Check, CirclePlus, Highlighter, Pencil, Undo2 } from 'lucide-react';
import type { Candidate, Decision, DecisionQuestion } from '../types';
import { FIELD_LABELS, REASON_TEXT } from '../types';
import { Button } from './Button';
import { ConfidenceIndicator } from './ConfidenceIndicator';
import { ReasonCodeTag } from './chips';

const CATEGORY_CHOICES = [
  'Document comparison request',
  'New SI request',
  'Invoice query',
  'General message',
  'Spam',
];

export function DecisionCard({
  question,
  index,
  total,
  decision,
  selected,
  disabled = false,
  onSelect,
  onDecide,
  onClear,
  onHoverCandidate,
}: {
  question: DecisionQuestion;
  index: number;
  total: number;
  decision?: Decision;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onDecide: (d: Decision) => void;
  onClear: () => void;
  onHoverCandidate?: (c: Candidate | null) => void;
}) {
  const [mode, setMode] = useState<'idle' | 'correcting'>('idle');
  const [draft, setDraft] = useState(question.proposedValue ?? '');
  const [pickedCandidate, setPickedCandidate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLElement>(null);

  const label = question.field === 'category' ? 'Category' : FIELD_LABELS[question.field];
  const isCategory = question.field === 'category';

  useEffect(() => {
    if (mode === 'correcting') inputRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    if (selected) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selected]);

  function applyCorrection() {
    const v = draft.trim();
    if (!v) {
      setError('Enter the value as it should read, or use Mark missing if it is not on the document.');
      return;
    }
    setError(null);
    setMode('idle');
    onDecide({ questionId: question.id, kind: 'Correct', value: v });
  }

  const decided = Boolean(decision);

  return (
    <article
      ref={cardRef}
      className={`dcard${selected ? ' is-selected' : ''}${decided ? ' is-decided' : ''}${disabled ? ' is-disabled' : ''}`}
      aria-labelledby={`dcard-${question.id}-title`}
      onClick={() => !selected && onSelect()}
    >
      <header className="dcard__head">
        <div className="dcard__ident">
          <button
            type="button"
            className="dcard__title-btn"
            id={`dcard-${question.id}-title`}
            onClick={onSelect}
            aria-pressed={selected}
          >
            <span className="dcard__seq num">
              {index + 1}/{total}
            </span>
            <span className="dcard__title">{label}</span>
            {selected && (
              <span className="dcard__showing">
                <Highlighter size={12} aria-hidden="true" /> showing
              </span>
            )}
          </button>
        </div>
        <ConfidenceIndicator value={question.confidence} size="sm" />
      </header>

      <details className="dcard__reasons technical-details"><summary>Technical details</summary>
        {question.reasonCodes.map((rc) => (
          <ReasonCodeTag key={rc} code={rc} />
        ))}
      </details>
      <p className="dcard__reason-text">{question.reasonCodes.map((rc) => REASON_TEXT[rc]).join(' ')}</p>

      {!isCategory && (
        <dl className="dcard__values">
          <div>
            <dt>Shipping instruction</dt>
            <dd>{question.siValue ?? <span className="muted">Not stated</span>}</dd>
          </div>
          <div>
            <dt>Draft bill of lading</dt>
            <dd>{question.blValue ?? <span className="muted">Not read with confidence</span>}</dd>
          </div>
          <div>
            <dt>Suggested value</dt>
            <dd className="dcard__proposed">
              {question.proposedValue ?? <span className="muted">None proposed</span>}
            </dd>
          </div>
          <div>
            <dt>Read by</dt>
            <dd>{question.method}</dd>
          </div>
        </dl>
      )}

      {isCategory && (
        <dl className="dcard__values dcard__values--single">
          <div>
            <dt>Proposed category</dt>
            <dd className="dcard__proposed">{question.proposedValue}</dd>
          </div>
        </dl>
      )}

      <div className="dcard__snippet">
        <span className="label">Text from the document</span>
        <p className="snippet plain-text">{question.snippet}</p>
      </div>

      {question.candidates && question.candidates.length > 1 && (
        <fieldset className="dcard__candidates">
          <legend>Two values were found. Pick the one that should stand.</legend>
          {question.candidates.map((c) => (
            <label
              key={c.id}
              className={`candidate${pickedCandidate === c.id ? ' is-picked' : ''}`}
              onMouseEnter={() => onHoverCandidate?.(c)}
              onMouseLeave={() => onHoverCandidate?.(null)}
              onFocus={() => onHoverCandidate?.(c)}
            >
              <input
                type="radio"
                name={`cand-${question.id}`}
                value={c.id}
                checked={pickedCandidate === c.id}
                disabled={disabled}
                onChange={() => {
                  setPickedCandidate(c.id);
                  onHoverCandidate?.(c);
                }}
              />
              <span className="candidate__body">
                <span className="candidate__value">{c.value}</span>
                <span className="candidate__source">{c.sourceLabel}</span>
                <span className="candidate__snippet mono">{c.snippet}</span>
              </span>
              <ConfidenceIndicator value={c.confidence} size="sm" showBand={false} />
            </label>
          ))}
        </fieldset>
      )}

      {mode === 'correcting' && (
        <div className="dcard__correct">
          <label className="label" htmlFor={`corr-${question.id}`}>
            {isCategory ? 'Correct the category' : `Correct the ${label.toLowerCase()} as it should read`}
          </label>
          {isCategory ? (
            <select
              id={`corr-${question.id}`}
              className="input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            >
              {CATEGORY_CHOICES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <input
              ref={inputRef}
              id={`corr-${question.id}`}
              className={`input${error ? ' is-error' : ''}`}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyCorrection();
                if (e.key === 'Escape') setMode('idle');
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `corr-${question.id}-err` : undefined}
            />
          )}
          {error && (
            <p className="field-error" id={`corr-${question.id}-err`} role="alert">
              {error}
            </p>
          )}
          <div className="dcard__correct-actions">
            <Button size="sm" variant="primary" icon={<Check size={14} />} onClick={applyCorrection}>
              Apply correction
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {decided ? (
        <div className="dcard__decided">
          <p className="dcard__decided-text">
            <Check size={14} aria-hidden="true" />
            <span>
              <strong>{decision!.kind === 'Mark missing' ? 'Marked missing' : decision!.kind === 'Correct' ? 'Corrected' : 'Confirmed'}</strong>
              {decision!.value ? (
                <>
                  {' '}
                  as <span className="dcard__decided-value">{decision!.value}</span>
                </>
              ) : (
                <> — the value is not stated on the document</>
              )}
            </span>
          </p>
          <Button size="sm" variant="ghost" icon={<Undo2 size={14} />} onClick={onClear} disabled={disabled}>
            Change
          </Button>
        </div>
      ) : (
        mode === 'idle' && (
          <div className="dcard__actions">
            <Button
              size="sm"
              variant="primary"
              icon={<Check size={14} />}
              disabled={disabled || (Boolean(question.candidates?.length) && !pickedCandidate && !question.proposedValue)}
              onClick={() => {
                const cand = question.candidates?.find((c) => c.id === pickedCandidate);
                onDecide({
                  questionId: question.id,
                  kind: 'Confirm',
                  value: cand ? cand.value : question.proposedValue,
                  candidateId: cand?.id,
                });
              }}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              icon={<Pencil size={14} />}
              disabled={disabled}
              onClick={() => {
                setDraft(question.proposedValue ?? '');
                setMode('correcting');
              }}
            >
              Correct
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<CirclePlus size={14} className="rot45" />}
              disabled={disabled}
              onClick={() => onDecide({ questionId: question.id, kind: 'Mark missing', value: null })}
            >
              Mark missing
            </Button>
          </div>
        )
      )}

      {question.candidates && question.candidates.length > 1 && !decided && !pickedCandidate && (
        <p className="dcard__hint">
          Pick a value above, then Confirm. Confirm without a pick keeps the proposed value.
        </p>
      )}
    </article>
  );
}
