// Keep stored values and export contracts stable while using plain language in the UI.
export const LABELS: Record<string, string> = {
  'No mismatch detected': 'No differences found',
  'Mismatch found': 'Differences found',
  'Not applicable': 'No comparison needed',
  Failed: 'Could not finish',
  Queued: 'Waiting to start',
  Processing: 'Checking',
  Claimed: 'In progress',
  Open: 'Available',
  'New SI request': 'New shipping instruction',
};
export const friendlyLabel = (value: string) => LABELS[value] ?? value;
