import { cn } from '@/lib/utils';
import { getAgent } from '@/lib/agents';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Props {
  agentId: string;
  confidence: number;
  basis?: string;
  className?: string;
}

export default function ConfidenceBadge({ agentId, confidence, basis, className }: Props) {
  const agent = getAgent(agentId);
  if (!agent) return null;

  const color =
    confidence >= 80 ? 'text-emerald-400 bg-emerald-500/10'
    : confidence >= 60 ? 'text-amber-400 bg-amber-500/10'
    : 'text-red-400 bg-red-500/10';

  return (
    <div className={cn('inline-flex items-center gap-1.5 text-xs', className)}>
      <span className="text-muted-foreground">—</span>
      <span className={cn('font-medium', agent.accent)}>{agent.emoji} {agent.name} Agent</span>
      <span className={cn('font-semibold px-1.5 py-0.5 rounded-full', color)}>
        {confidence}% confidence
      </span>
      {basis && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            {basis}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
