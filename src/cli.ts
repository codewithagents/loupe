#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.LOUPE_PORT ?? '7429', 10);
const BASE = `http://127.0.0.1:${PORT}`;
const SERVER_PATH = path.join(__dirname, 'server-process.js');

function keyFromPath(absPath: string): string {
  return crypto.createHash('sha256').update(absPath).digest('hex').slice(0, 16);
}

async function getPackageVersion(): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(path.join(__dirname, '..', 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '1.0.0';
  } catch {
    return '1.0.0';
  }
}

async function computeFingerprint(): Promise<string> {
  try {
    const files = (await readdir(__dirname)).filter(f => f.endsWith('.js')).sort();
    const h = crypto.createHash('sha256');
    for (const f of files) h.update(await readFile(path.join(__dirname, f)));
    const browserDir = path.join(__dirname, 'browser');
    try {
      const browserFiles = (await readdir(browserDir)).filter(f => f.endsWith('.js')).sort();
      for (const f of browserFiles) h.update(await readFile(path.join(browserDir, f)));
    } catch { /* browser dir may not exist */ }
    return h.digest('hex').slice(0, 16);
  } catch {
    return '';
  }
}

async function healthCheck(): Promise<{ version: string; fingerprint: string } | null> {
  try {
    const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return null;
    return await r.json() as { version: string; fingerprint: string };
  } catch {
    return null;
  }
}

async function waitForServer(maxMs = 3000): Promise<{ version: string; fingerprint: string } | null> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const h = await healthCheck();
    if (h) return h;
    await new Promise<void>(r => setTimeout(r, 150));
  }
  return null;
}

async function waitForServerGone(maxMs = 2000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const h = await healthCheck();
    if (!h) return true;
    await new Promise<void>(r => setTimeout(r, 150));
  }
  return false;
}

function spawnServer(): void {
  const child = spawn(process.execPath, [SERVER_PATH], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, LOUPE_PORT: String(PORT) },
  });
  child.unref();
}

async function ensureServer(): Promise<void> {
  const [ourVersion, ourFingerprint] = await Promise.all([getPackageVersion(), computeFingerprint()]);
  const health = await healthCheck();

  if (health) {
    const versionStale = health.version && health.version !== ourVersion;
    const codeStale = !health.fingerprint || health.fingerprint !== ourFingerprint;
    if (versionStale || codeStale) {
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

async function cmdOpen(args: string[]): Promise<void> {
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
  const data = await r.json() as { key: string; url: string };

  const openCmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd'
    : 'xdg-open';
  const openArgs = process.platform === 'win32'
    ? ['/c', 'start', data.url]
    : [data.url];

  spawn(openCmd, openArgs, { detached: true, stdio: 'ignore' }).unref();
  console.log(JSON.stringify({ key: data.key, url: data.url }));
}

async function cmdPoll(args: string[]): Promise<void> {
  const replyTos: Array<{ uid: string; text: string }> = [];
  let replyText: string | null = null;
  let timeoutSec = 0;
  const fileArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--reply-to' && i + 2 < args.length) {
      replyTos.push({ uid: args[i + 1], text: args[i + 2] });
      i += 2;
    } else if (args[i] === '--reply' && i + 1 < args.length) {
      replyText = args[i + 1];
      i += 1;
    } else if (args[i] === '--timeout' && i + 1 < args.length) {
      timeoutSec = parseInt(args[i + 1] ?? '0', 10);
      i += 1;
    } else {
      fileArgs.push(args[i]);
    }
  }

  const filePath = fileArgs[0];
  if (!filePath) {
    console.error('Usage: node cli.js poll <file> [--reply-to <uid> "text"] [--reply "text"] [--timeout <sec>]');
    process.exit(1);
  }
  const absPath = path.resolve(filePath);
  await ensureServer();
  const key = keyFromPath(absPath);

  for (const { uid, text } of replyTos) {
    await fetch(`${BASE}/api/${key}/agent-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, targetUid: uid }),
    });
  }

  if (replyText) {
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

async function cmdAck(args: string[]): Promise<void> {
  const filePath = args[0];
  const threadId = args[1];
  const text = args[2];
  if (!filePath || !threadId || !text) {
    console.error('Usage: node cli.js ack <file> <threadId> "text"');
    process.exit(1);
  }
  const absPath = path.resolve(filePath);
  await ensureServer();
  const key = keyFromPath(absPath);
  await fetch(`${BASE}/api/${key}/agent-interim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ threadId, text }),
  });
  console.log(JSON.stringify({ ok: true }));
}

const [, , command, ...rest] = process.argv;

if (command === 'open') {
  await cmdOpen(rest);
} else if (command === 'poll') {
  await cmdPoll(rest);
} else if (command === 'ack') {
  await cmdAck(rest);
} else {
  console.error('Usage: node cli.js <open|poll|ack> [args...]');
  process.exit(1);
}
process.exit(0);
