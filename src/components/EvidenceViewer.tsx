/* ============================================================
   Evidence viewer.

   Renders a document facsimile page and draws a yellow highlight box
   over the source of the selected value. PDFs and scans show the
   rendered page. Word and text files show the text with the snippet
   highlighted. Page controls and zoom sit in the header.
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Highlighter, ZoomIn, ZoomOut } from 'lucide-react';
import { PAGE_H, PAGE_W, type DocElement, type DocumentFacsimile } from '../data/documents';
import { FIELD_LABELS, type Attachment, type FieldKey, type Region } from '../types';
import { IconButton } from './Button';
import { LiveDocument } from './LiveDocument';

/* ---------- page rendering ---------- */

function Element({ el }: { el: DocElement }) {
  switch (el.t) {
    case 'box':
      return (
        <div
          className={`doc-box${el.fill ? ' doc-box--fill' : ''}`}
          style={{ left: el.x, top: el.y, width: el.w, height: el.h }}
        />
      );
    case 'rule':
      return <div className="doc-rule" style={{ left: el.x, top: el.y, width: el.w }} />;
    case 'vrule':
      return <div className="doc-vrule" style={{ left: el.x, top: el.y, height: el.h }} />;
    case 'title':
      return (
        <div className="doc-title" style={{ left: el.x, top: el.y - 12, fontSize: el.size ?? 14 }}>
          {el.text}
        </div>
      );
    case 'label':
      return (
        <div className="doc-label" style={{ left: el.x, top: el.y - 8 }}>
          {el.text}
        </div>
      );
    case 'value':
      return (
        <div
          className={`doc-value${el.bold ? ' is-bold' : ''}${el.mono ? ' is-mono' : ''}${el.degraded ? ' is-degraded' : ''}`}
          style={{
            left: el.x,
            top: el.y - 12,
            fontSize: el.size ?? 12,
            width: el.w,
          }}
        >
          {el.text}
        </div>
      );
    case 'note':
      return (
        <div className="doc-note" style={{ left: el.x, top: el.y, width: el.w }}>
          {el.text}
        </div>
      );
    case 'stamp':
      return (
        <div
          className="doc-stamp"
          style={{ left: el.x, top: el.y, transform: `rotate(${el.angle ?? -14}deg)` }}
        >
          {el.text}
        </div>
      );
  }
}

/* ---------- text view for Word and text files ---------- */

interface TextLine {
  label?: string;
  text: string;
  field?: FieldKey;
}

function toTextLines(doc: DocumentFacsimile, page: number): TextLine[] {
  const out: TextLine[] = [];
  let pendingLabel: string | undefined;
  for (const el of doc.pages[page - 1]?.elements ?? []) {
    if (el.t === 'title') out.push({ text: el.text });
    else if (el.t === 'label') pendingLabel = el.text;
    else if (el.t === 'value') {
      out.push({ label: pendingLabel, text: el.text, field: el.field });
      pendingLabel = undefined;
    } else if (el.t === 'note') out.push({ text: el.text });
  }
  return out;
}

/* ---------- viewer ---------- */

