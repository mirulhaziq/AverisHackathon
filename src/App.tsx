import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
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
  [/^\/dashboard/, 'Home'],
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

export function App() {
  const { user } = useStore();
  const { pathname } = useLocation();

  if (!user) return <SignIn />;

  const title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? 'SDVS';

  return (
    <AppShell title={title}>
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
