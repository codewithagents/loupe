import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { injectScript } from './html-inject.js';
import { renderShell } from './shell.js';
import { watchFile } from './watch.js';
import { clientSdkSource } from './client-sdk.js';
import {
  getOrCreateSession,
  getSession,
  takePrompts,
  restorePrompts,
  appendPrompts,
  appendReply,
  resolveThread,
  getHistory,
  toggleDone,
  emitFeedback,
  onFeedback,
  offFeedback,
} from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let packageVersion = '1.0.0';
try {
  const pkg = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'package.json'), 'utf8'));
  packageVersion = pkg.version || packageVersion;
} catch { /* ignore */ }

// Fingerprint all scripts/*.js files so cli can detect code changes without a version bump
let serverFingerprint = '';
try {
  const files = (await fs.readdir(__dirname)).filter(f => f.endsWith('.js')).sort();
  const h = crypto.createHash('sha256');
  for (const f of files) h.update(await fs.readFile(path.join(__dirname, f)));
  serverFingerprint = h.digest('hex').slice(0, 16);
} catch { /* ignore */ }

export function keyFromPath(absPath) {
  return crypto.createHash('sha256').update(absPath).digest('hex').slice(0, 16);
}

const sseConnections = new Map();
const fileWatchers = new Map();

function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function normalizePrompt(p) {
  const uid = p.uid ?? crypto.randomUUID();
  return {
    uid,
    threadId: p.threadId ?? uid,
    prompt: p.prompt ?? '',
    selector: p.selector ?? null,
    tag: p.tag ?? 'note',
    text: p.text ?? null,
    target: p.target ?? null,
    contentSnippet: p.contentSnippet ?? null,
  };
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
}

