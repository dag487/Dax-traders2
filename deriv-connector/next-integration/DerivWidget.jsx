// deriv-connector/next-integration/DerivWidget.jsx
// Example React component to add to your Next.js app

import React, { useState } from 'react';
import { useDeriv } from './useDeriv';

export default function DerivWidget() {
  const { connected, lastMessage, send } = useDeriv();
  const [payload, setPayload] = useState('{"ticks":"R_100"}');
  const [log, setLog] = useState([]);

  const addLog = (m) => setLog((l) => [...l.slice(-200), `[${new Date().toLocaleTimeString()}] ${JSON.stringify(m)}`]);

  React.useEffect(() => {
    if (lastMessage) addLog(lastMessage);
  }, [lastMessage]);

  const handleSend = async (e) => {
    e.preventDefault();
    let p;
    try { p = JSON.parse(payload); } catch (err) { alert('Invalid JSON'); return; }
    try {
      const r = await send(p);
      addLog({ sent: p, response: r });
    } catch (err) {
      addLog({ error: err.message });
    }
  };

  return (
    <div style={{ border: '1px solid #ddd', padding: 12 }}>
      <h3>Deriv Connector</h3>
      <div>Status: {connected ? 'connected' : 'disconnected'}</div>
      <form onSubmit={handleSend} style={{ marginTop: 8 }}>
        <textarea style={{ width: '100%', height: 80 }} value={payload} onChange={(e) => setPayload(e.target.value)} />
        <button type="submit">Send</button>
      </form>

      <h4>Log</h4>
      <div style={{ background: '#fafafa', height: 200, overflow: 'auto', padding: 8 }}>
        {log.map((l, i) => <div key={i} style={{ fontFamily: 'monospace', fontSize: 12 }}>{typeof l === 'string' ? l : JSON.stringify(l)}</div>)}
      </div>
    </div>
  );
}
