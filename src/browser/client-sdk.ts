import type {
  ShellToSdkMessage,
  PmAnchorResult,
} from '../types.js';

// Key is passed as a query param on the module script src URL.
const key: string = new URL(import.meta.url).searchParams.get('key') ?? '';

let hoverOv: HTMLDivElement | null = null;
let selOv: HTMLDivElement | null = null;
let selectedEl: Element | null = null;
let composeBox: HTMLDivElement | null = null;
let markerContainer: HTMLDivElement | null = null;
let markers: Record<string, { el: HTMLButtonElement; selector: string | null }> = {};

type MarkerState = 'done' | 'agent-last' | 'user-last' | 'drafts-only';

function buildSelector(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  for (let i = 0; i < 5 && node && node !== document.body && node !== document.documentElement; i++) {
    if (node.id) {
      parts.unshift('#' + CSS.escape(node.id));
      break;
    }
    const tag = node.tagName.toLowerCase();
    const parent = node.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(c => c.tagName === node!.tagName);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(node) + 1;
        parts.unshift(`${tag}:nth-of-type(${idx})`);
      } else {
        parts.unshift(tag);
      }
    } else {
      parts.unshift(tag);
    }
    node = node.parentElement;
  }
  return parts.join(' > ');
}

function rectOf(el: Element): { top: number; left: number; width: number; height: number } {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function getContentSnippet(el: Element): string {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 80 ? text.slice(0, 80) + '…' : text;
}

function isLoupeEl(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false;
  if (markerContainer?.contains(el)) return true;
  if (composeBox?.contains(el)) return true;
  return false;
}

/* ---- markers ---- */
function getMarkerContainer(): HTMLDivElement {
  if (!markerContainer) {
    markerContainer = document.createElement('div');
    markerContainer.setAttribute('data-loupe-container', '1');
    markerContainer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000;overflow:visible';
    document.body.appendChild(markerContainer);
  }
  return markerContainer;
}

function updateMarkerStyle(el: HTMLButtonElement, count: number, state: MarkerState): void {
  if (state === 'done') {
    el.style.background = '#4b5563';
    el.style.color = '#22c55e';
    el.style.border = '2px solid rgba(0,0,0,0.1)';
    el.textContent = '✓';
  } else if (state === 'agent-last') {
    el.style.background = '#3b82f6';
    el.style.color = '#fff';
    el.style.border = '2px solid rgba(0,0,0,0.15)';
    el.textContent = String(count);
  } else if (state === 'user-last') {
    el.style.background = '#f59e0b';
    el.style.color = '#000';
    el.style.border = '2px solid rgba(0,0,0,0.15)';
    el.textContent = String(count);
  } else {
    el.style.background = 'transparent';
    el.style.color = '#94a3b8';
    el.style.border = '2px solid #94a3b8';
    el.textContent = String(count);
  }
}

function makeMarkerEl(threadId: string, count: number, state: MarkerState): HTMLButtonElement {
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

function positionMarker(el: HTMLButtonElement, selector: string | null): void {
  if (!selector) { el.style.display = 'none'; return; }
  const target = document.querySelector(selector);
  if (!target) { el.style.display = 'none'; return; }
  const r = target.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.style.top = `${Math.max(0, r.top - 11)}px`;
  el.style.left = `${Math.max(0, r.right - 11)}px`;
}

/* ---- overlays ---- */
function placeOv(ov: HTMLDivElement, el: Element): void {
  const r = el.getBoundingClientRect();
  ov.style.top = `${r.top}px`;
  ov.style.left = `${r.left}px`;
  ov.style.width = `${r.width}px`;
  ov.style.height = `${r.height}px`;
}

function ensureHoverOv(): HTMLDivElement {
  if (!hoverOv) {
    hoverOv = document.createElement('div');
    hoverOv.style.cssText = 'position:fixed;pointer-events:none;border:2px solid rgba(245,158,11,0.6);border-radius:2px;box-sizing:border-box;z-index:2147483645;transition:all 0.08s;display:none;';
    document.body.appendChild(hoverOv);
  }
  return hoverOv;
}

function showSelOv(el: Element): void {
  if (!selOv) {
    selOv = document.createElement('div');
    selOv.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #3b82f6;border-radius:2px;box-sizing:border-box;z-index:2147483646;box-shadow:0 0 0 3px rgba(59,130,246,0.2);display:none;';
    document.body.appendChild(selOv);
  }
  placeOv(selOv, el);
  selOv.style.display = 'block';
}

/* ---- inline compose ---- */
function openCompose(el: Element, selector: string): void {
  if (composeBox) { composeBox.remove(); composeBox = null; }
  const contentSnippet = getContentSnippet(el);

  const r = el.getBoundingClientRect();
  const mg = 8, bw = 240, bh = 118;
  let left = r.left;
  let top = r.bottom + mg;
  if (left + bw > window.innerWidth - mg) left = window.innerWidth - bw - mg;
  if (left < mg) left = mg;
  if (top + bh > window.innerHeight - mg) top = r.top - bh - mg;
  if (top < mg) top = mg;

  const box = document.createElement('div');
  box.setAttribute('data-loupe-compose', '1');
  box.style.cssText = `position:fixed;z-index:2147483001;background:#1e293b;border:1.5px solid #3b82f6;border-radius:8px;padding:8px;width:240px;box-shadow:0 4px 20px rgba(0,0,0,0.6);display:flex;flex-direction:column;gap:5px;left:${left}px;top:${top}px;`;

  const lbl = document.createElement('div');
  lbl.style.cssText = 'font-size:10px;color:#94a3b8;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  lbl.textContent = selector || 'element';
  box.appendChild(lbl);

  const ta = document.createElement('textarea');
  ta.style.cssText = 'background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:4px;padding:6px;font-size:12px;resize:none;height:56px;outline:none;font-family:system-ui,sans-serif;width:100%;box-sizing:border-box;line-height:1.4;';
  ta.placeholder = 'Type note, Enter to add...';
  box.appendChild(ta);

  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:10px;color:#475569;line-height:1.3;';
  hint.textContent = 'Enter: add  Shift+Enter: newline  Cmd+Enter: add & send all  Esc: cancel';
  box.appendChild(hint);

  ta.addEventListener('keydown', (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter' && e.shiftKey) return;
    const isMeta = e.metaKey || e.ctrlKey;
    if (e.key === 'Enter' && !isMeta) {
      e.preventDefault();
      const text = ta.value.trim();
      if (text) window.parent.postMessage({ type: 'loupe:note', selector, text, contentSnippet }, '*');
      closeCompose();
    } else if (e.key === 'Enter' && isMeta) {
      e.preventDefault();
      const text = ta.value.trim();
      if (text) window.parent.postMessage({ type: 'loupe:note', selector, text, contentSnippet }, '*');
      closeCompose();
      window.parent.postMessage({ type: 'loupe:send-all' }, '*');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeCompose();
    }
  });

  document.body.appendChild(box);
  composeBox = box;
  ta.focus();
}

function closeCompose(): void {
  if (composeBox) { composeBox.remove(); composeBox = null; }
  if (selOv) selOv.style.display = 'none';
  selectedEl = null;
}

/* ---- rAF tick ---- */
function tick(): void {
  for (const tid in markers) {
    positionMarker(markers[tid].el, markers[tid].selector);
  }
  if (selectedEl && selOv && selOv.style.display !== 'none') {
    placeOv(selOv, selectedEl);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

/* ---- checkAnchor ---- */
function checkAnchor(threadId: string, selector: string | null, contentSnippet: string | null): PmAnchorResult {
  if (selector && document.querySelector(selector)) {
    return { threadId, selector, orphaned: false };
  }
  if (contentSnippet) {
    const snippet = contentSnippet.replace(/…$/, '');
    let found: Element | null = null;
    let ambiguous = false;
    const all = document.body ? document.body.querySelectorAll('*') : [];
    for (let i = 0; i < all.length; i++) {
      const node = all[i];
      if (isLoupeEl(node)) continue;
      const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text === snippet || (contentSnippet.endsWith('…') && text.startsWith(snippet))) {
        if (found) { ambiguous = true; break; }
        found = node;
      }
    }
    if (found && !ambiguous) {
      return { threadId, selector: buildSelector(found), orphaned: false, reanchored: true };
    }
  }
  return { threadId, selector: null, orphaned: true };
}

/* ---- postMessage from parent shell ---- */
window.addEventListener('scroll', () => { if (composeBox) closeCompose(); }, true);

window.addEventListener('message', (e: MessageEvent) => {
  if (!e.data || typeof e.data !== 'object') return;
  const d = e.data as ShellToSdkMessage;
  if (d.type === 'loupe:add-marker') {
    const container = getMarkerContainer();
    if (markers[d.threadId]) {
      updateMarkerStyle(markers[d.threadId].el, d.count, d.state);
      markers[d.threadId].selector = d.selector;
    } else {
      const el = makeMarkerEl(d.threadId, d.count, d.state);
      container.appendChild(el);
      markers[d.threadId] = { el, selector: d.selector };
    }
  } else if (d.type === 'loupe:clear-markers') {
    for (const tid in markers) markers[tid].el.remove();
    markers = {};
  } else if (d.type === 'loupe:remove-marker') {
    if (markers[d.threadId]) { markers[d.threadId].el.remove(); delete markers[d.threadId]; }
  } else if (d.type === 'loupe:check-anchors') {
    const results = d.threads.map(t => checkAnchor(t.threadId, t.selector, t.contentSnippet));
    window.parent.postMessage({ type: 'loupe:anchor-report', results }, '*');
  }
});

/* ---- hover ---- */
document.addEventListener('mouseover', (e: MouseEvent) => {
  if (isLoupeEl(e.target)) return;
  if (selectedEl) return;
  const ov = ensureHoverOv();
  if (e.target instanceof Element) placeOv(ov, e.target);
  ov.style.display = 'block';
});

document.addEventListener('mouseout', (e: MouseEvent) => {
  if (isLoupeEl(e.target)) return;
  if (!selectedEl && hoverOv) hoverOv.style.display = 'none';
});

/* ---- click (capture) ---- */
document.addEventListener('click', (e: MouseEvent) => {
  if (isLoupeEl(e.target)) return;

  if (e.target === document.body || e.target === document.documentElement) {
    closeCompose();
    return;
  }

  if (!(e.target instanceof Element)) return;
  e.preventDefault();
  e.stopPropagation();

  const selector = buildSelector(e.target);
  selectedEl = e.target;
  if (hoverOv) hoverOv.style.display = 'none';
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
