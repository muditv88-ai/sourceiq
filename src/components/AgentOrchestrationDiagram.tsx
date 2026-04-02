import { AGENTS } from '@/lib/agents';
import { useAgents } from '@/contexts/AgentContext';
import { cn } from '@/lib/utils';

export default function AgentOrchestrationDiagram() {
  const { activities } = useAgents();

  const latestStatus = (agentId: string) => {
    const act = activities.find((a) => a.agentId === agentId);
    return act?.status ?? 'idle';
  };

  return (
    <div className="relative flex flex-col items-center gap-4 py-4">
      {/* You node */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-xs font-semibold shadow">
        <span>👤</span> You
      </div>

      {/* Arrow down */}
      <div className="w-px h-5 bg-border" />

      {/* Orchestrator */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-full border-2 border-primary/40 bg-primary/5 text-primary text-xs font-semibold">
        <span>🤖</span> Orchestrator
      </div>

      {/* Fan-out arrows */}
      <div className="relative w-full flex justify-center">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-4 bg-border" />
        <div className="absolute top-4 left-[10%] right-[10%] h-px bg-border" />
        {/* vertical drops */}
        {AGENTS.map((_, i) => {
          const totalCols = AGENTS.length;
          const pct = ((i + 0.5) / totalCols) * 80 + 10; // 10% to 90%
          return (
            <div
              key={i}
              className="absolute h-4 w-px bg-border"
              style={{ left: `${pct}%`, top: '4px' }}
            />
          );
        })}
      </div>

      {/* Agent nodes */}
      <div className="grid grid-cols-3 gap-2 w-full mt-4">
        {AGENTS.map((agent) => {
          const status = latestStatus(agent.id);
          return (
            <div
              key={agent.id}
              className={cn(
                'flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border text-center transition-all',
                agent.color,
                status === 'running' && 'ring-1 ring-blue-400/50 shadow-sm',
                status === 'complete' && 'ring-1 ring-emerald-400/30'
              )}
            >
              <span className="text-lg leading-none">{agent.emoji}</span>
              <span className={cn('text-[10px] font-semibold leading-tight', agent.accent)}>
                {agent.name}
              </span>
              <span
                className={cn(
                  'text-[9px] px-1.5 py-0.5 rounded-full font-medium capitalize',
                  status === 'running' && 'bg-blue-500/20 text-blue-300',
                  status === 'complete' && 'bg-emerald-500/20 text-emerald-300',
                  status === 'queued' && 'bg-amber-500/20 text-amber-300',
                  status === 'error' && 'bg-red-500/20 text-red-300',
                  status === 'idle' && 'bg-muted/50 text-muted-foreground'
                )}
              >
                {status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
