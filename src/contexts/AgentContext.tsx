import React, { createContext, useContext, useCallback, useRef, useState, useEffect } from 'react';
import type { AgentActivity, AgentStatus } from '@/lib/agents';
import { getToken } from '@/lib/auth';

const BACKEND = import.meta.env.VITE_API_URL ?? 'https://muditv88-ai-sourceiq-backend.hf.space';

function wsBase(httpUrl: string): string {
  return httpUrl.replace(/^https?:\/\//, (m) => (m === 'https://' ? 'wss://' : 'ws://'));
}

const WS_URL = `${wsBase(BACKEND)}/agent-logs/ws`;
const POLL_URL = `${BACKEND}/agent-logs`;
const POLL_MS = 5000;

interface AgentContextValue {
  activities: AgentActivity[];
  pushActivity: (activity: Omit<AgentActivity, 'timestamp'>) => void;
  clearActivities: () => void;
  runCount: number;
  totalTimeSavedMs: number;
  connected: boolean;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [runCount, setRunCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const totalTimeSavedMs = useRef(0);
  const seenIds = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const unmounted = useRef(false);

  const ingestEntries = useCallback((entries: Array<{id: string; agent_id: string; status: AgentStatus; message?: string; confidence?: number; duration_ms?: number; timestamp: number}>) => {
    const fresh = entries.filter((e) => !seenIds.current.has(e.id));
    if (fresh.length === 0) return;
    fresh.forEach((e) => seenIds.current.add(e.id));
    const mapped: AgentActivity[] = fresh.map((e) => ({agentId: e.agent_id, status: e.status, message: e.message, confidence: e.confidence, durationMs: e.duration_ms, timestamp: e.timestamp}));
    setActivities((prev) => [...mapped, ...prev].slice(0, 50));
    const completed = mapped.filter((a) => a.status === 'complete');
    if (completed.length > 0) {
      setRunCount((c) => c + completed.length);
      completed.forEach((a) => { if (a.durationMs) totalTimeSavedMs.current += a.durationMs; });
    }
  }, []);

  const pushActivity = useCallback((activity: Omit<AgentActivity, 'timestamp'>) => {
    const stamped: AgentActivity = { ...activity, timestamp: Date.now() };
    setActivities((prev) => [stamped, ...prev].slice(0, 50));
    if (activity.status === 'complete') {
      setRunCount((c) => c + 1);
      if (activity.durationMs) totalTimeSavedMs.current += activity.durationMs;
    }
  }, []);

  const clearActivities = useCallback(() => {
    setActivities([]);
    seenIds.current.clear();
  }, []);

  const startPolling = useCallback(() => {
    if (pollTimer.current) return;
    async function fetchLogs() {
      const token = getToken();
      if (!token || token === 'undefined' || token === 'null' || token.trim() === '') return;
      try {
        const res = await fetch(POLL_URL, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        if (!unmounted.current) ingestEntries(data);
      } catch {}
    }
    fetchLogs();
    pollTimer.current = setInterval(fetchLogs, POLL_MS);
  }, [ingestEntries]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
  }, []);

  const connectWS = useCallback(() => {
    if (unmounted.current) return;
    const token = getToken();
    const url = token && token !== 'undefined' ? `${WS_URL}?token=${token}` : WS_URL;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => { if (unmounted.current) { ws.close(); return; } setConnected(true); stopPolling(); };
    ws.onmessage = (event) => {
      if (unmounted.current) return;
      try {
        const data = JSON.parse(event.data as string);
        if (data.type === 'ping') { ws.send('pong'); return; }
        if (data.id && data.agent_id) ingestEntries([data]);
      } catch {}
    };
    ws.onclose = () => {
      if (unmounted.current) return;
      setConnected(false);
      wsRef.current = null;
      startPolling();
      reconnectTimer.current = setTimeout(() => { stopPolling(); connectWS(); }, 5000);
    };
    ws.onerror = () => { ws.close(); };
  }, [ingestEntries, startPolling, stopPolling]);

  useEffect(() => {
    unmounted.current = false;
    connectWS();
    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      stopPolling();
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    };
  }, [connectWS, stopPolling]);

  return (
    <AgentContext.Provider value={{ activities, pushActivity, clearActivities, runCount, totalTimeSavedMs: totalTimeSavedMs.current, connected }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgents() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error('useAgents must be used inside AgentProvider');
  return ctx;
}
