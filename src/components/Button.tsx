import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'marker';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconEnd?: ReactNode;
  block?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  iconEnd,
  block = false,
  children,
  className = '',
  disabled,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      className={`btn btn--${variant} btn--${size}${block ? ' btn--block' : ''}${loading ? ' is-loading' : ''} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <LoaderCircle size={15} className="btn__spinner" aria-hidden="true" />
      ) : (
        icon && (
          <span className="btn__icon" aria-hidden="true">
            {icon}
          </span>
        )
      )}
      <span className="btn__label">{children}</span>
      {iconEnd && !loading && (
        <span className="btn__icon" aria-hidden="true">
          {iconEnd}
        </span>
      )}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  size?: Size;
  pressed?: boolean;
}

export function IconButton({ label, children, size = 'md', pressed, className = '', ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-btn icon-btn--${size}${pressed ? ' is-pressed' : ''} ${className}`}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      {...rest}
    >
      {children}
    </button>
  );
}
