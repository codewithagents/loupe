// Key is passed as a query param on the module script src URL.
const key = new URL(import.meta.url).searchParams.get('key') ?? '';
let hoverOv = null;
let selOv = null;
let selectedEl = null;
let composeBox = null;
let markerContainer = null;
let markers = {};
let presenceWorking = false;
// Draft persistence: survives the artifact iframe being torn down and reloaded
// (the shell reloads the artifact whenever the underlying file changes on disk).
// sessionStorage is scoped to the tab + origin, not to a specific document instance,
// so it survives `artifactFrame.src = ...` reassignment as long as the iframe stays
// same-origin with the shell, which it is here (both served by the loupe server).
const DRAFT_KEY = 'loupe:compose-draft:' + key;
const TEXTAREA_MIN_HEIGHT = 56;
const TEXTAREA_MAX_HEIGHT = 200;
// Set while a compose box is open, to flush its latest state to sessionStorage
// on pagehide (fired just before the iframe document is torn down on reload).
let persistCurrentDraft = null;
// Cancels the currently open box's pending "focus was lost" flip (see the blur
// handler in openCompose). pagehide calls this before persisting, so a blur that
// only happened because the iframe document is mid-teardown never gets a chance
// to record "not focused" before we capture the final draft state.
let cancelPendingFocusFlip = null;
function clearPersistedDraft() {
    try {
        sessionStorage.removeItem(DRAFT_KEY);
    }
    catch (_e) { }
}
// Inject pulse keyframe once at module load.
const _pulseStyle = document.createElement('style');
_pulseStyle.textContent = '@keyframes loupe-pulse{0%,100%{box-shadow:0 2px 6px rgba(0,0,0,0.35),0 0 0 0 rgba(245,158,11,0.55)}50%{box-shadow:0 2px 6px rgba(0,0,0,0.35),0 0 0 5px rgba(245,158,11,0)}} .loupe-awaiting-pulse{animation:loupe-pulse 1.4s ease-in-out infinite;}';
document.head.appendChild(_pulseStyle);
function buildSelector(el) {
    const parts = [];
    let node = el;
    for (let i = 0; i < 5 && node && node !== document.body && node !== document.documentElement; i++) {
        if (node.id) {
            parts.unshift('#' + CSS.escape(node.id));
            break;
        }
        const tag = node.tagName.toLowerCase();
        const parent = node.parentElement;
        if (parent) {
            const siblings = Array.from(parent.children).filter(c => c.tagName === node.tagName);
            if (siblings.length > 1) {
                const idx = siblings.indexOf(node) + 1;
                parts.unshift(`${tag}:nth-of-type(${idx})`);
            }
            else {
                parts.unshift(tag);
            }
        }
        else {
            parts.unshift(tag);
        }
        node = node.parentElement;
    }
    return parts.join(' > ');
}
function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
}
function getContentSnippet(el) {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    return text.length > 80 ? text.slice(0, 80) + '…' : text;
}
function isLoupeEl(el) {
    if (!(el instanceof Element))
        return false;
    if (markerContainer?.contains(el))
        return true;
    if (composeBox?.contains(el))
        return true;
    return false;
}
/* ---- markers ---- */
function getMarkerContainer() {
    if (!markerContainer) {
        markerContainer = document.createElement('div');
        markerContainer.setAttribute('data-loupe-container', '1');
        markerContainer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000;overflow:visible';
        document.body.appendChild(markerContainer);
    }
    return markerContainer;
}
function applyPulse(el, state) {
    el.classList.toggle('loupe-awaiting-pulse', state === 'user-last' && presenceWorking);
}
function updateMarkerStyle(el, count, state) {
    if (state === 'done') {
        el.style.background = '#4b5563';
        el.style.color = '#22c55e';
        el.style.border = '2px solid rgba(0,0,0,0.1)';
        el.textContent = '✓';
    }
    else if (state === 'agent-last') {
        el.style.background = '#3b82f6';
        el.style.color = '#fff';
        el.style.border = '2px solid rgba(0,0,0,0.15)';
        el.textContent = String(count);
    }
    else if (state === 'interim') {
        el.style.background = '#1e3a5f';
        el.style.color = '#93c5fd';
        el.style.border = '2px dashed #3b82f6';
        el.textContent = '…';
    }
    else if (state === 'queued') {
        el.style.background = 'transparent';
        el.style.color = '#f59e0b';
        el.style.border = '2px dashed #f59e0b';
        el.textContent = String(count);
    }
    else if (state === 'user-last') {
        el.style.background = '#f59e0b';
        el.style.color = '#000';
        el.style.border = '2px solid rgba(0,0,0,0.15)';
        el.textContent = String(count);
    }
    else {
        el.style.background = 'transparent';
        el.style.color = '#94a3b8';
        el.style.border = '2px solid #94a3b8';
        el.textContent = String(count);
    }
    applyPulse(el, state);
}
function makeMarkerEl(threadId, count, state) {
    const el = document.createElement('button');
    el.setAttribute('data-loupe-marker', threadId);
    el.style.cssText = 'position:absolute;pointer-events:auto;width:22px;height:22px;border-radius:50%;font-size:10px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.35);line-height:1;padding:0;transition:transform 0.1s;';
    updateMarkerStyle(el, count, state);
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        closeCompose();
        window.parent.postMessage({ type: 'loupe:marker-click', threadId }, '*');
    });
    el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.2)'; });
    el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    return el;
}
function positionMarker(el, selector) {
    if (!selector) {
        el.style.display = 'none';
        return;
    }
    const target = document.querySelector(selector);
    if (!target) {
        el.style.display = 'none';
        return;
    }
    const r = target.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
        el.style.display = 'none';
        return;
    }
    // Hide when anchor is fully out of the viewport (no clamping).
    if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) {
        el.style.display = 'none';
        return;
    }
    el.style.display = 'flex';
    el.style.top = `${r.top - 11}px`;
    el.style.left = `${r.right - 11}px`;
}
/* ---- overlays ---- */
function placeOv(ov, el) {
    const r = el.getBoundingClientRect();
    ov.style.top = `${r.top}px`;
    ov.style.left = `${r.left}px`;
    ov.style.width = `${r.width}px`;
    ov.style.height = `${r.height}px`;
}
function ensureHoverOv() {
    if (!hoverOv) {
        hoverOv = document.createElement('div');
        hoverOv.style.cssText = 'position:fixed;pointer-events:none;border:2px solid rgba(245,158,11,0.6);border-radius:2px;box-sizing:border-box;z-index:2147483645;transition:all 0.08s;display:none;';
        document.body.appendChild(hoverOv);
    }
    return hoverOv;
}
function showSelOv(el) {
    if (!selOv) {
        selOv = document.createElement('div');
        selOv.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #3b82f6;border-radius:2px;box-sizing:border-box;z-index:2147483646;box-shadow:0 0 0 3px rgba(59,130,246,0.2);display:none;';
        document.body.appendChild(selOv);
    }
    placeOv(selOv, el);
    selOv.style.display = 'block';
}
/* ---- inline compose ---- */
// Keeps the compose box anchored under (or above, if it would overflow) its target
// element. Reads the box's actual rendered height instead of a fixed guess, since the
// textarea auto-grows as the user types; without that the box could grow past the
// bottom of the viewport once the flip decision was made against a stale height.
function positionComposeBox(el, box) {
    const r = el.getBoundingClientRect();
    const mg = 8, bw = 240;
    const bh = box.offsetHeight || 118;
    let left = r.left;
    let top = r.bottom + mg;
    if (left + bw > window.innerWidth - mg)
        left = window.innerWidth - bw - mg;
    if (left < mg)
        left = mg;
    if (top + bh > window.innerHeight - mg)
        top = r.top - bh - mg;
    if (top < mg)
        top = mg;
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
}
// Grows the textarea with its content up to a max height, then lets it scroll
// internally (harmless now that the window scroll listener no longer closes the
// compose box on incidental scrolls originating inside loupe's own UI).
function autoGrowTextarea(ta) {
    ta.style.height = `${TEXTAREA_MIN_HEIGHT}px`;
    const next = Math.max(Math.min(ta.scrollHeight, TEXTAREA_MAX_HEIGHT), TEXTAREA_MIN_HEIGHT);
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
}
function openCompose(el, selector, restore) {
    if (composeBox) {
        composeBox.remove();
        composeBox = null;
    }
    cancelPendingFocusFlip?.();
    const contentSnippet = getContentSnippet(el);
    const box = document.createElement('div');
    box.setAttribute('data-loupe-compose', '1');
    box.style.cssText = 'position:fixed;z-index:2147483001;background:#1e293b;border:1.5px solid #3b82f6;border-radius:8px;padding:8px;width:240px;box-shadow:0 4px 20px rgba(0,0,0,0.6);display:flex;flex-direction:column;gap:5px;left:-9999px;top:-9999px;';
    const lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:10px;color:#94a3b8;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    lbl.textContent = selector || 'element';
    box.appendChild(lbl);
    const ta = document.createElement('textarea');
    ta.style.cssText = `background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:4px;padding:6px;font-size:12px;resize:none;height:${TEXTAREA_MIN_HEIGHT}px;overflow-y:hidden;outline:none;font-family:system-ui,sans-serif;width:100%;box-sizing:border-box;line-height:1.4;`;
    ta.placeholder = 'Type note, Enter to add...';
    box.appendChild(ta);
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:10px;color:#475569;line-height:1.3;';
    hint.textContent = 'Enter: add  Shift+Enter: newline  Cmd+Enter: add & send all  Esc: cancel';
    box.appendChild(hint);
    // Whether the textarea is focused, tracked explicitly instead of read from
    // document.activeElement at persist time. By the time any blur handler (or the
    // pagehide handler below) runs, activeElement has already moved on to whatever
    // took focus (or to document.body), so reading it there would always report
    // "not focused", even when the blur is really just an artifact of the iframe
    // document being torn down for reload rather than a deliberate focus change.
    let isFocused = restore ? restore.focus : true;
    let focusFlipTimer = null;
    function cancelFocusFlip() {
        if (focusFlipTimer !== null) {
            window.clearTimeout(focusFlipTimer);
            focusFlipTimer = null;
        }
    }
    function persistDraft() {
        try {
            const draft = {
                selector,
                contentSnippet,
                text: ta.value,
                selectionStart: ta.selectionStart,
                selectionEnd: ta.selectionEnd,
                focused: isFocused,
            };
            sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        }
        catch (_e) { }
    }
    ta.addEventListener('input', () => {
        autoGrowTextarea(ta);
        positionComposeBox(el, box);
        persistDraft();
    });
    ta.addEventListener('keyup', persistDraft);
    ta.addEventListener('click', persistDraft);
    ta.addEventListener('focus', () => {
        cancelFocusFlip();
        isFocused = true;
        persistDraft();
    });
    ta.addEventListener('blur', () => {
        // Defer the flip to false by one macrotask rather than applying it immediately.
        // A genuine blur (e.g. focus moving to the parent shell's own sidebar input) has
        // nothing racing it, so the flip lands a moment later as normal. A blur that is
        // just a side effect of this document unloading for reload is followed by
        // pagehide first, which cancels this timer, so isFocused (and the persisted
        // draft) still says "focused" when we come back. Ambiguous cases resolve in
        // favor of restoring focus, since losing it silently is the worse outcome.
        cancelFocusFlip();
        focusFlipTimer = window.setTimeout(() => {
            focusFlipTimer = null;
            isFocused = false;
            persistDraft();
        }, 0);
    });
    ta.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && e.shiftKey)
            return;
        const isMeta = e.metaKey || e.ctrlKey;
        if (e.key === 'Enter' && !isMeta) {
            e.preventDefault();
            const text = ta.value.trim();
            if (text)
                window.parent.postMessage({ type: 'loupe:note', selector, text, contentSnippet }, '*');
            closeCompose();
        }
        else if (e.key === 'Enter' && isMeta) {
            e.preventDefault();
            const text = ta.value.trim();
            if (text)
                window.parent.postMessage({ type: 'loupe:note', selector, text, contentSnippet }, '*');
            closeCompose();
            window.parent.postMessage({ type: 'loupe:send-all' }, '*');
        }
        else if (e.key === 'Escape') {
            e.preventDefault();
            closeCompose();
        }
    });
    document.body.appendChild(box);
    composeBox = box;
    persistCurrentDraft = persistDraft;
    cancelPendingFocusFlip = cancelFocusFlip;
    // Settle the height first (it affects the top/bottom flip math), then place the
    // box at its final position, and only then focus anything. Focusing an element
    // still parked at its off-screen placeholder position risks the browser trying to
    // scroll it into view, which would visibly jump the page (and, on restore, fire a
    // spurious scroll event during init).
    if (restore) {
        ta.value = restore.text;
        autoGrowTextarea(ta);
    }
    positionComposeBox(el, box);
    if (restore) {
        const len = ta.value.length;
        try {
            ta.setSelectionRange(Math.min(restore.selectionStart, len), Math.min(restore.selectionEnd, len));
        }
        catch (_e) { }
        if (restore.focus)
            ta.focus();
    }
    else {
        ta.focus();
    }
    persistDraft();
}
function closeCompose() {
    if (composeBox) {
        composeBox.remove();
        composeBox = null;
    }
    if (selOv)
        selOv.style.display = 'none';
    selectedEl = null;
    cancelPendingFocusFlip?.();
    cancelPendingFocusFlip = null;
    persistCurrentDraft = null;
    clearPersistedDraft();
}
/* ---- rAF tick ---- */
function tick() {
    for (const tid in markers) {
        positionMarker(markers[tid].el, markers[tid].selector);
    }
    if (selectedEl && selOv && selOv.style.display !== 'none') {
        placeOv(selOv, selectedEl);
    }
    if (composeBox && selectedEl) {
        positionComposeBox(selectedEl, composeBox);
    }
    requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
/* ---- checkAnchor ---- */
function checkAnchor(threadId, selector, contentSnippet) {
    if (selector && document.querySelector(selector)) {
        return { threadId, selector, orphaned: false };
    }
    if (contentSnippet) {
        const snippet = contentSnippet.replace(/…$/, '');
        let found = null;
        let ambiguous = false;
        const all = document.body ? document.body.querySelectorAll('*') : [];
        for (let i = 0; i < all.length; i++) {
            const node = all[i];
            if (isLoupeEl(node))
                continue;
            const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
            if (text === snippet || (contentSnippet.endsWith('…') && text.startsWith(snippet))) {
                if (found) {
                    ambiguous = true;
                    break;
                }
                found = node;
            }
        }
        if (found && !ambiguous) {
            return { threadId, selector: buildSelector(found), orphaned: false, reanchored: true };
        }
    }
    return { threadId, selector: null, orphaned: true };
}
/* ---- draft restoration across iframe reloads ---- */
// Reopens an in-progress compose box after the shell reloads the artifact iframe
// (e.g. the agent just edited the file on disk). Reuses checkAnchor, the same
// stale-selector-to-element machinery used for orphan detection elsewhere, so a
// draft survives even if the reload changed the DOM enough to shift the selector.
function restoreDraftOnLoad() {
    let raw = null;
    try {
        raw = sessionStorage.getItem(DRAFT_KEY);
    }
    catch (_e) {
        return;
    }
    if (!raw)
        return;
    let draft;
    try {
        draft = JSON.parse(raw);
    }
    catch (_e) {
        clearPersistedDraft();
        return;
    }
    const anchor = checkAnchor('__draft__', draft.selector || null, draft.contentSnippet || null);
    if (anchor.orphaned || !anchor.selector) {
        clearPersistedDraft();
        return;
    }
    const target = document.querySelector(anchor.selector);
    if (!target) {
        clearPersistedDraft();
        return;
    }
    selectedEl = target;
    showSelOv(target);
    openCompose(target, anchor.selector, {
        text: draft.text,
        selectionStart: draft.selectionStart,
        selectionEnd: draft.selectionEnd,
        focus: draft.focused,
    });
}
restoreDraftOnLoad();
// Final flush before the iframe document is torn down, e.g. by the shell reloading
// the artifact after the agent edits the file on disk. Cancel any pending "focus was
// lost" flip first, so a blur that only fired as a side effect of this same teardown
// does not get to record "not focused" before we capture the final draft state.
window.addEventListener('pagehide', () => {
    cancelPendingFocusFlip?.();
    persistCurrentDraft?.();
});
/* ---- postMessage from parent shell ---- */
// Scroll events do not bubble, but this listener is capture-phase on window, so it
// still fires for scrolls inside descendants, including the compose textarea's own
// internal overflow scrolling once a note grows past its visible height. Ignore those
// entirely. A real page scroll no longer closes the compose box either: it stays
// anchored to its target element every frame via tick(), closing on scroll just to
// lose the user's draft is itself the bug we're fixing.
window.addEventListener('scroll', (e) => {
    if (isLoupeEl(e.target))
        return;
    if (composeBox && selectedEl)
        positionComposeBox(selectedEl, composeBox);
}, true);
window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data !== 'object')
        return;
    const d = e.data;
    if (d.type === 'loupe:add-marker') {
        const container = getMarkerContainer();
        if (markers[d.threadId]) {
            updateMarkerStyle(markers[d.threadId].el, d.count, d.state);
            markers[d.threadId].selector = d.selector;
            markers[d.threadId].state = d.state;
        }
        else {
            const el = makeMarkerEl(d.threadId, d.count, d.state);
            container.appendChild(el);
            markers[d.threadId] = { el, selector: d.selector, state: d.state };
        }
    }
    else if (d.type === 'loupe:clear-markers') {
        for (const tid in markers)
            markers[tid].el.remove();
        markers = {};
    }
    else if (d.type === 'loupe:remove-marker') {
        if (markers[d.threadId]) {
            markers[d.threadId].el.remove();
            delete markers[d.threadId];
        }
    }
    else if (d.type === 'loupe:check-anchors') {
        const results = d.threads.map(t => checkAnchor(t.threadId, t.selector, t.contentSnippet));
        window.parent.postMessage({ type: 'loupe:anchor-report', results }, '*');
    }
    else if (d.type === 'loupe:agent-presence') {
        presenceWorking = d.state === 'working';
        for (const tid in markers)
            applyPulse(markers[tid].el, markers[tid].state);
    }
});
/* ---- hover ---- */
document.addEventListener('mouseover', (e) => {
    if (isLoupeEl(e.target))
        return;
    if (selectedEl)
        return;
    const ov = ensureHoverOv();
    if (e.target instanceof Element)
        placeOv(ov, e.target);
    ov.style.display = 'block';
});
document.addEventListener('mouseout', (e) => {
    if (isLoupeEl(e.target))
        return;
    if (!selectedEl && hoverOv)
        hoverOv.style.display = 'none';
});
/* ---- click (capture) ---- */
document.addEventListener('click', (e) => {
    if (isLoupeEl(e.target))
        return;
    if (e.target === document.body || e.target === document.documentElement) {
        closeCompose();
        return;
    }
    if (!(e.target instanceof Element))
        return;
    e.preventDefault();
    e.stopPropagation();
    const selector = buildSelector(e.target);
    selectedEl = e.target;
    if (hoverOv)
        hoverOv.style.display = 'none';
    showSelOv(e.target);
    openCompose(e.target, selector);
    window.parent.postMessage({ type: 'loupe:element', selector, rect: rectOf(e.target) }, '*');
}, true);
/* ---- text selection ---- */
document.addEventListener('mouseup', () => {
    const sel = window.getSelection();
    if (sel?.toString().trim()) {
        const text = sel.toString().trim();
        let rect = { top: 0, left: 0, width: 0, height: 0 };
        if (sel.rangeCount > 0) {
            const r = sel.getRangeAt(0).getBoundingClientRect();
            rect = { top: r.top, left: r.left, width: r.width, height: r.height };
        }
        window.parent.postMessage({ type: 'loupe:selection', text, rect }, '*');
    }
});
export {};
