import { EventEmitter } from 'node:events';
import { Mutex } from './mutex.js';

const sessions = new Map();
const emitter = new EventEmitter();
emitter.setMaxListeners(100);

const mutex = new Mutex();

export function getOrCreateSession(key, filePath) {
  if (!sessions.has(key)) {
    sessions.set(key, { key, filePath, prompts: [] });
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
    const taken = session.prompts.splice(0);
    return taken;
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
  });
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