export function EvidenceViewer({
  doc,
  attachment,
  heading,
  highlight,
  highlightField,
  highlightLabel,
  snippet,
  compact = false,
}: {
  doc: DocumentFacsimile | null;
  attachment?: Attachment;
  heading: string;
  highlight?: Region | null;
  highlightField?: FieldKey | null;
  highlightLabel?: string;
  /** Live data: the evidence text to find and highlight in the real file. */
  snippet?: string | null;
  compact?: boolean;
}) {
  const [zoom, setZoom] = useState(compact ? 0.78 : 0.9);
  const [page, setPage] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const pageCount = doc?.pages.length ?? 1;
  const asText = attachment?.fileType === 'DOCX' || attachment?.fileType === 'TXT';

  /* follow the selected value: switch page, then bring the box into view */
  useEffect(() => {
    if (!highlight) return;
    if (highlight.page !== page) setPage(highlight.page);
  }, [highlight, page]);

  useEffect(() => {
    if (!highlight || !boxRef.current || !scrollRef.current) return;
    const id = window.setTimeout(() => {
      boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }, 60);
    return () => window.clearTimeout(id);
  }, [highlight, page, zoom]);

  const lines = useMemo(() => (doc && asText ? toTextLines(doc, page) : []), [asText, doc, page]);

  if (!doc && attachment?.source) {
    return (
      <LiveDocument
        attachment={{ ...attachment, source: attachment.source }}
        heading={heading}
        snippet={snippet}
        highlightLabel={highlightLabel ?? (highlightField ? FIELD_LABELS[highlightField] : undefined)}
        compact={compact}
      />
    );
  }

  if (!doc) {
    return (
      <section className="viewer viewer--empty" aria-label={heading}>
        <header className="viewer__bar">
          <h3 className="viewer__title">{heading}</h3>
        </header>
        <div className="viewer__empty">
          <p className="viewer__empty-title">No document</p>
          <p className="viewer__empty-body">
            This email has no attachment for {heading.toLowerCase()}, so there is nothing to show. Ask the
            sender to resend the file.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={`viewer${compact ? ' viewer--compact' : ''}`} aria-label={heading}>
      <header className="viewer__bar">
        <div className="viewer__ident">
          <span className={`doc-kind doc-kind--${doc.kind.toLowerCase()}`}>{doc.kind}</span>
          <h3 className="viewer__title">{heading}</h3>
          <span className="viewer__file mono">{doc.filename}</span>
          {attachment && <span className="viewer__type">{attachment.fileType}</span>}
        </div>
        <div className="viewer__tools">
          {highlightField && (
            <span className="viewer__marking">
              <Highlighter size={12} aria-hidden="true" />
              {highlightLabel ?? FIELD_LABELS[highlightField]}
            </span>
          )}
          <div className="viewer__pager">
            <IconButton
              label="Previous page"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={15} />
            </IconButton>
            <span className="viewer__page-label num">
              {page} / {pageCount}
            </span>
            <IconButton
              label="Next page"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              <ChevronRight size={15} />
            </IconButton>
          </div>
          <div className="viewer__zoom">
            <IconButton
              label="Zoom out"
              size="sm"
              disabled={zoom <= 0.5}
              onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}
            >
              <ZoomOut size={15} />
            </IconButton>
            <button type="button" className="viewer__zoom-label num" onClick={() => setZoom(0.9)}>
              {Math.round(zoom * 100)}%
            </button>
            <IconButton
              label="Zoom in"
              size="sm"
              disabled={zoom >= 2}
              onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))}
            >
              <ZoomIn size={15} />
            </IconButton>
          </div>
          {attachment?.linkExpiresIn && (
            <a
              className="viewer__open"
              href="#open-document"
              onClick={(e) => e.preventDefault()}
              title={`Opens in a new tab. The link expires in ${attachment.linkExpiresIn}.`}
            >
              Open <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
        </div>
      </header>

      <div className="viewer__stage" ref={scrollRef} tabIndex={0} aria-label={`${heading} page ${page}`}>
        {asText ? (
          <div className="doc-text" style={{ fontSize: 13 * zoom }}>
            <p className="doc-text__head">
              Text extracted from {doc.filename}, page {page} of {pageCount}
            </p>
            {lines.map((l, i) => {
              const marked = highlightField != null && l.field === highlightField;
              return (
                <p key={i} className={`doc-text__line${marked ? ' is-marked' : ''}`} ref={marked ? boxRef : undefined}>
                  {l.label && <span className="doc-text__label">{l.label}: </span>}
                  <span className={marked ? 'doc-text__mark' : undefined}>{l.text}</span>
                </p>
              );
            })}
          </div>
        ) : (
          <div
            className={`doc-page-shell${doc.render === 'scan' ? ' is-scan' : ''}`}
            style={{ width: PAGE_W * zoom, height: PAGE_H * zoom }}
          >
            <div
              className="doc-page"
              style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${zoom})` }}
            >
              {(doc.pages[page - 1]?.elements ?? []).map((el, i) => (
                <Element key={i} el={el} />
              ))}
              {highlight && highlight.page === page && (
                <div
                  ref={boxRef}
                  className="doc-highlight"
                  style={{
                    left: highlight.x,
                    top: highlight.y,
                    width: highlight.w,
                    height: highlight.h,
                  }}
                >
                  <span className="doc-highlight__tag">
                    {highlightLabel ?? (highlightField ? FIELD_LABELS[highlightField] : 'Selected value')}
                  </span>
                </div>
              )}
              {doc.render === 'scan' && <div className="doc-grain" aria-hidden="true" />}
            </div>
          </div>
        )}
      </div>

      <footer className="viewer__foot">
        <span className="muted truncate">
          {doc.render === 'scan'
            ? 'Scanned file, read by OCR.'
            : asText
              ? 'Word file, read from the document text.'
              : 'Text PDF, read from the text layer.'}
          {attachment?.linkExpiresIn && ` Open link expires in ${attachment.linkExpiresIn}.`}
        </span>
      </footer>
    </section>
  );
}
