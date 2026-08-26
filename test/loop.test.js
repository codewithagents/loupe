import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, unlink, mkdtemp, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer, keyFromPath } from '../dist/server.js';
import { watchFile } from '../dist/watch.js';

const TEST_PORT = 17429;
const BASE = `http://127.0.0.1:${TEST_PORT}`;

let server;

test('setup: start server', async () => {
  server = createServer(TEST_PORT);
  await new Promise((resolve, reject) => {
    server.listen(TEST_PORT, '127.0.0.1', resolve);
    server.on('error', reject);
  });
});

test('GET /health includes version and fingerprint', async () => {
  const r = await fetch(`${BASE}/health`);
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.ok(typeof data.version === 'string' && data.version.length > 0, 'version present');
  assert.ok(typeof data.fingerprint === 'string' && data.fingerprint.length === 16, 'fingerprint is 16-char hex');
  assert.match(data.fingerprint, /^[a-f0-9]{16}$/, 'fingerprint is lowercase hex');
});

test('key derivation: same path produces same key, different path produces different key', () => {
  const p1 = '/some/absolute/path/file.html';
  const p2 = '/another/path/file.html';
  assert.equal(keyFromPath(p1), keyFromPath(p1));
  assert.notEqual(keyFromPath(p1), keyFromPath(p2));
  assert.equal(keyFromPath(p1).length, 16);
  assert.match(keyFromPath(p1), /^[a-f0-9]{16}$/);
});

test('POST /api/sessions returns key and url', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'loupe-test-'));
  const filePath = path.join(tmpDir, 'test.html');
  await writeFile(filePath, '<html><body><h1>Test</h1></body></html>');

  const r = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: filePath }),
  });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.ok(data.key, 'key should be present');
  assert.ok(data.url, 'url should be present');
  assert.match(data.key, /^[a-f0-9]{16}$/);
  assert.ok(data.url.includes(data.key));

  await unlink(filePath);
});

test('full poll loop: prompts are delivered and normalized with threadId', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'loupe-loop-'));
  const filePath = path.join(tmpDir, 'artifact.html');
  await writeFile(filePath, '<html><body><p>Hello</p></body></html>');

  const sessR = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: filePath }),
  });
  const { key } = await sessR.json();

  const pollPromise = fetch(`${BASE}/api/poll?file=${encodeURIComponent(filePath)}&timeout=5`);
  await new Promise(r => setTimeout(r, 100));

  const postR = await fetch(`${BASE}/api/${key}/prompts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompts: [{
        uid: 'test-uid-001',
        threadId: 'test-uid-001',
        prompt: 'This looks wrong',
        selector: 'p',
        tag: 'note',
        text: 'Hello',
        target: null,
        extraField: 'should be stripped',
      }],
    }),
  });
  assert.equal(postR.status, 200);

  const pollR = await pollPromise;
  const result = JSON.parse((await pollR.text()).trim());

  assert.ok(result.prompts, 'prompts array should be present');
  assert.equal(result.prompts.length, 1);

  const p = result.prompts[0];
  assert.equal(p.uid, 'test-uid-001');
  assert.equal(p.threadId, 'test-uid-001');
  assert.equal(p.prompt, 'This looks wrong');
  assert.equal(p.selector, 'p');
  assert.equal(p.tag, 'note');
  assert.equal(p.text, 'Hello');
  assert.equal(p.target, null);
  assert.equal(p.contentSnippet, null);
  assert.equal(p.extraField, undefined);

  const keys = Object.keys(p).sort();
  assert.deepEqual(keys, ['contentSnippet', 'prompt', 'selector', 'tag', 'target', 'text', 'threadId', 'uid'].sort());

  assert.ok(result.next_step);

  await unlink(filePath);
});

test('batch poll: multiple prompts returned in a single poll response', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'loupe-batch-'));
  const filePath = path.join(tmpDir, 'artifact.html');
  await writeFile(filePath, '<html><body><p>Batch test</p></body></html>');

  const sessR = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: filePath }),
  });
  const { key } = await sessR.json();

  const pollPromise = fetch(`${BASE}/api/poll?file=${encodeURIComponent(filePath)}&timeout=5`);
  await new Promise(r => setTimeout(r, 100));

  await fetch(`${BASE}/api/${key}/prompts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompts: [
        { uid: 'batch-001', threadId: 'batch-001', prompt: 'First note', selector: 'p', tag: 'note', text: null, target: null },
        { uid: 'batch-002', threadId: 'batch-002', prompt: 'Second note', selector: null, tag: 'note', text: 'some text', target: null },
        { uid: 'batch-003', threadId: 'batch-001', prompt: 'Follow-up', selector: 'p', tag: 'note', text: null, target: null },
      ],
    }),
  });

  const result = JSON.parse((await (await pollPromise).text()).trim());
  assert.ok(Array.isArray(result.prompts));
  assert.equal(result.prompts.length, 3, 'all three prompts arrive in one poll response');
  assert.equal(result.prompts[0].uid, 'batch-001');
  assert.equal(result.prompts[1].uid, 'batch-002');
  assert.equal(result.prompts[2].threadId, 'batch-001', 'follow-up shares threadId with parent');

  await unlink(filePath);
});

