// deriv-connector/next-integration/useDeriv.js
// React hook to manage SSE connection and send helper

import { useEffect, useRef, useState, useCallback } from 'react';
import { createEventSource, sendToDeriv } from './client';

export function useDeriv({ onMessage } = {}) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const esRef = useRef(null);

  useEffect(() => {
    esRef.current = createEventSource((msg) => {
      setLastMessage(msg);
      onMessage && onMessage(msg);
    }, () => setConnected(true), () => setConnected(false));

    return () => {
      try { esRef.current && esRef.current.close(); } catch (e) {}
      esRef.current = null;
    };
  }, []);

  const send = useCallback(async (payload) => {
    return sendToDeriv(payload);
  }, []);

  return { connected, lastMessage, send };
}
