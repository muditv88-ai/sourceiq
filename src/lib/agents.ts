// Central agent registry — single source of truth for all 6 agents
export type AgentStatus = 'idle' | 'running' | 'complete' | 'queued' | 'error';

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  description: string;
  route: string;
  color: string; // tailwind bg class
  accent: string; // tailwind text class
}

export interface AgentActivity {
  agentId: string;
  status: AgentStatus;
  message?: string;
  durationMs?: number;
  confidence?: number;
  timestamp: number;
}

export const AGENTS: Agent[] = [
  {
    id: 'rfp',
    name: 'RFP Generation',
    emoji: '🧾',
    description: 'Drafts full RFP documents from requirements',
    route: '/rfp/new',
    color: 'bg-blue-500/10',
    accent: 'text-blue-400',
  },
  {
    id: 'analysis',
    name: 'Technical Analysis',
    emoji: '⚙️',
    description: 'Evaluates compliance gaps and tech fit',
    route: '/analysis',
    color: 'bg-purple-500/10',
    accent: 'text-purple-400',
  },
  {
    id: 'pricing',
    name: 'Pricing',
    emoji: '💰',
    description: 'Market-rate cost estimates from comparable RFPs',
    route: '/pricing',
    color: 'bg-emerald-500/10',
    accent: 'text-emerald-400',
  },
  {
    id: 'deadline',
    name: 'Deadline',
    emoji: '⏰',
    description: 'Timeline risk analysis and milestone tracking',
    route: '/scenarios',
    color: 'bg-amber-500/10',
    accent: 'text-amber-400',
  },
  {
    id: 'award',
    name: 'Award',
    emoji: '🏆',
    description: 'Vendor scoring and recommendation engine',
    route: '/supplier-responses',
    color: 'bg-yellow-500/10',
    accent: 'text-yellow-400',
  },
  {
    id: 'comms',
    name: 'Communications',
    emoji: '📡',
    description: 'Supplier communication drafting and outreach',
    route: '/communications',
    color: 'bg-pink-500/10',
    accent: 'text-pink-400',
  },
];

export function getAgent(id: string): Agent | undefined {
  return AGENTS.find((a) => a.id === id);
}