test('history endpoint: returns sent prompts and agent replies', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'loupe-hist-'));
  const filePath = path.join(tmpDir, 'artifact.html');
  await writeFile(filePath, '<html><body><p>History test</p></body></html>');

  const sessR = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: filePath }),
  });
  const { key } = await sessR.json();

  // Post a prompt
  await fetch(`${BASE}/api/${key}/prompts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompts: [{ uid: 'hist-001', threadId: 'hist-001', prompt: 'Check this', selector: 'p', tag: 'note', text: null, target: null }] }),
  });

  // Drain the poll so prompts are "consumed" but history persists
  await fetch(`${BASE}/api/poll?file=${encodeURIComponent(filePath)}&timeout=1`);

  // Post an agent reply targeted at the prompt
  await fetch(`${BASE}/api/${key}/agent-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Looks good to me', targetUid: 'hist-001' }),
  });

  // Fetch history
  const histR = await fetch(`${BASE}/api/${key}/history`);
  assert.equal(histR.status, 200);
  const histData = await histR.json();
  assert.ok(Array.isArray(histData.history));

  const userEntries = histData.history.filter(h => h.role === 'user');
  const agentEntries = histData.history.filter(h => h.role === 'agent');

  assert.equal(userEntries.length, 1);
  assert.equal(userEntries[0].uid, 'hist-001');
  assert.equal(userEntries[0].threadId, 'hist-001');
  assert.equal(userEntries[0].prompt, 'Check this');

  assert.equal(agentEntries.length, 1);
  assert.equal(agentEntries[0].text, 'Looks good to me');
  assert.equal(agentEntries[0].threadId, 'hist-001', 'agent reply should carry threadId resolved from targetUid');

  await unlink(filePath);
});

test('resolveThread: --reply-to accepts threadId directly (not only prompt uid)', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'loupe-tid-'));
  const filePath = path.join(tmpDir, 'artifact.html');
  await writeFile(filePath, '<html><body><p>Thread test</p></body></html>');

  const sessR = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: filePath }),
  });
  const { key } = await sessR.json();

  // Thread tid-a with a follow-up (follow-up uid != threadId)
  await fetch(`${BASE}/api/${key}/prompts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompts: [
        { uid: 'tid-a', threadId: 'tid-a', prompt: 'First note', selector: 'p', tag: 'note', text: null, target: null },
        { uid: 'tid-a-followup', threadId: 'tid-a', prompt: 'Follow-up', selector: 'p', tag: 'note', text: null, target: null },
      ],
    }),
  });

  // Reply using the threadId directly (not a uid)
  const replyR = await fetch(`${BASE}/api/${key}/agent-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Got it', targetUid: 'tid-a' }),
  });
  assert.equal(replyR.status, 200);

  const histData = await (await fetch(`${BASE}/api/${key}/history`)).json();
  const agentEntries = histData.history.filter(h => h.role === 'agent');
  assert.equal(agentEntries.length, 1);
  assert.equal(agentEntries[0].threadId, 'tid-a', 'threadId resolved correctly when passing threadId as ref');

  await unlink(filePath);
});

test('broadcast reply: stored with __broadcast__ threadId so history restore works', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'loupe-bc-'));
  const filePath = path.join(tmpDir, 'artifact.html');
  await writeFile(filePath, '<html><body><p>Broadcast test</p></body></html>');

  const sessR = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: filePath }),
  });
  const { key } = await sessR.json();

  // Post a broadcast reply (no targetUid)
  await fetch(`${BASE}/api/${key}/agent-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'All changes applied.' }),
  });

  const histData = await (await fetch(`${BASE}/api/${key}/history`)).json();
  const agentEntries = histData.history.filter(h => h.role === 'agent');
  assert.equal(agentEntries.length, 1);
  assert.equal(agentEntries[0].threadId, '__broadcast__', 'broadcast reply must use __broadcast__ sentinel so page-refresh restore works');

  await unlink(filePath);
});

test('POST /api/:key/reset clears history and queued prompts', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'loupe-reset-'));
  const filePath = path.join(tmpDir, 'reset.html');
  await writeFile(filePath, '<html><body><p>Reset test</p></body></html>');

  const sessR = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: filePath }),
  });
  const { key } = await sessR.json();

  await fetch(`${BASE}/api/${key}/prompts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompts: [{ uid: 'reset-001', threadId: 'reset-001', prompt: 'Fix this', selector: 'p', tag: 'note', text: null, target: null }],
    }),
  });

  await fetch(`${BASE}/api/${key}/agent-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Fixed.', targetUid: 'reset-001' }),
  });

  const beforeData = await (await fetch(`${BASE}/api/${key}/history`)).json();
  assert.ok(beforeData.history.length > 0, 'history non-empty before reset');

  const resetR = await fetch(`${BASE}/api/${key}/reset`, { method: 'POST' });
  assert.equal(resetR.status, 200);
  const resetData = await resetR.json();
  assert.equal(resetData.ok, true);

  const afterData = await (await fetch(`${BASE}/api/${key}/history`)).json();
  assert.equal(afterData.history.length, 0, 'history empty after reset');
  assert.equal(afterData.doneThreadIds.length, 0, 'doneThreadIds empty after reset');

  await unlink(filePath);
});

test('watcher: detects file change after atomic inode replacement (write-temp-rename)', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'loupe-watch-'));
  const filePath = path.join(tmpDir, 'watched.html');
  await writeFile(filePath, '<html><body>v1</body></html>');

  let reloadCount = 0;
  const stop = watchFile(filePath, () => { reloadCount++; });

  await new Promise(r => setTimeout(r, 100));

  const tmpFile = filePath + '.tmp';
  await writeFile(tmpFile, '<html><body>v2</body></html>');
  await rename(tmpFile, filePath);

  await new Promise(r => setTimeout(r, 700));

  stop();

  assert.ok(reloadCount >= 1, 'reload should fire at least once after atomic rename, got: ' + reloadCount);

  await unlink(filePath);
});

test('teardown: close server', async () => {
  await new Promise((resolve) => server.close(resolve));
});
