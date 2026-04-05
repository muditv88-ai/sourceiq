import React, { createContext, useContext, useCallback, useRef, useState, useEffect } from 'react';
import type { AgentActivity, AgentStatus } from '@/lib/agents';
import { getToken } from '@/lib/auth';

const POLL_MS = 3000; // poll every 3 seconds

interface AgentContextValue {
  activities: AgentActivity[];
  pushActivity: (activity: Omit<AgentActivity, 'timestamp'>) => void;
  clearActivities: () => void;
  runCount: number;
  totalTimeSavedMs: number;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [runCount, setRunCount] = useState(0);
  const totalTimeSavedMs = useRef(0);
  const seenIds = useRef<Set<string>>(new Set());

  // ─── Local push (used by in-app triggers) ───────────────────────────────
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

  // ─── Backend polling for live agent logs ────────────────────────────────
  useEffect(() => {
    let active = true;

    async function fetchLogs() {
      // Guard 1: skip if no token in memory yet (pre-login / race condition on mount)
      const token = getToken();
      if (!token || token === 'undefined' || token === 'null' || token.trim() === '') return;

      try {
        const res = await fetch(`/api/agent-logs`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        // Guard 2: backend returns [] for anonymous requests (soft auth),
        // but if a real 401 slips through (e.g. expired token) just skip silently.
        if (res.status === 401 || res.status === 403) return;
        if (!res.ok) return;

        const data: Array<{
          id: string;
          agent_id: string;
          status: AgentStatus;
          message?: string;
          confidence?: number;
          duration_ms?: number;
          timestamp: number;
        }> = await res.json();

        if (!active) return;

        const fresh = data.filter((e) => !seenIds.current.has(e.id));
        if (fresh.length === 0) return;

        fresh.forEach((e) => seenIds.current.add(e.id));

        const mapped: AgentActivity[] = fresh.map((e) => ({
          agentId:    e.agent_id,
          status:     e.status,
          message:    e.message,
          confidence: e.confidence,
          durationMs: e.duration_ms,
          timestamp:  e.timestamp,
        }));

        setActivities((prev) => [...mapped, ...prev].slice(0, 50));

        const completed = mapped.filter((a) => a.status === 'complete');
        if (completed.length > 0) {
          setRunCount((c) => c + completed.length);
          completed.forEach((a) => {
            if (a.durationMs) totalTimeSavedMs.current += a.durationMs;
          });
        }
      } catch {
        // network error — silently wait for next poll tick
      }
    }

    fetchLogs(); // immediate first fetch
    const id = setInterval(fetchLogs, POLL_MS);
    return () => { active = false; clearInterval(id); };
  }, []);

  return (
    <AgentContext.Provider
      value={{
        activities,
        pushActivity,
        clearActivities,
        runCount,
        totalTimeSavedMs: totalTimeSavedMs.current,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}

export function useAgents() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error('useAgents must be used inside AgentProvider');
  return ctx;
}

