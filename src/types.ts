/* ============================================================
   Tidemark domain types
   ============================================================ */

export type Role = 'Operator' | 'Reviewer' | 'Admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  initials: string;
}

/** How Tidemark classified the email. */
export type Category =
  | 'Document comparison request'
  | 'New SI request'
  | 'Invoice query'
  | 'General message'
  | 'Spam';

/** Where the case is in the pipeline. */
export type CaseStatus =
  | 'Queued'
  | 'Processing'
  | 'Waiting for review'
  | 'Completed'
  | 'Failed';

/** The five result words, used verbatim everywhere. */
export type CaseResult =
  | 'No mismatch detected'
  | 'Mismatch found'
  | 'Needs review'
  | 'Not applicable'
  | 'Failed';

/** Per-field comparison outcome. */
export type FieldResult = 'Match' | 'Mismatch' | 'Needs review' | 'Not compared';

/** The seven compared fields, in fixed order. */
export type FieldKey =
  | 'shipper'
  | 'consignee'
  | 'notifyParty'
  | 'portOfLoading'
  | 'portOfDischarge'
  | 'containerCount'
  | 'grossWeightKg';

export const FIELD_ORDER: FieldKey[] = [
  'shipper',
  'consignee',
  'notifyParty',
  'portOfLoading',
  'portOfDischarge',
  'containerCount',
  'grossWeightKg',
];

export const FIELD_LABELS: Record<FieldKey, string> = {
  shipper: 'Shipper',
  consignee: 'Consignee',
  notifyParty: 'Notify party',
  portOfLoading: 'Port of loading',
  portOfDischarge: 'Port of discharge',
  containerCount: 'Container count',
  grossWeightKg: 'Gross weight (kg)',
};

export type ExtractionMethod =
  | 'Text layer'
  | 'Labelled field'
  | 'Table cell'
  | 'OCR'
  | 'Not found';

export type DocKind = 'SI' | 'BL';

