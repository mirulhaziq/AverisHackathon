/* ============================================================
   Application state. One context holds the signed-in session,
   the theme, and the working copy of the sample data so that
   decisions taken in the review screens show up in the report.
   ============================================================ */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  SEED_AUDIT,
  SEED_BATCHES,
  SEED_CASES,
  SEED_EXPORTS,
  SEED_MAPPING,
  SEED_PORT_ALIASES,
  SEED_SUFFIXES,
  SEED_SYNONYMS,
  SEED_TASKS,
  SEED_THRESHOLDS,
  SIGNED_IN_USERS,
} from '../data/seed';
import {
  FIELD_LABELS,
  type AuditEntry,
  type CaseResult,
  type Category,
  type ComparisonRow,
  type ConfigThresholds,
  type Decision,
  type EmailCase,
  type ExportRecord,
  type FieldKey,
  type FieldResult,
  type ImportBatch,
  type MappingRow,
  type PortAliasRow,
  type ReviewTask,
  type Role,
  type SuffixRow,
  type SynonymRow,
  type User,
} from '../types';

/* ---------- theme ---------- */

export type ThemePref = 'light' | 'dark' | 'system';

/* ---------- toasts ---------- */

export interface Toast {
  id: string;
  tone: 'success' | 'error' | 'info';
  title: string;
  body?: string;
  action?: { label: string; to: string };
}

/* ---------- permissions ---------- */

export type Capability =
  | 'view'
  | 'retryCase'
  | 'export'
  | 'reprocessBatch'
  | 'claimTask'
  | 'resolveTask'
  | 'correctCategory'
  | 'configure'
  | 'viewAudit'
  | 'editExportNotes';

const CAPABILITIES: Record<Role, Capability[]> = {
  Operator: ['view', 'retryCase', 'export', 'reprocessBatch', 'editExportNotes'],
  Reviewer: ['view', 'retryCase', 'export', 'claimTask', 'resolveTask', 'correctCategory', 'editExportNotes'],
  Admin: [
    'view',
    'retryCase',
    'export',
    'reprocessBatch',
    'claimTask',
    'resolveTask',
    'correctCategory',
    'configure',
    'viewAudit',
    'editExportNotes',
  ],
};

/* ---------- value normalization, mirrors the back end rules ---------- */

const SUFFIX_PATTERN =
  /\b(sdn\.?\s*bhd\.?|berhad|bhd\.?|gmbh|g\.m\.b\.h\.|b\.?v\.?|l\.?l\.?c\.?|d\.?o\.?o\.?|lda\.?|limitada|a\/s|a\.s\.|as|inc\.?|ltd\.?|pte\.?|plc)\b/gi;

export function normalizeValue(raw: string | null | undefined): string {
  if (raw == null) return '';
  let v = String(raw).toLowerCase();
  v = v.replace(/\bkgs?\b/g, ' ');
  v = v.replace(/,/g, '');
  v = v.replace(/[.’']/g, ' ');
  v = v.replace(SUFFIX_PATTERN, ' ');
  v = v.replace(/\s+/g, ' ').trim();
  return v;
}

function compareValues(si: string | null, bl: string | null): FieldResult {
  if (si == null && bl == null) return 'Not compared';
  if (si == null || bl == null) return 'Mismatch';
  return normalizeValue(si) === normalizeValue(bl) ? 'Match' : 'Mismatch';
}

export function deriveCaseResult(rows: ComparisonRow[], fallback: CaseResult): CaseResult {
  if (rows.length === 0) return fallback;
  if (rows.some((r) => r.result === 'Needs review')) return 'Needs review';
  if (rows.some((r) => r.result === 'Mismatch')) return 'Mismatch found';
  if (rows.some((r) => r.result === 'Match')) return 'No mismatch detected';
  return fallback;
}

/* ---------- context shape ---------- */

interface Store {
  /* session */
  user: User | null;
  sessionExpired: boolean;
  signIn: (role?: Role) => void;
  signOut: () => void;
  expireSession: () => void;
  switchRole: (role: Role) => void;
  can: (c: Capability) => boolean;

  /* theme */
  themePref: ThemePref;
  setThemePref: (t: ThemePref) => void;
  resolvedTheme: 'light' | 'dark';

  /* data */
  cases: EmailCase[];
  tasks: ReviewTask[];
  batches: ImportBatch[];
  exports: ExportRecord[];
  audit: AuditEntry[];
  thresholds: ConfigThresholds;
  synonyms: SynonymRow[];
  portAliases: PortAliasRow[];
  suffixes: SuffixRow[];
  mapping: MappingRow[];

  getCase: (id: string) => EmailCase | undefined;
  getTask: (id: string) => ReviewTask | undefined;
  taskForCase: (caseId: string) => ReviewTask | undefined;

  /* actions */
  claimTask: (taskId: string) => void;
  releaseTask: (taskId: string) => void;
  saveDecisions: (taskId: string, decisions: Decision[]) => { caseId: string; result: CaseResult };
  rejectCase: (taskId: string, note: string) => { caseId: string };
  retryCase: (caseId: string, mode: 'fromFailedStep' | 'restart') => void;
  reprocessBatch: (batchId: string) => void;
  addExport: (format: ExportRecord['format'], pendingReviewCount: number, caseCount: number) => ExportRecord;
  updateExport: (id: string, patch: Partial<Pick<ExportRecord, 'score' | 'notes'>>) => void;
  saveConfig: (next: {
    thresholds: ConfigThresholds;
    synonyms: SynonymRow[];
    portAliases: PortAliasRow[];
    suffixes: SuffixRow[];
    mapping: MappingRow[];
  }) => void;
  resetSampleData: () => void;

  /* toasts */
  toasts: Toast[];
  pushToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
}

const StoreContext = createContext<Store | null>(null);

const LS_THEME = 'sdvs.theme';
const LS_ROLE = 'sdvs.role';

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private window or blocked storage: the app works without it */
  }
}

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `2026-09-21 ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${seq++}`;

