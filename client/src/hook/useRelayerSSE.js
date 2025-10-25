import { useEffect, useMemo, useRef, useState } from 'react';

export function useRelayerSSE({ apiBase = '', user }) {
  const [tick, setTick] = useState(null);
  const [lastExec, setLastExec] = useState(null);
  const esRef = useRef(null);

  const url = useMemo(() => {
    const b = String(apiBase || '').replace(/\/+$/, '');
    const path = `/api/relayer/stream${user ? `?user=${user}` : ''}`;
    return b ? `${b}${path}` : path;
  }, [apiBase, user]);

  useEffect(() => {
    if (!user) return;
    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    es.addEventListener('tick', (e) => {
      try {
        setTick(JSON.parse(e.data));
      } catch {}
    });
    es.addEventListener('exec', (e) => {
      try {
        setLastExec(JSON.parse(e.data));
      } catch {}
    });
    es.onerror = () => {
      /* авто-reconnect браузера */
    };

    return () => {
      esRef.current?.close();
    };
  }, [url, user]);

  return { tick, lastExec };
}
