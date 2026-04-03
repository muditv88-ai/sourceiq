export type AgentStatus = 'idle' | 'running' | 'complete' | 'queued' | 'error';

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  description: string;
  route: string;
  color: string;
  accent: string;
  capabilities?: string[];
  model?: string;
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
  { id: 'rfp', name: 'RFP Generation', emoji: '🧾', description: 'Drafts full RFP documents from requirements or parses uploaded docs', route: '/rfp/new', color: 'bg-blue-500/10', accent: 'text-blue-400', capabilities: ['generate_rfp_text', 'parse_uploaded_rfp', 'attach_drawing', 'attach_zip', 'get_drawings'] },
  { id: 'analysis', name: 'Technical Analysis', emoji: '⚙️', description: 'Scores supplier responses against RFP criteria; gap analysis', route: '/analysis', color: 'bg-purple-500/10', accent: 'text-purple-400', capabilities: ['score_all_suppliers', 'run_gap_analysis', 'generate_report'] },
  { id: 'pricing', name: 'Pricing Analysis', emoji: '💰', description: 'Ingests Excel workbooks, normalises UoM/currency, calculates TCO', route: '/pricing', color: 'bg-emerald-500/10', accent: 'text-emerald-400', capabilities: ['ingest_workbook', 'parse_and_normalize', 'calculate_tco', 'normalize_currency'] },
  { id: 'award', name: 'Award', emoji: '🏆', description: 'Runs award scenarios, generates justification memos, notifies suppliers', route: '/supplier-responses', color: 'bg-yellow-500/10', accent: 'text-yellow-400', capabilities: ['run_scenario', 'generate_narrative', 'notify_suppliers'] },
  { id: 'comms', name: 'Communications', emoji: '📡', description: 'Drafts and sends RFP invites, reminders, clarifications, award/regret letters', route: '/communications', color: 'bg-pink-500/10', accent: 'text-pink-400', capabilities: ['draft_email', 'send_email', 'log_communication'] },
  { id: 'deadline', name: 'Deadline Monitor', emoji: '⏰', description: 'Monitors project deadlines; sends reminders at 7, 3 and 1 day marks', route: '/scenarios', color: 'bg-amber-500/10', accent: 'text-amber-400', capabilities: ['check_deadlines', 'send_deadline_reminders'] },
  { id: 'response_intake', name: 'Response Intake', emoji: '📥', description: 'Parses and validates supplier bid responses; auto-requests missing sections', route: '/supplier-responses', color: 'bg-cyan-500/10', accent: 'text-cyan-400', capabilities: ['parse_and_map_response', 'check_completeness'] },
  { id: 'onboarding', name: 'Supplier Onboarding', emoji: '🤝', description: 'Manages onboarding: invitations, document validation, missing doc follow-ups', route: '/suppliers', color: 'bg-indigo-500/10', accent: 'text-indigo-400', capabilities: ['send_onboarding_invite', 'validate_onboarding_docs', 'request_missing_docs'] },
  { id: 'copilot', name: 'Copilot', emoji: '🤖', description: 'Conversational AI with access to all specialist agent tools', route: '/copilot', color: 'bg-violet-500/10', accent: 'text-violet-400', capabilities: ['generate_rfp', 'send_communication', 'run_award_scenario', 'get_analysis_summary'] },
  { id: 'orchestrator', name: 'Orchestrator', emoji: '🔀', description: 'Routes incoming requests to the correct specialist agent', route: '/', color: 'bg-slate-500/10', accent: 'text-slate-400' },
  { id: 'reviewer', name: 'Reviewer', emoji: '🔍', description: 'Reviews agent outputs for quality, tone and completeness before delivery', route: '/', color: 'bg-orange-500/10', accent: 'text-orange-400', capabilities: ['review_email_draft', 'review_rfp_section', 'review_award_narrative'] },
];

let _registry: Agent[] = [...AGENTS];

export function getRegistry(): Agent[] { return _registry; }

export function getAgent(id: string): Agent | undefined { return _registry.find((a) => a.id === id); }

export async function fetchAgents(apiBase: string, token?: string): Promise<Agent[]> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${apiBase}/agents`, { headers });
    if (!res.ok) return _registry;
    const data: Agent[] = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      _registry = data.map((backendAgent) => {
        const local = AGENTS.find((a) => a.id === backendAgent.id);
        return { ...local, ...backendAgent };
      });
    }
    return _registry;
  } catch {
    return _registry;
  }
}
