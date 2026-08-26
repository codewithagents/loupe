export function renderShell(key, port, version) {
  version = version || '?';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Loupe Review</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; height: 100vh; background: #0f172a; color: #e2e8f0; overflow: hidden; }
  #toolbar { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #1e293b; border-bottom: 1px solid #334155; font-size: 13px; flex-shrink: 0; }
  #toolbar-title { font-weight: 600; color: #f8fafc; }
  #toolbar-info { color: #94a3b8; font-size: 12px; }
  #toolbar-spacer { flex: 1; }
  #pending-count { font-size: 12px; color: #94a3b8; }
  #send-btn { background: #3b82f6; color: white; border: none; border-radius: 4px; padding: 5px 14px; cursor: pointer; font-size: 12px; font-weight: 500; }
  #send-btn:hover:not(:disabled) { background: #2563eb; }
  #send-btn:disabled { background: #334155; color: #64748b; cursor: default; }
  #artifact-wrap { flex: 1; min-height: 0; }
  #artifact-frame { width: 100%; height: 100%; border: none; background: white; display: block; }
  #status-bar { padding: 3px 12px; font-size: 11px; color: #64748b; background: #0f172a; border-top: 1px solid #334155; flex-shrink: 0; }

  /* Modal overlay */
  #modal-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9000; align-items: center; justify-content: center; }
  #modal-backdrop.open { display: flex; }
  #modal { background: #1e293b; border: 1px solid #334155; border-radius: 12px; width: 500px; max-width: calc(100vw - 32px); max-height: calc(100vh - 64px); display: flex; flex-direction: column; box-shadow: 0 24px 64px rgba(0,0,0,0.6); overflow: hidden; }

  /* Modal header */
  #modal-hdr { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px 12px; border-bottom: 1px solid #334155; flex-shrink: 0; }
  #modal-hdr-text { flex: 1; min-width: 0; }
  #modal-snippet { font-size: 14px; font-weight: 500; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #modal-sel { font-family: monospace; font-size: 11px; color: #f59e0b; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #modal-hdr-btns { display: flex; gap: 6px; flex-shrink: 0; padding-top: 1px; }
  .modal-btn { background: transparent; border: 1px solid #334155; border-radius: 4px; color: #94a3b8; width: 28px; height: 28px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; }
  .modal-btn:hover { background: #0f172a; color: #e2e8f0; }
  #modal-done-btn.done { background: #4b5563; color: #9ca3af; border-color: #6b7280; }

  /* Modal messages */
  #modal-msgs { overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; min-height: 80px; max-height: 45vh; }
  #modal-empty { color: #475569; font-size: 13px; text-align: center; padding: 20px 0; }
  .msg { border-radius: 8px; padding: 8px 12px; font-size: 13px; line-height: 1.5; }
  .msg-user { background: #0f172a; border: 1px solid #334155; }
  .msg-agent { background: #1d4ed8; border: 1px solid #2563eb; }
  .msg-draft { background: #0f172a; border: 1px dashed #f59e0b; opacity: 0.85; }
  .msg-meta { font-size: 10px; color: #64748b; margin-bottom: 3px; }
  .msg-body { word-break: break-word; }
  .msg-draft-label { font-size: 10px; color: #f59e0b; margin-bottom: 3px; }

  /* Modal compose */
  #modal-compose { padding: 10px 16px 12px; border-top: 1px solid #334155; flex-shrink: 0; display: flex; flex-direction: column; gap: 5px; }
  #modal-input { background: #0f172a; color: #e2e8f0; border: 1px solid #334155; border-radius: 6px; padding: 8px 10px; font-size: 13px; resize: none; height: 64px; outline: none; font-family: inherit; width: 100%; line-height: 1.5; }
  #modal-input:focus { border-color: #3b82f6; }
  #modal-hint { font-size: 10px; color: #475569; }
</style>
</head>
<body>
<div id="toolbar">
  <span id="toolbar-title">Loupe v${version}</span>
  <span id="toolbar-info">Session: ${key}</span>
  <span id="toolbar-spacer"></span>
  <span id="pending-count">0 pending</span>
  <button id="send-btn" disabled>Send</button>
</div>
<div id="artifact-wrap">
  <iframe id="artifact-frame"></iframe>
</div>
<div id="status-bar">Connecting...</div>
<div id="modal-backdrop">
  <div id="modal">
    <div id="modal-hdr">
      <div id="modal-hdr-text">
        <div id="modal-snippet"></div>
        <div id="modal-sel"></div>
      </div>
      <div id="modal-hdr-btns">
        <button id="modal-done-btn" class="modal-btn" title="Mark as done">&#x2713;</button>
        <button id="modal-close-btn" class="modal-btn" title="Close">&#x2715;</button>
      </div>
    </div>
    <div id="modal-msgs"></div>
    <div id="modal-compose">
      <textarea id="modal-input" placeholder="Continue the thread&#x2026;"></textarea>
      <div id="modal-hint">Enter: add note &middot; Shift+Enter: newline &middot; Cmd+Enter: add &amp; send all &middot; Esc: close</div>
    </div>
  </div>
</div>
<script>
(function() {
  var KEY = ${JSON.stringify(key)};
  var API = '/api/' + KEY;
  var DRAFTS_KEY = 'loupe:drafts:' + KEY;

  var threads = {};
  var activeThreadId = null;
  var pendingCtx = null;
  var awaitingReply = {};
  var reloadCounter = 0;
  var artifactReady = false;

  var pendingCountEl = document.getElementById('pending-count');
  var sendBtn = document.getElementById('send-btn');
  var statusBar = document.getElementById('status-bar');
  var artifactFrame = document.getElementById('artifact-frame');
  var modalBackdrop = document.getElementById('modal-backdrop');
  var modalSnippet = document.getElementById('modal-snippet');
  var modalSel = document.getElementById('modal-sel');
  var modalMsgs = document.getElementById('modal-msgs');
  var modalDoneBtn = document.getElementById('modal-done-btn');
  var modalCloseBtn = document.getElementById('modal-close-btn');
  var modalInput = document.getElementById('modal-input');

  /* ---- uid ---- */
  function uid() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  /* ---- pending count ---- */
  function totalDrafts() {
    var n = 0;
    for (var tid in threads) n += threads[tid].drafts.length;
    return n;
  }

  function updatePendingCount() {
    var n = totalDrafts();
    pendingCountEl.textContent = n + ' pending';
    sendBtn.disabled = n === 0;
  }

  /* ---- marker state (4 states) ---- */
  function markerState(t) {
    if (t.done) return 'done';
    if (t.messages.length > 0) {
      return t.messages[t.messages.length - 1].role === 'agent' ? 'agent-last' : 'user-last';
    }
    return 'drafts-only';
  }

  /* ---- markers ---- */
  function applyMarker(tid) {
    var t = threads[tid];
    if (!t || !t.selector) return;
    if (!artifactReady) return;
    var count = t.messages.length + t.drafts.length;
    try {
      artifactFrame.contentWindow.postMessage({
        type: 'loupe:add-marker',
        threadId: tid,
        selector: t.selector,
        count: count,
        state: markerState(t)
      }, '*');
    } catch(e) {}
  }

  function applyAllMarkers() {
    for (var tid in threads) applyMarker(tid);
  }

  /* ---- localStorage drafts ---- */
  function saveDrafts() {
    var all = [];
    for (var tid in threads) {
      var t = threads[tid];
      for (var i = 0; i < t.drafts.length; i++) {
        all.push({ uid: t.drafts[i].uid, threadId: tid, prompt: t.drafts[i].prompt, selector: t.selector, selText: t.selText, contentSnippet: t.contentSnippet || null });
      }
    }
    try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(all)); } catch(e) {}
  }

  function loadDrafts() {
    try {
      var stored = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]');
      for (var i = 0; i < stored.length; i++) {
        var d = stored[i];
        if (!threads[d.threadId]) {
          threads[d.threadId] = { threadId: d.threadId, selector: d.selector || null, selText: d.selText || null, contentSnippet: d.contentSnippet || null, messages: [], drafts: [], done: false };
        }
        threads[d.threadId].drafts.push({ uid: d.uid, prompt: d.prompt });
      }
    } catch(e) {}
  }

  /* ---- restore from server history ---- */
  function restoreHistory(history, doneThreadIds) {
    for (var i = 0; i < history.length; i++) {
      var item = history[i];
      var tid = item.threadId || item.uid;
      if (!threads[tid]) {
        threads[tid] = { threadId: tid, selector: item.selector || null, selText: item.text || null, contentSnippet: item.contentSnippet || null, messages: [], drafts: [], done: false };
      } else if (!threads[tid].contentSnippet && item.contentSnippet) {
        threads[tid].contentSnippet = item.contentSnippet;
      }
      if (item.role === 'user') {
        threads[tid].messages.push({ role: 'user', uid: item.uid, content: item.prompt });
      } else if (item.role === 'agent') {
        threads[tid].messages.push({ role: 'agent', uid: item.uid, content: item.text });
      }
    }
    if (doneThreadIds) {
      for (var j = 0; j < doneThreadIds.length; j++) {
        var dtid = doneThreadIds[j];
        if (threads[dtid]) threads[dtid].done = true;
      }
    }
  }

  /* ---- modal rendering ---- */
  function renderModal(tid) {
    var t = threads[tid];
    if (!t) return;

    modalSnippet.textContent = t.contentSnippet || t.selector || 'General note';
    modalSel.textContent = t.selector || (t.selText ? '“' + t.selText.slice(0, 50) + '”' : '');
    modalDoneBtn.classList.toggle('done', !!t.done);
    modalDoneBtn.title = t.done ? 'Mark as open' : 'Mark as done';

    modalMsgs.innerHTML = '';

    if (t.messages.length === 0 && t.drafts.length === 0) {
      var empty = document.createElement('div');
      empty.id = 'modal-empty';
      empty.textContent = 'No messages yet';
      modalMsgs.appendChild(empty);
    } else {
      for (var i = 0; i < t.messages.length; i++) {
        var m = t.messages[i];
        var div = document.createElement('div');
        div.className = 'msg ' + (m.role === 'user' ? 'msg-user' : 'msg-agent');
        var meta = document.createElement('div');
        meta.className = 'msg-meta';
        meta.textContent = m.role === 'user' ? 'You' : 'Agent';
        div.appendChild(meta);
        var body = document.createElement('div');
        body.className = 'msg-body';
        body.textContent = m.content;
        div.appendChild(body);
        modalMsgs.appendChild(div);
      }
      for (var j = 0; j < t.drafts.length; j++) {
        var dft = t.drafts[j];
        var dDiv = document.createElement('div');
        dDiv.className = 'msg msg-draft';
        var dLabel = document.createElement('div');
        dLabel.className = 'msg-draft-label';
        dLabel.textContent = 'Pending - not sent yet';
        dDiv.appendChild(dLabel);
        var dBody = document.createElement('div');
        dBody.className = 'msg-body';
        dBody.textContent = dft.prompt;
        dDiv.appendChild(dBody);
        modalMsgs.appendChild(dDiv);
      }
    }
    modalMsgs.scrollTop = modalMsgs.scrollHeight;
  }

  function openModal(tid) {
    if (!threads[tid]) return;
    activeThreadId = tid;
    renderModal(tid);
    modalBackdrop.classList.add('open');
    setTimeout(function() { modalInput.focus(); }, 50);
  }

  function closeModal() {
    modalBackdrop.classList.remove('open');
    activeThreadId = null;
    modalInput.value = '';
  }

  /* ---- done toggle ---- */
  modalDoneBtn.addEventListener('click', function() {
    if (!activeThreadId || !threads[activeThreadId]) return;
    var tid = activeThreadId;
    threads[tid].done = !threads[tid].done;
    applyMarker(tid);
    renderModal(tid);
    fetch(API + '/thread/' + encodeURIComponent(tid) + '/done', { method: 'POST' }).catch(function() {});
  });

  /* ---- close modal ---- */
  modalCloseBtn.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', function(e) { if (e.target === modalBackdrop) closeModal(); });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && modalBackdrop.classList.contains('open')) closeModal();
  });

  /* ---- modal compose ---- */
  modalInput.addEventListener('keydown', function(e) {
    var isMeta = e.metaKey || e.ctrlKey;
    if (e.key === 'Enter' && !e.shiftKey && !isMeta) {
      e.preventDefault();
      var text = modalInput.value.trim();
      if (!text || !activeThreadId || !threads[activeThreadId]) return;
      addDraft(activeThreadId, text);
      modalInput.value = '';
    } else if (e.key === 'Enter' && !e.shiftKey && isMeta) {
      e.preventDefault();
      var text2 = modalInput.value.trim();
      if (text2 && activeThreadId && threads[activeThreadId]) {
        addDraft(activeThreadId, text2);
        modalInput.value = '';
      }
      sendBtn.click();
    } else if (e.key === 'Escape') {
      closeModal();
    }
  });

  /* ---- thread helpers ---- */
  function findThreadBySelector(selector) {
    for (var tid in threads) {
      if (threads[tid].selector === selector) return tid;
    }
    return null;
  }

  function addNoteFromIframe(selector, noteText, contentSnippet) {
    var targetTid;
    if (selector) {
      var existing = findThreadBySelector(selector);
      if (existing) {
        targetTid = existing;
        if (!threads[targetTid].contentSnippet && contentSnippet) threads[targetTid].contentSnippet = contentSnippet;
      } else {
        targetTid = uid();
        threads[targetTid] = { threadId: targetTid, selector: selector, selText: null, contentSnippet: contentSnippet || null, messages: [], drafts: [], done: false };
      }
      pendingCtx = null;
      activeThreadId = targetTid;
    } else {
      targetTid = uid();
      threads[targetTid] = { threadId: targetTid, selector: null, selText: null, contentSnippet: contentSnippet || null, messages: [], drafts: [], done: false };
      activeThreadId = targetTid;
      pendingCtx = null;
    }
    if (targetTid && threads[targetTid]) addDraft(targetTid, noteText);
  }

  /* ---- add draft ---- */
  function addDraft(tid, prompt) {
    var t = threads[tid];
    if (!t) return;
    t.drafts.push({ uid: uid(), prompt: prompt });
    applyMarker(tid);
    updatePendingCount();
    saveDrafts();
    if (activeThreadId === tid && modalBackdrop.classList.contains('open')) renderModal(tid);
  }

  /* ---- send ---- */
  sendBtn.addEventListener('click', function() {
    var batch = [];
    var sentTids = {};
    for (var tid in threads) {
      var t = threads[tid];
      for (var i = 0; i < t.drafts.length; i++) {
        var d = t.drafts[i];
        batch.push({ uid: d.uid, threadId: tid, prompt: d.prompt, selector: t.selector, tag: 'note', text: t.selText, target: null, contentSnippet: t.contentSnippet || null });
        sentTids[tid] = true;
      }
    }
    if (batch.length === 0) return;
    sendBtn.disabled = true;

    fetch(API + '/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompts: batch })
    }).then(function() {
      for (var tid in threads) {
        var t = threads[tid];
        for (var i = 0; i < t.drafts.length; i++) {
          t.messages.push({ role: 'user', uid: t.drafts[i].uid, content: t.drafts[i].prompt });
        }
        t.drafts = [];
        applyMarker(tid);
      }
      try { localStorage.removeItem(DRAFTS_KEY); } catch(e) {}
      for (var stid in sentTids) awaitingReply[stid] = true;
      statusBar.textContent = 'Sent - waiting for agent…';
      updatePendingCount();
      if (activeThreadId && modalBackdrop.classList.contains('open')) renderModal(activeThreadId);
    }).catch(function() {
      sendBtn.disabled = false;
      updatePendingCount();
    });
  });

  /* ---- postMessage from artifact ---- */
  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'object') return;
    var d = e.data;
    if (d.type === 'loupe:element') {
      pendingCtx = { selector: d.selector, selText: null };
    } else if (d.type === 'loupe:note') {
      if (d.text) addNoteFromIframe(d.selector || null, d.text, d.contentSnippet || null);
    } else if (d.type === 'loupe:send-all') {
      sendBtn.click();
    } else if (d.type === 'loupe:marker-click') {
      openModal(d.threadId);
    }
  });

  /* ---- SSE ---- */
  var evtSource = new EventSource('/events/' + KEY);

  evtSource.addEventListener('reload', function() {
    reloadCounter++;
    artifactReady = false;
    artifactFrame.src = '/artifact/' + KEY + '/?r=' + reloadCounter;
    statusBar.textContent = 'Reloading...';
  });

  evtSource.addEventListener('agent-reply', function(e) {
    try {
      var data = JSON.parse(e.data);
      var tid = data.threadId;
      if (tid && threads[tid]) {
        threads[tid].messages.push({ role: 'agent', uid: data.uid || uid(), content: data.text });
        applyMarker(tid);
        delete awaitingReply[tid];
        if (Object.keys(awaitingReply).length === 0) statusBar.textContent = 'Connected';
        if (activeThreadId === tid && modalBackdrop.classList.contains('open')) renderModal(tid);
      } else {
        var btid = '__broadcast__';
        if (!threads[btid]) {
          threads[btid] = { threadId: btid, selector: null, selText: null, contentSnippet: null, messages: [], drafts: [], done: false };
        }
        threads[btid].messages.push({ role: 'agent', uid: data.uid || uid(), content: data.text });
        if (activeThreadId === btid && modalBackdrop.classList.contains('open')) renderModal(btid);
        else openModal(btid);
      }
    } catch(err) {}
  });

  evtSource.onopen = function() { statusBar.textContent = 'Connected'; };
  evtSource.onerror = function() { statusBar.textContent = 'Reconnecting...'; };

  /* ---- iframe load ---- */
  artifactFrame.addEventListener('load', function() {
    artifactReady = true;
    statusBar.textContent = 'Connected';
    setTimeout(applyAllMarkers, 50);
  });

  /* ---- init ---- */
  (function init() {
    fetch(API + '/history').then(function(r) {
      return r.ok ? r.json() : { history: [], doneThreadIds: [] };
    }).then(function(data) {
      restoreHistory(data.history || [], data.doneThreadIds || []);
      loadDrafts();
      updatePendingCount();
      artifactFrame.src = '/artifact/' + KEY + '/';
    }).catch(function() {
      loadDrafts();
      updatePendingCount();
      artifactFrame.src = '/artifact/' + KEY + '/';
    });
  })();
})();
</script>
</body>
</html>`;
}
