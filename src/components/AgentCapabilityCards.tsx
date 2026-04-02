import { AGENTS } from '@/lib/agents';
import { useAgents } from '@/contexts/AgentContext';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export default function AgentCapabilityCards() {
  const { activities } = useAgents();
  const navigate = useNavigate();

  const latestActivity = (agentId: string) =>
    activities.find((a) => a.agentId === agentId);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {AGENTS.map((agent) => {
        const latest = latestActivity(agent.id);
        const status = latest?.status ?? 'idle';

        return (
          <button
            key={agent.id}
            onClick={() => navigate(agent.route)}
            className={cn(
              'group text-left flex flex-col gap-3 p-4 rounded-xl border bg-card hover:shadow-md transition-all cursor-pointer',
              status === 'running' && 'border-blue-400/30 ring-1 ring-blue-400/20',
              status === 'complete' && 'border-emerald-400/20'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center text-lg', agent.color)}>
                {agent.emoji}
              </div>
              <span
                className={cn(
                  'text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize',
                  status === 'running' && 'bg-blue-500/15 text-blue-400 animate-pulse',
                  status === 'complete' && 'bg-emerald-500/15 text-emerald-400',
                  status === 'queued' && 'bg-amber-500/15 text-amber-400',
                  status === 'error' && 'bg-red-500/15 text-red-400',
                  status === 'idle' && 'bg-muted text-muted-foreground'
                )}
              >
                {status === 'idle' ? 'Ready' : status}
              </span>
            </div>

            <div>
              <p className={cn('text-sm font-semibold', agent.accent)}>{agent.name} Agent</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{agent.description}</p>
            </div>

            {latest?.message && (
              <p className="text-[10px] text-muted-foreground/70 italic truncate">
                &ldquo;{latest.message}&rdquo;
              </p>
            )}

            {latest?.confidence !== undefined && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', agent.color.replace('bg-', 'bg-').replace('/10', '/60'))}
                    style={{ width: `${latest.confidence}%` }}
                  />
                </div>
                <span className="text-[10px] font-medium text-muted-foreground">{latest.confidence}% conf.</span>
              </div>
            )}

            <div className={cn('flex items-center gap-1 text-[10px] font-medium mt-auto', agent.accent)}>
              Open <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
