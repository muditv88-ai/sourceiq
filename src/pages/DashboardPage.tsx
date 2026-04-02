import AgentCapabilityCards from '@/components/AgentCapabilityCards';
import AgentActivityFeed from '@/components/AgentActivityFeed';
import AgentOrchestrationDiagram from '@/components/AgentOrchestrationDiagram';
import { useAgents } from '@/contexts/AgentContext';
import { useEffect } from 'react';
import { Zap, Info } from 'lucide-react';

// Demo: seed some mock activity on first load so the UI isn't empty
function useDemoActivity() {
  const { pushActivity } = useAgents();
  useEffect(() => {
    const timeout = setTimeout(() => {
      pushActivity({ agentId: 'rfp', status: 'complete', message: 'Drafted 4 RFP sections', durationMs: 2300, confidence: 92 });
      pushActivity({ agentId: 'analysis', status: 'complete', message: 'Identified 3 compliance gaps', durationMs: 1800, confidence: 87 });
      pushActivity({ agentId: 'pricing', status: 'complete', message: 'Analysed 14 comparable RFPs', durationMs: 3100, confidence: 81 });
      pushActivity({ agentId: 'deadline', status: 'queued', message: 'Waiting for pricing data' });
      pushActivity({ agentId: 'award', status: 'idle' });
      pushActivity({ agentId: 'comms', status: 'idle' });
    }, 800);
    return () => clearTimeout(timeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default function DashboardPage() {
  useDemoActivity();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your multi-agent procurement intelligence hub
        </p>
      </div>

      {/* System banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20 text-sm">
        <Zap className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold text-foreground">6 AI agents running in parallel</p>
          <p className="text-muted-foreground text-xs mt-0.5">
            RFP Generation → Technical Analysis → Pricing → Deadline → Award → Communications
          </p>
        </div>
        <Info className="h-4 w-4 text-muted-foreground/50 mt-0.5 shrink-0 ml-auto" />
      </div>

      {/* Agent capability cards */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Agent Roster</h2>
        <AgentCapabilityCards />
      </section>

      {/* Two-col: feed + orchestration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold mb-3">Live Agent Activity</h2>
          <AgentActivityFeed />
        </div>
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold mb-1">Agent Orchestration</h2>
          <p className="text-xs text-muted-foreground mb-3">How agents connect in the pipeline</p>
          <AgentOrchestrationDiagram />
        </div>
      </div>
    </div>
  );
}
