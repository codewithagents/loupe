import { EventEmitter } from 'node:events';
import { Mutex } from './mutex.js';
import crypto from 'node:crypto';

const sessions = new Map();
const emitter = new EventEmitter();
emitter.setMaxListeners(100);
const mutex = new Mutex();

export function getOrCreateSession(key, filePath) {
  if (!sessions.has(key)) {
    sessions.set(key, { key, filePath, prompts: [], history: [] });
  }
  return sessions.get(key);
}

export function getSession(key) {
  return sessions.get(key) || null;
}

export async function takePrompts(key) {
  return mutex.run(() => {
    const session = sessions.get(key);
    if (!session) return [];
    return session.prompts.splice(0);
  });
}

export async function restorePrompts(key, prompts) {
  return mutex.run(() => {
    const session = sessions.get(key);
    if (!session) return;
    session.prompts.unshift(...prompts);
  });
}

export async function appendPrompts(key, prompts) {
  return mutex.run(() => {
    const session = sessions.get(key);
    if (!session) return;
    session.prompts.push(...prompts);
    for (const p of prompts) {
      session.history.push({
        role: 'user',
        uid: p.uid,
        threadId: p.threadId || p.uid,
        prompt: p.prompt,
        selector: p.selector,
        tag: p.tag,
        text: p.text,
        target: p.target,
      });
    }
  });
}

export async function appendReply(key, reply) {
  return mutex.run(() => {
    const session = sessions.get(key);
    if (!session) return;
    session.history.push({
      role: 'agent',
      uid: reply.uid ?? crypto.randomUUID(),
      // null threadId (broadcast) uses a stable sentinel so history restore works
      threadId: reply.threadId ?? '__broadcast__',
      text: reply.text,
    });
  });
}

// Accept ref as either a threadId (preferred) or a prompt uid
export function resolveThread(key, ref) {
  const session = sessions.get(key);
  if (!session) return null;
  if (session.history.some(h => h.threadId === ref)) return ref;
  const entry = session.history.find(h => h.role === 'user' && h.uid === ref);
  return entry ? (entry.threadId || entry.uid) : null;
}

export function getHistory(key) {
  const session = sessions.get(key);
  return session ? [...session.history] : [];
}

export function emitFeedback(key) {
  emitter.emit(`feedback:${key}`);
}

export function onFeedback(key, listener) {
  emitter.once(`feedback:${key}`, listener);
}

export function offFeedback(key, listener) {
  emitter.off(`feedback:${key}`, listener);
}

export function getMutex() {
  return mutex;
}
