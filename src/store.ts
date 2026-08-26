import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { Mutex } from './mutex.js';
import type {
  SessionRecord,
  NormalizedPrompt,
  HistoryItem,
  UserHistoryItem,
  AgentHistoryItem,
  HistoryResponse,
  DoneToggleResponse,
} from './types.js';

const sessions = new Map<string, SessionRecord>();
const emitter = new EventEmitter();
emitter.setMaxListeners(100);
const mutex = new Mutex();

export function getOrCreateSession(key: string, filePath: string, doneThreadIds: string[] = []): SessionRecord {
  if (!sessions.has(key)) {
    sessions.set(key, { key, filePath, prompts: [], history: [], doneThreads: new Set(doneThreadIds) });
  }
  return sessions.get(key)!;
}

export function getSession(key: string): SessionRecord | null {
  return sessions.get(key) ?? null;
}

export async function takePrompts(key: string): Promise<NormalizedPrompt[]> {
  return mutex.run(() => {
    const session = sessions.get(key);
    if (!session) return [];
    return session.prompts.splice(0);
  });
}

export async function restorePrompts(key: string, prompts: NormalizedPrompt[]): Promise<void> {
  return mutex.run(() => {
    const session = sessions.get(key);
    if (!session) return;
    session.prompts.unshift(...prompts);
  });
}

export async function appendPrompts(key: string, prompts: NormalizedPrompt[]): Promise<void> {
  return mutex.run(() => {
    const session = sessions.get(key);
    if (!session) return;
    session.prompts.push(...prompts);
    for (const p of prompts) {
      const item: UserHistoryItem = {
        role: 'user',
        uid: p.uid,
        threadId: p.threadId,
        prompt: p.prompt,
        selector: p.selector,
        tag: p.tag,
        text: p.text,
        target: p.target,
        contentSnippet: p.contentSnippet,
      };
      session.history.push(item);
    }
  });
}

export async function appendReply(key: string, reply: { uid?: string; threadId: string | null; text: string }): Promise<void> {
  return mutex.run(() => {
    const session = sessions.get(key);
    if (!session) return;
    const item: AgentHistoryItem = {
      role: 'agent',
      uid: reply.uid ?? crypto.randomUUID(),
      threadId: reply.threadId ?? '__broadcast__',
      text: reply.text,
    };
    session.history.push(item);
  });
}

export function resolveThread(key: string, ref: string): string | null {
  const session = sessions.get(key);
  if (!session) return null;
  if (session.history.some(h => h.threadId === ref)) return ref;
  const entry = session.history.find((h): h is UserHistoryItem => h.role === 'user' && h.uid === ref);
  return entry ? (entry.threadId || entry.uid) : null;
}

export function getHistory(key: string): HistoryResponse | null {
  const session = sessions.get(key);
  if (!session) return null;
  return { history: [...session.history], doneThreadIds: [...session.doneThreads] };
}

export async function toggleDone(key: string, threadId: string): Promise<DoneToggleResponse | null> {
  return mutex.run(() => {
    const session = sessions.get(key);
    if (!session) return null;
    if (session.doneThreads.has(threadId)) {
      session.doneThreads.delete(threadId);
      return { done: false };
    } else {
      session.doneThreads.add(threadId);
      return { done: true };
    }
  });
}

export function emitFeedback(key: string): void {
  emitter.emit(`feedback:${key}`);
}

export function onFeedback(key: string, listener: () => void): void {
  emitter.once(`feedback:${key}`, listener);
}

export function offFeedback(key: string, listener: () => void): void {
  emitter.off(`feedback:${key}`, listener);
}

export function getMutex(): Mutex {
  return mutex;
}

export type { HistoryItem, NormalizedPrompt, SessionRecord };
