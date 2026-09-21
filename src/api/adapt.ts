/* ============================================================
   Maps the real backend's wire shapes (src/api/client.ts) onto the
   frontend's existing domain types (src/types.ts), so every screen built
   against the seed data keeps working unchanged against real data.

   Known, accepted gaps (backend doesn't produce these yet):
   - No page images / bounding boxes, so EvidenceViewer falls back to its
     "No document" panel for real cases (it already handles that).
   - No batches, exports, audit log, or admin config endpoints - those
     stay on seed data (see state/store.tsx).
   - Case-level reviews (wrong_doc_type / missing_attachment / unreadable)
     have no per-field data to show, so they render as a single synthetic
     "category" question. The backend has no endpoint to resolve these
     yet, so saving one is a local-only acknowledgement (see saveDecisions
     in state/store.tsx).
   ============================================================ */
import type {
  WireEmail,
  WireEmailSummary,
  WireFieldDecision,
  WireResult,
  WireResultLight,
} from './client';
import { attachmentFileUrl } from './client';
import type {
  Attachment,
  CaseResult,
  CaseStatus,
  Category,
  ComparisonRow,
  DecisionQuestion,
  DocKind,
  EmailCase,
  FieldKey,
  ReasonCode,
  ReviewHistoryEntry,
  ReviewTask,
  TimelineStep,
} from '../types';

/* ---------- enum mappings ---------- */

const CATEGORY_MAP: Record<string, Category> = {
  BL_COMPARISON: 'Document comparison request',
  SI_REQUEST: 'New SI request',
  INVOICE_QUERY: 'Invoice query',
  GENERAL: 'General message',
  SPAM: 'Spam',
};
const CATEGORY_MAP_REV: Record<Category, string> = {
  'Document comparison request': 'BL_COMPARISON',
  'New SI request': 'SI_REQUEST',
  'Invoice query': 'INVOICE_QUERY',
  'General message': 'GENERAL',
  Spam: 'SPAM',
};

export function mapCategory(wire: string): Category {
  return CATEGORY_MAP[wire] ?? 'General message';
}

const FIELD_MAP: Record<string, FieldKey> = {
  shipper: 'shipper',
  consignee: 'consignee',
  notify_party: 'notifyParty',
  port_of_loading: 'portOfLoading',
  port_of_discharge: 'portOfDischarge',
  container_count: 'containerCount',
  gross_weight_kg: 'grossWeightKg',
};
const FIELD_MAP_REV: Record<FieldKey, string> = {
  shipper: 'shipper',
  consignee: 'consignee',
  notifyParty: 'notify_party',
  portOfLoading: 'port_of_loading',
  portOfDischarge: 'port_of_discharge',
  containerCount: 'container_count',
  grossWeightKg: 'gross_weight_kg',
};

const REASON_MAP: Record<string, ReasonCode> = {
  wrong_doc_type: 'WRONG_DOC_TYPE',
  missing_attachment: 'MISSING_ATTACHMENT',
  unreadable: 'UNREADABLE_DOCUMENT',
  missing_value: 'FIELD_NOT_FOUND',
};

function mapStatus(r: WireResultLight | WireResult): CaseStatus {
  const meta = 'meta' in r ? r.meta : r;
  if (meta.proc_state === 'failed') return 'Failed';
  if (r.status === 'NEEDS_REVIEW') return 'Waiting for review';
  if (r.status === null) return 'Processing';
  return 'Completed';
}

function mapResult(r: WireResultLight | WireResult): CaseResult {
  const meta = 'meta' in r ? r.meta : r;
  if (meta.proc_state === 'failed') return 'Failed';
  if (r.category !== 'BL_COMPARISON') return 'Not applicable';
  if (r.status === 'MISMATCH') return 'Mismatch found';
  if (r.status === 'NEEDS_REVIEW') return 'Needs review';
  if (r.status === 'OK') return 'No mismatch detected';
  return 'Not applicable';
}

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

function fileTypeFor(path: string): Attachment['fileType'] {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'PDF';
  if (ext === 'docx') return 'DOCX';
  if (ext === 'xlsx') return 'XLSX';
  return 'TXT';
}

function mapAttachment(path: string, source?: { emailId: string; index: number }): Attachment {
  const name = basename(path).toUpperCase();
  const kind: Attachment['kind'] = name.includes('_SI') ? 'SI' : name.includes('_BL') ? 'BL' : 'Other';
  return {
    id: path,
    filename: basename(path),
    kind,
    sizeLabel: '—',
    fileType: fileTypeFor(path),
    pageCount: 1,
    ...(source && { source, fileUrl: attachmentFileUrl(source.emailId, source.index) }),
  };
}

