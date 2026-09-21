/* ============================================================
   Live document viewer.

   Shows a real attachment from the API: the text the pipeline read
   from it, with the line behind the selected value highlighted, and -
   for PDFs - the original file rendered by the browser. Used by
   EvidenceViewer whenever a case comes from the live API rather than
   the sample facsimiles.
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Highlighter } from 'lucide-react';
import { api, type WireAttachmentText } from '../api/client';
import type { Attachment } from '../types';

/* one request per file per session, shared by every viewer showing it */
const textCache = new Map<string, Promise<WireAttachmentText>>();

function loadText(emailId: string, index: number): Promise<WireAttachmentText> {
  const key = `${emailId}/${index}`;
  let p = textCache.get(key);
  if (!p) {
    p = api.getAttachmentText(emailId, index);
    p.catch(() => textCache.delete(key)); // let a later render retry
    textCache.set(key, p);
  }
  return p;
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Index of the line the evidence snippet came from, or -1. */
function findLine(lines: string[], snippet: string | null | undefined): number {
  if (!snippet) return -1;
  const needle = squash(snippet);
  if (!needle) return -1;
  const exact = lines.findIndex((l) => squash(l).includes(needle));
  if (exact >= 0) return exact;
  // the snippet can span a label and value that the file splits over lines
  return lines.findIndex((l) => {
    const hay = squash(l);
    return hay.length > 3 && needle.includes(hay);
  });
}

const METHOD_NOTE: Record<string, string> = {
  text: 'Plain text file, shown exactly as read.',
  'text-layer': 'Text PDF, read from its text layer.',
  docx: 'Word file, read from its paragraphs and tables.',
  xlsx: 'Excel file, read cell by cell.',
  scan: 'Scanned PDF with little or no text layer. Check the original.',
  none: 'This file could not be read.',
};

export function LiveDocument({
  attachment,
  heading,
  snippet,
  highlightLabel,
  compact = false,
}: {
  attachment: Attachment & { source: NonNullable<Attachment['source']> };
  heading: string;
  snippet?: string | null;
  highlightLabel?: string;
  compact?: boolean;
}) {
  const { emailId, index } = attachment.source;
  const [data, setData] = useState<WireAttachmentText | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isPdf = attachment.fileType === 'PDF' || attachment.fileType === 'Scanned PDF';
  const [mode, setMode] = useState<'text' | 'original'>('text');
  const markRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    loadText(emailId, index).then(
      (d) => {
        if (cancelled) return;
        setData(d);
        // nothing useful to highlight in a scan's text - start on the original
        if (d.method === 'scan' || (isPdf && !d.text.trim())) setMode('original');
      },
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'The file could not be loaded.'),
    );
    return () => {
      cancelled = true;
    };
  }, [emailId, index, isPdf]);

  const lines = useMemo(() => (data?.text ?? '').split(/\r?\n/), [data]);
  const marked = useMemo(() => findLine(lines, snippet), [lines, snippet]);

  useEffect(() => {
    if (mode !== 'text' || marked < 0) return;
    const id = window.setTimeout(() => markRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    return () => window.clearTimeout(id);
  }, [marked, mode, data]);

  const roleNote =
    data && !data.unreadable && attachment.kind !== 'Other' && data.role !== attachment.kind
      ? `The content reads as ${data.role === 'SI' ? 'a shipping instruction' : data.role === 'BL' ? 'a bill of lading' : 'neither an SI nor a BL'}.`
      : null;

  return (
    <section className={`viewer${compact ? ' viewer--compact' : ''}`} aria-label={heading}>
      <header className="viewer__bar">
        <div className="viewer__ident">
          {attachment.kind !== 'Other' && (
            <span className={`doc-kind doc-kind--${attachment.kind.toLowerCase()}`}>{attachment.kind}</span>
          )}
          <h3 className="viewer__title">{heading}</h3>
          <span className="viewer__file mono">{attachment.filename}</span>
          <span className="viewer__type">{attachment.fileType}</span>
        </div>
        <div className="viewer__tools">
          {highlightLabel && mode === 'text' && (
            <span className="viewer__marking">
              <Highlighter size={12} aria-hidden="true" />
              {highlightLabel}
            </span>
          )}
          {isPdf && (
            <div className="viewer__modes" role="group" aria-label="View">
              <button type="button" aria-pressed={mode === 'text'} onClick={() => setMode('text')}>
                Text
              </button>
              <button type="button" aria-pressed={mode === 'original'} onClick={() => setMode('original')}>
                Original
              </button>
            </div>
          )}
          {attachment.fileUrl && (
            <a className="viewer__open" href={attachment.fileUrl} target="_blank" rel="noreferrer">
              Open <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
        </div>
      </header>

      {mode === 'original' && attachment.fileUrl ? (
        <div className="viewer__stage viewer__stage--frame">
          <iframe className="viewer__frame" src={attachment.fileUrl} title={`${heading}: ${attachment.filename}`} />
        </div>
      ) : (
        <div className="viewer__stage" tabIndex={0} aria-label={`${heading} text`}>
          <div className="doc-text">
            {error ? (
              <p className="doc-text__head">Could not load this file: {error}</p>
            ) : !data ? (
              <p className="doc-text__head">Loading {attachment.filename}…</p>
            ) : data.unreadable ? (
              <p className="doc-text__head">This file could not be read: {data.unreadable}</p>
            ) : (
              <>
                <p className="doc-text__head">
                  Text read from {data.filename}
                  {snippet && marked < 0 && ' · the selected value was not found word for word in this file'}
                </p>
                {lines.map((l, i) => {
                  if (!l.trim()) return <p key={i} className="doc-text__line doc-text__line--blank" aria-hidden="true" />;
                  const isMarked = i === marked;
                  const colon = l.indexOf(':');
                  return (
                    <p
                      key={i}
                      ref={isMarked ? markRef : undefined}
                      className={`doc-text__line${isMarked ? ' is-marked' : ''}`}
                    >
                      {isMarked && colon > 0 ? (
                        <>
                          <span className="doc-text__label">{l.slice(0, colon + 1)}</span>
                          <span className="doc-text__mark">{l.slice(colon + 1)}</span>
                        </>
                      ) : isMarked ? (
                        <span className="doc-text__mark">{l}</span>
                      ) : (
                        l
                      )}
                    </p>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}

      <footer className="viewer__foot">
        <span className="muted truncate">
          {data ? (METHOD_NOTE[data.method] ?? '') : ''}
          {roleNote && <strong> {roleNote}</strong>}
        </span>
      </footer>
    </section>
  );
}
