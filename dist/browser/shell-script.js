const KEY = window.__LOUPE.key;
const API = '/api/' + KEY;
const DRAFTS_KEY = 'loupe:drafts:' + KEY;
const MODE_KEY = 'loupe:send-mode';
const threads = {};
let activeThreadId = null;
let awaitingReply = {};
let reloadCounter = 0;
let artifactReady = false;
let sendMode = 'collect';
let waitSince = null;
let timerInterval = null;
// Scroll position captured before reload, restored on iframe load.
let savedScrollX = 0;
let savedScrollY = 0;
let pendingScrollRestore = false;
try {
    sendMode = localStorage.getItem(MODE_KEY) || 'collect';
}
catch (_e) { }
function qs(id) { return document.getElementById(id); }
const sendBtn = qs('send-btn');
const statusBar = qs('status-bar');
const artifactFrame = qs('artifact-frame');
const orphanBtn = qs('orphan-btn');
const orphanList = qs('orphan-list');
const pollLightEl = qs('poll-light');
const pollLightLabel = qs('poll-light-label');
const pollLightWrap = qs('poll-light-wrap');
const responseTimer = qs('response-timer');
const modalBackdrop = qs('modal-backdrop');
const modalOrphanWarning = qs('modal-orphan-warning');
const modalSnippet = qs('modal-snippet');
const modalSel = qs('modal-sel');
const modalMsgs = qs('modal-msgs');
const modalDoneBtn = qs('modal-done-btn');
const modalCloseBtn = qs('modal-close-btn');
const modalInput = qs('modal-input');
const modalHint = qs('modal-hint');
const modeInstantBtn = qs('mode-instant-btn');
const modeCollectBtn = qs('mode-collect-btn');
/* ---- uid ---- */
function uid() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
}
/* ---- mode toggle ---- */
function setMode(mode) {
    sendMode = mode;
    try {
        localStorage.setItem(MODE_KEY, mode);
    }
    catch (_e) { }
    modeInstantBtn.classList.toggle('active', mode === 'instant');
    modeCollectBtn.classList.toggle('active', mode === 'collect');
    modalHint.textContent = mode === 'instant'
        ? 'Enter: send  Shift+Enter: newline  Esc: close'
        : 'Enter: add note  Shift+Enter: newline  Cmd/Ctrl+Enter: send all  Esc: close';
    updatePendingCount();
}
modeInstantBtn.addEventListener('click', () => setMode('instant'));
modeCollectBtn.addEventListener('click', () => setMode('collect'));
/* ---- response timer ---- */
function startTimer(since = Date.now()) {
    waitSince = since;
    if (timerInterval !== null)
        clearInterval(timerInterval);
    const tick = () => {
        if (waitSince === null)
            return;
        const secs = Math.round((Date.now() - waitSince) / 1000);
        responseTimer.textContent = `waiting ${secs}s`;
        responseTimer.style.display = '';
    };
    tick();
    timerInterval = window.setInterval(tick, 1000);
}
function stopTimer() {
    if (timerInterval !== null) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    waitSince = null;
    responseTimer.style.display = 'none';
}
function updatePollLight(state, workingSince) {
    pollLightEl.setAttribute('data-state', state);
    const labels = {
        polling: 'Agent listening',
        working: 'Agent working',
        idle: 'Not polling',
    };
    const titles = {
        polling: 'Agent connected and listening',
        working: 'Agent working on feedback',
        idle: 'Agent not polling',
    };
    pollLightLabel.textContent = labels[state];
    pollLightWrap.title = titles[state];
    if (state === 'working')
        startTimer(workingSince ?? Date.now());
    else
        stopTimer();
    try {
        artifactFrame.contentWindow?.postMessage({ type: 'loupe:agent-presence', state }, '*');
    }
    catch (_e) { }
}
/* ---- pending count / send button ---- */
function totalDrafts() {
    let n = 0;
    for (const tid in threads)
        n += threads[tid].drafts.length;
    return n;
}
function updatePendingCount() {
    const n = totalDrafts();
    if (sendMode === 'collect') {
        sendBtn.style.display = '';
        if (n > 0) {
            sendBtn.textContent = `Send feedback (${n})  Cmd+Enter`;
            sendBtn.disabled = false;
            sendBtn.classList.add('has-pending');
        }
        else {
            sendBtn.textContent = 'Send (Cmd+Enter)';
            sendBtn.disabled = true;
            sendBtn.classList.remove('has-pending');
        }
    }
    else {
        sendBtn.style.display = 'none';
    }
}
/* ---- orphan badge ---- */
function updateOrphanBadge() {
    const orphaned = [];
    for (const tid in threads) {
        if (threads[tid].orphaned)
            orphaned.push(tid);
    }
    if (orphaned.length === 0) {
        orphanBtn.style.display = 'none';
        orphanList.style.display = 'none';
        return;
    }
    orphanBtn.style.display = '';
    orphanBtn.textContent = `Orphaned (${orphaned.length})`;
    orphanList.innerHTML = '';
    for (const oid of orphaned) {
        const t = threads[oid];
        const row = document.createElement('button');
        row.className = 'orphan-row';
        const snippetEl = document.createElement('div');
        snippetEl.className = 'orphan-row-snippet';
        snippetEl.textContent = t.contentSnippet || t.selector || 'General note';
        row.appendChild(snippetEl);
        const selEl = document.createElement('div');
        selEl.className = 'orphan-row-sel';
        selEl.textContent = t.selector || '';
        row.appendChild(selEl);
        row.addEventListener('click', () => {
            orphanList.style.display = 'none';
            openModal(oid);
        });
        orphanList.appendChild(row);
    }
}
orphanBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    orphanList.style.display = orphanList.style.display === 'none' ? 'block' : 'none';
});
document.addEventListener('click', () => { orphanList.style.display = 'none'; });
/* ---- marker state ---- */
function markerState(t) {
    if (t.done)
        return 'done';
    if (t.messages.length > 0) {
        return t.messages[t.messages.length - 1].role === 'agent' ? 'agent-last' : 'user-last';
    }
    return 'drafts-only';
}
/* ---- markers ---- */
function applyMarker(tid) {
    const t = threads[tid];
    if (!t || !t.selector || t.orphaned)
        return;
    if (!artifactReady)
        return;
    const count = t.messages.length + t.drafts.length;
    try {
        artifactFrame.contentWindow?.postMessage({
            type: 'loupe:add-marker',
            threadId: tid,
            selector: t.selector,
            count,
            state: markerState(t),
        }, '*');
    }
    catch (_e) { }
}
function applyAllMarkers() {
    for (const tid in threads)
        applyMarker(tid);
    checkAllAnchors();
}
/* ---- anchor checking ---- */
function checkAllAnchors() {
    const toCheck = [];
    for (const tid in threads) {
        const t = threads[tid];
        if (t.selector || t.contentSnippet) {
            toCheck.push({ threadId: tid, selector: t.selector || null, contentSnippet: t.contentSnippet || null });
        }
    }
    if (toCheck.length === 0)
        return;
    try {
        artifactFrame.contentWindow?.postMessage({ type: 'loupe:check-anchors', threads: toCheck }, '*');
    }
    catch (_e) { }
}
/* ---- localStorage drafts ---- */
function saveDrafts() {
    const all = [];
    for (const tid in threads) {
        const t = threads[tid];
        for (const d of t.drafts) {
            all.push({ uid: d.uid, threadId: tid, prompt: d.prompt, selector: t.selector, selText: t.selText, contentSnippet: t.contentSnippet || null });
        }
    }
    try {
        localStorage.setItem(DRAFTS_KEY, JSON.stringify(all));
    }
    catch (_e) { }
}
function loadDrafts() {
    try {
        const stored = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]');
        for (const d of stored) {
            if (!threads[d.threadId]) {
                threads[d.threadId] = { threadId: d.threadId, selector: d.selector || null, selText: d.selText || null, contentSnippet: d.contentSnippet || null, messages: [], drafts: [], done: false, orphaned: false };
            }
            threads[d.threadId].drafts.push({ uid: d.uid, prompt: d.prompt });
        }
    }
    catch (_e) { }
}
/* ---- restore from server history ---- */
function restoreHistory(history, doneThreadIds) {
    for (const item of history) {
        const tid = item.threadId || item.uid;
        if (!threads[tid]) {
            const selector = item.role === 'user' ? (item.selector || null) : null;
            const contentSnippet = item.role === 'user' ? (item.contentSnippet || null) : null;
            const selText = item.role === 'user' ? (item.text || null) : null;
            threads[tid] = { threadId: tid, selector, selText, contentSnippet, messages: [], drafts: [], done: false, orphaned: false };
        }
        else if (!threads[tid].contentSnippet && item.role === 'user' && item.contentSnippet) {
            threads[tid].contentSnippet = item.contentSnippet;
        }
        if (item.role === 'user') {
            threads[tid].messages.push({ role: 'user', uid: item.uid, content: item.prompt });
        }
        else if (item.role === 'agent') {
            threads[tid].messages.push({ role: 'agent', uid: item.uid, content: item.text });
        }
    }
    for (const dtid of (doneThreadIds || [])) {
        if (threads[dtid])
            threads[dtid].done = true;
    }
}
/* ---- modal rendering ---- */
function renderModal(tid) {
    const t = threads[tid];
    if (!t)
        return;
    modalOrphanWarning.style.display = t.orphaned ? 'block' : 'none';
    modalSnippet.textContent = t.contentSnippet || t.selector || 'General note';
    modalSel.textContent = t.selector || (t.selText ? `"${t.selText.slice(0, 50)}"` : '');
    modalDoneBtn.classList.toggle('done', !!t.done);
    modalDoneBtn.textContent = t.done ? 'Reopen (Cmd+D)' : 'Resolve (Cmd+D)';
    modalMsgs.innerHTML = '';
    if (t.messages.length === 0 && t.drafts.length === 0) {
        const empty = document.createElement('div');
        empty.id = 'modal-empty';
        empty.textContent = 'No messages yet';
        modalMsgs.appendChild(empty);
    }
    else {
        for (const m of t.messages) {
            const div = document.createElement('div');
            div.className = 'msg ' + (m.role === 'user' ? 'msg-user' : 'msg-agent');
            const meta = document.createElement('div');
            meta.className = 'msg-meta';
            meta.textContent = m.role === 'user' ? 'You' : 'Agent';
            div.appendChild(meta);
            const body = document.createElement('div');
            body.className = 'msg-body';
            body.textContent = m.content;
            div.appendChild(body);
            modalMsgs.appendChild(div);
        }
        for (const dft of t.drafts) {
            const dDiv = document.createElement('div');
            dDiv.className = 'msg msg-draft';
            const dLabel = document.createElement('div');
            dLabel.className = 'msg-draft-label';
            dLabel.textContent = 'Pending - not sent yet';
            dDiv.appendChild(dLabel);
            const dBody = document.createElement('div');
            dBody.className = 'msg-body';
            dBody.textContent = dft.prompt;
            dDiv.appendChild(dBody);
            modalMsgs.appendChild(dDiv);
        }
    }
    modalMsgs.scrollTop = modalMsgs.scrollHeight;
}
function openModal(tid) {
    if (!threads[tid])
        return;
    activeThreadId = tid;
    renderModal(tid);
    modalBackdrop.classList.add('open');
    setTimeout(() => { modalInput.focus(); }, 50);
}
function closeModal() {
    modalBackdrop.classList.remove('open');
    activeThreadId = null;
    modalInput.value = '';
}
/* ---- done toggle ---- */
modalDoneBtn.addEventListener('click', () => {
    if (!activeThreadId || !threads[activeThreadId])
        return;
    const tid = activeThreadId;
    threads[tid].done = !threads[tid].done;
    applyMarker(tid);
    renderModal(tid);
    fetch(`${API}/thread/${encodeURIComponent(tid)}/done`, { method: 'POST' }).catch(() => { });
});
/* ---- close modal ---- */
modalCloseBtn.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop)
    closeModal(); });
