import http from 'node:http';
import fs from 'node:fs/promises';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { injectScript } from './html-inject.js';
import { renderShell } from './shell.js';
import { watchFile } from './watch.js';
import { getOrCreateSession, getSession, takePrompts, restorePrompts, appendPrompts, appendReply, resolveThread, getHistory, toggleDone, resetSession, emitFeedback, onFeedback, offFeedback, } from './store.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let packageVersion = '1.0.0';
try {
    const pkg = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'package.json'), 'utf8'));
    packageVersion = pkg.version ?? packageVersion;
}
catch { /* ignore */ }
const browserDir = path.join(__dirname, 'browser');
let clientSdkSource = '';
let shellScriptSource = '';
try {
    clientSdkSource = await fs.readFile(path.join(browserDir, 'client-sdk.js'), 'utf8');
    shellScriptSource = await fs.readFile(path.join(browserDir, 'shell-script.js'), 'utf8');
}
catch { /* ignore - browser build may not exist */ }
let serverFingerprint = '';
try {
    const files = (await fs.readdir(__dirname)).filter(f => f.endsWith('.js')).sort();
    const h = crypto.createHash('sha256');
    for (const f of files)
        h.update(await fs.readFile(path.join(__dirname, f)));
    try {
        const browserFiles = (await fs.readdir(browserDir)).filter(f => f.endsWith('.js')).sort();
        for (const f of browserFiles)
            h.update(await fs.readFile(path.join(browserDir, f)));
    }
    catch { /* browser dir may not exist */ }
    serverFingerprint = h.digest('hex').slice(0, 16);
}
catch { /* ignore */ }
export function keyFromPath(absPath) {
    return crypto.createHash('sha256').update(absPath).digest('hex').slice(0, 16);
}
function stateFilePath(key) {
    return path.join(os.tmpdir(), 'loupe-state-' + key + '.json');
}
function loadSessionState(key) {
    try {
        const p = stateFilePath(key);
        if (existsSync(p)) {
            const data = JSON.parse(readFileSync(p, 'utf8'));
            return Array.isArray(data.doneThreadIds) ? data.doneThreadIds : [];
        }
    }
    catch { /* ignore */ }
    return [];
}
function saveSessionState(key) {
    try {
        const data = getHistory(key);
        if (data)
            writeFileSync(stateFilePath(key), JSON.stringify({ doneThreadIds: data.doneThreadIds }));
    }
    catch { /* ignore */ }
}
const sseConnections = new Map();
const fileWatchers = new Map();
const activePollCounts = new Map();
const lastPresencePayload = new Map();
// Light states: green = poll open (listening now), amber = working with
// recent activity, grey = no poll and gone quiet (agent stopped/crashed).
// amber reverts to grey if the agent sends no activity for WORKING_LIVENESS_MS.
const WORKING_LIVENESS_MS = 120_000;
const workingLivenessTimers = new Map();
function clearLivenessTimer(key) {
    const t = workingLivenessTimers.get(key);
    if (t !== undefined) {
        clearTimeout(t);
        workingLivenessTimers.delete(key);
    }
}
function startLivenessTimer(key) {
    clearLivenessTimer(key);
    const t = setTimeout(() => {
        workingLivenessTimers.delete(key);
        if (lastPresencePayload.get(key)?.state === 'working')
            broadcastPresence(key, 'idle');
    }, WORKING_LIVENESS_MS);
    t.unref();
    workingLivenessTimers.set(key, t);
}
// Call on proof of agent activity (reply sent, artifact edited) while
// in working state. Resets the liveness grace period.
function touchLiveness(key) {
    if (lastPresencePayload.get(key)?.state === 'working')
        startLivenessTimer(key);
}
function sendSSE(res, event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function broadcastPresence(key, state) {
    const payload = state === 'working'
        ? { state, workingSince: Date.now() }
        : { state };
    lastPresencePayload.set(key, payload);
    if (state === 'working')
        startLivenessTimer(key);
    else
        clearLivenessTimer(key);
    for (const [conn, connKey] of sseConnections) {
        if (connKey === key)
            sendSSE(conn, 'agent-presence', payload);
    }
}
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (d) => { body += d; });
        req.on('end', () => {
            try {
                resolve(JSON.parse(body || '{}'));
            }
            catch (e) {
                reject(e);
            }
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
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
        const pathname = url.pathname;
        const method = req.method ?? 'GET';
        res.setHeader('Access-Control-Allow-Origin', '*');
        try {
            // GET /health
            if (method === 'GET' && pathname === '/health') {
                const payload = { version: packageVersion, fingerprint: serverFingerprint, pid: process.pid };
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(payload));
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
                const filePath = path.resolve(body.file ?? '');
                const key = keyFromPath(filePath);
                getOrCreateSession(key, filePath, loadSessionState(key));
                if (!fileWatchers.has(key)) {
                    const stop = watchFile(filePath, () => {
                        for (const [conn, connKey] of sseConnections) {
                            if (connKey === key)
                                sendSSE(conn, 'reload', {});
                        }
                        touchLiveness(key);
                    });
                    fileWatchers.set(key, stop);
                }
                const sessionResp = { key, url: `http://127.0.0.1:${port}/session/${key}` };
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(sessionResp));
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
                if (!session)
                    return notFound(res);
                const html = await fs.readFile(session.filePath, 'utf8');
                const injected = injectScript(html, `<script type="module" src="/sdk.js?key=${key}"></script>`);
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
            // GET /shell-script.js
            if (method === 'GET' && pathname === '/shell-script.js') {
                res.writeHead(200, { 'Content-Type': 'application/javascript' });
                res.end(shellScriptSource);
                return;
            }
            // GET /events/:key
            const eventsMatch = pathname.match(/^\/events\/([a-f0-9]{16})$/);
            if (method === 'GET' && eventsMatch) {
                const key = eventsMatch[1];
                let cleanedUp = false;
                const cleanup = () => {
                    if (cleanedUp)
                        return;
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
                // Immediately emit the last known presence state so the light is
                // correct on page load / refresh. workingSince is included so the
                // timer can show correct elapsed time after a page refresh.
                const knownPayload = lastPresencePayload.get(key);
                if (knownPayload)
                    sendSSE(res, 'agent-presence', knownPayload);
                const pingInterval = setInterval(() => {
                    if (!res.writableEnded)
                        res.write(': ping\n\n');
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
                if (!session)
                    return notFound(res);
                const rawPrompts = body.prompts ?? [];
                const normalized = rawPrompts.map(normalizePrompt);
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
                if (!data)
                    return notFound(res);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
                return;
            }
            // POST /api/:key/thread/:threadId/done
            const doneMatch = pathname.match(/^\/api\/([a-f0-9]{16})\/thread\/([^/]+)\/done$/);
            if (method === 'POST' && doneMatch) {
                const [, key, threadId] = doneMatch;
                const result = await toggleDone(key, decodeURIComponent(threadId));
                if (!result)
                    return notFound(res);
                saveSessionState(key);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
                return;
            }
            // GET /api/poll?file=ABS[&timeout=SEC]
            if (method === 'GET' && pathname === '/api/poll') {
                const filePath = url.searchParams.get('file');
                const timeoutSec = parseInt(url.searchParams.get('timeout') ?? '0', 10);
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
                    if (!res.writableEnded)
                        res.write(' ');
                }, 15000);
                hb.unref();
                let responding = false;
                let pollRegistered = false;
                const respond = async (prompts) => {
                    if (responding)
                        return;
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
                    broadcastPresence(key, 'working');
                    await respond(existing);
                    return;
                }
                let timeoutHandle = null;
                const feedbackListener = async () => {
                    if (responding)
                        return;
                    const prompts = await takePrompts(key);
                    if (closed || res.writableEnded) {
                        if (pollRegistered) {
                            const remaining = Math.max(0, (activePollCounts.get(key) ?? 1) - 1);
                            activePollCounts.set(key, remaining);
                            pollRegistered = false;
                            if (remaining === 0)
                                broadcastPresence(key, 'idle');
                        }
                        if (prompts.length > 0) {
                            await restorePrompts(key, prompts);
                            emitFeedback(key);
                        }
                        return;
                    }
                    if (prompts.length > 0) {
                        if (timeoutHandle)
                            clearTimeout(timeoutHandle);
                        if (pollRegistered) {
                            activePollCounts.set(key, Math.max(0, (activePollCounts.get(key) ?? 1) - 1));
                            pollRegistered = false;
                        }
                        broadcastPresence(key, 'working');
                        await respond(prompts);
                    }
                    else {
                        onFeedback(key, feedbackListener);
                    }
                };
                const newCount = (activePollCounts.get(key) ?? 0) + 1;
                activePollCounts.set(key, newCount);
                pollRegistered = true;
                broadcastPresence(key, 'polling');
                onFeedback(key, feedbackListener);
                if (timeoutSec > 0) {
                    timeoutHandle = setTimeout(async () => {
                        offFeedback(key, feedbackListener);
                        if (!responding) {
                            if (pollRegistered) {
                                const remaining = Math.max(0, (activePollCounts.get(key) ?? 1) - 1);
                                activePollCounts.set(key, remaining);
                                pollRegistered = false;
                                if (remaining === 0)
                                    broadcastPresence(key, 'idle');
                            }
                            await respond([]);
                        }
                    }, timeoutSec * 1000);
                }
                req.on('close', async () => {
                    if (timeoutHandle)
                        clearTimeout(timeoutHandle);
                    offFeedback(key, feedbackListener);
                    if (!responding) {
                        if (pollRegistered) {
                            const remaining = Math.max(0, (activePollCounts.get(key) ?? 1) - 1);
                            activePollCounts.set(key, remaining);
                            pollRegistered = false;
                            if (remaining === 0)
                                broadcastPresence(key, 'idle');
                        }
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
                const targetUid = body.targetUid ?? null;
                const threadId = targetUid ? resolveThread(key, targetUid) : null;
                const payload = { uid: replyUid, text: body.text ?? '', targetUid, threadId };
                await appendReply(key, { uid: replyUid, threadId, text: body.text ?? '' });
                for (const [conn, connKey] of sseConnections) {
                    if (connKey === key)
                        sendSSE(conn, 'agent-reply', payload);
                }
                touchLiveness(key);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
                return;
            }
            // POST /api/:key/agent-interim
            const interimMatch = pathname.match(/^\/api\/([a-f0-9]{16})\/agent-interim$/);
            if (method === 'POST' && interimMatch) {
                const key = interimMatch[1];
                const body = await parseBody(req);
                const session = getSession(key);
                if (!session)
                    return notFound(res);
                const threadId = body.threadId ?? '';
                const text = body.text ?? '';
                for (const [conn, connKey] of sseConnections) {
                    if (connKey === key)
                        sendSSE(conn, 'agent-interim', { threadId, text });
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
                return;
            }
            // POST /api/:key/reset
            const resetMatch = pathname.match(/^\/api\/([a-f0-9]{16})\/reset$/);
            if (method === 'POST' && resetMatch) {
                const key = resetMatch[1];
                const session = getSession(key);
                if (!session)
                    return notFound(res);
                await resetSession(key);
                try {
                    await fs.unlink(stateFilePath(key));
                }
                catch { /* file may not exist */ }
                for (const [conn, connKey] of sseConnections) {
                    if (connKey === key)
                        sendSSE(conn, 'reset', {});
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
                return;
            }
            notFound(res);
        }
        catch (err) {
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
