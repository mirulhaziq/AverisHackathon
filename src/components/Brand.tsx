/** Tidemark's rising tide: three document lines meeting a forward course. */
export function TideMark({ className = '' }: { className?: string }) {
  return <svg className={className} width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
    <path d="M5 11h13l10-6M5 19h16l10-6M5 27h19l7-4" stroke="currentColor" strokeWidth="3.5" strokeLinecap="square" strokeLinejoin="miter" />
  </svg>;
}

/** A chart-like illustration shared by the welcome and workspace screens. */
export function TideChart({ className = '' }: { className?: string }) {
  return <svg className={`tide-chart ${className}`} viewBox="0 0 600 400" fill="none" aria-hidden="true">
    <defs><pattern id="chart-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" stroke="currentColor" strokeOpacity=".13" /></pattern></defs>
    <rect width="600" height="400" fill="url(#chart-grid)" />
    {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M-60 ${240 + i * 20} C100 ${340 + i * 13}, 180 ${60 + i * 15}, 340 ${140 + i * 18} S520 ${100 + i * 20}, 670 ${-20 + i * 28}`} stroke="currentColor" strokeOpacity={.17 + i * .055} strokeWidth="1" />)}
    <path d="M80 280L265 172L452 116" stroke="#ec9068" strokeWidth="1.5" strokeDasharray="5 7" />
    <circle cx="80" cy="280" r="5" fill="#ec9068" /><circle cx="265" cy="172" r="5" fill="#ec9068" />
    <circle cx="452" cy="116" r="22" stroke="#ec9068" strokeOpacity=".5" /><circle cx="452" cy="116" r="5" fill="#ec9068" />
    <path d="M452 83v-12m0 78v12m-33-45h-12m78 0h12" stroke="#ec9068" />
    <g fill="currentColor" fontFamily="monospace" fontSize="10" letterSpacing="2"><text x="70" y="310">RECEIVE</text><text x="245" y="150">VERIFY</text><text x="435" y="190">PROCEED</text></g>
  </svg>;
}
