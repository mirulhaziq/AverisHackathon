/* ============================================================
   6. Review task — three columns filling the viewport.
   Left: email context. Middle: the two documents with the yellow
   highlight over the source. Right: one decision card per field.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  CircleCheck,
  Columns2,
  Mail,
  Paperclip,
  Rows2,
  Save,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, IconButton } from '../components/Button';
import { DecisionCard, type DecisionCardActions } from '../components/DecisionCard';
import { EvidenceViewer } from '../components/EvidenceViewer';
import { Banner, EmptyState } from '../components/feedback';
import { CategoryChip, ReasonCodeTag } from '../components/chips';
import { Tabs } from '../components/Tabs';
import { DOCUMENTS } from '../data/seed';
import { regionFor } from '../data/documents';
import { useStore } from '../state/store';
import { friendlyLabel } from '../data/labels';
import {
  FIELD_LABELS,
  REASON_TEXT,
  type Candidate,
  type CaseResult,
  type Decision,
  type FieldKey,
  type Region,
} from '../types';

type Pane = 'email' | 'documents' | 'decisions';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/* Keyed by task so that moving straight on to the next review (from the
   saved panel) starts with fresh decisions instead of the last task's state. */
export function ReviewTask() {
  const { taskId } = useParams();
  return <ReviewTaskScreen key={taskId} />;
}