function mapComparisonRow(c: WireResult['comparisons'][number]): ComparisonRow {
  const field = FIELD_MAP[c.field] ?? (c.field as FieldKey);
  const result: ComparisonRow['result'] = c.match === true ? 'Match' : c.match === false ? 'Mismatch' : 'Needs review';
  return {
    field,
    si: {
      value: c.si_value,
      method: c.si_value ? 'Labelled field' : 'Not found',
      confidence: c.si_value ? 1 : 0,
      snippet: c.si_evidence?.snippet ?? 'Not found in this document.',
    },
    bl: {
      value: c.bl_value,
      method: c.bl_value ? 'Labelled field' : 'Not found',
      confidence: c.bl_value ? 1 : 0,
      snippet: c.bl_evidence?.snippet ?? 'Not found in this document.',
    },
    result,
    reviewReason: c.match === null ? 'The value is missing on at least one side.' : undefined,
  };
}

function mapTimeline(result: WireResult): TimelineStep[] {
  const at = result.meta.updated_at ?? '';
  return result.steps.map((s) => ({
    step: s.step,
    state: s.ok ? 'Done' : 'Failed',
    at,
    detail: s.detail ? JSON.stringify(s.detail) : undefined,
    durationMs: s.ms,
  }));
}

function mapHistory(result: WireResult): ReviewHistoryEntry[] {
  const out: ReviewHistoryEntry[] = [];
  result.resolutions.forEach((r, i) => {
    const payload = r.resolution as { decisions?: WireFieldDecision[]; note?: string } | undefined;
    (payload?.decisions ?? []).forEach((d, j) => {
      out.push({
        id: `${result.email_id}-h-${i}-${j}`,
        at: r.at,
        actor: r.reviewer,
        field: FIELD_MAP[d.field] ?? undefined,
        action: d.decision === 'match' ? 'Confirmed' : 'Corrected',
        to: d.corrected_si ?? d.corrected_bl ?? undefined,
        note: payload?.note,
      });
    });
  });
  return out;
}

function reasonFromSteps(result: WireResult): string {
  const step = result.steps.find((s) => s.step === 'classify');
  const detail = step?.detail as { reason?: string } | undefined;
  return detail?.reason ?? 'Classified by the pipeline.';
}

/* ---------- public builders ---------- */

/** Builds a lightweight EmailCase from the initial list endpoints, before
 * full detail (comparisons, steps, history) has been fetched. Good enough
 * for the Dashboard and Inbox report tables. */
export function buildLightCase(email: WireEmailSummary, result: WireResultLight | undefined): EmailCase {
  const category = result ? mapCategory(result.category) : 'General message';
  return {
    id: email.email_id,
    subject: email.subject,
    sender: email.from,
    senderName: email.from,
    receivedAt: result?.updated_at ?? '—',
    updatedAt: result?.updated_at ?? '—',
    category,
    categoryConfidence: 1,
    categoryReason: '',
    status: result ? mapStatus(result) : 'Queued',
    result: result ? mapResult(result) : 'Not applicable',
    batchId: null,
    body: '',
    attachments: Array(email.n_attachments).fill(0).map((_, i) => mapAttachment(`attachments/${email.email_id}_${i}`)),
    comparison: [],
    timeline: [],
    reviewHistory: [],
    failure:
      result?.proc_state === 'failed' && result.last_error
        ? {
            step: result.last_error.step,
            code: result.last_error.kind,
            message: result.last_error.message,
            attempts: result.attempts ?? 1,
            nextAction: result.last_error.retryable
              ? 'This step can be retried automatically. Use Retry on the case page.'
              : 'This error needs a person to look at it before retrying.',
          }
        : undefined,
  };
}

/** Builds the full EmailCase once both the raw email and the full result
 * have been fetched (see refreshCaseDetail in state/store.tsx). */
export function buildFullCase(email: WireEmail, result: WireResult): EmailCase {
  const category = mapCategory(result.category);
  return {
    id: email.email_id,
    subject: email.subject,
    sender: email.from,
    senderName: email.from,
    receivedAt: result.meta.updated_at ?? '—',
    updatedAt: result.meta.updated_at ?? '—',
    category,
    categoryConfidence: result.category_confidence,
    categoryReason: reasonFromSteps(result),
    status: mapStatus(result),
    result: mapResult(result),
    batchId: null,
    body: email.body,
    attachments: email.attachments.map((p, index) => mapAttachment(p, { emailId: email.email_id, index })),
    comparison: result.comparisons.map(mapComparisonRow),
    timeline: mapTimeline(result),
    reviewHistory: mapHistory(result),
    failure:
      result.meta.proc_state === 'failed' && result.meta.last_error
        ? {
            step: result.meta.last_error.step,
            code: result.meta.last_error.kind,
            message: result.meta.last_error.message,
            attempts: result.meta.attempts ?? 1,
            nextAction: result.meta.last_error.retryable
              ? 'This step can be retried automatically. Use Retry on the case page.'
              : 'This error needs a person to look at it before retrying.',
          }
        : undefined,
  };
}

