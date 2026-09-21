/* ============================================================
   Empty state, error banner, info banner, loading skeletons,
   confirmation toasts.
   ============================================================ */

import { CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../state/store';
import { Button, IconButton } from './Button';

/* ---------- empty state ---------- */

interface EmptyAction {
  label: string;
  onClick?: () => void;
  to?: string;
}

function EmptyActionControl({ action, primary }: { action: EmptyAction; primary?: boolean }) {
  if (action.to) {
    return (
      <Link className={`btn ${primary ? 'btn--primary' : 'btn--secondary'} btn--md`} to={action.to}>
        <span className="btn__label">{action.label}</span>
      </Link>
    );
  }
  return (
    <Button variant={primary ? 'primary' : 'secondary'} onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

/* `action` is the way forward; `secondaryAction` is the way back. When both
   are given the first is drawn as the primary button. */
export function EmptyState({
  title,
  body,
  action,
  secondaryAction,
  icon,
}: {
  title: string;
  body: string;
  action?: EmptyAction;
  secondaryAction?: EmptyAction;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon && (
        <span className="empty__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <h3 className="empty__title">{title}</h3>
      <p className="empty__body">{body}</p>
      {(action || secondaryAction) && (
        <div className="empty__actions">
          {action && <EmptyActionControl action={action} primary={!!secondaryAction} />}
          {secondaryAction && <EmptyActionControl action={secondaryAction} />}
        </div>
      )}
    </div>
  );
}

/* ---------- banners ---------- */

export function Banner({
  tone,
  title,
  children,
  actions,
  onDismiss,
}: {
  tone: 'error' | 'warning' | 'info' | 'success';
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  onDismiss?: () => void;
}) {
  const icon =
    tone === 'error' ? (
      <CircleX size={16} />
    ) : tone === 'warning' ? (
      <TriangleAlert size={16} />
    ) : tone === 'success' ? (
      <CircleCheck size={16} />
    ) : (
      <Info size={16} />
    );
  return (
    <div className={`banner banner--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="banner__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="banner__text">
        <p className="banner__title">{title}</p>
        {children && <div className="banner__body">{children}</div>}
      </div>
      {actions && <div className="banner__actions">{actions}</div>}
      {onDismiss && (
        <IconButton label="Dismiss this message" size="sm" onClick={onDismiss} className="banner__close">
          <X size={15} />
        </IconButton>
      )}
    </div>
  );
}

/* ---------- loading ---------- */

export function Skeleton({ w = '100%', h = 14 }: { w?: string | number; h?: number }) {
  return <span className="skeleton" style={{ width: w, height: h }} aria-hidden="true" />;
}

export function TableSkeleton({ rows = 6, cols = 7 }: { rows?: number; cols?: number }) {
  const widths = ['62px', '46%', '22%', '150px', '130px', '150px', '84px'];
  return (
    <div className="table-wrap" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading rows</span>
      <table className="table">
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((__, c) => (
                <td key={c}>
                  <Skeleton w={widths[c % widths.length]} h={12} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="panel panel--pad" aria-busy="true">
      <Skeleton w="34%" h={16} />
      <div style={{ height: 12 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <Skeleton w={i === lines - 1 ? '58%' : '100%'} h={12} />
        </div>
      ))}
    </div>
  );
}

/* ---------- toasts ---------- */

export function ToastStack() {
  const { toasts, dismissToast } = useStore();
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" role="region" aria-label="Notifications">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`} role="status">
          <span className="toast__icon" aria-hidden="true">
            {t.tone === 'success' ? (
              <CircleCheck size={16} />
            ) : t.tone === 'error' ? (
              <CircleX size={16} />
            ) : (
              <Info size={16} />
            )}
          </span>
          <div className="toast__text">
            <p className="toast__title">{t.title}</p>
            {t.body && <p className="toast__body">{t.body}</p>}
            {t.action && (
              <Link className="toast__action" to={t.action.to}>
                {t.action.label}
              </Link>
            )}
          </div>
          <IconButton label="Dismiss" size="sm" onClick={() => dismissToast(t.id)}>
            <X size={14} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
