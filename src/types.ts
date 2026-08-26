// ---- Store / session model ----

export interface SessionRecord {
  key: string;
  filePath: string;
  prompts: NormalizedPrompt[];
  history: HistoryItem[];
  doneThreads: Set<string>;
}

// ---- Wire protocol: prompts (browser → server → agent) ----

export interface RawPrompt {
  uid?: string;
  threadId?: string;
  prompt?: string;
  selector?: string | null;
  tag?: string;
  text?: string | null;
  target?: string | null;
  contentSnippet?: string | null;
  [key: string]: unknown;
}

export interface NormalizedPrompt {
  uid: string;
  threadId: string;
  prompt: string;
  selector: string | null;
  tag: string;
  text: string | null;
  target: string | null;
  contentSnippet: string | null;
}

// ---- History ----

export interface UserHistoryItem {
  role: 'user';
  uid: string;
  threadId: string;
  prompt: string;
  selector: string | null;
  tag: string;
  text: string | null;
  target: string | null;
  contentSnippet: string | null;
}

export interface AgentHistoryItem {
  role: 'agent';
  uid: string;
  threadId: string;
  text: string;
}

export type HistoryItem = UserHistoryItem | AgentHistoryItem;

// ---- HTTP response shapes ----

export interface HealthResponse {
  version: string;
  fingerprint: string;
  pid: number;
}

export interface SessionCreateResponse {
  key: string;
  url: string;
}

export interface PollResponse {
  session: { key: string; filePath: string };
  prompts: NormalizedPrompt[];
  next_step: string;
}

export interface HistoryResponse {
  history: HistoryItem[];
  doneThreadIds: string[];
}

export interface DoneToggleResponse {
  done: boolean;
}

export interface AgentReplyBody {
  uid: string;
  text: string;
  targetUid: string | null;
  threadId: string | null;
}

// ---- SSE event payloads ----

export interface SSEReloadPayload {
  [key: string]: never;
}

export interface SSEAgentReplyPayload {
  uid: string;
  text: string;
  targetUid: string | null;
  threadId: string | null;
}

export interface SSEAgentPresencePayload {
  state: 'waiting' | 'working';
}

// ---- postMessage types (iframe SDK ↔ shell) ----

export interface PmElement {
  type: 'loupe:element';
  selector: string;
  rect: { top: number; left: number; width: number; height: number };
}

export interface PmNote {
  type: 'loupe:note';
  selector: string | null;
  text: string;
  contentSnippet: string | null;
}

export interface PmSendAll {
  type: 'loupe:send-all';
}

export interface PmMarkerClick {
  type: 'loupe:marker-click';
  threadId: string;
}

export interface PmSelection {
  type: 'loupe:selection';
  text: string;
  rect: { top: number; left: number; width: number; height: number };
}

export interface PmAddMarker {
  type: 'loupe:add-marker';
  threadId: string;
  selector: string;
  count: number;
  state: 'done' | 'agent-last' | 'user-last' | 'drafts-only';
}

export interface PmClearMarkers {
  type: 'loupe:clear-markers';
}

export interface PmRemoveMarker {
  type: 'loupe:remove-marker';
  threadId: string;
}

export interface PmCheckAnchors {
  type: 'loupe:check-anchors';
  threads: Array<{ threadId: string; selector: string | null; contentSnippet: string | null }>;
}

export interface PmAnchorResult {
  threadId: string;
  selector: string | null;
  orphaned: boolean;
  reanchored?: boolean;
}

export interface PmAnchorReport {
  type: 'loupe:anchor-report';
  results: PmAnchorResult[];
}

export type ShellToSdkMessage = PmAddMarker | PmClearMarkers | PmRemoveMarker | PmCheckAnchors;
export type SdkToShellMessage = PmElement | PmNote | PmSendAll | PmMarkerClick | PmAnchorReport | PmSelection;

// ---- State file (persistence across server restarts) ----

export interface PersistedSessionState {
  doneThreadIds: string[];
}
