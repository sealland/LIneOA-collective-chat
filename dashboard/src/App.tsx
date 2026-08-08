import { useCallback, useEffect, useState } from 'react';
import { Route, Routes, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { Shell } from './components/Shell';
import { OverviewPage } from './pages/OverviewPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { ConversationsPage } from './pages/ConversationsPage';
import { QualityPage } from './pages/QualityPage';
import { fetchJson } from './lib/api';

export default function App() {
  const [params, setParams] = useSearchParams();
  const dateParam = params.get('date');
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : dayjs().format('YYYY-MM-DD');
  const [dates, setDates] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const reloadDates = useCallback(() => {
    fetchJson<{ dates: string[] }>('/api/dates')
      .then((d) => setDates(d.dates))
      .catch(() => setDates([]));
  }, []);

  useEffect(() => {
    reloadDates();
  }, [reloadDates]);

  function onDateChange(next: string) {
    const nextParams = new URLSearchParams(params);
    nextParams.set('date', next);
    setParams(nextParams);
  }

  function onCollectCompleted() {
    reloadDates();
    setRefreshKey((k) => k + 1);
  }

  return (
    <Shell date={date} dates={dates} onDateChange={onDateChange} onCollectCompleted={onCollectCompleted}>
      <Routes>
        <Route path="/" element={<OverviewPage key={`o-${date}-${refreshKey}`} date={date} />} />
        <Route
          path="/employees"
          element={<EmployeesPage key={`e-${date}-${refreshKey}`} date={date} />}
        />
        <Route
          path="/conversations"
          element={<ConversationsPage key={`c-${date}-${refreshKey}`} date={date} />}
        />
        <Route path="/quality" element={<QualityPage key={`q-${date}-${refreshKey}`} date={date} />} />
      </Routes>
    </Shell>
  );
}