export function StoreProvider({ children }: { children: ReactNode }) {
  /* --- session --- */
  const [user, setUser] = useState<User | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  /* --- theme --- */
  const [themePref, setThemePrefState] = useState<ThemePref>(
    () => (readLocal(LS_THEME) as ThemePref | null) ?? 'light',
  );
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme: 'light' | 'dark' =
    themePref === 'system' ? (systemDark ? 'dark' : 'light') : themePref;

  useEffect(() => {
    const root = document.documentElement;
    if (themePref === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', themePref);
  }, [themePref]);

  const setThemePref = useCallback((t: ThemePref) => {
    setThemePrefState(t);
    writeLocal(LS_THEME, t);
  }, []);

  /* --- data --- */
  const [cases, setCases] = useState<EmailCase[]>(() => structuredClone(SEED_CASES));
  const [tasks, setTasks] = useState<ReviewTask[]>(() => structuredClone(SEED_TASKS));
  const [batches, setBatches] = useState<ImportBatch[]>(() => structuredClone(SEED_BATCHES));
  const [exportsList, setExportsList] = useState<ExportRecord[]>(() => structuredClone(SEED_EXPORTS));
  const [audit, setAudit] = useState<AuditEntry[]>(() => structuredClone(SEED_AUDIT));
  const [thresholds, setThresholds] = useState<ConfigThresholds>(() => ({ ...SEED_THRESHOLDS }));
  const [synonyms, setSynonyms] = useState<SynonymRow[]>(() => structuredClone(SEED_SYNONYMS));
  const [portAliases, setPortAliases] = useState<PortAliasRow[]>(() => structuredClone(SEED_PORT_ALIASES));
  const [suffixes, setSuffixes] = useState<SuffixRow[]>(() => structuredClone(SEED_SUFFIXES));
  const [mapping, setMapping] = useState<MappingRow[]>(() => structuredClone(SEED_MAPPING));

  /* --- toasts --- */
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = nextId('toast');
    setToasts((prev) => [...prev, { ...t, id }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 7000);
  }, []);

  /* --- session actions --- */
  const signIn = useCallback((role?: Role) => {
    const chosen = role ?? ((readLocal(LS_ROLE) as Role | null) ?? 'Reviewer');
    setUser(SIGNED_IN_USERS[chosen]);
    setSessionExpired(false);
    writeLocal(LS_ROLE, chosen);
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    setSessionExpired(false);
  }, []);

  const expireSession = useCallback(() => {
    setUser(null);
    setSessionExpired(true);
  }, []);

  const switchRole = useCallback((role: Role) => {
    setUser(SIGNED_IN_USERS[role]);
    writeLocal(LS_ROLE, role);
  }, []);

  const can = useCallback(
    (c: Capability) => (user ? CAPABILITIES[user.role].includes(c) : false),
    [user],
  );

  /* --- lookups --- */
  const getCase = useCallback((id: string) => cases.find((c) => c.id === id), [cases]);
  const getTask = useCallback((id: string) => tasks.find((t) => t.id === id), [tasks]);
  const taskForCase = useCallback((caseId: string) => tasks.find((t) => t.caseId === caseId), [tasks]);

  const logAudit = useCallback((entry: Omit<AuditEntry, 'id' | 'at'>) => {
    setAudit((prev) => [{ ...entry, id: nextId('a'), at: stamp() }, ...prev]);
  }, []);

  /* --- task actions --- */
  const claimTask = useCallback(
    (taskId: string) => {
      if (!user) return;
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, claimState: 'Claimed', claimedBy: { name: user.name, initials: user.initials } }
            : t,
        ),
      );
      const t = tasks.find((x) => x.id === taskId);
      logAudit({
        actor: user.name,
        actorRole: user.role,
        action: 'Task claimed',
        target: taskId,
        ip: '203.0.113.42',
        detail: { Case: t?.caseId ?? '', 'Reason codes': (t?.reasonCodes ?? []).join(', ') },
      });
    },
    [logAudit, tasks, user],
  );

  const releaseTask = useCallback(
    (taskId: string) => {
      if (!user) return;
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, claimState: t.ageMinutes > 1440 ? 'Overdue' : 'Open', claimedBy: undefined } : t,
        ),
      );
      logAudit({
        actor: user.name,
        actorRole: user.role,
        action: 'Claim released',
        target: taskId,
        ip: '203.0.113.42',
        detail: { Reason: 'Released by the reviewer without a decision.' },
      });
    },
    [logAudit, user],
  );

  /* --- the core action: apply decisions and resume the case --- */
  const saveDecisions = useCallback(
    (taskId: string, decisions: Decision[]) => {
      const task = tasks.find((t) => t.id === taskId);
      const actor = user?.name ?? 'Unknown reviewer';
      if (!task) return { caseId: '', result: 'Needs review' as CaseResult };

      let finalResult: CaseResult = 'Needs review';

      setCases((prev) =>
        prev.map((c) => {
          if (c.id !== task.caseId) return c;

          const rows = c.comparison.map((r) => ({ ...r, si: { ...r.si }, bl: { ...r.bl } }));
          const history = [...c.reviewHistory];
          let category: Category = c.category;
          let categoryConfidence = c.categoryConfidence;
          let categoryReason = c.categoryReason;

          for (const d of decisions) {
            const q = task.questions.find((x) => x.id === d.questionId);
            if (!q) continue;

            /* category questions change the classification, not a field */
            if (q.field === 'category') {
              if (d.kind === 'Correct' && d.value) {
                const from = category;
                category = d.value as Category;
                categoryConfidence = 1;
                categoryReason = `Corrected by ${actor} during review. SDVS had proposed ${from} at confidence ${q.confidence.toFixed(2)}.`;
                history.push({
                  id: nextId('rh'),
                  at: stamp(),
                  actor,
                  action: 'Category corrected',
                  from,
                  to: d.value,
                });
              } else if (d.kind === 'Confirm') {
                categoryConfidence = 1;
                categoryReason = `Confirmed by ${actor} during review.`;
                history.push({
                  id: nextId('rh'),
                  at: stamp(),
                  actor,
                  action: 'Confirmed',
                  to: category,
                });
              } else {
                history.push({
                  id: nextId('rh'),
                  at: stamp(),
                  actor,
                  action: 'Marked missing',
                  note: 'No documents were attached, so nothing could be compared.',
                });
              }
              continue;
            }

            const field = q.field as FieldKey;
            const idx = rows.findIndex((r) => r.field === field);
            if (idx === -1) continue;
            const r = rows[idx];
            const before = r.bl.value;

            if (d.kind === 'Mark missing') {
              r.bl = {
                ...r.bl,
                value: null,
                method: 'Not found',
                confidence: 1,
                snippet: `Marked missing by ${actor}. The value is not stated on this document.`,
              };
              history.push({
                id: nextId('rh'),
                at: stamp(),
                actor,
                field,
                action: 'Marked missing',
                from: before ?? undefined,
                note: 'The reviewer confirmed the value is not stated on the draft bill of lading.',
              });
            } else {
              const chosen = d.value ?? q.proposedValue;
              const candidate = d.candidateId ? q.candidates?.find((c2) => c2.id === d.candidateId) : undefined;
              r.bl = {
                ...r.bl,
                value: chosen,
                raw: candidate?.value ?? chosen ?? undefined,
                confidence: 1,
                method: candidate ? candidate.doc === 'SI' ? 'Labelled field' : r.bl.method : r.bl.method,
                snippet: candidate
                  ? `${candidate.snippet}\nChosen by ${actor} from ${candidate.sourceLabel}.`
                  : `${r.bl.snippet}\n${d.kind === 'Correct' ? 'Corrected' : 'Confirmed'} by ${actor}.`,
                region: candidate?.region ?? r.bl.region,
              };
              history.push({
                id: nextId('rh'),
                at: stamp(),
                actor,
                field,
                action: d.kind === 'Correct' ? 'Corrected' : 'Confirmed',
                from: before ?? undefined,
                to: chosen ?? undefined,
                note: candidate ? `Taken from ${candidate.sourceLabel}.` : undefined,
              });
            }

            /* the question is answered, so the row is compared again */
            r.result = compareValues(r.si.value, r.bl.value);
            r.reviewReason = undefined;
            if (r.result === 'Match' && r.si.value && r.bl.value && r.si.value !== r.bl.value) {
              r.normalizationNote = 'Matched after normalization: letter case, punctuation and units were ignored.';
            }
            if (r.bl.value == null) {
              r.normalizationNote = undefined;
            }
            rows[idx] = r;
          }

          const result = deriveCaseResult(rows, category === 'Document comparison request' ? 'Not applicable' : 'Not applicable');
          finalResult = result;

          const extraSteps = [
            {
              step: 'ApplyReviewDecisions',
              state: 'Done' as const,
              at: stamp(),
              detail: `${decisions.length} decision${decisions.length === 1 ? '' : 's'} applied by ${actor}.`,
              durationMs: 900,
            },
            ...(rows.length > 0
              ? [
                  {
                    step: 'CompareFields',
                    state: 'Done' as const,
                    at: stamp(),
                    detail: `Re-run after review. ${rows.filter((r) => r.result === 'Match').length} fields match, ${rows.filter((r) => r.result === 'Mismatch').length} differ.`,
                    durationMs: 2100,
                  },
                ]
              : []),
            {
              step: 'PublishResult',
              state: 'Done' as const,
              at: stamp(),
              detail:
                rows.length === 0
                  ? 'Confirmed as classified, but no documents were attached, so nothing could be compared. Result published: Not applicable.'
                  : `Result published: ${result}.`,
              durationMs: 720,
            },
          ];

          return {
            ...c,
            category,
            categoryConfidence,
            categoryReason,
            comparison: rows,
            reviewHistory: history,
            status: 'Completed',
            result,
            updatedAt: stamp().slice(0, 16),
            timeline: [...c.timeline.filter((s) => s.step !== 'PublishResult'), ...extraSteps],
          };
        }),
      );

      setTasks((prev) => prev.filter((t) => t.id !== taskId));

      for (const d of decisions) {
        const q = task.questions.find((x) => x.id === d.questionId);
        if (!q) continue;
        const label = q.field === 'category' ? 'Category' : FIELD_LABELS[q.field as FieldKey];
        logAudit({
          actor,
          actorRole: user?.role ?? 'Reviewer',
          action: 'Decision saved',
          target: task.caseId,
          ip: '203.0.113.42',
          detail: {
            Task: task.id,
            Field: label,
            Decision: d.kind,
            Value: d.value ?? 'Not stated',
          },
        });
      }

      return { caseId: task.caseId, result: finalResult };
    },
    [logAudit, tasks, user],
  );

  const rejectCase = useCallback(
    (taskId: string, note: string) => {
      const task = tasks.find((t) => t.id === taskId);
      const actor = user?.name ?? 'Unknown reviewer';
      if (!task) return { caseId: '' };

      setCases((prev) =>
        prev.map((c) =>
          c.id === task.caseId
            ? {
                ...c,
                status: 'Failed',
                result: 'Failed',
                updatedAt: stamp().slice(0, 16),
                failure: {
                  step: 'ReviewDecision',
                  code: 'REJECTED_BY_REVIEWER',
                  message: `${actor} rejected this case during review. Note: ${note}`,
                  attempts: 1,
                  nextAction:
                    'Ask the sender for a clean copy of the documents, then use Restart to run the case again from the beginning.',
                },
                reviewHistory: [
                  ...c.reviewHistory,
                  { id: nextId('rh'), at: stamp(), actor, action: 'Rejected case' as const, note },
                ],
                timeline: [
                  ...c.timeline.filter((s) => s.step !== 'PublishResult'),
                  {
                    step: 'ReviewDecision',
                    state: 'Failed' as const,
                    at: stamp(),
                    detail: `Rejected by ${actor}. ${note}`,
                  },
                  {
                    step: 'PublishResult',
                    state: 'Done' as const,
                    at: stamp(),
                    detail: 'Result published: Failed.',
                    durationMs: 600,
                  },
                ],
              }
            : c,
        ),
      );
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      logAudit({
        actor,
        actorRole: user?.role ?? 'Reviewer',
        action: 'Case rejected',
        target: task.caseId,
        ip: '203.0.113.42',
        detail: { Task: task.id, Note: note },
      });
      return { caseId: task.caseId };
    },
    [logAudit, tasks, user],
  );

  const retryCase = useCallback(
    (caseId: string, mode: 'fromFailedStep' | 'restart') => {
      const actor = user?.name ?? 'Unknown operator';
      setCases((prev) =>
        prev.map((c) => {
          if (c.id !== caseId) return c;
          const failedStep = c.failure?.step ?? 'ReadDocuments';
          return {
            ...c,
            status: 'Processing',
            updatedAt: stamp().slice(0, 16),
            timeline: [
              ...c.timeline,
              {
                step: mode === 'restart' ? 'Restart' : `Retry ${failedStep}`,
                state: 'Running' as const,
                at: stamp(),
                detail:
                  mode === 'restart'
                    ? `Restarted from the beginning by ${actor}.`
                    : `Retried from ${failedStep} by ${actor}.`,
              },
            ],
          };
        }),
      );
      logAudit({
        actor,
        actorRole: user?.role ?? 'Operator',
        action: mode === 'restart' ? 'Case restarted' : 'Case retried',
        target: caseId,
        ip: '203.0.113.19',
        detail: { Mode: mode === 'restart' ? 'Restart' : 'Retry from failed step' },
      });

      /* the prototype settles back into the failed state so the screen stays honest */
      window.setTimeout(() => {
        setCases((prev) =>
          prev.map((c) =>
            c.id === caseId
              ? {
                  ...c,
                  status: 'Failed',
                  result: 'Failed',
                  updatedAt: stamp().slice(0, 16),
                  timeline: [
                    ...c.timeline,
                    {
                      step: c.failure?.step ?? 'ReadDocuments',
                      state: 'Failed' as const,
                      at: stamp(),
                      detail: 'The file could not be read. The upload is still incomplete.',
                    },
                  ],
                }
              : c,
          ),
        );
        pushToast({
          tone: 'error',
          title: 'Retry failed',
          body: `${caseId} failed again at ${SEED_CASES.find((c) => c.id === caseId)?.failure?.step ?? 'ReadDocuments'}. The file is still unreadable, so ask the sender to resend it.`,
        });
      }, 2600);
    },
    [logAudit, pushToast, user],
  );

  const reprocessBatch = useCallback(
    (batchId: string) => {
      const actor = user?.name ?? 'Unknown operator';
      setBatches((prev) =>
        prev.map((b) =>
          b.id === batchId
            ? {
                ...b,
                state: 'Running',
                received: Math.min(b.expected, b.received + Math.ceil((b.expected - b.received) / 2)),
                accepted: Math.min(b.expected, b.accepted + Math.ceil((b.expected - b.received) / 2)),
                deadLetterCount: 0,
                deadLetterNote: 'The dead-letter queue was drained into this reprocess run.',
              }
            : b,
        ),
      );
      logAudit({
        actor,
        actorRole: user?.role ?? 'Operator',
        action: 'Batch reprocessed',
        target: batchId,
        ip: '203.0.113.19',
        detail: { Scope: 'Rejected records and the dead-letter queue' },
      });
      pushToast({
        tone: 'success',
        title: 'Batch reprocessing',
        body: `${batchId} is running again. The dead-letter queue was drained into this run.`,
      });
    },
    [logAudit, pushToast, user],
  );

  const addExport = useCallback(
    (format: ExportRecord['format'], pendingReviewCount: number, caseCount: number) => {
      const n = exportsList.length + 44;
      const record: ExportRecord = {
        id: `X-00${n}`,
        createdAt: stamp().slice(0, 16),
        createdBy: user?.name ?? 'Unknown',
        format,
        caseCount,
        pendingReviewCount,
        score: '',
        notes: '',
        filename:
          format === 'CSV' ? `sdvs-cases-2026-09-21.csv` : `sdvs-submission-2026-09-21.json`,
      };
      setExportsList((prev) => [record, ...prev]);
      logAudit({
        actor: user?.name ?? 'Unknown',
        actorRole: user?.role ?? 'Operator',
        action: 'Export generated',
        target: record.id,
        ip: '203.0.113.19',
        detail: {
          Format: format,
          Cases: String(caseCount),
          'Waiting for review': String(pendingReviewCount),
          File: record.filename,
        },
      });
      return record;
    },
    [exportsList.length, logAudit, user],
  );

  const updateExport = useCallback(
    (id: string, patch: Partial<Pick<ExportRecord, 'score' | 'notes'>>) => {
      setExportsList((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    },
    [],
  );

  const saveConfig = useCallback(
    (next: {
      thresholds: ConfigThresholds;
      synonyms: SynonymRow[];
      portAliases: PortAliasRow[];
      suffixes: SuffixRow[];
      mapping: MappingRow[];
    }) => {
      setThresholds(next.thresholds);
      setSynonyms(next.synonyms);
      setPortAliases(next.portAliases);
      setSuffixes(next.suffixes);
      setMapping(next.mapping);
      logAudit({
        actor: user?.name ?? 'Unknown',
        actorRole: user?.role ?? 'Admin',
        action: 'Configuration changed',
        target: 'Configuration',
        ip: '198.51.100.7',
        detail: {
          'Accept confidence': next.thresholds.acceptConfidence.toFixed(2),
          'Review confidence': next.thresholds.reviewConfidence.toFixed(2),
          'Weight tolerance': `${next.thresholds.weightTolerancePct}%`,
          'Label synonyms': String(next.synonyms.length),
          'Port aliases': String(next.portAliases.length),
        },
      });
      pushToast({ tone: 'success', title: 'Changes saved', body: 'The new configuration applies to cases from now on.' });
    },
    [logAudit, pushToast, user],
  );

  const resetSampleData = useCallback(() => {
    setCases(structuredClone(SEED_CASES));
    setTasks(structuredClone(SEED_TASKS));
    setBatches(structuredClone(SEED_BATCHES));
    setExportsList(structuredClone(SEED_EXPORTS));
    setAudit(structuredClone(SEED_AUDIT));
    setThresholds({ ...SEED_THRESHOLDS });
    setSynonyms(structuredClone(SEED_SYNONYMS));
    setPortAliases(structuredClone(SEED_PORT_ALIASES));
    setSuffixes(structuredClone(SEED_SUFFIXES));
    setMapping(structuredClone(SEED_MAPPING));
    pushToast({ tone: 'info', title: 'Sample data reset', body: 'Every case, task and batch is back to its starting state.' });
  }, [pushToast]);

  const value = useMemo<Store>(
    () => ({
      user,
      sessionExpired,
      signIn,
      signOut,
      expireSession,
      switchRole,
      can,
      themePref,
      setThemePref,
      resolvedTheme,
      cases,
      tasks,
      batches,
      exports: exportsList,
      audit,
      thresholds,
      synonyms,
      portAliases,
      suffixes,
      mapping,
      getCase,
      getTask,
      taskForCase,
      claimTask,
      releaseTask,
      saveDecisions,
      rejectCase,
      retryCase,
      reprocessBatch,
      addExport,
      updateExport,
      saveConfig,
      resetSampleData,
      toasts,
      pushToast,
      dismissToast,
    }),
    [
      addExport,
      audit,
      batches,
      can,
      cases,
      claimTask,
      dismissToast,
      expireSession,
      exportsList,
      getCase,
      getTask,
      mapping,
      portAliases,
      pushToast,
      rejectCase,
      releaseTask,
      reprocessBatch,
      resetSampleData,
      resolvedTheme,
      retryCase,
      saveConfig,
      saveDecisions,
      sessionExpired,
      setThemePref,
      signIn,
      signOut,
      suffixes,
      switchRole,
      synonyms,
      taskForCase,
      tasks,
      themePref,
      thresholds,
      toasts,
      updateExport,
      user,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
