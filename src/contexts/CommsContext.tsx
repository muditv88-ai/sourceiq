/**
 * CommsContext — FM-5 cross-tab shared state
 *
 * Provides:
 *  - emails / setEmails       — shared email queue (Composer + Notifications)
 *  - threads / setThreads     — Q&A threads (QA tab + unread count)
 *  - notifications / setNotifications — notification log
 *  - unreadCount              — total unread (bell badge in AppLayout)
 *  - preloadTemplate(tpl)     — called from Templates tab, navigates to /communications?tab=composer with template prefilled
 *  - composerPrefill          — consumed & cleared by ComposerTab on mount
 */
import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type EmailType = "clarification" | "award" | "regret" | "onboarding" | "deadline_reminder" | "rfp_invite";

export interface CommEmail {
  id: string;
  supplier: string;
  supplierEmail?: string;
  subject: string;
  body: string;
  status: "draft" | "sent" | "failed";
  type: EmailType;
  confidence?: number;
  sentAt?: string;
  rfpId?: string;
}

export interface QAMessage {
  id: string;
  supplier: string;
  direction: "inbound" | "outbound";
  subject: string;
  body: string;
  timestamp: string;
  read: boolean;
  rfpId: string;
  threadId: string;
}

export interface QAThread {
  threadId: string;
  supplier: string;
  rfpId: string;
  subject: string;
  lastMessage: string;
  lastTimestamp: string;
  unread: number;
  messages: QAMessage[];
  status: "open" | "resolved";
}

export interface NotificationLog {
  id: string;
  type: "sent" | "received" | "reminder" | "system";
  message: string;
  supplier?: string;
  timestamp: string;
  read: boolean;
}

export interface EmailTemplate {
  id: string;
  name: string;
  type: EmailType;
  subject: string;
  body: string;
  usageCount: number;
}

export interface ComposerPrefill {
  type: EmailType;
  subject?: string;
  body?: string;
  templateName?: string;
}

// ---------------------------------------------------------------------------
// Seed data (single source of truth — imported by CommunicationsPage)
// ---------------------------------------------------------------------------
export const SEED_EMAILS: CommEmail[] = [
  {
    id: "e1",
    supplier: "NovaBridge Inc",
    subject: "Clarification Request: IoT Integration Capabilities",
    type: "clarification",
    confidence: 87,
    rfpId: "rfp-001",
    body: `Dear NovaBridge Team,\n\nThank you for your response to our RFP for IT Infrastructure Services.\n\nAfter reviewing your proposal, we would appreciate clarification on the following points:\n\n1. IoT Integration: Your proposal mentions IoT support but lacks specific implementation details.\n\n2. Scalability: Please elaborate on your infrastructure's ability to handle 10x traffic spikes.\n\nWe kindly request your response by April 10, 2025.\n\nBest regards,\nProcurement Team`,
    status: "draft",
  },
  {
    id: "e2",
    supplier: "Vertex Solutions",
    subject: "Contract Award – IT Infrastructure RFP",
    type: "award",
    confidence: 95,
    rfpId: "rfp-001",
    body: `Dear Vertex Solutions Team,\n\nWe are pleased to inform you that Vertex Solutions has been selected as the successful bidder.\n\nYour proposal demonstrated exceptional technical capability, competitive pricing, and alignment with our strategic objectives.\n\nBest regards,\nProcurement Team`,
    status: "sent",
    sentAt: "2025-04-01 14:32",
  },
];

