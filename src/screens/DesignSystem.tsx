/* ============================================================
   Design system page: tokens, type scale, spacing, components.
   ============================================================ */

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CircleCheck, CircleX, Download, Info, Plus, X } from 'lucide-react';
import { Button, IconButton } from '../components/Button';
import { BatchProgressBar, CountBar } from '../components/BatchProgressBar';
import {
  CategoryChip,
  ClaimChip,
  FieldResultChip,
  ReasonCodeTag,
  ResultChip,
  StatusChip,
} from '../components/chips';
import { ComparisonTable } from '../components/ComparisonTable';
import { ConfidenceIndicator } from '../components/ConfidenceIndicator';
import { DecisionCard } from '../components/DecisionCard';
import { EvidenceViewer } from '../components/EvidenceViewer';
import { Banner, CardSkeleton, EmptyState, TableSkeleton } from '../components/feedback';
import { FilterBar, SearchInput, Select } from '../components/FilterBar';
import { Tabs } from '../components/Tabs';
import { DOCUMENTS, SEED_CASES, SEED_TASKS } from '../data/seed';
import { regionFor } from '../data/documents';
import type { CaseResult, CaseStatus, Category, Decision, FieldResult } from '../types';

const TOKEN_GROUPS: Array<{ title: string; note: string; tokens: string[] }> = [
  {
    title: 'Surfaces and rules',
    note: 'Warm ivory paper, quiet panels, and fine rules for a document-led workspace.',
    tokens: ['--paper', '--surface', '--surface-sunken', '--surface-hover', '--rule-soft', '--rule', '--rule-strong'],
  },
  {
    title: 'Ink',
    note: 'Three weights of text. Every one clears WCAG AA on its surface.',
    tokens: ['--ink', '--ink-2', '--ink-3'],
  },
  {
    title: 'Sea green, the primary',
    note: 'Used for the rail, primary buttons and links. Deep enough to carry white text.',
    tokens: ['--steel-900', '--steel-800', '--steel-700', '--steel-600', '--steel-500', '--steel-300', '--steel-100'],
  },
  {
    title: 'Signal orange',
    note: 'The Tidemark accent: warm course lines, editorial labels, and the custom tide mark.',
    tokens: ['--brand-orange', '--brand-soft', '--brand-peach'],
  },
  {
    title: 'Highlighter yellow',
    note: 'Marks the one thing that needs attention: a mismatched value, or the evidence being checked. Never decorative.',
    tokens: ['--marker', '--marker-soft', '--marker-rule', '--marker-ink'],
  },
  {
    title: 'Match',
    note: 'Green, always with the word Match and a tick.',
    tokens: ['--match-ink', '--match-bg', '--match-rule'],
  },
  {
    title: 'Mismatch',
    note: 'Brick red, always with the word Mismatch and a cross.',
    tokens: ['--mismatch-ink', '--mismatch-bg', '--mismatch-rule'],
  },
  {
    title: 'Needs review',
    note: 'Amber, always with the words Needs review and a triangle.',
    tokens: ['--review-ink', '--review-bg', '--review-rule'],
  },
  {
    title: 'Failed and not applicable',
    note: 'Graphite for a failure, an outline chip for not applicable, so neither reads as an alarm.',
    tokens: ['--fail-ink', '--fail-bg', '--fail-rule', '--na-ink', '--na-rule'],
  },
];

const TYPE_ROWS = [
  { token: '--t-display', px: '28px', font: 'Manrope 600', sample: 'Mismatch found in one field', cls: 'ty-display' },
  { token: '--t-h1', px: '30px', font: 'Manrope 600', sample: 'Review task T-2051', cls: 'ty-h1' },
  { token: '--t-h2', px: '18px', font: 'Manrope 600', sample: 'Field comparison', cls: 'ty-h2' },
  { token: '--t-h3', px: '15px', font: 'Manrope 600', sample: 'Gross weight (kg)', cls: 'ty-h3' },
  { token: '--t-body', px: '16px', font: 'DM Sans 400', sample: 'The scan was hard to read, so the value is not certain.', cls: 'ty-body' },
  { token: '--t-small', px: '15px', font: 'DM Sans 400', sample: 'Matched after normalization: letter case ignored.', cls: 'ty-small' },
  { token: '--t-micro', px: '13px', font: 'DM Sans 600', sample: 'Port of discharge', cls: 'ty-micro' },
  { token: '--t-nano', px: '12px', font: 'DM Sans 400', sample: 'Updated 2026-09-21 08:14', cls: 'ty-nano' },
  { token: 'mono', px: '13px', font: 'IBM Plex Mono 400', sample: 'E-1042 · LOW_CONFIDENCE_OCR · MYPKG', cls: 'ty-mono' },
];

