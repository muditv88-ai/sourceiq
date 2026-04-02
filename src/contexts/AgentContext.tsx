import React, { createContext, useContext, useCallback, useRef, useState } from 'react';
import type { AgentActivity, AgentStatus } from '@/lib/agents';

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

  const pushActivity = useCallback((activity: Omit<AgentActivity, 'timestamp'>) => {
    const stamped: AgentActivity = { ...activity, timestamp: Date.now() };
    setActivities((prev) => {
      const next = [stamped, ...prev].slice(0, 50); // keep last 50
      return next;
    });
    if (activity.status === 'complete') {
      setRunCount((c) => c + 1);
      if (activity.durationMs) totalTimeSavedMs.current += activity.durationMs;
    }
  }, []);

  const clearActivities = useCallback(() => setActivities([]), []);

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
