import { useState, useCallback } from 'react';
import Header from './components/Header';
import TradingTab from './components/TradingTab';
import BacktestTab from './components/BacktestTab';
import ReportsTab from './components/ReportsTab';
import MultiBotTab from './components/MultiBotTab';
import useWebSocket from './hooks/useWebSocket';
import useToast from './hooks/useToast.jsx';

const TABS = [
  { id: 'trading', label: '트레이딩' },
  { id: 'bots', label: '멀티봇' },
  { id: 'backtest', label: '전략 검증' },
  { id: 'reports', label: '리포트' },
];

export default function App() {
  const [tab, setTab] = useState('trading');
  const [ticker, setTicker] = useState({});
  const [botStatus, setBotStatus] = useState({});
  const { show: toast, Toast } = useToast();

  const onWsMessage = useCallback((type, payload) => {
    if (type === 'ticker') setTicker(payload);
    else if (type === 'botStatus') setBotStatus(payload);
  }, []);

  const { status: wsStatus, send: wsSend } = useWebSocket(onWsMessage);

  return (
    <>
      <Header wsStatus={wsStatus} />
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'trading' && <TradingTab ticker={ticker} botStatus={botStatus} wsSend={wsSend} toast={toast} />}
      {tab === 'bots' && <MultiBotTab toast={toast} />}
      {tab === 'backtest' && <BacktestTab toast={toast} />}
      {tab === 'reports' && <ReportsTab toast={toast} />}

      <Toast />
    </>
  );
}
