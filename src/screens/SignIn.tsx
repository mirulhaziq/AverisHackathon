/* ============================================================
   1. Sign in
   ============================================================ */

import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { TideMark, TideChart } from '../components/Brand';
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
      <section className="signin__story" aria-label="About Tidemark">
        <div className="story-brand"><TideMark /><span>tidemark<span className="brand-period">.</span></span></div>
        <div className="story-copy"><p className="eyebrow">A CLEARER COURSE FOR YOUR CARGO</p><h1>Every detail.<br />In the <em>clear.</em></h1><p>From shipping instructions to bills of lading.{' '}<br />Find the differences before they go the distance.</p></div>
        <div className="story-chart"><TideChart /><span className="chart-caption mono">DOCUMENT TO DEPARTURE / A CLEARER COURSE</span></div>
        <div className="story-footer"><span>Clear documents. Confident departures.</span><span className="mono">EST. 2026</span></div>
      </section>
      <div className="signin__entry">
      <div className="signin__entry-top"><span>THE SHIPPING DOCUMENT WORKSPACE</span><span className="demo-tag">DEMO EDITION</span></div>
      <div className="signin__panel">
        <div className="signin__brand">
          <span className="signin__mark" aria-hidden="true">
            <TideMark />
          </span>
          <div>
            <span className="signin__name">tidemark.</span>
            <p className="signin__tagline">Document intelligence</p>
          </div>
        </div>

        <div><p className="eyebrow">WELCOME ABOARD</p><h2 className="signin__heading">Your next departure<br />starts with clarity.</h2></div>
        <p className="signin__intro">One calm workspace to compare shipping documents, resolve differences, and keep your cargo moving.</p>
        <div className="signin__benefits"><span><Check size={15} /> Compare the details</span><span><Check size={15} /> Review with confidence</span></div>

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

      <p className="signin__foot">Built for the people behind every shipment.<span className="mono">TIDEMARK / 1.0</span></p>
      </div>
    </div>
  );
}