const SPACES = ['--s-1', '--s-2', '--s-3', '--s-4', '--s-5', '--s-6', '--s-7', '--s-8', '--s-9', '--s-10'];

const STATUSES: CaseStatus[] = ['Queued', 'Processing', 'Waiting for review', 'Completed', 'Failed'];
const RESULTS: CaseResult[] = [
  'No mismatch detected',
  'Mismatch found',
  'Needs review',
  'Not applicable',
  'Failed',
];
const FIELD_RESULTS: FieldResult[] = ['Match', 'Mismatch', 'Needs review', 'Not compared'];
const CATEGORIES: Category[] = [
  'Document comparison request',
  'New SI request',
  'Invoice query',
  'General message',
  'Spam',
];

export function DesignSystem() {
  const [values, setValues] = useState<Record<string, string>>({});
  const probeRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState('one');
  const [demoDecision, setDemoDecision] = useState<Decision | undefined>(undefined);
  const [demoSearch, setDemoSearch] = useState('');
  const [demoSelect, setDemoSelect] = useState<Category | 'all'>('all');

  /* read the resolved token values so the swatch labels are honest */
  useEffect(() => {
    const el = probeRef.current ?? document.documentElement;
    const cs = getComputedStyle(el);
    const next: Record<string, string> = {};
    for (const g of TOKEN_GROUPS) for (const t of g.tokens) next[t] = cs.getPropertyValue(t).trim();
    for (const s of SPACES) next[s] = cs.getPropertyValue(s).trim();
    setValues(next);
  }, []);

  const demoCase = SEED_CASES.find((c) => c.id === 'E-1042')!;
  const demoTask = SEED_TASKS[0];
  const demoQuestion = demoTask.questions[0];
  const scanDoc = DOCUMENTS['doc-1044-bl'];

  return (
    <div className="page ds" ref={probeRef}>
      <header className="page__head">
        <div>
          <h2 className="page__title">Tidemark design system</h2>
          <p className="page__sub">
            Tokens, type, spacing and every component with the states it needs. Switch the theme in the top bar to
            check both palettes.
          </p>
        </div>
      </header>

      {/* ============ colour ============ */}
      <section className="panel panel--pad ds__section" aria-labelledby="ds-colour">
        <h3 id="ds-colour" className="ds__title">
          Colour tokens
        </h3>
        <p className="ds__note">
          Colour never carries meaning alone. Every semantic colour appears with a word and an icon, so the
          interface still reads correctly in greyscale.
        </p>
        <div className="ds__token-groups">
          {TOKEN_GROUPS.map((g) => (
            <div className="ds__token-group" key={g.title}>
              <h4 className="ds__group-title">{g.title}</h4>
              <p className="ds__group-note">{g.note}</p>
              <ul className="swatches">
                {g.tokens.map((t) => (
                  <li key={t} className="swatch">
                    <span className="swatch__chip" style={{ background: `var(${t})` }} aria-hidden="true" />
                    <span className="swatch__text">
                      <span className="swatch__name mono">{t}</span>
                      <span className="swatch__value mono muted">{values[t] || '—'}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ============ type ============ */}
      <section className="panel panel--pad ds__section" aria-labelledby="ds-type">
        <h3 id="ds-type" className="ds__title">
          Type scale
        </h3>
        <p className="ds__note">
          Headings in Manrope, a sturdy grotesque. Body in DM Sans. Identifiers and reason codes in IBM Plex
          Mono so a code can be read character by character.
        </p>
        <table className="table table--type">
          <thead>
            <tr>
              <th scope="col">Token</th>
              <th scope="col">Size</th>
              <th scope="col">Face</th>
              <th scope="col">Sample</th>
            </tr>
          </thead>
          <tbody>
            {TYPE_ROWS.map((r) => (
              <tr key={r.token}>
                <td className="mono">{r.token}</td>
                <td className="num muted">{r.px}</td>
                <td className="muted">{r.font}</td>
                <td>
                  <span className={r.cls}>{r.sample}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ============ spacing ============ */}
      <section className="panel panel--pad ds__section" aria-labelledby="ds-space">
        <h3 id="ds-space" className="ds__title">
          Spacing and radius
        </h3>
        <p className="ds__note">A 4px base. Corners stay square-ish: 2px on chips and inputs, 3px on panels.</p>
        <ul className="ds__spaces">
          {SPACES.map((s) => (
            <li key={s}>
              <span className="mono">{s}</span>
              <span className="ds__space-bar" style={{ width: `var(${s})` }} aria-hidden="true" />
              <span className="num muted">{values[s] || ''}</span>
            </li>
          ))}
        </ul>
        <ul className="ds__radii">
          {[
            ['--r-1', '2px', 'Chips, inputs'],
            ['--r-2', '3px', 'Panels, buttons'],
            ['--r-3', '4px', 'Overlays'],
          ].map(([t, px, use]) => (
            <li key={t}>
              <span className="ds__radius-box" style={{ borderRadius: `var(${t})` }} aria-hidden="true" />
              <span className="mono">{t}</span>
              <span className="num muted">{px}</span>
              <span className="muted">{use}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ============ chips ============ */}
      <section className="panel panel--pad ds__section" aria-labelledby="ds-chips">
        <h3 id="ds-chips" className="ds__title">
          Chips
        </h3>

        <Spec label="Result chip" note="The five result words, used verbatim in every screen and every export.">
          <div className="ds__row">
            {RESULTS.map((r) => (
              <ResultChip key={r} result={r} />
            ))}
          </div>
        </Spec>

        <Spec label="Status chip" note="Where the case is in the pipeline.">
          <div className="ds__row">
            {STATUSES.map((s) => (
              <StatusChip key={s} status={s} />
            ))}
          </div>
        </Spec>

        <Spec label="Field result chip" note="Used in the Result column of every comparison table.">
          <div className="ds__row">
            {FIELD_RESULTS.map((r) => (
              <FieldResultChip key={r} result={r} />
            ))}
          </div>
        </Spec>

        <Spec label="Category chip" note="With and without the classification confidence.">
          <div className="ds__row ds__row--wrap">
            {CATEGORIES.map((c) => (
              <CategoryChip key={c} category={c} />
            ))}
            <CategoryChip category="Document comparison request" confidence={0.81} />
          </div>
        </Spec>

        <Spec label="Reason code tag" note="The code in monospace, with the plain-language reason beside it where there is room.">
          <div className="ds__col">
            <div className="ds__row">
              <ReasonCodeTag code="LOW_CONFIDENCE_OCR" />
              <ReasonCodeTag code="TWO_CANDIDATES" />
              <ReasonCodeTag code="MISSING_ATTACHMENT" />
              <ReasonCodeTag code="UNKNOWN_PORT_ALIAS" />
            </div>
            <ReasonCodeTag code="WEIGHT_OUT_OF_TOLERANCE" withText />
          </div>
        </Spec>

        <Spec label="Claimed by avatar chip" note="Open, claimed by a named person, and overdue.">
          <div className="ds__row">
            <ClaimChip state="Open" />
            <ClaimChip state="Claimed" claimedBy={{ name: 'Priya Raman', initials: 'PR' }} />
            <ClaimChip state="Overdue" />
          </div>
        </Spec>

        <Spec label="Confidence indicator" note="A band word, a number, and three segments. High at 0.90, medium at 0.70.">
          <div className="ds__row">
            <ConfidenceIndicator value={0.98} />
            <ConfidenceIndicator value={0.81} />
            <ConfidenceIndicator value={0.54} />
            <ConfidenceIndicator value={0.45} size="sm" />
          </div>
        </Spec>
      </section>

      {/* ============ buttons ============ */}
      <section className="panel panel--pad ds__section" aria-labelledby="ds-buttons">
        <h3 id="ds-buttons" className="ds__title">
          Buttons and controls
        </h3>
        <p className="ds__note">
          Hover and focus are shown with the same styles the real controls use, forced on for this page.
        </p>
        <table className="table table--states">
          <thead>
            <tr>
              <th scope="col">Variant</th>
              <th scope="col">Default</th>
              <th scope="col">Hover</th>
              <th scope="col">Focus</th>
              <th scope="col">Disabled</th>
              <th scope="col">Loading</th>
            </tr>
          </thead>
          <tbody>
            {(['primary', 'secondary', 'ghost', 'danger'] as const).map((v) => (
              <tr key={v}>
                <th scope="row">{v}</th>
                <td>
                  <Button variant={v}>Save decisions</Button>
                </td>
                <td>
                  <Button variant={v} className="force-hover">
                    Save decisions
                  </Button>
                </td>
                <td>
                  <Button variant={v} className="force-focus">
                    Save decisions
                  </Button>
                </td>
                <td>
                  <Button variant={v} disabled>
                    Save decisions
                  </Button>
                </td>
                <td>
                  <Button variant={v} loading>
                    Save decisions
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <Spec label="Icon button" note="Always carries a title and an accessible label.">
          <div className="ds__row">
            <IconButton label="Add a row">
              <Plus size={15} />
            </IconButton>
            <IconButton label="Add a row" className="force-hover">
              <Plus size={15} />
            </IconButton>
            <IconButton label="Add a row" className="force-focus">
              <Plus size={15} />
            </IconButton>
            <IconButton label="Add a row" disabled>
              <Plus size={15} />
            </IconButton>
            <IconButton label="Pressed" pressed>
              <Plus size={15} />
            </IconButton>
          </div>
        </Spec>

        <Spec label="Text input" note="Default, focus, with an error, and disabled.">
          <div className="ds__row ds__row--wrap">
            <input className="input" defaultValue="21,850" aria-label="Default input" />
            <input className="input force-focus" defaultValue="21,850" aria-label="Focused input" />
            <div>
              <input className="input is-error" defaultValue="" aria-label="Input with an error" aria-invalid />
              <p className="field-error" role="alert">
                Enter the value as it should read, or use Mark missing.
              </p>
            </div>
            <input className="input" defaultValue="21,850" aria-label="Disabled input" disabled />
          </div>
        </Spec>

        <Spec label="Tabs" note="Arrow keys move between tabs.">
          <Tabs
            label="Demo tabs"
            active={tab}
            onChange={setTab}
            items={[
              { id: 'one', label: 'Documents', count: 2 },
              { id: 'two', label: 'Extracted fields', count: 14 },
              { id: 'three', label: 'Timeline', count: 7 },
            ]}
          />
        </Spec>
      </section>

      {/* ============ filter bar ============ */}
      <section className="panel ds__section" aria-labelledby="ds-filter">
        <header className="panel__head">
          <h3 id="ds-filter" className="panel__title">
            Filter bar
          </h3>
        </header>
        <FilterBar
          activeCount={demoSelect !== 'all' || demoSearch ? 1 : 0}
          onClear={() => {
            setDemoSelect('all');
            setDemoSearch('');
          }}
          resultLabel="13 of 13 emails"
        >
          <SearchInput value={demoSearch} onChange={setDemoSearch} label="Demo search" placeholder="Search ID or subject" />
          <Select label="Category" value={demoSelect} options={CATEGORIES} onChange={setDemoSelect} />
        </FilterBar>
      </section>

      {/* ============ progress ============ */}
      <section className="panel panel--pad ds__section" aria-labelledby="ds-progress">
        <h3 id="ds-progress" className="ds__title">
          Batch progress bar and count bars
        </h3>
        <Spec label="Batch progress" note="Accepted and rejected are separate segments, both named in words.">
          <div className="ds__col">
            <BatchProgressBar expected={40} accepted={28} rejected={3} state="Running" />
            <BatchProgressBar expected={120} accepted={116} rejected={4} state="Complete with rejects" />
            <BatchProgressBar expected={60} accepted={17} rejected={1} state="Stalled" />
          </div>
        </Spec>
        <Spec label="Count bars" note="Plain numbers with a quiet bar, used on the dashboard instead of a chart.">
          <div className="ds__col ds__col--narrow">
            <CountBar label="No mismatch detected" value={2} max={5} tone="match" />
            <CountBar label="Mismatch found" value={2} max={5} tone="mismatch" />
            <CountBar label="Needs review" value={5} max={5} tone="review" />
            <CountBar label="Not applicable" value={3} max={5} tone="na" />
            <CountBar label="Failed" value={1} max={5} tone="fail" />
          </div>
        </Spec>
      </section>

      {/* ============ comparison table ============ */}
      <section className="panel ds__section" aria-labelledby="ds-cmp">
        <header className="panel__head">
          <h3 id="ds-cmp" className="panel__title">
            Comparison table
          </h3>
          <span className="panel__meta">Field, SI value, BL value, Result — always this order</span>
        </header>
        <ComparisonTable rows={demoCase.comparison} />
      </section>

      {/* ============ evidence viewer ============ */}
      <section className="panel ds__section" aria-labelledby="ds-evidence">
        <header className="panel__head">
          <h3 id="ds-evidence" className="panel__title">
            Evidence viewer with highlight box
          </h3>
          <span className="panel__meta">Scanned file, gross weight marked</span>
        </header>
        <div className="ds__viewer">
          <EvidenceViewer
            doc={scanDoc}
            attachment={SEED_CASES.find((c) => c.id === 'E-1044')!.attachments[1]}
            heading="Draft bill of lading"
            highlight={regionFor('BL', 'grossWeightKg')}
            highlightField="grossWeightKg"
            compact
          />
        </div>
      </section>

      {/* ============ decision card ============ */}
      <section className="panel panel--pad ds__section" aria-labelledby="ds-decision">
        <h3 id="ds-decision" className="ds__title">
          Decision card
        </h3>
        <p className="ds__note">
          Undecided on the left, decided on the right. Use Correct on the left card to see the inline input.
        </p>
        <div className="ds__cards">
          <DecisionCard
            question={demoQuestion}
            index={0}
            total={3}
            decision={demoDecision}
            selected
            onSelect={() => undefined}
            onDecide={setDemoDecision}
            onClear={() => setDemoDecision(undefined)}
          />
          <DecisionCard
            question={demoTask.questions[1]}
            index={1}
            total={3}
            decision={{ questionId: demoTask.questions[1].id, kind: 'Confirm', value: 'Zadar Customs Broker d.o.o.' }}
            selected={false}
            onSelect={() => undefined}
            onDecide={() => undefined}
            onClear={() => undefined}
          />
          <DecisionCard
            question={demoTask.questions[2]}
            index={2}
            total={3}
            selected={false}
            disabled
            onSelect={() => undefined}
            onDecide={() => undefined}
            onClear={() => undefined}
          />
        </div>
      </section>

      {/* ============ banners, empty, loading, toast ============ */}
      <section className="panel panel--pad ds__section" aria-labelledby="ds-feedback">
        <h3 id="ds-feedback" className="ds__title">
          Banners, empty states, loading and toasts
        </h3>

        <Spec label="Error banner" note="Says what happened and what to do next.">
          <Banner
            tone="error"
            title="This case failed at ReadDocuments"
            actions={
              <>
                <Button size="sm" variant="primary">
                  Retry from failed step
                </Button>
                <Button size="sm">Restart</Button>
              </>
            }
          >
            <p className="banner__line">
              <span className="mono">DOC_READ_FAILED</span> after 3 attempts.
            </p>
            <p className="banner__line">
              <strong>What to do next.</strong> Ask the sender to resend the draft bill of lading, then retry.
            </p>
          </Banner>
        </Spec>

        <Spec label="Warning, info and success banners">
          <div className="ds__col">
            <Banner tone="warning" title="4 cases still waiting for review">
              They will be exported carrying Needs review. Resolve them first if the submission should carry
              confirmed values.
            </Banner>
            <Banner tone="info" title="You have unsaved changes">
              Nothing is applied until you use Save changes.
            </Banner>
            <Banner tone="success" title="Changes saved">
              The new configuration applies to cases from now on.
            </Banner>
          </div>
        </Spec>

        <Spec label="Confirmation toast" note="The button names the action and the toast repeats the same word.">
          <div className="ds__toasts">
            <div className="toast toast--success">
              <span className="toast__icon" aria-hidden="true">
                <CircleCheck size={16} />
              </span>
              <div className="toast__text">
                <p className="toast__title">Decisions saved</p>
                <p className="toast__body">E-1044 is resuming. The result is now No mismatch detected.</p>
                <span className="toast__action">View case E-1044</span>
              </div>
              <IconButton label="Dismiss">
                <X size={14} />
              </IconButton>
            </div>
            <div className="toast toast--error">
              <span className="toast__icon" aria-hidden="true">
                <CircleX size={16} />
              </span>
              <div className="toast__text">
                <p className="toast__title">Retry failed</p>
                <p className="toast__body">E-1047 failed again at ReadDocuments. Ask the sender to resend the file.</p>
              </div>
              <IconButton label="Dismiss">
                <X size={14} />
              </IconButton>
            </div>
            <div className="toast toast--info">
              <span className="toast__icon" aria-hidden="true">
                <Info size={16} />
              </span>
              <div className="toast__text">
                <p className="toast__title">Sample data reset</p>
                <p className="toast__body">Every case, task and batch is back to its starting state.</p>
              </div>
              <IconButton label="Dismiss">
                <X size={14} />
              </IconButton>
            </div>
          </div>
        </Spec>

        <Spec label="Empty state" note="Points at the next action.">
          <div className="ds__col">
            <div className="panel">
              <EmptyState
                title="The review queue is empty"
                body="Every value Tidemark was unsure about has been confirmed or corrected. New tasks appear here as batches run."
                action={{ label: 'Open the inbox report', to: '/inbox' }}
              />
            </div>
          </div>
        </Spec>

        <Spec label="Loading" note="Table and panel skeletons, announced to screen readers.">
          <div className="ds__col">
            <div className="panel">
              <TableSkeleton rows={3} cols={5} />
            </div>
            <CardSkeleton />
          </div>
        </Spec>
      </section>

      {/* ============ copy rules ============ */}
      <section className="panel panel--pad ds__section" aria-labelledby="ds-copy">
        <h3 id="ds-copy" className="ds__title">
          Copy rules
        </h3>
        <ul className="ds__rules">
          <li>
            <strong>Plain verbs, sentence case.</strong> Save decisions, not SAVE DECISIONS or Submit.
          </li>
          <li>
            <strong>Confirmations repeat the button word.</strong> Save decisions produces Decisions saved. Retry
            produces Retry failed or Retry started.
          </li>
          <li>
            <strong>Errors say what happened and what to do next.</strong> Never only a code.
          </li>
          <li>
            <strong>Result words never change.</strong> No mismatch detected, Mismatch found, Needs review, Not
            applicable, Failed.
          </li>
          <li>
            <strong>Document and email text is plain text.</strong> No rendered HTML from a message, ever.
          </li>
          <li>
            <strong>Uncertainty is stated, not hidden.</strong> A value Tidemark is unsure of says Needs review with
            its reason, and never a guess.
          </li>
        </ul>
        <div className="ds__row">
          <Button variant="primary" iconEnd={<ArrowRight size={15} />}>
            Save decisions
          </Button>
          <Button icon={<Download size={15} />}>Generate submission file</Button>
        </div>
      </section>
    </div>
  );
}

function Spec({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="ds__spec">
      <div className="ds__spec-head">
        <h4 className="ds__spec-title">{label}</h4>
        {note && <p className="ds__spec-note">{note}</p>}
      </div>
      <div className="ds__spec-body">{children}</div>
    </div>
  );
}