export const SEED_THREADS: QAThread[] = [
  {
    threadId: "t1",
    supplier: "NovaBridge Inc",
    rfpId: "rfp-001",
    subject: "Clarification: Delivery Timeline for Phase 2",
    lastMessage: "We confirm delivery by Q3 as stated in our proposal.",
    lastTimestamp: "2025-04-01 11:05",
    unread: 1,
    status: "open",
    messages: [
      { id: "m1", supplier: "NovaBridge Inc", direction: "outbound", subject: "Clarification: Phase 2 Timeline", body: "Could you confirm the delivery date for Phase 2 — our procurement team needs this to finalise the project plan.", timestamp: "2025-03-30 09:00", read: true, rfpId: "rfp-001", threadId: "t1" },
      { id: "m2", supplier: "NovaBridge Inc", direction: "inbound",  subject: "Re: Clarification: Phase 2 Timeline", body: "We confirm delivery by Q3 2025 as stated in our proposal. Happy to provide a detailed milestone plan if needed.", timestamp: "2025-04-01 11:05", read: false, rfpId: "rfp-001", threadId: "t1" },
    ],
  },
  {
    threadId: "t2",
    supplier: "Apex Dynamics",
    rfpId: "rfp-002",
    subject: "Warranty Terms Clarification",
    lastMessage: "All products carry a 3-year on-site warranty.",
    lastTimestamp: "2025-03-28 16:20",
    unread: 0,
    status: "resolved",
    messages: [
      { id: "m3", supplier: "Apex Dynamics", direction: "outbound", subject: "Warranty Terms Clarification", body: "Please confirm the warranty period and whether on-site support is included.", timestamp: "2025-03-27 10:00", read: true, rfpId: "rfp-002", threadId: "t2" },
      { id: "m4", supplier: "Apex Dynamics", direction: "inbound",  subject: "Re: Warranty Terms", body: "All products carry a 3-year on-site warranty. Engineers are available within 4 hours.", timestamp: "2025-03-28 16:20", read: true, rfpId: "rfp-002", threadId: "t2" },
    ],
  },
];

export const SEED_NOTIFICATIONS: NotificationLog[] = [
  { id: "n1", type: "sent",     message: "Award email sent to Vertex Solutions",              supplier: "Vertex Solutions", timestamp: "2025-04-01 14:32", read: true  },
  { id: "n2", type: "received", message: "Q&A reply from NovaBridge Inc",                     supplier: "NovaBridge Inc",   timestamp: "2025-04-01 11:05", read: false },
  { id: "n3", type: "reminder", message: "Deadline reminder due for 3 suppliers",                                           timestamp: "2025-04-01 09:00", read: false },
  { id: "n4", type: "system",   message: "2 RFP invites queued for dispatch",                                               timestamp: "2025-03-31 18:00", read: true  },
  { id: "n5", type: "received", message: "Warranty clarification received from Apex Dynamics", supplier: "Apex Dynamics",   timestamp: "2025-03-28 16:20", read: true  },
];

