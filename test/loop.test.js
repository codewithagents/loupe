import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer, keyFromPath } from '../assets/server.js';

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
  return data.key;
});

test('full poll loop: prompts are delivered and normalized', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'loupe-loop-'));
  const filePath = path.join(tmpDir, 'artifact.html');
  await writeFile(filePath, '<html><body><p>Hello</p></body></html>');

  // Create session
  const sessR = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: filePath }),
  });
  const { key } = await sessR.json();

  // Start poll (don't await yet)
  const pollPromise = fetch(`${BASE}/api/poll?file=${encodeURIComponent(filePath)}&timeout=5`);

  // Give the poll a moment to register
  await new Promise(r => setTimeout(r, 100));

  // Post a prompt with extra fields that should be stripped
  const postR = await fetch(`${BASE}/api/${key}/prompts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompts: [{
        uid: 'test-uid-001',
        prompt: 'This looks wrong',
        selector: 'p',
        tag: 'note',
        text: 'Hello',
        target: null,
        extraField: 'should be stripped',
        another: 123,
      }],
    }),
  });
  assert.equal(postR.status, 200);

  // Await poll result
  const pollR = await pollPromise;
  const pollText = await pollR.text();
  const result = JSON.parse(pollText.trim());

  assert.ok(result.prompts, 'prompts array should be present');
  assert.equal(result.prompts.length, 1);

  const p = result.prompts[0];

  // Verify correct fields are present
  assert.equal(p.uid, 'test-uid-001');
  assert.equal(p.prompt, 'This looks wrong');
  assert.equal(p.selector, 'p');
  assert.equal(p.tag, 'note');
  assert.equal(p.text, 'Hello');
  assert.equal(p.target, null);

  // Verify extra fields are stripped
  assert.equal(p.extraField, undefined);
  assert.equal(p.another, undefined);

  // Verify exactly 6 fields
  const keys = Object.keys(p);
  assert.deepEqual(keys.sort(), ['prompt', 'selector', 'tag', 'target', 'text', 'uid'].sort());

  assert.ok(result.next_step, 'next_step hint should be present');

  await unlink(filePath);
});

test('teardown: close server', async () => {
  await new Promise((resolve) => server.close(resolve));
});
