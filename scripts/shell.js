export function renderShell(key, port) {
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
  #main { display: flex; flex: 1; min-height: 0; }
  #artifact-wrap { flex: 1; min-width: 0; }
  #artifact-frame { width: 100%; height: 100%; border: none; background: white; display: block; }
  #sidebar { width: 340px; flex-shrink: 0; display: flex; flex-direction: column; border-left: 1px solid #334155; background: #1e293b; min-height: 0; }

  /* Thread list panel */
  #tl-panel { display: flex; flex-direction: column; border-bottom: 2px solid #334155; min-height: 0; max-height: 50%; }
  #tl-header { display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; border-bottom: 1px solid #334155; flex-shrink: 0; }
  #tl-header-label { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
  #add-general-btn { font-size: 11px; background: transparent; color: #64748b; border: 1px solid #334155; border-radius: 4px; padding: 2px 7px; cursor: pointer; }
  #add-general-btn:hover { color: #e2e8f0; border-color: #64748b; }
  #thread-list { flex: 1; overflow-y: auto; }
  .thread-row { display: flex; align-items: center; gap: 8px; padding: 7px 10px; cursor: pointer; border-bottom: 1px solid #1e293b; transition: background 0.1s; }
  .thread-row:hover { background: #0f172a; }
  .thread-row.active { background: #0f172a; border-left: 2px solid #3b82f6; padding-left: 8px; }
  .thread-badge { flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .thread-badge.pending { background: #f59e0b; color: #000; }
  .thread-badge.sent { background: #3b82f6; color: #fff; }
  .thread-badge.empty { background: #334155; color: #94a3b8; }
  .thread-label { flex: 1; min-width: 0; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .thread-label-sel { font-family: monospace; color: #f59e0b; }
  .thread-label-gen { color: #94a3b8; font-style: italic; }
  #tl-footer { display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; flex-shrink: 0; border-top: 1px solid #334155; }
  #pending-count { font-size: 11px; color: #64748b; }
  #send-btn { background: #3b82f6; color: white; border: none; border-radius: 4px; padding: 6px 14px; cursor: pointer; font-size: 12px; font-weight: 500; }
  #send-btn:hover:not(:disabled) { background: #2563eb; }
  #send-btn:disabled { background: #334155; color: #64748b; cursor: default; }

  /* Thread detail panel */
  #td-panel { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  #td-header { padding: 7px 10px; font-size: 11px; color: #94a3b8; border-bottom: 1px solid #334155; flex-shrink: 0; display: flex; align-items: center; gap: 6px; }
  #td-header-sel { font-family: monospace; color: #f59e0b; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  #td-messages { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
  #td-empty { color: #475569; font-size: 13px; padding: 20px 10px; text-align: center; }
  .msg { border-radius: 6px; padding: 8px 10px; font-size: 13px; line-height: 1.5; }
  .msg-user { background: #0f172a; border: 1px solid #334155; }
  .msg-agent { background: #1d4ed8; border: 1px solid #2563eb; }
  .msg-draft { background: #0f172a; border: 1px dashed #f59e0b; opacity: 0.85; }
  .msg-meta { font-size: 10px; color: #64748b; margin-bottom: 3px; }
  .msg-body { word-break: break-word; }
  .msg-draft-label { font-size: 10px; color: #f59e0b; margin-bottom: 3px; }
  #td-compose { padding: 8px; border-top: 1px solid #334155; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; }
  #td-input { background: #0f172a; color: #e2e8f0; border: 1px solid #334155; border-radius: 4px; padding: 7px; font-size: 13px; resize: none; height: 60px; outline: none; font-family: inherit; width: 100%; }
  #td-input:focus { border-color: #3b82f6; }
  #td-add-btn { background: #f59e0b; color: #000; border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-size: 12px; font-weight: 600; align-self: flex-end; }
  #td-add-btn:hover { background: #d97706; }
  #status-bar { padding: 3px 12px; font-size: 11px; color: #64748b; background: #0f172a; border-top: 1px solid #334155; flex-shrink: 0; }
</style>
</head>
<body>
<div id="toolbar">
  <span id="toolbar-title">Loupe</span>
  <span id="toolbar-info">Session: ${key}</span>
</div>
<div id="main">
  <div id="artifact-wrap">
    <iframe id="artifact-frame"></iframe>
  </div>
  <div id="sidebar">
    <div id="tl-panel">
      <div id="tl-header">
        <span id="tl-header-label">Annotations</span>
        <button id="add-general-btn">+ General</button>
      </div>
      <div id="thread-list"></div>
      <div id="tl-footer">
        <span id="pending-count">0 pending</span>
        <button id="send-btn" disabled>Send</button>
      </div>
    </div>
    <div id="td-panel">
      <div id="td-header">
        <span id="td-header-sel">Select an element to annotate</span>
      </div>
      <div id="td-messages">
        <div id="td-empty">Click an element in the page or select a thread above</div>
      </div>
      <div id="td-compose">
        <textarea id="td-input" placeholder="Type a note..."></textarea>
        <button id="td-add-btn">Add note</button>
      </div>
    </div>
  </div>
</div>
<div id="status-bar">Connecting...</div>
<script>
(function() {
  var KEY = ${JSON.stringify(key)};
  var DRAFTS_KEY = 'loupe:drafts:' + KEY;

  var threads = {};
  var activeThreadId = null;
  var reloadCounter = 0;
  var artifactReady = false;

  var threadList = document.getElementById('thread-list');
  var pendingCount = document.getElementById('pending-count');
  var sendBtn = document.getElementById('send-btn');
  var addGeneralBtn = document.getElementById('add-general-btn');
  var tdHeader = document.getElementById('td-header-sel');
  var tdMessages = document.getElementById('td-messages');
  var tdInput = document.getElementById('td-input');
  var tdAddBtn = document.getElementById('td-add-btn');
  var statusBar = document.getElementById('status-bar');
  var artifactFrame = document.getElementById('artifact-frame');

  /* ---- uid ---- */
  function uid() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  /* ---- thread helpers ---- */
  function getThread(tid) { return threads[tid] || null; }

  function totalDrafts() {
    var n = 0;
    for (var tid in threads) n += threads[tid].drafts.length;
    return n;
  }

  function threadBadgeCount(t) {
    return t.messages.length + t.drafts.length;
  }

  /* ---- localStorage drafts ---- */
  function saveDrafts() {
    var all = [];
    for (var tid in threads) {
      var t = threads[tid];
      for (var i = 0; i < t.drafts.length; i++) {
        all.push({ uid: t.drafts[i].uid, threadId: tid, prompt: t.drafts[i].prompt, selector: t.selector, selText: t.selText });
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
          threads[d.threadId] = { threadId: d.threadId, selector: d.selector || null, selText: d.selText || null, messages: [], drafts: [] };
        }
        threads[d.threadId].drafts.push({ uid: d.uid, prompt: d.prompt });
      }
    } catch(e) {}
  }

  /* ---- restore from server history ---- */
  function restoreHistory(history) {
    for (var i = 0; i < history.length; i++) {
      var item = history[i];
      var tid = item.threadId || item.uid;
      if (!threads[tid]) {
        threads[tid] = { threadId: tid, selector: item.selector || null, selText: item.text || null, messages: [], drafts: [] };
      }
      if (item.role === 'user') {
        threads[tid].messages.push({ role: 'user', uid: item.uid, content: item.prompt });
      } else if (item.role === 'agent') {
        threads[tid].messages.push({ role: 'agent', uid: item.uid, content: item.text });
      }
    }
  }

  /* ---- markers ---- */
  function applyMarker(tid) {
    var t = threads[tid];
    if (!t || !t.selector) return;
    if (!artifactReady) return;
    var count = threadBadgeCount(t);
    var pending = t.drafts.length > 0;
    try {
      artifactFrame.contentWindow.postMessage({ type: 'loupe:add-marker', threadId: tid, selector: t.selector, count: count, pending: pending }, '*');
    } catch(e) {}
  }

  function applyAllMarkers() {
    for (var tid in threads) applyMarker(tid);
  }

  /* ---- rendering ---- */
  function renderThreadList() {
    threadList.innerHTML = '';
    var tids = Object.keys(threads);
    for (var i = 0; i < tids.length; i++) {
      var tid = tids[i];
      var t = threads[tid];
      var row = document.createElement('div');
      row.className = 'thread-row' + (tid === activeThreadId ? ' active' : '');
      row.setAttribute('data-tid', tid);

      var badge = document.createElement('div');
      var count = threadBadgeCount(t);
      badge.className = 'thread-badge ' + (t.drafts.length > 0 ? 'pending' : count > 0 ? 'sent' : 'empty');
      badge.textContent = String(count || 0);
      row.appendChild(badge);

      var label = document.createElement('div');
      label.className = 'thread-label';
      if (t.selector) {
        var sp = document.createElement('span');
        sp.className = 'thread-label-sel';
        sp.textContent = t.selector;
        label.appendChild(sp);
      } else if (t.selText) {
        label.textContent = '"' + t.selText.slice(0, 30) + (t.selText.length > 30 ? '...' : '') + '"';
        label.style.fontStyle = 'italic';
        label.style.color = '#94a3b8';
      } else {
        var sp2 = document.createElement('span');
        sp2.className = 'thread-label-gen';
        sp2.textContent = 'General note';
        label.appendChild(sp2);
      }
      row.appendChild(label);

      (function(threadId) {
        row.addEventListener('click', function() { setActiveThread(threadId); });
      })(tid);

      threadList.appendChild(row);
    }

    var nd = totalDrafts();
    pendingCount.textContent = nd + ' pending';
    sendBtn.disabled = nd === 0;
  }

  function renderThreadDetail() {
    if (!activeThreadId || !threads[activeThreadId]) {
      tdHeader.textContent = 'Select an element to annotate';
      tdMessages.innerHTML = '<div id="td-empty">Click an element in the page or select a thread above</div>';
      return;
    }
    var t = threads[activeThreadId];
    tdHeader.textContent = t.selector || (t.selText ? '"' + t.selText.slice(0, 40) + '"' : 'General note');

    tdMessages.innerHTML = '';

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
      tdMessages.appendChild(div);
    }

    for (var j = 0; j < t.drafts.length; j++) {
      var d = t.drafts[j];
      var dDiv = document.createElement('div');
      dDiv.className = 'msg msg-draft';
      var dLabel = document.createElement('div');
      dLabel.className = 'msg-draft-label';
      dLabel.textContent = 'Pending - not sent yet';
      dDiv.appendChild(dLabel);
      var dBody = document.createElement('div');
      dBody.className = 'msg-body';
      dBody.textContent = d.prompt;
      dDiv.appendChild(dBody);
      tdMessages.appendChild(dDiv);
    }

    tdMessages.scrollTop = tdMessages.scrollHeight;
  }

  function setActiveThread(tid) {
    activeThreadId = tid;
    renderThreadList();
    renderThreadDetail();
  }

  function createThread(selector, selText) {
    var tid = uid();
    threads[tid] = { threadId: tid, selector: selector || null, selText: selText || null, messages: [], drafts: [] };
    setActiveThread(tid);
    applyMarker(tid);
    return tid;
  }

  function findThreadBySelector(selector) {
    for (var tid in threads) {
      if (threads[tid].selector === selector) return tid;
    }
    return null;
  }

  /* ---- add draft ---- */
  function addDraft(tid, prompt) {
    var t = threads[tid];
    if (!t) return;
    t.drafts.push({ uid: uid(), prompt: prompt });
    applyMarker(tid);
    renderThreadList();
    renderThreadDetail();
    saveDrafts();
  }

  /* ---- send ---- */
  sendBtn.addEventListener('click', function() {
    var batch = [];
    for (var tid in threads) {
      var t = threads[tid];
      for (var i = 0; i < t.drafts.length; i++) {
        var d = t.drafts[i];
        batch.push({ uid: d.uid, threadId: tid, prompt: d.prompt, selector: t.selector, tag: 'note', text: t.selText, target: null });
      }
    }
    if (batch.length === 0) return;
    sendBtn.disabled = true;

    fetch('/api/' + KEY + '/prompts', {
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
      renderThreadList();
      renderThreadDetail();
    }).catch(function() {
      sendBtn.disabled = false;
      renderThreadList();
    });
  });

  /* ---- add note button ---- */
  tdAddBtn.addEventListener('click', function() {
    var text = tdInput.value.trim();
    if (!text) return;
    if (!activeThreadId || !threads[activeThreadId]) return;
    addDraft(activeThreadId, text);
    tdInput.value = '';
  });

  tdInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); tdAddBtn.click(); }
  });

  /* ---- general note ---- */
  addGeneralBtn.addEventListener('click', function() {
    var tid = createThread(null, null);
    tdInput.focus();
  });

  /* ---- postMessage from artifact ---- */
  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'object') return;
    var d = e.data;
    if (d.type === 'loupe:element') {
      var existing = findThreadBySelector(d.selector);
      if (existing) {
        setActiveThread(existing);
      } else {
        createThread(d.selector, null);
        tdInput.focus();
      }
    } else if (d.type === 'loupe:selection') {
      createThread(null, d.text);
      tdInput.focus();
    } else if (d.type === 'loupe:marker-click') {
      setActiveThread(d.threadId);
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
        renderThreadList();
        if (activeThreadId === tid) renderThreadDetail();
      } else {
        // broadcast: create/find general thread
        var btid = '__broadcast__';
        if (!threads[btid]) {
          threads[btid] = { threadId: btid, selector: null, selText: null, messages: [], drafts: [] };
        }
        threads[btid].messages.push({ role: 'agent', uid: data.uid || uid(), content: data.text });
        renderThreadList();
        if (activeThreadId === btid) renderThreadDetail();
        else setActiveThread(btid);
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
    // Restore from server first, then overlay localStorage drafts
    fetch('/api/' + KEY + '/history').then(function(r) {
      return r.ok ? r.json() : { history: [] };
    }).then(function(data) {
      restoreHistory(data.history || []);
      loadDrafts();
      renderThreadList();
      renderThreadDetail();
      // Load artifact after state is ready
      artifactFrame.src = '/artifact/' + KEY + '/';
    }).catch(function() {
      loadDrafts();
      renderThreadList();
      renderThreadDetail();
      artifactFrame.src = '/artifact/' + KEY + '/';
    });
  })();
})();
</script>
</body>
</html>`;
}
