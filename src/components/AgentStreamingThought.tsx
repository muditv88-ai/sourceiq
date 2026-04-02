import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface Props {
  thoughts: string[];
  isRunning: boolean;
  agentName?: string;
  className?: string;
}

export default function AgentStreamingThought({ thoughts, isRunning, agentName, className }: Props) {
  const [visible, setVisible] = useState<string[]>([]);
  const [cursor, setCursor] = useState(true);

  useEffect(() => {
    if (!isRunning) { setVisible([]); return; }
    setVisible([]);
    let idx = 0;
    const interval = setInterval(() => {
      if (idx < thoughts.length) {
        setVisible((prev) => [...prev, thoughts[idx]]);
        idx++;
      } else {
        clearInterval(interval);
      }
    }, 900);
    return () => clearInterval(interval);
  }, [isRunning, thoughts]);

  useEffect(() => {
    const t = setInterval(() => setCursor((c) => !c), 500);
    return () => clearInterval(t);
  }, []);

  if (!isRunning && visible.length === 0) return null;

  return (
    <div className={cn('rounded-xl border bg-card/80 p-4 space-y-2 font-mono text-xs', className)}>
      <div className="flex items-center gap-2 text-muted-foreground mb-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>{agentName ?? 'Agent'} is thinking...</span>
      </div>
      {visible.map((thought, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-primary/50 mt-px">›</span>
          <span
            className={cn(
              'text-muted-foreground leading-relaxed',
              i === visible.length - 1 && isRunning && 'text-foreground/80'
            )}
          >
            {thought}
            {i === visible.length - 1 && isRunning && (
              <span className={cn('inline-block w-1.5 h-3 ml-0.5 align-middle bg-primary', cursor ? 'opacity-100' : 'opacity-0')} />
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