/** A rectangle on a document page, in page coordinate space. */
export interface Region {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One extracted value with its evidence. */
export interface Extraction {
  value: string | null;
  /** Raw text as it appears in the document, before normalization. */
  raw?: string;
  method: ExtractionMethod;
  confidence: number; // 0..1
  snippet: string;
  region?: Region;
  /** Set when the raw texts differed but normalize to the same value. */
  normalizedFrom?: string;
}

/** One row of the comparison table. */
export interface ComparisonRow {
  field: FieldKey;
  si: Extraction;
  bl: Extraction;
  result: FieldResult;
  /** Shown under a value when raw texts differed, e.g. case or a suffix. */
  normalizationNote?: string;
  /** Shown on a Needs review row. */
  reviewReason?: string;
}

export interface Attachment {
  id: string;
  filename: string;
  kind: DocKind | 'Other';
  sizeLabel: string;
  fileType: 'PDF' | 'Scanned PDF' | 'DOCX' | 'TXT' | 'XLSX';
  /** Short-lived open link, shown with its expiry. */
  linkExpiresIn?: string;
  pageCount: number;
}

export type TimelineState = 'Done' | 'Failed' | 'Waiting' | 'Skipped' | 'Running';

export interface TimelineStep {
  step: string;
  state: TimelineState;
  at: string;
  detail?: string;
  durationMs?: number;
}

export interface ReviewHistoryEntry {
  id: string;
  at: string;
  actor: string;
  field?: FieldKey;
  action: 'Confirmed' | 'Corrected' | 'Marked missing' | 'Rejected case' | 'Category corrected';
  from?: string;
  to?: string;
  note?: string;
}

export interface EmailCase {
  id: string; // E-1042
  subject: string;
  sender: string;
  senderName: string;
  receivedAt: string;
  updatedAt: string;
  category: Category;
  categoryConfidence: number;
  categoryReason: string;
  status: CaseStatus;
  result: CaseResult;
  batchId: string | null;
  body: string;
  attachments: Attachment[];
  comparison: ComparisonRow[];
  timeline: TimelineStep[];
  reviewHistory: ReviewHistoryEntry[];
  /** Populated when status is Failed. */
  failure?: {
    step: string;
    code: string;
    message: string;
    attempts: number;
    nextAction: string;
  };
  /** Whether the documents are a clean text PDF or a scan. */
  sourceQuality?: 'Text PDF' | 'Scan';
}

/* ---------- review tasks ---------- */

export type ReasonCode =
  | 'LOW_CONFIDENCE_OCR'
  | 'TWO_CANDIDATES'
  | 'AMBIGUOUS_LABEL'
  | 'MISSING_ATTACHMENT'
  | 'UNKNOWN_PORT_ALIAS'
  | 'CATEGORY_UNCERTAIN'
  | 'WEIGHT_OUT_OF_TOLERANCE'
  | 'FIELD_NOT_FOUND';

export const REASON_TEXT: Record<ReasonCode, string> = {
  LOW_CONFIDENCE_OCR: 'The scan was hard to read, so the value is not certain.',
  TWO_CANDIDATES: 'Two values were found for the same field.',
  AMBIGUOUS_LABEL: 'The label on the document does not clearly name this field.',
  MISSING_ATTACHMENT: 'The email asks for a comparison but has no documents attached.',
  UNKNOWN_PORT_ALIAS: 'The port name is unfamiliar. Check whether both documents refer to the same port.',
  CATEGORY_UNCERTAIN: 'The system is unsure what this email is asking for. Read the message to check its category.',
  WEIGHT_OUT_OF_TOLERANCE: 'The difference between the two weights is larger than allowed.',
  FIELD_NOT_FOUND: 'The field could not be found in the document.',
};

export type TaskClaimState = 'Open' | 'Claimed' | 'Overdue';

/** A candidate value a reviewer can pick from. */
export interface Candidate {
  id: string;
  value: string;
  doc: DocKind;
  page: number;
  snippet: string;
  confidence: number;
  region: Region;
  sourceLabel: string;
}

/** One question put to a reviewer, rendered as a decision card. */
export interface DecisionQuestion {
  id: string;
  field: FieldKey | 'category';
  reasonCodes: ReasonCode[];
  siValue: string | null;
  blValue: string | null;
  proposedValue: string | null;
  confidence: number;
  method: ExtractionMethod;
  snippet: string;
  doc: DocKind;
  region?: Region;
  candidates?: Candidate[];
}

export interface ReviewTask {
  id: string; // T-2051
  caseId: string;
  subject: string;
  reasonCodes: ReasonCode[];
  createdAt: string;
  ageLabel: string;
  ageMinutes: number;
  claimState: TaskClaimState;
  claimedBy?: { name: string; initials: string };
  questions: DecisionQuestion[];
  dueInLabel?: string;
}

/** A decision a reviewer has taken on one card, held before saving. */
export interface Decision {
  questionId: string;
  kind: 'Confirm' | 'Correct' | 'Mark missing';
  value: string | null;
  candidateId?: string;
}

/* ---------- batches, exports, config, audit ---------- */

export interface RejectedRecord {
  id: string;
  messageId: string;
  subject: string;
  reason: string;
  code: string;
  at: string;
}

export interface ImportBatch {
  id: string;
  label: string;
  startedAt: string;
  finishedAt: string | null;
  expected: number;
  received: number;
  accepted: number;
  rejected: number;
  state: 'Running' | 'Complete' | 'Complete with rejects' | 'Stalled';
  rejectedRecords: RejectedRecord[];
  deadLetterCount: number;
  deadLetterNote?: string;
}

export interface ExportRecord {
  id: string;
  createdAt: string;
  createdBy: string;
  format: 'Submission JSON' | 'CSV';
  caseCount: number;
  pendingReviewCount: number;
  score: string;
  notes: string;
  filename: string;
}

export interface ConfigThresholds {
  acceptConfidence: number;
  reviewConfidence: number;
  weightTolerancePct: number;
  containerCountTolerance: number;
  ocrMinConfidence: number;
  categoryMinConfidence: number;
}

export interface SynonymRow {
  id: string;
  field: FieldKey;
  label: string;
}

export interface PortAliasRow {
  id: string;
  alias: string;
  canonical: string;
  unlocode: string;
}

export interface SuffixRow {
  id: string;
  suffix: string;
  note: string;
}

export interface MappingRow {
  id: string;
  field: FieldKey | 'caseId' | 'result';
  exportColumn: string;
  required: boolean;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  actorRole: Role;
  action: string;
  target: string;
  ip: string;
  detail: Record<string, string>;
}