export function createServer(port) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const pathname = url.pathname;
    const method = req.method;

    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
      // GET /health
      if (method === 'GET' && pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ version: packageVersion, fingerprint: serverFingerprint, pid: process.pid }));
        return;
      }

      // POST /shutdown
      if (method === 'POST' && pathname === '/shutdown') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        server.close();
        return;
      }

      // POST /api/sessions
      if (method === 'POST' && pathname === '/api/sessions') {
        const body = await parseBody(req);
        const filePath = path.resolve(body.file || '');
        const key = keyFromPath(filePath);
        getOrCreateSession(key, filePath);

        if (!fileWatchers.has(key)) {
          const stop = watchFile(filePath, () => {
            for (const [conn, connKey] of sseConnections) {
              if (connKey === key) sendSSE(conn, 'reload', {});
            }
          });
          fileWatchers.set(key, stop);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ key, url: `http://127.0.0.1:${port}/session/${key}` }));
        return;
      }

      // GET /session/:key
      const sessionMatch = pathname.match(/^\/session\/([a-f0-9]{16})$/);
      if (method === 'GET' && sessionMatch) {
        const key = sessionMatch[1];
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(renderShell(key, port, packageVersion));
        return;
      }

      // GET /artifact/:key/
      const artifactMatch = pathname.match(/^\/artifact\/([a-f0-9]{16})\//);
      if (method === 'GET' && artifactMatch) {
        const key = artifactMatch[1];
        const session = getSession(key);
        if (!session) return notFound(res);

        const html = await fs.readFile(session.filePath, 'utf8');
        const injected = injectScript(html, `<script src="/sdk.js?key=${key}"></script>`);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(injected);
        return;
      }

      // GET /sdk.js?key=KEY
      if (method === 'GET' && pathname === '/sdk.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(clientSdkSource);
        return;
      }

      // GET /events/:key
      const eventsMatch = pathname.match(/^\/events\/([a-f0-9]{16})$/);
      if (method === 'GET' && eventsMatch) {
        const key = eventsMatch[1];
        let cleanedUp = false;

        const cleanup = () => {
          if (cleanedUp) return;
          cleanedUp = true;
          sseConnections.delete(res);
          clearInterval(pingInterval);
        };

        sseConnections.set(res, key);
        req.once('close', cleanup);

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        res.write('retry: 3000\n\n');

        const pingInterval = setInterval(() => {
          if (!res.writableEnded) res.write(': ping\n\n');
        }, 20000);
        pingInterval.unref();

        return;
      }

      // POST /api/:key/prompts
      const promptsMatch = pathname.match(/^\/api\/([a-f0-9]{16})\/prompts$/);
      if (method === 'POST' && promptsMatch) {
        const key = promptsMatch[1];
        const body = await parseBody(req);
        const session = getSession(key);
        if (!session) return notFound(res);

        const normalized = (body.prompts || []).map(normalizePrompt);
        await appendPrompts(key, normalized);
        emitFeedback(key);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // GET /api/:key/history
      const historyMatch = pathname.match(/^\/api\/([a-f0-9]{16})\/history$/);
      if (method === 'GET' && historyMatch) {
        const key = historyMatch[1];
        const data = getHistory(key);
        if (!data) return notFound(res);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        return;
      }

      // POST /api/:key/thread/:threadId/done
      const doneMatch = pathname.match(/^\/api\/([a-f0-9]{16})\/thread\/([^/]+)\/done$/);
      if (method === 'POST' && doneMatch) {
        const [, key, threadId] = doneMatch;
        const result = await toggleDone(key, decodeURIComponent(threadId));
        if (!result) return notFound(res);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      // GET /api/poll?file=ABS[&timeout=SEC]
      if (method === 'GET' && pathname === '/api/poll') {
        const filePath = url.searchParams.get('file');
        const timeoutSec = parseInt(url.searchParams.get('timeout') || '0', 10);
        if (!filePath) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'file param required' }));
          return;
        }
        const key = keyFromPath(path.resolve(filePath));
        const session = getSession(key);

        let closed = req.destroyed;
        req.on('close', () => { closed = true; });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.write(' ');

        const hb = setInterval(() => {
          if (!res.writableEnded) res.write(' ');
        }, 15000);
        hb.unref();

        let responding = false;

        const respond = async (prompts) => {
          if (responding) return;
          responding = true;
          clearInterval(hb);

          if (closed || res.writableEnded) {
            await restorePrompts(key, prompts);
            emitFeedback(key);
            return;
          }

          const sessionData = session ? { key: session.key, filePath: session.filePath } : { key, filePath };
          res.end(JSON.stringify({
            session: sessionData,
            prompts,
            next_step: 'Address the annotations, then run poll again (optionally with --reply-to <threadId> "text") to continue.',
          }));
        };

        const existing = await takePrompts(key);

        if (existing.length > 0) {
          await respond(existing);
          return;
        }

        let timeoutHandle = null;

        const feedbackListener = async () => {
          if (responding) return;
          const prompts = await takePrompts(key);

          if (closed || res.writableEnded) {
            if (prompts.length > 0) {
              await restorePrompts(key, prompts);
              emitFeedback(key);
            }
            return;
          }

          if (prompts.length > 0) {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            await respond(prompts);
          } else {
            onFeedback(key, feedbackListener);
          }
        };

        onFeedback(key, feedbackListener);

        if (timeoutSec > 0) {
          timeoutHandle = setTimeout(async () => {
            offFeedback(key, feedbackListener);
            if (!responding) {
              await respond([]);
            }
          }, timeoutSec * 1000);
        }

        req.on('close', async () => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          offFeedback(key, feedbackListener);
          if (!responding) {
            const prompts = await takePrompts(key);
            if (prompts.length > 0) {
              await restorePrompts(key, prompts);
              emitFeedback(key);
            }
          }
        });

        return;
      }

      // POST /api/:key/agent-reply
      const replyMatch = pathname.match(/^\/api\/([a-f0-9]{16})\/agent-reply$/);
      if (method === 'POST' && replyMatch) {
        const key = replyMatch[1];
        const body = await parseBody(req);
        const replyUid = crypto.randomUUID();
        const targetUid = body.targetUid || null;
        const threadId = targetUid ? resolveThread(key, targetUid) : null;
        const payload = { uid: replyUid, text: body.text || '', targetUid, threadId };
        await appendReply(key, { uid: replyUid, threadId, text: body.text || '' });
        for (const [conn, connKey] of sseConnections) {
          if (connKey === key) sendSSE(conn, 'agent-reply', payload);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      notFound(res);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    }
  });

  return server;
}

export function startServer(port) {
  const server = createServer(port);
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`loupe server listening on http://127.0.0.1:${port}\n`);
  });
  return server;
}
