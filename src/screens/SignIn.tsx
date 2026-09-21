/* ============================================================
   1. Sign in
   ============================================================ */

import { useState } from 'react';
import { Anchor, ArrowRight } from 'lucide-react';
import { Button } from '../components/Button';
import { Banner } from '../components/feedback';
import { useStore } from '../state/store';
import type { Role } from '../types';

export function SignIn() {
  const { signIn, sessionExpired } = useStore();
  const [role, setRole] = useState<Role>('Reviewer');
  const [busy, setBusy] = useState(false);

  const expired = sessionExpired;

  function go() {
    setBusy(true);
    window.setTimeout(() => {
      signIn(role);
      setBusy(false);
    }, 550);
  }

  return (
    <div className="signin">
      <div className="signin__panel">
        <div className="signin__brand">
          <span className="signin__mark" aria-hidden="true">
            <Anchor size={22} />
          </span>
          <div>
            <h1 className="signin__name">SDVS</h1>
            <p className="signin__tagline">Shipping Document Verification System</p>
          </div>
        </div>

        <div><p className="eyebrow">WELCOME TO YOUR WORKSPACE</p><h2 className="signin__heading">Shipping checks,<br />made clearer.</h2></div>
        <p className="signin__intro">See which shipping documents match, find differences, and check details that need a person’s attention.</p>

        {expired && (
          <Banner tone="error" title="Your session expired">
            You were signed out after 30 minutes without activity. Sign in again to carry on. Any review
            decisions you had not saved were not kept.
          </Banner>
        )}

        <Button variant="primary" size="lg" block loading={busy} iconEnd={<ArrowRight size={16} />} onClick={go}>
          Open demo workspace
        </Button>
        <p className="signin__hosted">
          Try the app with sample emails. No password is needed.
        </p>

        <details className="signin__proto">
          <summary className="signin__proto-title">Choose a different demo role</summary>
          <p className="signin__proto-note">
            Reviewer is selected so you can try checking documents. Operators view results; administrators also manage settings.
          </p>
          <div className="signin__roles" role="radiogroup" aria-label="Role to sign in with">
            {(['Operator', 'Reviewer', 'Admin'] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={role === r}
                className={`signin__role${role === r ? ' is-active' : ''}`}
                onClick={() => setRole(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </details>
      </div>

      <p className="signin__foot mono">SDVS 1.0 — operations build 2026.09.21</p>
    </div>
  );
}
