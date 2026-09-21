/* ============================================================
   Chips. Every chip carries a word, not colour alone, and an icon.
   ============================================================ */

import {
  Ban,
  CircleCheck,
  CircleX,
  Clock,
  FileDiff,
  FilePlus2,
  Hourglass,
  LoaderCircle,
  Mail,
  Minus,
  ReceiptText,
  ShieldAlert,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type {
  CaseResult,
  CaseStatus,
  Category,
  FieldResult,
  ReasonCode,
  TaskClaimState,
} from '../types';
import { REASON_TEXT } from '../types';
import { friendlyLabel } from '../data/labels';

const ICON = 13;

function Chip({
  tone,
  icon,
  children,
  title,
  variant = 'solid',
}: {
  tone: string;
  icon: ReactNode;
  children: ReactNode;
  title?: string;
  variant?: 'solid' | 'outline';
}) {
  return (
    <span className={`chip chip--${tone} chip--${variant}`} title={title}>
      <span className="chip__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="chip__label">{children}</span>
    </span>
  );
}

/* ---------- case result ---------- */

export function ResultChip({ result }: { result: CaseResult }) {
  switch (result) {
    case 'No mismatch detected':
      return (
        <Chip tone="match" icon={<CircleCheck size={ICON} />}>
          No differences found
        </Chip>
      );
    case 'Mismatch found':
      return (
        <Chip tone="mismatch" icon={<CircleX size={ICON} />}>
          Differences found
        </Chip>
      );
    case 'Needs review':
      return (
        <Chip tone="review" icon={<TriangleAlert size={ICON} />}>
          Needs review
        </Chip>
      );
    case 'Not applicable':
      return (
        <Chip tone="na" variant="outline" icon={<Minus size={ICON} />}>
          No comparison needed
        </Chip>
      );
    case 'Failed':
      return (
        <Chip tone="fail" icon={<Ban size={ICON} />}>
          Could not finish
        </Chip>
      );
  }
}

/* ---------- pipeline status ---------- */

export function StatusChip({ status }: { status: CaseStatus }) {
  switch (status) {
    case 'Queued':
      return (
        <Chip tone="na" variant="outline" icon={<Clock size={ICON} />}>
          Waiting to start
        </Chip>
      );
    case 'Processing':
      return (
        <Chip tone="info" icon={<LoaderCircle size={ICON} className="spin" />}>
          Checking
        </Chip>
      );
    case 'Waiting for review':
      return (
        <Chip tone="review" icon={<Hourglass size={ICON} />}>
          Waiting for review
        </Chip>
      );
    case 'Completed':
      return (
        <Chip tone="match" icon={<CircleCheck size={ICON} />}>
          Completed
        </Chip>
      );
    case 'Failed':
      return (
        <Chip tone="fail" icon={<Ban size={ICON} />}>
          Could not finish
        </Chip>
      );
  }
}

/* ---------- per field result ---------- */

export function FieldResultChip({ result }: { result: FieldResult }) {
  switch (result) {
    case 'Match':
      return (
        <Chip tone="match" icon={<CircleCheck size={ICON} />}>
          Match
        </Chip>
      );
    case 'Mismatch':
      return (
        <Chip tone="mismatch" icon={<CircleX size={ICON} />}>
          Mismatch
        </Chip>
      );
    case 'Needs review':
      return (
        <Chip tone="review" icon={<TriangleAlert size={ICON} />}>
          Needs review
        </Chip>
      );
    case 'Not compared':
      return (
        <Chip tone="na" variant="outline" icon={<Minus size={ICON} />}>
          Not compared
        </Chip>
      );
  }
}

/* ---------- category ---------- */

const CATEGORY_ICON: Record<Category, ReactNode> = {
  'Document comparison request': <FileDiff size={ICON} />,
  'New SI request': <FilePlus2 size={ICON} />,
  'Invoice query': <ReceiptText size={ICON} />,
  'General message': <Mail size={ICON} />,
  Spam: <ShieldAlert size={ICON} />,
};

export function CategoryChip({
  category,
  confidence,
}: {
  category: Category;
  confidence?: number;
}) {
  return (
    <span className="chip chip--category chip--outline" title={`Category: ${category}`}>
      <span className="chip__icon" aria-hidden="true">
        {CATEGORY_ICON[category]}
      </span>
      <span className="chip__label">{friendlyLabel(category)}</span>
      {confidence !== undefined && <span className="sr-only">System certainty: {Math.round(confidence * 100)} percent</span>}
    </span>
  );
}

/* ---------- reason code ---------- */

export function ReasonCodeTag({ code, withText = false }: { code: ReasonCode; withText?: boolean }) {
  return (
    <span className="reason-tag" title={REASON_TEXT[code]}>
      <span className="reason-tag__code mono">{code}</span>
      {withText && <span className="reason-tag__text">{REASON_TEXT[code]}</span>}
    </span>
  );
}

/* ---------- claim state ---------- */

export function ClaimChip({
  state,
  claimedBy,
}: {
  state: TaskClaimState;
  claimedBy?: { name: string; initials: string };
}) {
  if (state === 'Claimed' && claimedBy) {
    return (
      <span className="claim-chip" title={`Claimed by ${claimedBy.name}`}>
        <span className="avatar avatar--sm" aria-hidden="true">
          {claimedBy.initials}
        </span>
        <span className="claim-chip__label">With {claimedBy.name}</span>
      </span>
    );
  }
  if (state === 'Overdue') {
    return (
      <Chip tone="mismatch" icon={<TriangleAlert size={ICON} />}>
        Overdue
      </Chip>
    );
  }
  return (
    <Chip tone="na" variant="outline" icon={<UserRound size={ICON} />}>
      Available
    </Chip>
  );
}

/* ---------- a plain marker for a normalized value ---------- */

export function NormalizedNote({ children }: { children: ReactNode }) {
  return <p className="norm-note">{children}</p>;
}