export const SEED_TEMPLATES: EmailTemplate[] = [
  { id: "tpl1", name: "Standard Clarification",  type: "clarification",     usageCount: 12, subject: "Clarification Request – {{RFP_TITLE}}",          body: "Dear {{SUPPLIER_NAME}},\n\nRegarding your proposal for {{RFP_TITLE}}, we require clarification on the following:\n\n{{POINTS}}\n\nPlease respond by {{DEADLINE}}.\n\nBest regards,\n{{BUYER_NAME}}" },
  { id: "tpl2", name: "RFP Invitation",          type: "rfp_invite",        usageCount: 8,  subject: "Invitation to Bid – {{RFP_TITLE}}",              body: "Dear {{SUPPLIER_NAME}},\n\nYou are invited to submit a proposal for {{RFP_TITLE}}.\n\nScope summary:\n{{SCOPE}}\n\nDeadline: {{DEADLINE}}\n\nPlease confirm receipt of this invitation.\n\nBest regards,\n{{BUYER_NAME}}" },
  { id: "tpl3", name: "Deadline Reminder",       type: "deadline_reminder", usageCount: 6,  subject: "Reminder: Proposal Due in {{DAYS_LEFT}} Days",    body: "Dear {{SUPPLIER_NAME}},\n\nThis is a reminder that your proposal for {{RFP_TITLE}} is due on {{DEADLINE}}.\n\nIf you require any extensions, please contact us immediately.\n\nBest regards,\n{{BUYER_NAME}}" },
  { id: "tpl4", name: "Award Notification",      type: "award",             usageCount: 4,  subject: "Contract Award – {{RFP_TITLE}}",                 body: "Dear {{SUPPLIER_NAME}},\n\nWe are pleased to inform you that your proposal for {{RFP_TITLE}} has been selected.\n\nNext steps:\n1. Contract signing scheduled for {{CONTRACT_DATE}}\n2. Project kick-off: {{KICKOFF_DATE}}\n\nBest regards,\n{{BUYER_NAME}}" },
  { id: "tpl5", name: "Regret Notification",     type: "regret",            usageCount: 4,  subject: "Outcome of Tender – {{RFP_TITLE}}",              body: "Dear {{SUPPLIER_NAME}},\n\nThank you for participating in the tender for {{RFP_TITLE}}.\n\nAfter careful evaluation, we have decided to award the contract to another supplier. We appreciate your effort and encourage you to participate in future opportunities.\n\nBest regards,\n{{BUYER_NAME}}" },
  { id: "tpl6", name: "Supplier Onboarding",     type: "onboarding",        usageCount: 3,  subject: "Welcome – Supplier Onboarding for {{RFP_TITLE}}", body: "Dear {{SUPPLIER_NAME}},\n\nCongratulations on being awarded the contract for {{RFP_TITLE}}.\n\nTo proceed with onboarding, please complete the following:\n1. Sign the attached NDA\n2. Register on our supplier portal: {{PORTAL_LINK}}\n3. Submit compliance documents by {{DEADLINE}}\n\nBest regards,\n{{BUYER_NAME}}" },
];

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
interface CommsContextValue {
  emails: CommEmail[];
  setEmails: React.Dispatch<React.SetStateAction<CommEmail[]>>;
  threads: QAThread[];
  setThreads: React.Dispatch<React.SetStateAction<QAThread[]>>;
  notifications: NotificationLog[];
  setNotifications: React.Dispatch<React.SetStateAction<NotificationLog[]>>;
  templates: EmailTemplate[];
  /** Total unread notifications + Q&A messages — drives header bell badge */
  unreadCount: number;
  /** Load a template into the composer and switch to the composer tab */
  composerPrefill: ComposerPrefill | null;
  applyTemplate: (tpl: EmailTemplate) => void;
  clearPrefill: () => void;
  /** Push a new notification entry (called on email send / reply receive) */
  pushNotification: (n: Omit<NotificationLog, "id" | "timestamp" | "read">) => void;
  /** Mark all notifications read */
  markAllRead: () => void;
}

const CommsContext = createContext<CommsContextValue | null>(null);

export function CommsProvider({ children }: { children: ReactNode }) {
  const [emails, setEmails]               = useState<CommEmail[]>(SEED_EMAILS);
  const [threads, setThreads]             = useState<QAThread[]>(SEED_THREADS);
  const [notifications, setNotifications] = useState<NotificationLog[]>(SEED_NOTIFICATIONS);
  const [composerPrefill, setComposerPrefill] = useState<ComposerPrefill | null>(null);

  const unreadCount =
    notifications.filter(n => !n.read).length +
    threads.reduce((acc, t) => acc + t.unread, 0);

  const applyTemplate = useCallback((tpl: EmailTemplate) => {
    setComposerPrefill({ type: tpl.type, subject: tpl.subject, body: tpl.body, templateName: tpl.name });
    // Increment usage count
    // (templates are read-only seed data so we don't track this in state here)
  }, []);

  const clearPrefill = useCallback(() => setComposerPrefill(null), []);

  const pushNotification = useCallback(
    (n: Omit<NotificationLog, "id" | "timestamp" | "read">) => {
      setNotifications(prev => [
        { ...n, id: `notif-${Date.now()}`, timestamp: new Date().toLocaleString(), read: false },
        ...prev,
      ]);
    },
    []
  );

  const markAllRead = useCallback(
    () => setNotifications(prev => prev.map(n => ({ ...n, read: true }))),
    []
  );

  return (
    <CommsContext.Provider value={{
      emails, setEmails,
      threads, setThreads,
      notifications, setNotifications,
      templates: SEED_TEMPLATES,
      unreadCount,
      composerPrefill,
      applyTemplate,
      clearPrefill,
      pushNotification,
      markAllRead,
    }}>
      {children}
    </CommsContext.Provider>
  );
}

export function useComms() {
  const ctx = useContext(CommsContext);
  if (!ctx) throw new Error("useComms must be used inside <CommsProvider>");
  return ctx;
}
