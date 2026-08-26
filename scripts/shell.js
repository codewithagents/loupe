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
  #main { display: flex; flex: 1; min-height: 0; position: relative; }
  #artifact-wrap { flex: 1; position: relative; overflow: hidden; }
  #artifact-frame { width: 100%; height: 100%; border: none; background: white; display: block; }
  .pin { position: absolute; pointer-events: none; border: 2px solid #f59e0b; border-radius: 3px; background: rgba(245,158,11,0.08); z-index: 10; }
  .pin-label { position: absolute; top: -20px; left: 0; background: #f59e0b; color: #000; font-size: 10px; font-weight: 600; padding: 1px 5px; border-radius: 3px; white-space: nowrap; pointer-events: none; }
  #sidebar { width: 340px; display: flex; flex-direction: column; border-left: 1px solid #334155; background: #1e293b; min-height: 0; }
  #pending-area { display: flex; flex-direction: column; border-bottom: 1px solid #334155; min-height: 0; max-height: 55%; }
  #pending-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid #334155; flex-shrink: 0; }
  #pending-header span { font-size: 12px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
  #add-general-btn { font-size: 11px; background: #1d4ed8; color: white; border: none; border-radius: 4px; padding: 3px 8px; cursor: pointer; }
  #add-general-btn:hover { background: #2563eb; }
  #pending-list { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
  .pending-item { background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 8px; position: relative; }
  .pending-item-target { font-family: monospace; font-size: 11px; color: #f59e0b; margin-bottom: 4px; }
  .pending-item-text { font-style: italic; font-size: 11px; color: #94a3b8; margin-bottom: 4px; }
  .pending-item-note { font-size: 13px; color: #e2e8f0; word-break: break-word; }
  .pending-item-remove { position: absolute; top: 6px; right: 6px; background: none; border: none; color: #64748b; cursor: pointer; font-size: 14px; line-height: 1; padding: 2px 4px; }
  .pending-item-remove:hover { color: #f87171; }
  #pending-footer { padding: 8px 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; }
  #pending-count { font-size: 11px; color: #64748b; }
  #send-btn { background: #3b82f6; color: white; border: none; border-radius: 4px; padding: 7px 18px; cursor: pointer; font-size: 13px; font-weight: 500; }
  #send-btn:hover:not(:disabled) { background: #2563eb; }
  #send-btn:disabled { background: #334155; cursor: default; color: #64748b; }
  #conversation { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  #conv-header { font-size: 12px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 10px; border-bottom: 1px solid #334155; flex-shrink: 0; }
  .msg { border-radius: 6px; padding: 8px 10px; font-size: 13px; line-height: 1.5; }
  .msg-user { background: #0f172a; border: 1px solid #334155; }
  .msg-agent { background: #1d4ed8; border: 1px solid #2563eb; }
  .msg-meta { font-size: 11px; color: #64748b; margin-bottom: 3px; }
  .msg-selector { font-family: monospace; font-size: 11px; color: #f59e0b; margin-top: 3px; }
  .msg-text { font-style: italic; color: #94a3b8; margin-top: 3px; font-size: 12px; }
  #status-bar { padding: 4px 12px; font-size: 11px; color: #64748b; background: #0f172a; border-top: 1px solid #334155; flex-shrink: 0; }
  #popup { display: none; position: fixed; z-index: 9999; background: #1e293b; border: 1px solid #3b82f6; border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); padding: 10px; width: 260px; flex-direction: column; gap: 8px; }
  #popup.visible { display: flex; }
  #popup-label { font-size: 11px; color: #94a3b8; }
  #popup-selector { font-family: monospace; font-size: 11px; color: #f59e0b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #popup-seltext { font-size: 11px; font-style: italic; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #popup-input { background: #0f172a; color: #e2e8f0; border: 1px solid #334155; border-radius: 4px; padding: 7px; font-size: 13px; resize: none; height: 70px; outline: none; font-family: inherit; }
  #popup-input:focus { border-color: #3b82f6; }
  #popup-btns { display: flex; gap: 6px; justify-content: flex-end; }
  #popup-cancel { background: none; color: #94a3b8; border: 1px solid #334155; border-radius: 4px; padding: 5px 12px; cursor: pointer; font-size: 12px; }
  #popup-cancel:hover { border-color: #64748b; }
  #popup-add { background: #3b82f6; color: white; border: none; border-radius: 4px; padding: 5px 12px; cursor: pointer; font-size: 12px; font-weight: 500; }
  #popup-add:hover { background: #2563eb; }
</style>
</head>
<body>
<div id="toolbar">
  <span id="toolbar-title">Loupe</span>
  <span id="toolbar-info">Session: ${key}</span>
</div>
<div id="main">
  <div id="artifact-wrap">
    <iframe id="artifact-frame" src="/artifact/${key}/"></iframe>
  </div>
  <div id="sidebar">
    <div id="pending-area">
      <div id="pending-header">
        <span>Pending</span>
        <button id="add-general-btn">+ General note</button>
      </div>
      <div id="pending-list"></div>
      <div id="pending-footer">
        <span id="pending-count">0 annotations</span>
        <button id="send-btn" disabled>Send</button>
      </div>
    </div>
    <div id="conv-header">Conversation</div>
    <div id="conversation"></div>
  </div>
</div>
<div id="status-bar">Connected</div>
<div id="popup">
  <div id="popup-label">Note for element</div>
  <div id="popup-selector" style="display:none"></div>
  <div id="popup-seltext" style="display:none"></div>
  <textarea id="popup-input" placeholder="Type your annotation..."></textarea>
  <div id="popup-btns">
    <button id="popup-cancel">Cancel</button>
    <button id="popup-add">Add</button>
  </div>
</div>
<script>
(function() {
  var key = ${JSON.stringify(key)};
  var pending = [];
  var pinEls = new Map();
  var reloadCounter = 0;

  var conversation = document.getElementById('conversation');
  var pendingList = document.getElementById('pending-list');
  var pendingCount = document.getElementById('pending-count');
  var sendBtn = document.getElementById('send-btn');
  var addGeneralBtn = document.getElementById('add-general-btn');
  var status = document.getElementById('status-bar');
  var artifactFrame = document.getElementById('artifact-frame');
  var artifactWrap = document.getElementById('artifact-wrap');
  var popup = document.getElementById('popup');
  var popupLabel = document.getElementById('popup-label');
  var popupSelector = document.getElementById('popup-selector');
  var popupSeltext = document.getElementById('popup-seltext');
  var popupInput = document.getElementById('popup-input');
  var popupAdd = document.getElementById('popup-add');
  var popupCancel = document.getElementById('popup-cancel');

  var pendingPopupData = null;

  function uid() {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function updatePendingCount() {
    var n = pending.length;
    pendingCount.textContent = n + ' annotation' + (n === 1 ? '' : 's');
    sendBtn.disabled = n === 0;
  }

  function removePendingItem(id) {
    var idx = pending.findIndex(function(p) { return p.uid === id; });
    if (idx !== -1) pending.splice(idx, 1);
    var pin = pinEls.get(id);
    if (pin) { pin.remove(); pinEls.delete(id); }
    renderPendingList();
  }

  function renderPendingList() {
    pendingList.innerHTML = '';
    pending.forEach(function(item) {
      var div = document.createElement('div');
      div.className = 'pending-item';

      if (item.selector) {
        var tgt = document.createElement('div');
        tgt.className = 'pending-item-target';
        tgt.textContent = item.selector;
        div.appendChild(tgt);
      }
      if (item.text) {
        var st = document.createElement('div');
        st.className = 'pending-item-text';
        st.textContent = '"' + item.text.slice(0, 60) + (item.text.length > 60 ? '...' : '') + '"';
        div.appendChild(st);
      }
      var note = document.createElement('div');
      note.className = 'pending-item-note';
      note.textContent = item.prompt;
      div.appendChild(note);

      var rm = document.createElement('button');
      rm.className = 'pending-item-remove';
      rm.textContent = 'x';
      rm.title = 'Remove';
      (function(id) {
        rm.addEventListener('click', function() { removePendingItem(id); });
      })(item.uid);
      div.appendChild(rm);

      pendingList.appendChild(div);
    });
    updatePendingCount();
  }

  function addPin(id, rect) {
    if (!rect || !rect.width) return;
    var frameRect = artifactFrame.getBoundingClientRect();
    var wrapRect = artifactWrap.getBoundingClientRect();
    var pin = document.createElement('div');
    pin.className = 'pin';
    pin.style.left = (frameRect.left - wrapRect.left + rect.left) + 'px';
    pin.style.top = (frameRect.top - wrapRect.top + rect.top) + 'px';
    pin.style.width = Math.max(rect.width, 4) + 'px';
    pin.style.height = Math.max(rect.height, 4) + 'px';
    var lbl = document.createElement('div');
    lbl.className = 'pin-label';
    lbl.textContent = String(pending.length);
    pin.appendChild(lbl);
    artifactWrap.appendChild(pin);
    pinEls.set(id, pin);
  }

  function clearPins() {
    pinEls.forEach(function(el) { el.remove(); });
    pinEls.clear();
  }

  function openPopup(data, anchorRect) {
    pendingPopupData = data;
    popupInput.value = '';

    if (data.selector) {
      popupLabel.textContent = 'Note for element';
      popupSelector.textContent = data.selector;
      popupSelector.style.display = 'block';
    } else {
      popupLabel.textContent = 'General note';
      popupSelector.style.display = 'none';
    }
    if (data.text) {
      popupSeltext.textContent = '"' + data.text.slice(0, 50) + (data.text.length > 50 ? '...' : '') + '"';
      popupSeltext.style.display = 'block';
    } else {
      popupSeltext.style.display = 'none';
    }

    // Position popup anchored to the element rect (in iframe coords -> shell coords)
    if (anchorRect) {
      var frameRect = artifactFrame.getBoundingClientRect();
      var left = frameRect.left + anchorRect.left;
      var top = frameRect.top + anchorRect.top + anchorRect.height + 6;
      // Keep on-screen
      if (left + 260 > window.innerWidth - 8) left = window.innerWidth - 268;
      if (left < 8) left = 8;
      if (top + 200 > window.innerHeight - 8) top = frameRect.top + anchorRect.top - 200 - 6;
      if (top < 8) top = 8;
      popup.style.left = left + 'px';
      popup.style.top = top + 'px';
    } else {
      popup.style.left = '50%';
      popup.style.top = '50%';
      popup.style.transform = 'translate(-50%, -50%)';
    }

    popup.classList.add('visible');
    setTimeout(function() { popupInput.focus(); }, 30);
  }

  function closePopup() {
    popup.classList.remove('visible');
    popup.style.transform = '';
    pendingPopupData = null;
  }

  function confirmPopup() {
    var note = popupInput.value.trim();
    if (!note || !pendingPopupData) return;
    var item = {
      uid: uid(),
      prompt: note,
      selector: pendingPopupData.selector || null,
      tag: 'note',
      text: pendingPopupData.text || null,
      target: null,
      _rect: pendingPopupData.rect || null
    };
    pending.push(item);
    if (item._rect) addPin(item.uid, item._rect);
    renderPendingList();
    closePopup();
  }

  popupAdd.addEventListener('click', confirmPopup);
  popupCancel.addEventListener('click', closePopup);
  popupInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmPopup(); }
    if (e.key === 'Escape') closePopup();
  });

  // Close popup when clicking outside
  document.addEventListener('mousedown', function(e) {
    if (popup.classList.contains('visible') && !popup.contains(e.target)) {
      closePopup();
    }
  });

  addGeneralBtn.addEventListener('click', function() {
    openPopup({ selector: null, text: null, rect: null }, null);
  });

  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'loupe:element') {
      openPopup({ selector: e.data.selector, text: null, rect: e.data.rect }, e.data.rect);
    } else if (e.data.type === 'loupe:selection') {
      openPopup({ selector: null, text: e.data.text, rect: e.data.rect }, e.data.rect);
    }
  });

  sendBtn.addEventListener('click', function() {
    if (pending.length === 0) return;
    sendBtn.disabled = true;
    var batch = pending.map(function(item) {
      return { uid: item.uid, prompt: item.prompt, selector: item.selector, tag: item.tag, text: item.text, target: item.target };
    });
    fetch('/api/' + key + '/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompts: batch })
    }).then(function() {
      batch.forEach(function(item) {
        addMessage('user', item.prompt, item.selector, item.text);
      });
      pending.length = 0;
      clearPins();
      renderPendingList();
    }).catch(function() {
      sendBtn.disabled = false;
      updatePendingCount();
    });
  });

  function addMessage(who, text, selector, selText) {
    var div = document.createElement('div');
    div.className = 'msg msg-' + who;
    var meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.textContent = who === 'user' ? 'You' : 'Agent';
    div.appendChild(meta);
    var body = document.createElement('div');
    body.textContent = text;
    div.appendChild(body);
    if (selector) {
      var sel = document.createElement('div');
      sel.className = 'msg-selector';
      sel.textContent = selector;
      div.appendChild(sel);
    }
    if (selText) {
      var st = document.createElement('div');
      st.className = 'msg-text';
      st.textContent = '"' + selText + '"';
      div.appendChild(st);
    }
    conversation.appendChild(div);
    conversation.scrollTop = conversation.scrollHeight;
  }

  var evtSource = new EventSource('/events/' + key);

  evtSource.addEventListener('reload', function() {
    reloadCounter++;
    clearPins();
    artifactFrame.src = '/artifact/' + key + '/?r=' + reloadCounter;
    status.textContent = 'Page reloaded';
    setTimeout(function() { status.textContent = 'Connected'; }, 2000);
  });

  evtSource.addEventListener('agent-reply', function(e) {
    try {
      var data = JSON.parse(e.data);
      addMessage('agent', data.text, null, null);
    } catch(err) {
      addMessage('agent', e.data, null, null);
    }
  });

  evtSource.onopen = function() { status.textContent = 'Connected'; };
  evtSource.onerror = function() { status.textContent = 'Reconnecting...'; };
})();
</script>
</body>
</html>`;
}
