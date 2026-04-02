import { useAgents } from '@/contexts/AgentContext';
import { getAgent } from '@/lib/agents';
import { cn } from '@/lib/utils';
import { CheckCircle2, Loader2, Clock, AlertCircle, Zap, ChevronUp, ChevronDown, X } from 'lucide-react';
import { useState } from 'react';

const STATUS_ICON: Record<string, React.ReactNode> = {
  running:  <Loader2    className="h-3 w-3 animate-spin text-blue-400 shrink-0" />,
  complete: <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />,
  queued:   <Clock       className="h-3 w-3 text-amber-400 shrink-0" />,
  idle:     <Zap         className="h-3 w-3 text-muted-foreground shrink-0" />,
  error:    <AlertCircle className="h-3 w-3 text-destructive shrink-0" />,
};

const STATUS_COLOR: Record<string, string> = {
  running:  'border-l-2 border-blue-500/40 bg-blue-500/5',
  complete: 'border-l-2 border-emerald-500/40 bg-emerald-500/5',
  queued:   'border-l-2 border-amber-500/40 bg-amber-500/5',
  error:    'border-l-2 border-destructive/40 bg-destructive/5',
  idle:     '',
};

export default function AgentActivityStrip() {
  const { activities, clearActivities } = useAgents();
  const [expanded, setExpanded] = useState(false);

  const runningCount = activities.filter((a) => a.status === 'running').length;
  const latestActivity = activities[0];
  const latestAgent = latestActivity ? getAgent(latestActivity.agentId) : null;

  if (activities.length === 0) return null;

  return (
    <div
      className={cn(
        'fixed bottom-0 left-64 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border shadow-lg transition-all duration-300',
        expanded ? 'h-48' : 'h-9'
      )}
    >
      {/* Collapsed bar — always visible */}
      <div className="flex items-center gap-3 px-4 h-9 shrink-0">
        {/* Live pulse / status dot */}
        {runningCount > 0 ? (
          <span className="flex items-center gap-1.5 text-xs text-blue-400 font-medium">
            <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
            {runningCount} running
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Agents idle
          </span>
        )}

        {/* Divider */}
        <span className="h-4 w-px bg-border" />

        {/* Latest step — scrolling ticker when collapsed */}
        {latestActivity && latestAgent && (
          <div className="flex items-center gap-2 flex-1 min-w-0 text-xs">
            {STATUS_ICON[latestActivity.status]}
            <span className="font-medium text-foreground/80 shrink-0">{latestAgent.name}</span>
            {latestActivity.message && (
              <span className="text-muted-foreground truncate">{latestActivity.message}</span>
            )}
            {latestActivity.confidence !== undefined && (
              <span className="ml-2 shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                {latestActivity.confidence}%
              </span>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-muted-foreground shrink-0">{activities.length} events</span>
          <button
            onClick={clearActivities}
            className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            title="Clear activity"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded panel — horizontal scrolling list of events */}
      {expanded && (
        <div className="px-4 pb-3 overflow-x-auto">
          <div className="flex items-start gap-2 min-w-max">
            {activities.slice(0, 20).map((act, i) => {
              const agent = getAgent(act.agentId);
              if (!agent) return null;
              return (
                <div
                  key={`${act.agentId}-${act.timestamp}-${i}`}
                  className={cn(
                    'flex flex-col gap-1 px-3 py-2 rounded-lg text-xs w-52 shrink-0',
                    STATUS_COLOR[act.status] || 'bg-muted/30'
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {STATUS_ICON[act.status]}
                    <span className="font-semibold text-foreground/90 truncate">{agent.name}</span>
                    {act.confidence !== undefined && (
                      <span className="ml-auto text-[10px] font-semibold px-1 rounded-full bg-emerald-500/10 text-emerald-400">
                        {act.confidence}%
                      </span>
                    )}
                  </div>
                  {act.message && (
                    <p className="text-muted-foreground line-clamp-2 leading-tight">{act.message}</p>
                  )}
                  {act.durationMs !== undefined && (
                    <p className="text-muted-foreground/50 text-[10px]">{(act.durationMs / 1000).toFixed(1)}s</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