document.addEventListener('keydown', (e) => {
    const isModal = modalBackdrop.classList.contains('open');
    if (e.key === 'Escape' && isModal) {
        closeModal();
        return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'd' && isModal) {
        e.preventDefault();
        if (activeThreadId && threads[activeThreadId])
            modalDoneBtn.click();
    }
});
/* ---- modal compose ---- */
modalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.shiftKey)
        return;
    const isMeta = e.metaKey || e.ctrlKey;
    if (e.key === 'Enter' && !isMeta) {
        e.preventDefault();
        const text = modalInput.value.trim();
        if (!text || !activeThreadId || !threads[activeThreadId])
            return;
        addDraft(activeThreadId, text);
        modalInput.value = '';
        if (sendMode === 'instant')
            sendAll();
    }
    else if (e.key === 'Enter' && isMeta) {
        e.preventDefault();
        const text = modalInput.value.trim();
        if (text && activeThreadId && threads[activeThreadId]) {
            addDraft(activeThreadId, text);
            modalInput.value = '';
        }
        sendAll();
    }
    else if (e.key === 'Escape') {
        closeModal();
    }
});
/* ---- thread helpers ---- */
function findThreadBySelector(selector) {
    for (const tid in threads) {
        if (threads[tid].selector === selector)
            return tid;
    }
    return null;
}
function addNoteFromIframe(selector, noteText, contentSnippet) {
    let targetTid;
    if (selector) {
        const existing = findThreadBySelector(selector);
        if (existing) {
            targetTid = existing;
            if (!threads[targetTid].contentSnippet && contentSnippet)
                threads[targetTid].contentSnippet = contentSnippet;
        }
        else {
            targetTid = uid();
            threads[targetTid] = { threadId: targetTid, selector, selText: null, contentSnippet: contentSnippet || null, messages: [], drafts: [], done: false, orphaned: false };
        }
        activeThreadId = targetTid;
    }
    else {
        targetTid = uid();
        threads[targetTid] = { threadId: targetTid, selector: null, selText: null, contentSnippet: contentSnippet || null, messages: [], drafts: [], done: false, orphaned: false };
        activeThreadId = targetTid;
    }
    addDraft(targetTid, noteText);
    if (sendMode === 'instant')
        sendAll();
}
/* ---- add draft ---- */
function addDraft(tid, prompt) {
    const t = threads[tid];
    if (!t)
        return;
    t.drafts.push({ uid: uid(), prompt });
    applyMarker(tid);
    updatePendingCount();
    saveDrafts();
    if (activeThreadId === tid && modalBackdrop.classList.contains('open'))
        renderModal(tid);
}
/* ---- send all drafts ---- */
function sendAll() {
    const batch = [];
    const sentTids = {};
    for (const tid in threads) {
        const t = threads[tid];
        for (const d of t.drafts) {
            batch.push({ uid: d.uid, threadId: tid, prompt: d.prompt, selector: t.selector, tag: 'note', text: t.selText, target: null, contentSnippet: t.contentSnippet || null });
            sentTids[tid] = true;
        }
    }
    if (batch.length === 0)
        return;
    sendBtn.disabled = true;
    sendBtn.classList.remove('has-pending');
    fetch(`${API}/prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompts: batch }),
    }).then(() => {
        for (const tid in threads) {
            const t = threads[tid];
            for (const d of t.drafts) {
                t.messages.push({ role: 'user', uid: d.uid, content: d.prompt });
            }
            t.drafts = [];
            applyMarker(tid);
        }
        try {
            localStorage.removeItem(DRAFTS_KEY);
        }
        catch (_e) { }
        for (const stid in sentTids)
            awaitingReply[stid] = true;
        statusBar.textContent = 'Sent - waiting for agent...';
        updatePendingCount();
        if (activeThreadId && modalBackdrop.classList.contains('open'))
            renderModal(activeThreadId);
    }).catch(() => {
        updatePendingCount();
    });
}
sendBtn.addEventListener('click', sendAll);
/* ---- postMessage from artifact iframe ---- */
window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data !== 'object')
        return;
    const d = e.data;
    if (d.type === 'loupe:element') {
        // element hover context, no state needed here
    }
    else if (d.type === 'loupe:note') {
        if (d.text)
            addNoteFromIframe(d.selector || null, d.text, d.contentSnippet || null);
    }
    else if (d.type === 'loupe:send-all') {
        sendAll();
    }
    else if (d.type === 'loupe:marker-click') {
        openModal(d.threadId);
    }
    else if (d.type === 'loupe:anchor-report') {
        for (const r of d.results) {
            const t = threads[r.threadId];
            if (!t)
                continue;
            const wasOrphaned = t.orphaned;
            t.orphaned = !!r.orphaned;
            if (!r.orphaned) {
                if (r.selector && r.selector !== t.selector)
                    t.selector = r.selector;
                if (wasOrphaned)
                    applyMarker(r.threadId);
            }
            else {
                try {
                    artifactFrame.contentWindow?.postMessage({ type: 'loupe:remove-marker', threadId: r.threadId }, '*');
                }
                catch (_ex) { }
            }
        }
        updateOrphanBadge();
        if (activeThreadId && modalBackdrop.classList.contains('open'))
            renderModal(activeThreadId);
    }
});
/* ---- SSE ---- */
const evtSource = new EventSource('/events/' + KEY);
evtSource.addEventListener('reload', () => {
    reloadCounter++;
    artifactReady = false;
    // Capture scroll position before the reload clears the page.
    try {
        const cw = artifactFrame.contentWindow;
        if (cw) {
            savedScrollX = cw.scrollX;
            savedScrollY = cw.scrollY;
            pendingScrollRestore = true;
        }
    }
    catch (_e) { }
    artifactFrame.src = '/artifact/' + KEY + '/?r=' + reloadCounter;
    statusBar.textContent = 'Reloading...';
});
evtSource.addEventListener('agent-reply', (e) => {
    try {
        const data = JSON.parse(e.data);
        const tid = data.threadId;
        if (tid && threads[tid]) {
            threads[tid].messages.push({ role: 'agent', uid: data.uid || uid(), content: data.text });
            applyMarker(tid);
            delete awaitingReply[tid];
            if (Object.keys(awaitingReply).length === 0) {
                statusBar.textContent = 'Connected';
                stopTimer();
            }
            if (activeThreadId === tid && modalBackdrop.classList.contains('open'))
                renderModal(tid);
        }
        else {
            const btid = '__broadcast__';
            if (!threads[btid]) {
                threads[btid] = { threadId: btid, selector: null, selText: null, contentSnippet: null, messages: [], drafts: [], done: false, orphaned: false };
            }
            threads[btid].messages.push({ role: 'agent', uid: data.uid || uid(), content: data.text });
            if (activeThreadId === btid && modalBackdrop.classList.contains('open'))
                renderModal(btid);
            else
                openModal(btid);
        }
    }
    catch (_err) { }
});
evtSource.addEventListener('agent-presence', (e) => {
    try {
        const data = JSON.parse(e.data);
        updatePollLight(data.state, data.workingSince);
    }
    catch (_err) { }
});
evtSource.onopen = () => { statusBar.textContent = 'Connected'; };
evtSource.onerror = () => { statusBar.textContent = 'Reconnecting...'; };
/* ---- iframe load ---- */
artifactFrame.addEventListener('load', () => {
    artifactReady = true;
    statusBar.textContent = 'Connected';
    if (pendingScrollRestore) {
        pendingScrollRestore = false;
        const sx = savedScrollX;
        const sy = savedScrollY;
        try {
            artifactFrame.contentWindow?.scrollTo(sx, sy);
        }
        catch (_e) { }
    }
    setTimeout(applyAllMarkers, 50);
});
/* ---- init ---- */
(function init() {
    setMode(sendMode);
    fetch(`${API}/history`)
        .then((r) => r.ok ? r.json() : Promise.resolve({ history: [], doneThreadIds: [] }))
        .then((data) => {
        restoreHistory(data.history || [], data.doneThreadIds || []);
        loadDrafts();
        updatePendingCount();
        artifactFrame.src = '/artifact/' + KEY + '/';
    })
        .catch(() => {
        loadDrafts();
        updatePendingCount();
        artifactFrame.src = '/artifact/' + KEY + '/';
    });
})();
export {};
