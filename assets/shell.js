export function renderShell(key, port) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Loupe Review</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; height: 100vh; background: #0f172a; color: #e2e8f0; }
  #toolbar { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #1e293b; border-bottom: 1px solid #334155; font-size: 13px; }
  #toolbar-title { font-weight: 600; color: #f8fafc; }
  #toolbar-info { color: #94a3b8; font-size: 12px; }
  #toolbar-selected { color: #f59e0b; font-size: 12px; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #main { display: flex; flex: 1; min-height: 0; }
  #artifact-frame { flex: 1; border: none; background: white; }
  #sidebar { width: 340px; display: flex; flex-direction: column; border-left: 1px solid #334155; background: #1e293b; }
  #conversation { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  .msg { border-radius: 6px; padding: 8px 10px; font-size: 13px; line-height: 1.5; }
  .msg-user { background: #0f172a; border: 1px solid #334155; }
  .msg-agent { background: #1d4ed8; border: 1px solid #2563eb; }
  .msg-meta { font-size: 11px; color: #64748b; margin-bottom: 3px; }
  .msg-selector { font-family: monospace; font-size: 11px; color: #f59e0b; margin-top: 3px; }
  .msg-text { font-style: italic; color: #94a3b8; margin-top: 3px; font-size: 12px; }
  #compose { padding: 10px; border-top: 1px solid #334155; display: flex; flex-direction: column; gap: 6px; }
  #compose textarea { background: #0f172a; color: #e2e8f0; border: 1px solid #334155; border-radius: 4px; padding: 8px; font-size: 13px; resize: vertical; min-height: 60px; outline: none; font-family: inherit; }
  #compose textarea:focus { border-color: #3b82f6; }
  #send-btn { background: #3b82f6; color: white; border: none; border-radius: 4px; padding: 8px 16px; cursor: pointer; font-size: 13px; font-weight: 500; align-self: flex-end; }
  #send-btn:hover { background: #2563eb; }
  #send-btn:disabled { background: #334155; cursor: default; color: #64748b; }
  #status-bar { padding: 4px 12px; font-size: 11px; color: #64748b; background: #0f172a; border-top: 1px solid #334155; }
</style>
</head>
<body>
<div id="toolbar">
  <span id="toolbar-title">Loupe</span>
  <span id="toolbar-info">Session: ${key}</span>
  <span id="toolbar-selected" id="selected-display"></span>
</div>
<div id="main">
  <iframe id="artifact-frame" src="/artifact/${key}/"></iframe>
  <div id="sidebar">
    <div id="conversation"></div>
    <div id="compose">
      <textarea id="message-input" placeholder="Click an element or select text in the page, then type your note here..."></textarea>
      <button id="send-btn">Send</button>
    </div>
  </div>
</div>
<div id="status-bar" id="status">Connected</div>
<script>
(function() {
  var key = ${JSON.stringify(key)};
  var currentSelector = null;
  var currentText = null;
  var msgCount = 0;

  var conversation = document.getElementById('conversation');
  var input = document.getElementById('message-input');
  var sendBtn = document.getElementById('send-btn');
  var selectedDisplay = document.getElementById('toolbar-selected');
  var status = document.getElementById('status-bar');

  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'loupe:element') {
      currentSelector = e.data.selector;
      selectedDisplay.textContent = 'Selected: ' + e.data.selector;
    } else if (e.data.type === 'loupe:selection') {
      currentText = e.data.text;
      selectedDisplay.textContent = 'Text: "' + e.data.text.slice(0, 60) + (e.data.text.length > 60 ? '...' : '') + '"';
    }
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

  sendBtn.addEventListener('click', function() {
    var text = input.value.trim();
    if (!text) return;
    sendBtn.disabled = true;

    var uid = crypto.randomUUID();
    var prompt = {
      uid: uid,
      prompt: text,
      selector: currentSelector,
      tag: 'note',
      text: currentText,
      target: null
    };

    fetch('/api/' + key + '/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompts: [prompt] })
    }).then(function() {
      addMessage('user', text, currentSelector, currentText);
      input.value = '';
      currentSelector = null;
      currentText = null;
      selectedDisplay.textContent = '';
      sendBtn.disabled = false;
    }).catch(function() {
      sendBtn.disabled = false;
    });
  });

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      sendBtn.click();
    }
  });

  var evtSource = new EventSource('/events/' + key);

  evtSource.addEventListener('reload', function() {
    document.getElementById('artifact-frame').src = '/artifact/' + key + '/?' + Date.now();
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
