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
  #mode-toggle { display: flex; border: 1px solid #334155; border-radius: 4px; overflow: hidden; flex-shrink: 0; }
  .mode-btn { background: transparent; color: #64748b; border: none; padding: 3px 10px; cursor: pointer; font-size: 12px; white-space: nowrap; }
  .mode-btn:hover { color: #e2e8f0; }
  .mode-btn.active { background: #334155; color: #e2e8f0; }
  #toolbar-spacer { flex: 1; }
  #poll-light-wrap { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #94a3b8; cursor: default; white-space: nowrap; }
  #poll-light { width: 8px; height: 8px; border-radius: 50%; background: #475569; flex-shrink: 0; transition: background 0.3s; }
  #poll-light[data-state="polling"] { background: #22c55e; }
  #poll-light[data-state="working"] { background: #f59e0b; }
  #response-timer { font-size: 12px; color: #60a5fa; white-space: nowrap; display: none; font-variant-numeric: tabular-nums; }
  #orphan-wrap { position: relative; }
  #orphan-btn { background: #b45309; color: #fef3c7; border: none; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 12px; font-weight: 500; white-space: nowrap; display: none; }
  #orphan-btn:hover { background: #92400e; }
  #orphan-list { display: none; position: absolute; top: calc(100% + 6px); right: 0; background: #1e293b; border: 1px solid #334155; border-radius: 8px; min-width: 260px; max-height: 280px; overflow-y: auto; box-shadow: 0 8px 24px rgba(0,0,0,0.5); z-index: 8000; }
  .orphan-row { display: block; width: 100%; text-align: left; background: transparent; border: none; border-bottom: 1px solid #0f172a; padding: 9px 14px; cursor: pointer; color: #e2e8f0; font-size: 12px; }
  .orphan-row:hover { background: #0f172a; }
  .orphan-row-snippet { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .orphan-row-sel { font-family: monospace; font-size: 10px; color: #64748b; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @keyframes loupe-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(59,130,246,0.55)} 50%{box-shadow:0 0 0 6px rgba(59,130,246,0)} }
  #send-btn { background: #3b82f6; color: white; border: none; border-radius: 4px; padding: 5px 12px; cursor: pointer; font-size: 12px; font-weight: 500; white-space: nowrap; }
  #send-btn:hover:not(:disabled) { background: #2563eb; }
  #send-btn:disabled { background: #334155; color: #64748b; cursor: default; }
  #send-btn.has-pending { background: #2563eb; animation: loupe-pulse 2s infinite; }
  #reset-btn { background: transparent; color: #64748b; border: 1px solid #334155; border-radius: 4px; padding: 3px 9px; cursor: pointer; font-size: 12px; white-space: nowrap; }
  #reset-btn:hover { color: #f87171; border-color: #7f1d1d; }
  #reset-confirm { display: none; align-items: center; gap: 6px; font-size: 12px; color: #fca5a5; white-space: nowrap; }
  #reset-confirm.visible { display: flex; }
  #reset-yes-btn { background: #7f1d1d; color: #fecaca; border: 1px solid #b91c1c; border-radius: 4px; padding: 3px 8px; cursor: pointer; font-size: 12px; }
  #reset-yes-btn:hover { background: #991b1b; }
  #reset-no-btn { background: transparent; color: #64748b; border: 1px solid #334155; border-radius: 4px; padding: 3px 8px; cursor: pointer; font-size: 12px; }
  #reset-no-btn:hover { color: #e2e8f0; }
  #artifact-wrap { flex: 1; min-height: 0; }
  #artifact-frame { width: 100%; height: 100%; border: none; background: white; display: block; }
  #status-bar { padding: 3px 12px; font-size: 11px; color: #64748b; background: #0f172a; border-top: 1px solid #334155; flex-shrink: 0; }

  /* Modal overlay */
  #modal-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9000; align-items: center; justify-content: center; }
  #modal-backdrop.open { display: flex; }
  #modal { background: #1e293b; border: 1px solid #334155; border-radius: 12px; width: 520px; max-width: calc(100vw - 32px); max-height: calc(100vh - 64px); display: flex; flex-direction: column; box-shadow: 0 24px 64px rgba(0,0,0,0.6); overflow: hidden; }

  /* Modal header */
  #modal-hdr { padding: 16px 16px 12px; border-bottom: 1px solid #334155; flex-shrink: 0; }
  #modal-orphan-warning { display: none; background: #451a03; border: 1px solid #92400e; border-radius: 5px; padding: 6px 10px; margin-bottom: 10px; font-size: 12px; color: #fbbf24; }
  #modal-snippet { font-size: 17px; font-weight: 700; color: #f8fafc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 3px; }
  #modal-sel { font-family: monospace; font-size: 11px; color: #f59e0b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 10px; }
  #modal-hdr-actions { display: flex; gap: 8px; align-items: center; }
  #modal-done-btn { background: #334155; color: #e2e8f0; border: 1px solid #475569; border-radius: 5px; padding: 5px 12px; cursor: pointer; font-size: 12px; font-weight: 500; white-space: nowrap; }
  #modal-done-btn:hover { background: #475569; }
  #modal-done-btn.done { background: #4b5563; color: #9ca3af; border-color: #6b7280; }
  #modal-close-btn { background: transparent; color: #94a3b8; border: 1px solid #334155; border-radius: 5px; padding: 5px 10px; cursor: pointer; font-size: 12px; white-space: nowrap; margin-left: auto; }
  #modal-close-btn:hover { background: #0f172a; color: #e2e8f0; }

  /* Modal messages */
  #modal-msgs { overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; min-height: 80px; max-height: 40vh; }
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
  <div id="mode-toggle">
    <button class="mode-btn" id="mode-instant-btn">Instant</button>
    <button class="mode-btn active" id="mode-collect-btn">Collect</button>
  </div>
  <span id="toolbar-spacer"></span>
  <span id="poll-light-wrap" title="Agent not polling">
    <span id="poll-light" data-state="idle"></span>
    <span id="poll-light-label">Not polling</span>
  </span>
  <span id="response-timer"></span>
  <span id="orphan-wrap">
    <button id="orphan-btn">&#x26A0; Orphaned (0)</button>
    <div id="orphan-list"></div>
  </span>
  <button id="reset-btn" title="Remove all comments and start fresh">Reset</button>
  <span id="reset-confirm">Remove all comments? <button id="reset-yes-btn">Yes, reset</button><button id="reset-no-btn">Cancel</button></span>
  <button id="send-btn" disabled>Send (&#x2318;&#x21B5;)</button>
</div>
<div id="artifact-wrap">
  <iframe id="artifact-frame"></iframe>
</div>
<div id="status-bar">Connecting...</div>
<div id="modal-backdrop">
  <div id="modal">
    <div id="modal-hdr">
      <div id="modal-orphan-warning">&#x26A0; Anchor lost - the element this referred to changed or was removed</div>
      <div id="modal-snippet"></div>
      <div id="modal-sel"></div>
      <div id="modal-hdr-actions">
        <button id="modal-done-btn">Resolve (Cmd+D)</button>
        <button id="modal-close-btn">Close (Esc)</button>
      </div>
    </div>
    <div id="modal-msgs"></div>
    <div id="modal-compose">
      <textarea id="modal-input" placeholder="Continue the thread..."></textarea>
      <div id="modal-hint"></div>
    </div>
  </div>
</div>
<script>window.__LOUPE=${JSON.stringify({ key, port, version })};</script>
<script type="module" src="/shell-script.js"></script>
</body>
</html>`;
}
