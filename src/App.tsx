import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Banner } from './components/feedback';
import { useStore } from './state/store';
import { SignIn } from './screens/SignIn';
import { Dashboard } from './screens/Dashboard';
import { InboxReport } from './screens/InboxReport';
import { CaseDetail } from './screens/CaseDetail';
import { ReviewQueue } from './screens/ReviewQueue';
import { ReviewTask } from './screens/ReviewTask';
import { ImportBatches } from './screens/ImportBatches';
import { ExportScreen } from './screens/ExportScreen';
import { Configuration } from './screens/Configuration';
import { AuditLog } from './screens/AuditLog';
import { DesignSystem } from './screens/DesignSystem';
import { Help } from './screens/Help';

const TITLES: Array<[RegExp, string]> = [
  [/^\/dashboard/, 'Overview'],
  [/^\/inbox/, 'All emails'],
  [/^\/cases/, 'Email details'],
  [/^\/review\/.+/, 'Check document details'],
  [/^\/review$/, 'Needs review'],
  [/^\/batches/, 'Email imports'],
  [/^\/export/, 'Download results'],
  [/^\/configuration/, 'Settings'],
  [/^\/audit/, 'Activity history'],
  [/^\/help/, 'Help & guidance'],
  [/^\/design-system/, 'Design system'],
];

/* Screens with no backend endpoint yet - they run on sample data even when
   the live API is up, so say so rather than let it pass for real results. */
const SAMPLE_ONLY: Array<[RegExp, string]> = [
  [/^\/batches/, 'Email imports'],
  [/^\/export/, 'Export history'],
  [/^\/configuration/, 'Settings'],
  [/^\/audit/, 'Activity history'],
];

export function App() {
  const { user, dataError } = useStore();
  const { pathname } = useLocation();

  if (!user) return <SignIn />;

  const title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? 'Tidemark';
  const sampleOnly = SAMPLE_ONLY.find(([re]) => re.test(pathname))?.[1];

  return (
    <AppShell title={title}>
      {dataError && (
        <Banner tone="warning" title="Showing sample data">
          The live API could not be reached ({dataError}), so this screen is showing sample data instead of real
          results.
        </Banner>
      )}
      {!dataError && sampleOnly && (
        <Banner tone="info" title="Sample data on this screen">
          {sampleOnly} is not connected to the server yet, so this screen shows example data. Emails, results and
          reviews elsewhere are live.
        </Banner>
      )}
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/inbox" element={<InboxReport />} />
        <Route path="/cases/:caseId" element={<CaseDetail />} />
        <Route path="/review" element={<ReviewQueue />} />
        <Route path="/review/:taskId" element={<ReviewTask />} />
        <Route path="/batches" element={<ImportBatches />} />
        <Route path="/export" element={<ExportScreen />} />
        <Route path="/configuration" element={<Configuration />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="/design-system" element={<DesignSystem />} />
        <Route path="/help" element={<Help />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}