/** One review task per NEEDS_REVIEW case. Field-level questions come from
 * comparisons with match === null; a case-level reason (no attachments,
 * wrong document type, unreadable file) has no field to point at, so it
 * gets a single synthetic "category" question instead. */
export function buildReviewTask(subject: string, result: WireResult): ReviewTask {
  const reasonCodes: ReasonCode[] = [REASON_MAP[result.review_reason ?? ''] ?? 'FIELD_NOT_FOUND'];
  const fieldQuestions: DecisionQuestion[] = result.comparisons
    .filter((c) => c.match === null)
    .map((c) => ({
      id: `${result.email_id}-q-${c.field}`,
      field: FIELD_MAP[c.field] ?? (c.field as FieldKey),
      reasonCodes,
      siValue: c.si_value,
      blValue: c.bl_value,
      proposedValue: c.si_value ?? c.bl_value,
      confidence: 0.4,
      method: 'Not found',
      snippet: c.si_evidence?.snippet ?? c.bl_evidence?.snippet ?? 'No source line found for this field.',
      doc: (c.si_value == null ? 'SI' : 'BL') as DocKind,
    }));

  const questions: DecisionQuestion[] =
    fieldQuestions.length > 0
      ? fieldQuestions
      : [
          {
            id: `${result.email_id}-q-category`,
            field: 'category',
            reasonCodes,
            siValue: null,
            blValue: null,
            proposedValue: null,
            confidence: result.category_confidence,
            method: 'Not found',
            snippet: '',
            doc: 'SI',
          },
        ];

  return {
    id: `T-${result.email_id}`,
    caseId: result.email_id,
    subject,
    reasonCodes,
    createdAt: result.meta.updated_at ?? '',
    ageLabel: result.meta.updated_at ? ageLabelFrom(result.meta.updated_at) : 'recently',
    ageMinutes: result.meta.updated_at ? ageMinutesFrom(result.meta.updated_at) : 0,
    claimState: 'Open',
    questions,
  };
}

/** Placeholder review task from the light /review listing only, before the
 * full comparisons are known. loadCaseDetail (state/store.tsx) replaces
 * this with the real buildReviewTask() output once fetched. */
export function buildLightReviewTask(subject: string, light: WireResultLight): ReviewTask {
  const reasonCodes: ReasonCode[] = [REASON_MAP[light.review_reason ?? ''] ?? 'FIELD_NOT_FOUND'];
  const question: DecisionQuestion = {
    id: `${light.email_id}-q-loading`,
    field: 'category',
    reasonCodes,
    siValue: null,
    blValue: null,
    proposedValue: null,
    confidence: 0,
    method: 'Not found',
    snippet: '',
    doc: 'SI',
  };
  return {
    id: `T-${light.email_id}`,
    caseId: light.email_id,
    subject,
    reasonCodes,
    createdAt: light.updated_at ?? '',
    ageLabel: light.updated_at ? ageLabelFrom(light.updated_at) : 'recently',
    ageMinutes: light.updated_at ? ageMinutesFrom(light.updated_at) : 0,
    claimState: 'Open',
    questions: [question],
  };
}

function ageMinutesFrom(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.round(ms / 60000));
}

function ageLabelFrom(iso: string): string {
  const mins = ageMinutesFrom(iso);
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

/** Frontend Decision[] -> the backend's field-decision shape. Returns null
 * when there is nothing the real API can resolve (the synthetic "category"
 * question for case-level reviews - see buildReviewTask above) so the
 * caller can fall back to a local-only acknowledgement. */
export function toWireDecisions(
  decisions: { questionId: string; kind: string; value: string | null }[],
  questions: DecisionQuestion[],
): WireFieldDecision[] | null {
  const out: WireFieldDecision[] = [];
  for (const d of decisions) {
    const q = questions.find((x) => x.id === d.questionId);
    if (!q || q.field === 'category') continue;
    const field = FIELD_MAP_REV[q.field as FieldKey];
    const decision: WireFieldDecision['decision'] = d.kind === 'Confirm' ? 'match' : 'mismatch';
    const corrected = d.kind === 'Correct' ? d.value ?? q.proposedValue : null;
    out.push({
      field,
      decision,
      corrected_si: q.doc === 'SI' ? corrected : undefined,
      corrected_bl: q.doc === 'BL' ? corrected : undefined,
    });
  }
  return out.length > 0 ? out : null;
}

export { CATEGORY_MAP_REV };
