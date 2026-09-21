import { ArrowRight, CheckCheck, CircleHelp, FileCheck2, Inbox, ListChecks, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useStore } from '../state/store';
import { ResultChip } from '../components/chips';
import { BatchProgressBar } from '../components/BatchProgressBar';
import { TideChart } from '../components/Brand';

export function Dashboard() {
  const { cases, tasks, batches, user, can } = useStore();
  const failed = cases.filter((c) => c.result === 'Failed');
  const matched = cases.filter((c) => c.result === 'No mismatch detected');
  const differences = cases.filter((c) => c.result === 'Mismatch found');
  const latest = batches[0];
  const oldest = [...tasks].sort((a, b) => b.ageMinutes - a.ageMinutes)[0];
  /* With reviews waiting, the way into the queue leads the page and the
     banner steps down to a single line of brand. */
  const workWaiting = tasks.length > 0 && can('resolveTask');
  return (
    <div className="page home">
      <header className="page__head">
        <div><p className="eyebrow">THE DAILY MANIFEST</p><h2 className="page__title">A clearer view, {user?.name.split(' ')[0]}.</h2><p className="page__sub">Every document. Every detail. All in view.</p></div>
        {workWaiting ? (
          <div className="home-next">
            <Link to="/review" className="btn btn--primary btn--md">
              <ListChecks size={18} aria-hidden="true" /> Review {tasks.length} waiting <ArrowRight size={16} aria-hidden="true" />
            </Link>
            {oldest && <span className="home-next__meta">Oldest waiting <span className="num">{oldest.ageLabel}</span></span>}
          </div>
        ) : (
          <Link to="/inbox" className="btn btn--secondary btn--md"><Inbox size={18} /> View all emails</Link>
        )}
      </header>
      <section className={`course-banner${workWaiting ? ' course-banner--compact' : ''}`} aria-labelledby="course-title">
        <div className="course-banner__copy"><span className="course-banner__label"><span className="workspace-dot" /> YOUR DOCUMENT DESK</span><h3 id="course-title">Clear the details.{' '}<br /><em>Keep things moving.</em></h3><p>{tasks.length ? `${tasks.length} reviews are ready for your expertise. A little attention here goes a long way out there.` : 'Your review queue is clear. Explore the latest results and keep every shipment in view.'}</p><Link to={tasks.length ? '/review' : '/inbox'} className="course-banner__action">{tasks.length ? 'Go to review queue' : 'Explore results'}<ArrowRight size={17} /></Link></div>
        <TideChart /><span className="course-banner__index mono">TM / DOCUMENT INTELLIGENCE</span>
      </section>
      <section className="home-summary" aria-label="Document check summary">
        {[
          { label: 'Emails received', value: cases.length, note: 'All emails in this workspace', to: '/inbox', icon: Inbox, tone: 'info' },
          { label: 'Need a review', value: tasks.length, note: 'A person needs to check these', to: '/review', icon: ListChecks, tone: 'review' },
          { label: 'Differences found', value: differences.length, note: 'Details differ between documents', to: '/inbox?result=Mismatch%20found', icon: FileCheck2, tone: 'mismatch' },
          { label: 'Details aligned', value: matched.length, note: 'No differences found', to: '/inbox?result=No%20mismatch%20detected', icon: CheckCheck, tone: 'match' },
        ].map((item) => <Link key={item.label} to={item.to} className={`summary-card summary-card--${item.tone}`}>
          <div className="summary-card__top"><span>{item.label}</span><item.icon size={20} aria-hidden="true" /></div>
          <strong className="summary-card__number">{String(item.value).padStart(2, '0')}</strong><span className="summary-card__note">{item.note}<ArrowRight size={14} /></span>
        </Link>)}
      </section>
      <div className="home-columns">
        <section className="panel home-attention" aria-labelledby="attention-title">
          <header className="panel__head"><h3 id="attention-title" className="panel__title"><span className="section-index">01</span> Your attention, please</h3><span className="panel__meta">NEXT IN LINE</span></header>
          <div className="action-row"><span className="action-icon action-icon--review"><ListChecks size={23} /></span>
            <div className="action-row__body"><h4>{tasks.length ? `${tasks.length} document review${tasks.length === 1 ? '' : 's'} waiting` : 'You’re up to date with reviews'}</h4>
              <p>{tasks.length ? 'Check the highlighted details, then confirm or correct them.' : 'New reviews appear here when a document needs a person to check it.'}</p>
              {oldest && <span className="action-row__meta">Oldest review waiting {oldest.ageLabel}</span>}
              <Link to={tasks.length ? '/review' : '/inbox'} className="btn btn--primary btn--md">{tasks.length ? 'View reviews' : 'View results'}<ArrowRight size={17} /></Link>
            </div>
          </div>
          {differences.length > 0 && <div className="action-row"><span className="action-icon action-icon--mismatch"><FileCheck2 size={23} /></span><div className="action-row__body"><h4>{differences.length} email{differences.length === 1 ? ' has' : 's have'} document differences</h4><p>Open the results to see which details need correcting.</p><Link to="/inbox?result=Mismatch%20found" className="text-action">View differences <ArrowRight size={16} /></Link></div></div>}
          {failed.length > 0 && <div className="action-row"><span className="action-icon"><RefreshCw size={22} /></span><div className="action-row__body"><h4>{failed.length} check{failed.length === 1 ? '' : 's'} could not finish</h4><p>Open an email to see what went wrong and how to try again.</p><Link to="/inbox?result=Failed" className="text-action">View unfinished checks <ArrowRight size={16} /></Link></div></div>}
        </section>
        <aside className="home-aside">
          <section className="guide-card"><span className="eyebrow">THE TIDEMARK WAY</span><h3>From uncertain<br />to underway.</h3><p>We check the documents.<br />You bring the human judgement.</p>
            <ol className="simple-steps"><li><span>1</span><div><strong>Open a review</strong><p>Choose an email that needs checking.</p></div></li><li><span>2</span><div><strong>Check the documents</strong><p>Look at the highlighted details.</p></div></li><li><span>3</span><div><strong>Confirm and save</strong><p>Keep a correct value or enter a correction.</p></div></li></ol>
            <Link to="/help" className="text-action"><CircleHelp size={17} /> Read the simple guide <ArrowRight size={16} /></Link>
          </section>
          {latest && <section className="panel"><header className="panel__head"><h3 className="panel__title">Latest email import</h3></header><div className="panel__body"><p className="import-caption">{latest.label}</p><BatchProgressBar expected={latest.expected} accepted={latest.accepted} rejected={latest.rejected} state={latest.state} /><Link to="/batches" className="text-action import-link">View import progress <ArrowRight size={16} /></Link></div></section>}
        </aside>
      </div>
      <section className="panel" aria-labelledby="recent-title"><header className="panel__head"><h3 id="recent-title" className="panel__title"><span className="section-index">02</span> Latest on the desk</h3><Link to="/inbox" className="panel__link">View all emails <ArrowRight size={15} /></Link></header>
        <div className="recent-list">{[...cases].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5).map((c) => <Link key={c.id} to={`/cases/${c.id}`} className="recent-email"><span className="recent-email__icon"><Inbox size={19} /></span><span className="recent-email__body"><strong>{c.subject}</strong><span>{c.senderName} · {c.id}</span></span><ResultChip result={c.result} /><ArrowRight size={17} aria-hidden="true" /></Link>)}</div>
      </section>
      <footer className="workspace-footer"><span>tidemark.</span><p>Clear documents. Confident departures.</p><span className="mono">DEMO WORKSPACE</span></footer>
    </div>
  );
}
