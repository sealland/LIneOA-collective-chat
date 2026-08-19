import { useCallback, useEffect, useState } from 'react';
import { Route, Routes, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { Shell } from './components/Shell';
import { OverviewPage } from './pages/OverviewPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { ConversationsPage } from './pages/ConversationsPage';
import { QualityPage } from './pages/QualityPage';
import { fetchJson } from './lib/api';
import { normalizeDateRange } from './lib/dateRange';

export default function App() {
  const [params, setParams] = useSearchParams();
  const today = dayjs().format('YYYY-MM-DD');
  const { from, to } = normalizeDateRange({
    from: params.get('from'),
    to: params.get('to'),
    date: params.get('date'),
    fallback: today,
  });
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

  function onRangeChange(nextFrom: string, nextTo: string) {
    const next = normalizeDateRange({ from: nextFrom, to: nextTo, fallback: today });
    const nextParams = new URLSearchParams(params);
    nextParams.set('from', next.from);
    nextParams.set('to', next.to);
    nextParams.delete('date');
    setParams(nextParams);
  }

  function onCollectCompleted() {
    reloadDates();
    setRefreshKey((k) => k + 1);
  }

  const rangeKey = `${from}_${to}_${refreshKey}`;

  return (
    <Shell
      from={from}
      to={to}
      dates={dates}
      onRangeChange={onRangeChange}
      onCollectCompleted={onCollectCompleted}
    >
      <Routes>
        <Route path="/" element={<OverviewPage key={`o-${rangeKey}`} from={from} to={to} />} />
        <Route
          path="/employees"
          element={<EmployeesPage key={`e-${rangeKey}`} from={from} to={to} />}
        />
        <Route
          path="/conversations"
          element={<ConversationsPage key={`c-${rangeKey}`} from={from} to={to} />}
        />
        <Route
          path="/quality"
          element={<QualityPage key={`q-${rangeKey}`} from={from} to={to} />}
        />
      </Routes>
    </Shell>
  );
}
