/* ============================================================
   Batch progress: received against expected, with accepted and
   rejected shown as separate segments and named in words.
   ============================================================ */

export function BatchProgressBar({
  expected,
  accepted,
  rejected,
  state,
  compact = false,
}: {
  expected: number;
  accepted: number;
  rejected: number;
  state?: string;
  compact?: boolean;
}) {
  const received = accepted + rejected;
  const pct = expected > 0 ? Math.min(100, Math.round((received / expected) * 100)) : 0;
  const acceptedPct = expected > 0 ? (accepted / expected) * 100 : 0;
  const rejectedPct = expected > 0 ? (rejected / expected) * 100 : 0;

  return (
    <div className={`progress${compact ? ' progress--compact' : ''}`}>
      <div
        className="progress__track"
        role="progressbar"
        aria-valuenow={received}
        aria-valuemin={0}
        aria-valuemax={expected}
        aria-label={`${received} of ${expected} messages received`}
      >
        <span className="progress__seg progress__seg--accepted" style={{ width: `${acceptedPct}%` }} />
        <span className="progress__seg progress__seg--rejected" style={{ width: `${rejectedPct}%` }} />
      </div>
      <div className="progress__legend">
        <span className="progress__stat">
          <strong className="num">{received}</strong> of <strong className="num">{expected}</strong> received
          <span className="muted"> ({pct}%)</span>
        </span>
        <span className="progress__key">
          <span className="progress__dot progress__dot--accepted" aria-hidden="true" />
          <span className="num">{accepted}</span> accepted
        </span>
        <span className="progress__key">
          <span className="progress__dot progress__dot--rejected" aria-hidden="true" />
          <span className="num">{rejected}</span> rejected
        </span>
        {state && <span className="progress__state">{state}</span>}
      </div>
    </div>
  );
}

/** A plain horizontal bar for dashboard counts. */
export function CountBar({
  label,
  value,
  max,
  tone = 'steel',
  href,
}: {
  label: string;
  value: number;
  max: number;
  tone?: 'steel' | 'match' | 'mismatch' | 'review' | 'fail' | 'na';
  href?: string;
}) {
  const pct = max > 0 ? Math.max(value > 0 ? 3 : 0, (value / max) * 100) : 0;
  const content = (
    <>
      <span className="count-bar__label">{label}</span>
      <span className="count-bar__track" aria-hidden="true">
        <span className={`count-bar__fill count-bar__fill--${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="count-bar__value num">{value}</span>
    </>
  );
  return href ? (
    <a className="count-bar count-bar--link" href={href}>
      {content}
    </a>
  ) : (
    <div className="count-bar">{content}</div>
  );
}
