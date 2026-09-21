/* ============================================================
   Typed client for the real SDOC backend (see backend/app/main.py).

   VITE_API_URL and VITE_DEMO_TOKEN come from the build environment -
   see .env.local for local dev, and deploy-ui.yml / the API_URL repo
   variable for the deployed build.

   Note on VITE_DEMO_TOKEN: it ends up in the built JS bundle, which is
   public. That's an accepted hackathon-scope tradeoff so the review/retry
   actions work from the deployed UI at all - it is NOT safe for a real
   production deployment, where those actions would need a per-user auth
   token instead of one shared secret baked into the client.
   ============================================================ */

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const DEMO_TOKEN = (import.meta.env.VITE_DEMO_TOKEN as string | undefined) ?? '';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit & { auth?: boolean }): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (init?.auth) headers['X-Demo-Token'] = DEMO_TOKEN;
  if (init?.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, body || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/* ---------- wire shapes, exactly as backend/app/main.py returns them ---------- */

export interface WireEmailSummary {
  email_id: string;
  from: string;
  subject: string;
  n_attachments: number;
}

export interface WireEmail {
  email_id: string;
  from: string;
  subject: string;
  body: string;
  attachments: string[];
}

export interface WireEvidence {
  file: string;
  snippet: string;
}

export interface WireComparison {
  field: string;
  si_value: string | null;
  bl_value: string | null;
  match: boolean | null;
  si_evidence: WireEvidence | null;
  bl_evidence: WireEvidence | null;
}

export interface WireStep {
  step: string;
  ok: boolean;
  ms?: number;
  detail?: unknown;
}

export type WireStatus = 'OK' | 'MISMATCH' | 'NEEDS_REVIEW';
export type WireReviewReason = 'wrong_doc_type' | 'missing_attachment' | 'unreadable' | 'missing_value' | null;

export interface WireResultLight {
  email_id: string;
  category: string;
  status: WireStatus | null;
  review_reason: WireReviewReason;
  has_defect: boolean;
  defect_fields: string[];
  proc_state: 'done' | 'failed' | null;
  queue: 'review' | 'failed' | null;
  attempts: number | null;
  updated_at: string | null;
  git_sha: string | null;
  last_error: { step: string; kind: string; message: string; retryable: boolean } | null;
}

export interface WireResolution {
  at: string;
  reviewer: string;
  resolution: unknown;
}

export interface WireResult {
  email_id: string;
  category: string;
  category_confidence: number;
  steps: WireStep[];
  status: WireStatus;
  review_reason: WireReviewReason;
  has_defect: boolean;
  defect_fields: string[];
  comparisons: WireComparison[];
  meta: {
    proc_state: 'done' | 'failed' | null;
    queue: 'review' | 'failed' | null;
    attempts: number | null;
    updated_at: string | null;
    git_sha: string | null;
    last_error: WireResultLight['last_error'];
  };
  resolutions: WireResolution[];
}

export interface WireFieldDecision {
  field: string;
  decision: 'match' | 'mismatch';
  corrected_si?: string | null;
  corrected_bl?: string | null;
}

export interface WireStats {
  processed: number;
  by_category: Record<string, number>;
  by_status: Record<string, number>;
  awaiting_review: number;
  failed: number;
}

/* ---------- calls ---------- */

export const api = {
  health: () => request<{ status: string; commit: string; region: string; storage: string }>('/health'),

  listEmails: () => request<{ count: number; emails: WireEmailSummary[] }>('/emails'),
  getEmail: (id: string) => request<WireEmail>(`/emails/${id}`),

  listResults: () => request<{ count: number; results: WireResultLight[] }>('/results'),
  getResult: (id: string) => request<WireResult>(`/results/${id}`),

  listReviewQueue: () => request<{ count: number; items: WireResultLight[] }>('/review'),
  listFailures: () => request<{ count: number; items: WireResultLight[] }>('/failures'),
  stats: () => request<WireStats>('/stats'),

  process: (id: string) => request<WireResult>(`/process/${id}`, { method: 'POST', auth: true }),

  resolve: (id: string, decisions: WireFieldDecision[], reviewer: string, note?: string) =>
    request<WireResult>(`/review/${id}/resolve`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ decisions, reviewer, note }),
    }),
};

export const API_CONFIGURED = BASE.length > 0;
