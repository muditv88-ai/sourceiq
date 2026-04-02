import { useAgents } from '@/contexts/AgentContext';
import { AGENTS, getAgent } from '@/lib/agents';
import { cn } from '@/lib/utils';
import AgentOrchestrationDiagram from '@/components/AgentOrchestrationDiagram';
import AgentActivityFeed from '@/components/AgentActivityFeed';
import { BarChart3, Clock, Cpu, TrendingUp, Zap } from 'lucide-react';

function StatCard({ label, value, icon: Icon, sub }: { label: string; value: string; icon: React.ElementType; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function AgentAnalyticsPage() {
  const { activities, runCount, totalTimeSavedMs } = useAgents();

  const agentFireCounts = AGENTS.map((agent) => ({
    agent,
    count: activities.filter((a) => a.agentId === agent.id && a.status === 'complete').length,
  }));

  const maxCount = Math.max(...agentFireCounts.map((a) => a.count), 1);

  const lastRun = activities[0];
  const lastRunAgents = lastRun
    ? [...new Set(activities.filter((a) => Date.now() - a.timestamp < 60_000).map((a) => a.agentId))]
    : [];

  const timeSavedMin = Math.round(totalTimeSavedMs / 1000 / 60);
  const manualEquivalentMin = runCount * 45; // ~45 min manual per RFP cycle

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agent Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">Live metrics from the SourceIQ multi-agent system</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Agent Runs"
          value={String(runCount)}
          icon={Zap}
          sub="Total completed agent tasks"
        />
        <StatCard
          label="Agents Fired (Last Run)"
          value={lastRunAgents.length > 0 ? String(lastRunAgents.length) : '—'}
          icon={Cpu}
          sub={lastRunAgents.map((id) => getAgent(id)?.emoji).join(' ') || 'No recent run'}
        />
        <StatCard
          label="Time Saved (Agent)"
          value={`${timeSavedMin}m`}
          icon={Clock}
          sub="vs. estimated manual time"
        />
        <StatCard
          label="Manual Equivalent"
          value={`${manualEquivalentMin}m`}
          icon={TrendingUp}
          sub={`~45 min/run × ${runCount} runs`}
        />
      </div>

      {/* Bottom two-col grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent fire counts */}
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Agent Activity Breakdown</h2>
          </div>
          <div className="space-y-3">
            {agentFireCounts.map(({ agent, count }) => (
              <div key={agent.id} className="flex items-center gap-3">
                <span className="w-5 text-base leading-none">{agent.emoji}</span>
                <span className="text-xs font-medium text-muted-foreground w-28 shrink-0">{agent.name}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-700', agent.color.replace('/10', '/60'))}
                    style={{ width: `${(count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-semibold w-5 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Orchestration diagram */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold mb-2">Agent Orchestration</h2>
          <p className="text-xs text-muted-foreground mb-4">Live status of each agent in the pipeline</p>
          <AgentOrchestrationDiagram />
        </div>
      </div>

      {/* Activity Feed */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold mb-4">Live Activity Feed</h2>
        <AgentActivityFeed />
      </div>
    </div>
  );
}
