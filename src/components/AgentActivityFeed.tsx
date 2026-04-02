import { useAgents } from '@/contexts/AgentContext';
import { getAgent } from '@/lib/agents';
import { cn } from '@/lib/utils';
import { CheckCircle2, Loader2, Clock, AlertCircle, Zap } from 'lucide-react';

const STATUS_ICON = {
  running: <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />,
  complete: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
  queued: <Clock className="h-3.5 w-3.5 text-amber-400" />,
  idle: <Zap className="h-3.5 w-3.5 text-muted-foreground" />,
  error: <AlertCircle className="h-3.5 w-3.5 text-destructive" />,
};

const STATUS_LABEL = {
  running: '●',
  complete: '✓',
  queued: '⏳',
  idle: '○',
  error: '✗',
};

export default function AgentActivityFeed() {
  const { activities } = useAgents();

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Zap className="h-8 w-8 text-muted-foreground/30 mb-2" />
        <p className="text-xs text-muted-foreground">No agent activity yet</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Activity appears here when agents run</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
      {activities.map((act, i) => {
        const agent = getAgent(act.agentId);
        if (!agent) return null;
        return (
          <div
            key={`${act.agentId}-${act.timestamp}-${i}`}
            className={cn(
              'flex items-start gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors',
              act.status === 'running' ? 'bg-blue-500/5 border border-blue-500/10' : 'hover:bg-muted/40'
            )}
          >
            <span className="mt-0.5">{STATUS_ICON[act.status]}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-foreground/90">
                  {STATUS_LABEL[act.status]} {agent.name} Agent
                </span>
                {act.confidence !== undefined && (
                  <span className="ml-auto shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                    {act.confidence}%
                  </span>
                )}
              </div>
              {act.message && (
                <p className="text-muted-foreground mt-0.5 truncate">{act.message}</p>
              )}
              {act.status === 'complete' && act.durationMs !== undefined && (
                <p className="text-muted-foreground/50 mt-0.5">{(act.durationMs / 1000).toFixed(1)}s</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
