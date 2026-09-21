/* ============================================================
   Confidence indicator: a word, a number, and three segments.
   Never colour alone.
   ============================================================ */

type Band = 'High' | 'Medium' | 'Low';

export function confidenceBand(value: number, accept = 0.9, review = 0.7): Band {
  if (value >= accept) return 'High';
  if (value >= review) return 'Medium';
  return 'Low';
}

export function ConfidenceIndicator({
  value,
  accept = 0.9,
  review = 0.7,
  size = 'md',
  showBand = true,
}: {
  value: number;
  accept?: number;
  review?: number;
  size?: 'sm' | 'md';
  showBand?: boolean;
}) {
  const band = confidenceBand(value, accept, review);
  const filled = band === 'High' ? 3 : band === 'Medium' ? 2 : 1;
  return (
    <span
      className={`conf conf--${band.toLowerCase()} conf--${size}`}
      title={`Confidence ${value.toFixed(2)} — ${band}`}
    >
      <span className="conf__bars" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`conf__bar${i < filled ? ' is-on' : ''}`} />
        ))}
      </span>
      {showBand && <span className="conf__band">{band} certainty</span>}
      <span className="conf__num num">{Math.round(value * 100)}%</span>
    </span>
  );
}
