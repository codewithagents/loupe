#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.LOUPE_PORT || '7429', 10);
const BASE = `http://127.0.0.1:${PORT}`;
const SERVER_PATH = path.join(__dirname, 'server-process.js');

function keyFromPath(absPath) {
  return crypto.createHash('sha256').update(absPath).digest('hex').slice(0, 16);
}

async function getPackageVersion() {
  try {
    const pkg = JSON.parse(await readFile(path.join(__dirname, '..', 'package.json'), 'utf8'));
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

async function healthCheck() {
  try {
    const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function waitForServer(maxMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const h = await healthCheck();
    if (h) return h;
    await new Promise(r => setTimeout(r, 150));
  }
  return null;
}

async function waitForServerGone(maxMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const h = await healthCheck();
    if (!h) return true;
    await new Promise(r => setTimeout(r, 150));
  }
  return false;
}

function spawnServer() {
  const child = spawn(process.execPath, [SERVER_PATH], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, LOUPE_PORT: String(PORT) },
  });
  child.unref();
}

async function ensureServer() {
  const ourVersion = await getPackageVersion();
  const health = await healthCheck();

  if (health) {
    if (health.version && health.version !== ourVersion) {
      try {
        await fetch(`${BASE}/shutdown`, { method: 'POST', signal: AbortSignal.timeout(1500) });
      } catch { /* ignore */ }
      await waitForServerGone();
      spawnServer();
      const fresh = await waitForServer();
      if (!fresh) throw new Error('Failed to restart stale server');
    }
    return;
  }

  spawnServer();
  const ready = await waitForServer();
  if (!ready) throw new Error('Server did not start in time');
}

async function cmdOpen(args) {
  const filePath = args[0];
  if (!filePath) {
    console.error('Usage: node cli.js open <file>');
    process.exit(1);
  }
  const absPath = path.resolve(filePath);
  await ensureServer();

  const r = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: absPath }),
  });
  const data = await r.json();

  const openCmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd'
    : 'xdg-open';
  const openArgs = process.platform === 'win32'
    ? ['/c', 'start', data.url]
    : [data.url];

  spawn(openCmd, openArgs, { detached: true, stdio: 'ignore' }).unref();
  console.log(JSON.stringify({ key: data.key, url: data.url }));
}

async function cmdPoll(args) {
  const replyIdx = args.indexOf('--reply');
  const timeoutIdx = args.indexOf('--timeout');

  const replyText = replyIdx !== -1 ? args[replyIdx + 1] : null;
  const timeoutSec = timeoutIdx !== -1 ? parseInt(args[timeoutIdx + 1] || '0', 10) : 0;

  const fileArgs = args.filter((a, i) => {
    if (a === '--reply' || a === '--timeout') return false;
    if (i > 0 && (args[i - 1] === '--reply' || args[i - 1] === '--timeout')) return false;
    return true;
  });
  const filePath = fileArgs[0];

  if (!filePath) {
    console.error('Usage: node cli.js poll <file> [--reply "text"] [--timeout <sec>]');
    process.exit(1);
  }
  const absPath = path.resolve(filePath);
  await ensureServer();

  if (replyText) {
    const key = keyFromPath(absPath);
    await fetch(`${BASE}/api/${key}/agent-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: replyText }),
    });
  }

  const params = new URLSearchParams({ file: absPath });
  if (timeoutSec > 0) params.set('timeout', String(timeoutSec));

  const r = await fetch(`${BASE}/api/poll?${params}`);
  const text = await r.text();
  const trimmed = text.trim();
  if (trimmed) {
    console.log(trimmed);
  }
}

const [, , command, ...rest] = process.argv;

if (command === 'open') {
  await cmdOpen(rest);
} else if (command === 'poll') {
  await cmdPoll(rest);
} else {
  console.error('Usage: node cli.js <open|poll> [args...]');
  process.exit(1);
}