function ReviewTaskScreen() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { tasks, getTask, getCase, can, user, saveDecisions, rejectCase, pushToast, claimTask, loadCaseDetail } =
    useStore();

  const task = taskId ? getTask(taskId) : undefined;
  const c = task ? getCase(task.caseId) : undefined;

  useEffect(() => {
    if (task) void loadCaseDetail(task.caseId);
  }, [loadCaseDetail, task]);

  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [selectedId, setSelectedId] = useState<string | null>(task?.questions[0]?.id ?? null);
  const [hovered, setHovered] = useState<Candidate | null>(null);
  const [layout, setLayout] = useState<'stacked' | 'side'>('stacked');
  const [pane, setPane] = useState<Pane>('decisions');
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ caseId: string; result: CaseResult } | null>(null);

  const editable = can('resolveTask');

  /* Keyboard path. Each card registers its actions here; one window listener
     calls whichever handler the latest render left in keyHandler. */
  const cardActions = useRef(new Map<string, DecisionCardActions>());
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  /* React's autoFocus skips links, so the saved panel's lead action is
     focused through this ref instead; Enter then opens it. */
  const focusOnMount = useCallback((el: HTMLElement | null) => el?.focus(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (task && selectedId === null) setSelectedId(task.questions[0]?.id ?? null);
  }, [selectedId, task]);

  if ((!task || !c) && !saved) {
    keyHandler.current = () => {};
    return (
      <div className="page">
        <EmptyState
          title="That task is no longer in the queue"
          body="It was saved or released while this page was open. Open the review queue to pick up the next task."
          action={{ label: 'Open review queue', to: '/review' }}
        />
      </div>
    );
  }

  const selected = task?.questions.find((q) => q.id === selectedId) ?? task?.questions[0];
  const undecided = task?.questions.filter((q) => !decisions[q.id]).length ?? 0;

  /* ---------- which rectangles to light up ---------- */
  const siDoc = c?.attachments.find((a) => a.kind === 'SI');
  const blDoc = c?.attachments.find((a) => a.kind === 'BL');
  const siFac = siDoc ? DOCUMENTS[siDoc.id] ?? null : null;
  const blFac = blDoc ? DOCUMENTS[blDoc.id] ?? null : null;

  let siHighlight: Region | null = null;
  let blHighlight: Region | null = null;
  let markedField: FieldKey | null = null;

  if (hovered) {
    if (hovered.doc === 'SI') siHighlight = hovered.region;
    else blHighlight = hovered.region;
    markedField = selected && selected.field !== 'category' ? (selected.field as FieldKey) : null;
  } else if (selected && selected.field !== 'category') {
    markedField = selected.field as FieldKey;
    siHighlight = regionFor('SI', markedField);
    blHighlight = selected.region ?? regionFor('BL', markedField);
  }

  const markLabel = hovered
    ? `${hovered.value} — ${hovered.sourceLabel}`
    : markedField
      ? FIELD_LABELS[markedField]
      : undefined;

  /* ---------- actions ---------- */
  function decide(d: Decision) {
    setDecisions((prev) => ({ ...prev, [d.questionId]: d }));
    const i = task!.questions.findIndex((q) => q.id === d.questionId);
    const next = task!.questions.slice(i + 1).find((q) => !decisions[q.id]);
    if (next) setSelectedId(next.id);
  }

  function clearDecision(questionId: string) {
    setDecisions((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
    setSelectedId(questionId);
  }

  async function onSave() {
    setSaving(true);
    try {
      const out = await saveDecisions(task!.id, Object.values(decisions));
      setSaving(false);
      setSaved(out);
      pushToast({
        tone: 'success',
        title: 'Decisions saved',
        body: `${out.caseId} has been updated. Result: ${friendlyLabel(out.result)}.`,
        action: { label: `View case ${out.caseId}`, to: `/cases/${out.caseId}` },
      });
    } catch (e) {
      setSaving(false);
      pushToast({
        tone: 'error',
        title: 'Could not save',
        body: e instanceof Error ? e.message : 'The API could not be reached.',
      });
    }
  }

  function onReject() {
    if (rejectNote.trim().length < 8) {
      setRejectError('Write a short note saying why the case is rejected. The sender will be told this reason.');
      return;
    }
    const out = rejectCase(task!.id, rejectNote.trim());
    pushToast({
      tone: 'info',
      title: 'Case rejected',
      body: `${out.caseId} was rejected and its result is now Failed.`,
      action: { label: `View case ${out.caseId}`, to: `/cases/${out.caseId}` },
    });
    navigate('/review');
  }

  keyHandler.current = (e: KeyboardEvent) => {
    if (saved || !task || e.defaultPrevented) return;
    const target = e.target instanceof Element ? e.target : null;
    const typing = !!target?.closest('input:not([type="radio"]), textarea, select, [contenteditable="true"]');

    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (!editable || saving) return;
      if (undecided > 0) {
        pushToast({
          tone: 'info',
          title: 'Not saved yet',
          body: `Decide the ${undecided} remaining card${undecided === 1 ? '' : 's'} first, then save.`,
        });
        return;
      }
      onSave();
      return;
    }

    if (typing || rejecting || e.metaKey || e.ctrlKey || e.altKey) return;
    const qs = task.questions;
    const i = Math.max(0, qs.findIndex((q) => q.id === selected?.id));
    const actions = selected ? cardActions.current.get(selected.id) : undefined;

    switch (e.key) {
      case 'j':
      case 'J':
        if (i < qs.length - 1) {
          e.preventDefault();
          setSelectedId(qs[i + 1].id);
          setHovered(null);
        }
        return;
      case 'k':
      case 'K':
        if (i > 0) {
          e.preventDefault();
          setSelectedId(qs[i - 1].id);
          setHovered(null);
        }
        return;
      case 'Enter': {
        // Enter keeps its usual job on links and buttons, except the card
        // title button, which only selects the card it belongs to.
        const native = target?.closest('a, button, summary');
        if (native && !native.classList.contains('dcard__title-btn')) return;
        e.preventDefault();
        actions?.confirm();
        return;
      }
      case 'e':
      case 'E':
        e.preventDefault();
        actions?.correct();
        return;
      case 'm':
      case 'M':
        e.preventDefault();
        actions?.markMissing();
        return;
    }
  };

  /* ---------- confirmation after saving ---------- */
  if (saved) {
    /* The next task a reviewer can pick up: oldest first, not held by someone else. */
    const nextTask = [...tasks]
      .filter((t) => t.id !== taskId && (!t.claimedBy || t.claimedBy.name === user?.name))
      .sort((a, b) => b.ageMinutes - a.ageMinutes)[0];
    return (
      <div className="page">
        <div className="saved-panel" role="status">
          <span className="saved-panel__icon" aria-hidden="true">
            <CircleCheck size={28} />
          </span>
          <h2 className="saved-panel__title">Decisions saved</h2>
          <p className="saved-panel__body">
            {Object.keys(decisions).length} decision{Object.keys(decisions).length === 1 ? '' : 's'} recorded on{' '}
            <span className="mono">{saved.caseId}</span>. The case is resuming and the report now reads{' '}
            <strong>{friendlyLabel(saved.result)}</strong>.
          </p>
          <p className="saved-panel__note muted">
            {nextTask
              ? `${tasks.length} review${tasks.length === 1 ? '' : 's'} still waiting. Press Enter to open the next one.`
              : 'That was the last review waiting. You can view the updated email or return to the queue.'}
          </p>
          <div className="saved-panel__actions">
            {nextTask && (
              <Link to={`/review/${nextTask.id}`} className="btn btn--primary btn--md" ref={focusOnMount}>
                <span className="btn__label">Next review</span>
                <span className="btn__icon" aria-hidden="true">
                  <ArrowRight size={15} />
                </span>
              </Link>
            )}
            <Link
              to={`/cases/${saved.caseId}`}
              className={`btn ${nextTask ? 'btn--secondary' : 'btn--primary'} btn--md`}
              ref={nextTask ? undefined : focusOnMount}
            >
              <span className="btn__label">View case {saved.caseId}</span>
            </Link>
            <Link to="/review" className="btn btn--secondary btn--md">
              <span className="btn__label">Back to reviews</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!task || !c) return null;

  /* ---------- panes ---------- */

  const emailPane = (
    <section className="rt__col rt__col--email" aria-label="Email context">
      <header className="rt__col-head">
        <h3 className="rt__col-title">
          <Mail size={14} aria-hidden="true" /> Email
        </h3>
        <span className="mono muted">{c.id}</span>
      </header>
      <div className="rt__col-body">
        <h4 className="rt__subject">{c.subject}</h4>
        <p className="rt__sender">
          {c.senderName}
          <br />
          <span className="mono">{c.sender}</span>
        </p>
        <p className="rt__received muted">Received {c.receivedAt}</p>

        <div className="rt__block">
          <span className="label">Category</span>
          <CategoryChip category={c.category} confidence={c.categoryConfidence} />
          <p className="rt__reason">{c.categoryReason}</p>
        </div>

        <div className="rt__block">
          <span className="label">Why this needs a review</span>
          <ul className="rt__reasons">
            {task.reasonCodes.map((rc) => (
              <li key={rc}>
                <ReasonCodeTag code={rc} />
                <p className="rt__reason-text">{REASON_TEXT[rc]}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rt__block">
          <span className="label">
            Attachments <span className="num">({c.attachments.length})</span>
          </span>
          {c.attachments.length === 0 ? (
            <p className="rt__none">
              None. This email asks for a comparison but carries no documents, which is why it is here.
            </p>
          ) : (
            <ul className="rt__attachments">
              {c.attachments.map((a) => (
                <li key={a.id}>
                  <Paperclip size={12} aria-hidden="true" />
                  <span className="mono">{a.filename}</span>
                  <span className="muted">
                    {a.fileType} · {a.sizeLabel}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rt__block">
          <span className="label">Email text</span>
          <p className="rt__body plain-text">{c.body}</p>
        </div>
      </div>
    </section>
  );

  const docsPane = (
    <section className={`rt__col rt__col--docs rt__docs--${layout}`} aria-label="Documents">
      <header className="rt__col-head">
        <h3 className="rt__col-title">Documents</h3>
        <div className="rt__col-tools">
          <IconButton
            label="Stack the documents"
            size="sm"
            pressed={layout === 'stacked'}
            onClick={() => setLayout('stacked')}
          >
            <Rows2 size={15} />
          </IconButton>
          <IconButton
            label="Show the documents side by side"
            size="sm"
            pressed={layout === 'side'}
            onClick={() => setLayout('side')}
          >
            <Columns2 size={15} />
          </IconButton>
        </div>
      </header>
      <div className="rt__viewers">
        <EvidenceViewer
          doc={siFac}
          attachment={siDoc}
          heading="Shipping instruction"
          highlight={siHighlight}
          highlightField={markedField}
          highlightLabel={hovered?.doc === 'SI' ? markLabel : markedField ? FIELD_LABELS[markedField] : undefined}
          compact
        />
        <EvidenceViewer
          doc={blFac}
          attachment={blDoc}
          heading="Draft bill of lading"
          highlight={blHighlight}
          highlightField={markedField}
          highlightLabel={hovered?.doc === 'BL' ? markLabel : markedField ? FIELD_LABELS[markedField] : undefined}
          compact
        />
      </div>
    </section>
  );

  const decisionsPane = (
    <section className="rt__col rt__col--decisions" aria-label="Decisions">
      <header className="rt__col-head">
        <h3 className="rt__col-title">
          Decisions <span className="num muted">({task.questions.length})</span>
        </h3>
        <span className="rt__claim">
          {task.claimedBy ? (
            <>
              <span className="avatar avatar--sm" aria-hidden="true">
                {task.claimedBy.initials}
              </span>
              {task.claimedBy.name}
            </>
          ) : (
            <Button size="sm" onClick={() => claimTask(task.id)} disabled={!editable}>
              Assign to me
            </Button>
          )}
        </span>
      </header>
      <div className="rt__col-body rt__cards">
        {!editable && (
          <Banner tone="info" title="You are signed in as Operator">
            Only a Reviewer or an Admin can decide these values. You can read the task and the documents, and
            the case stays as it is.
          </Banner>
        )}
        {selected?.field === 'category' && (
          <Banner tone="info" title="This task is about the category, not a field">
            No document value is highlighted because nothing was attached. Read the email text on the left, then
            confirm the category or correct it.
          </Banner>
        )}
        {task.questions.map((q, i) => (
          <DecisionCard
            key={q.id}
            question={q}
            index={i}
            total={task.questions.length}
            decision={decisions[q.id]}
            selected={selectedId === q.id}
            disabled={!editable}
            onSelect={() => {
              setSelectedId(q.id);
              setHovered(null);
            }}
            onDecide={decide}
            onClear={() => clearDecision(q.id)}
            onHoverCandidate={setHovered}
            register={(api) => {
              if (api) cardActions.current.set(q.id, api);
              else cardActions.current.delete(q.id);
            }}
          />
        ))}
      </div>
    </section>
  );

  return (
    <div className="rt">
      <div className="rt__top">
        <Link to="/review" className="backlink">
          <ArrowLeft size={14} aria-hidden="true" /> Needs review
        </Link>
        <div className="rt__top-ident">
          <span className="mono">{task.id}</span>
          <span className="muted">·</span>
          <Link to={`/cases/${c.id}`} className="mono">
            {c.id}
          </Link>
          <span className="rt__top-subject truncate">{c.subject}</span>
        </div>
        <span className="rt__top-age">
          Waiting <span className="num">{task.ageLabel}</span>
          {task.dueInLabel && <span className="muted"> · {task.dueInLabel}</span>}
        </span>
      </div>

      <div className="review-guidance"><strong>Check each highlighted detail, then save.</strong><span>Confirm a correct value, correct a mistake, or mark information as missing. Your changes are recorded when you select “Save review”.</span><Link to="/help">Review guide</Link>
        {editable && (
          <p className="rt__keys" aria-label="Keyboard shortcuts">
            <span><kbd>J</kbd><kbd>K</kbd> move</span>
            <span><kbd>Enter</kbd> confirm</span>
            <span><kbd>E</kbd> correct</span>
            <span><kbd>M</kbd> missing</span>
            <span><kbd>{IS_MAC ? '⌘' : 'Ctrl'}</kbd><kbd>S</kbd> save</span>
          </p>
        )}
      </div>

      {/* narrow screens: one pane at a time */}
      <div className="rt__tabs">
        <Tabs
          label="Review task panes"
          size="sm"
          active={pane}
          onChange={(id) => setPane(id as Pane)}
          items={[
            { id: 'email', label: 'Email' },
            { id: 'documents', label: 'Documents' },
            { id: 'decisions', label: 'Your checks', count: undecided },
          ]}
        />
      </div>

      <div className={`rt__grid rt__grid--pane-${pane}`}>
        {emailPane}
        {docsPane}
        {decisionsPane}
      </div>

      {/* ---------- sticky footer ---------- */}
      <footer className="rt__foot">
        <div className="rt__foot-left">
          {rejecting ? (
            <div className="rt__reject">
              <label className="label" htmlFor="reject-note">
                Why is this case rejected? This note is required.
              </label>
              <textarea
                id="reject-note"
                className={`input textarea${rejectError ? ' is-error' : ''}`}
                rows={2}
                value={rejectNote}
                placeholder="For example: the scan is unreadable and the sender must resend it."
                onChange={(e) => {
                  setRejectNote(e.target.value);
                  if (rejectError) setRejectError(null);
                }}
                aria-invalid={Boolean(rejectError)}
                aria-describedby={rejectError ? 'reject-err' : undefined}
              />
              {rejectError && (
                <p className="field-error" id="reject-err" role="alert">
                  {rejectError}
                </p>
              )}
              <div className="rt__reject-actions">
                <Button size="sm" variant="danger" icon={<Ban size={14} />} onClick={onReject}>
                  Reject case
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" icon={<Ban size={15} />} disabled={!editable} onClick={() => setRejecting(true)}>
              Reject case
            </Button>
          )}
        </div>

        <div className="rt__foot-right">
          <p className={`rt__count${undecided === 0 ? ' is-done' : ''}`} aria-live="polite">
            {undecided === 0 ? (
              <>
                <CircleCheck size={14} aria-hidden="true" /> All {task.questions.length} card
                {task.questions.length === 1 ? '' : 's'} decided
              </>
            ) : (
              <>
                <span className="num">{undecided}</span> of{' '}
                <span className="num">{task.questions.length}</span> card
                {task.questions.length === 1 ? '' : 's'} still undecided
              </>
            )}
          </p>
          <Button
            variant="primary"
            size="lg"
            icon={<Save size={15} />}
            loading={saving}
            disabled={!editable || undecided > 0}
            onClick={onSave}
            title={undecided > 0 ? 'Decide every card before saving' : 'Save decisions and resume the case'}
          >
            Save review
          </Button>
        </div>
      </footer>

      <p className="rt__signed-in-as sr-only">
        Signed in as {user?.name}, {user?.role}.
      </p>
    </div>
  );
}
