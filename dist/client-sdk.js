export const clientSdkSource = `(function() {
  'use strict';

  var key = (function() {
    var m = new URLSearchParams(document.currentScript.src.split('?')[1] || '').get('key');
    return m || '';
  })();

  var hoverOv = null;    // amber transient outline
  var selOv = null;      // blue sticky outline (persists while compose is open)
  var selectedEl = null; // element currently selected
  var composeBox = null; // inline compose div (null when hidden)
  var markerContainer = null;
  var markers = {};

  function buildSelector(el) {
    var parts = [];
    var node = el;
    for (var i = 0; i < 5 && node && node !== document.body && node !== document.documentElement; i++) {
      if (node.id) {
        parts.unshift('#' + CSS.escape(node.id));
        break;
      }
      var tag = node.tagName.toLowerCase();
      var parent = node.parentElement;
      if (parent) {
        var siblings = Array.from(parent.children).filter(function(c) { return c.tagName === node.tagName; });
        if (siblings.length > 1) {
          var idx = siblings.indexOf(node) + 1;
          parts.unshift(tag + ':nth-of-type(' + idx + ')');
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

  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }

  function getContentSnippet(el) {
    var text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    return text.length > 80 ? text.slice(0, 80) + '\\u2026' : text;
  }

  function isLoupeEl(el) {
    if (markerContainer && markerContainer.contains(el)) return true;
    if (composeBox && composeBox.contains(el)) return true;
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

  function makeMarkerEl(threadId, count, state) {
    var el = document.createElement('button');
    el.setAttribute('data-loupe-marker', threadId);
    el.style.cssText = 'position:absolute;pointer-events:auto;width:22px;height:22px;border-radius:50%;font-size:10px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.35);line-height:1;padding:0;transition:transform 0.1s;';
    updateMarkerStyle(el, count, state);
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault();
      closeCompose();
      window.parent.postMessage({ type: 'loupe:marker-click', threadId: threadId }, '*');
    });
    el.addEventListener('mouseenter', function() { el.style.transform = 'scale(1.2)'; });
    el.addEventListener('mouseleave', function() { el.style.transform = ''; });
    return el;
  }

  function updateMarkerStyle(el, count, state) {
    if (state === 'done') {
      el.style.background = '#4b5563';
      el.style.color = '#22c55e';
      el.style.border = '2px solid rgba(0,0,0,0.1)';
      el.textContent = '\\u2713';
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

  function positionMarker(el, selector) {
    if (!selector) { el.style.display = 'none'; return; }
    var target = document.querySelector(selector);
    if (!target) { el.style.display = 'none'; return; }
    var r = target.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    el.style.top = Math.max(0, r.top - 11) + 'px';
    el.style.left = Math.max(0, r.right - 11) + 'px';
  }

  /* ---- overlays ---- */
  function placeOv(ov, el) {
    var r = el.getBoundingClientRect();
    ov.style.top = r.top + 'px';
    ov.style.left = r.left + 'px';
    ov.style.width = r.width + 'px';
    ov.style.height = r.height + 'px';
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
  function openCompose(el, selector) {
    if (composeBox) { composeBox.remove(); composeBox = null; }
    var contentSnippet = getContentSnippet(el);

    var r = el.getBoundingClientRect();
    var mg = 8;
    var bw = 240;
    var bh = 118;
    var left = r.left;
    var top = r.bottom + mg;
    if (left + bw > window.innerWidth - mg) left = window.innerWidth - bw - mg;
    if (left < mg) left = mg;
    if (top + bh > window.innerHeight - mg) top = r.top - bh - mg;
    if (top < mg) top = mg;

    var box = document.createElement('div');
    box.setAttribute('data-loupe-compose', '1');
    box.style.cssText = 'position:fixed;z-index:2147483001;background:#1e293b;border:1.5px solid #3b82f6;border-radius:8px;padding:8px;width:240px;box-shadow:0 4px 20px rgba(0,0,0,0.6);display:flex;flex-direction:column;gap:5px;left:' + left + 'px;top:' + top + 'px;';

    var lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:10px;color:#94a3b8;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    lbl.textContent = selector || 'element';
    box.appendChild(lbl);

    var ta = document.createElement('textarea');
    ta.style.cssText = 'background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:4px;padding:6px;font-size:12px;resize:none;height:56px;outline:none;font-family:system-ui,sans-serif;width:100%;box-sizing:border-box;line-height:1.4;';
    ta.placeholder = 'Type note, Enter to add...';
    box.appendChild(ta);

    var hint = document.createElement('div');
    hint.style.cssText = 'font-size:10px;color:#475569;line-height:1.3;';
    hint.textContent = 'Enter: add  Shift+Enter: newline  Cmd+Enter: add & send all  Esc: cancel';
    box.appendChild(hint);

    ta.addEventListener('keydown', function(e) {
      e.stopPropagation();
      if (e.key === 'Enter' && e.shiftKey) return;
      var isMeta = e.metaKey || e.ctrlKey;
      if (e.key === 'Enter' && !e.shiftKey && !isMeta) {
        e.preventDefault();
        var text = ta.value.trim();
        if (text) window.parent.postMessage({ type: 'loupe:note', selector: selector, text: text, contentSnippet: contentSnippet }, '*');
        closeCompose();
      } else if (e.key === 'Enter' && !e.shiftKey && isMeta) {
        e.preventDefault();
        var text2 = ta.value.trim();
        if (text2) window.parent.postMessage({ type: 'loupe:note', selector: selector, text: text2, contentSnippet: contentSnippet }, '*');
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

  function closeCompose() {
    if (composeBox) { composeBox.remove(); composeBox = null; }
    if (selOv) selOv.style.display = 'none';
    selectedEl = null;
  }

  /* ---- rAF tick: reposition markers and sticky overlay ---- */
  function tick() {
    for (var tid in markers) {
      positionMarker(markers[tid].el, markers[tid].selector);
    }
    if (selectedEl && selOv && selOv.style.display !== 'none') {
      placeOv(selOv, selectedEl);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* ---- scroll closes compose ---- */
  window.addEventListener('scroll', function() { if (composeBox) closeCompose(); }, true);

  /* ---- postMessage from parent ---- */
  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'object') return;
    var d = e.data;
    if (d.type === 'loupe:add-marker') {
      var container = getMarkerContainer();
      if (markers[d.threadId]) {
        updateMarkerStyle(markers[d.threadId].el, d.count, d.state);
        markers[d.threadId].selector = d.selector;
      } else {
        var el = makeMarkerEl(d.threadId, d.count, d.state);
        container.appendChild(el);
        markers[d.threadId] = { el: el, selector: d.selector };
      }
    } else if (d.type === 'loupe:clear-markers') {
      for (var tid in markers) { markers[tid].el.remove(); }
      markers = {};
    } else if (d.type === 'loupe:remove-marker') {
      if (markers[d.threadId]) { markers[d.threadId].el.remove(); delete markers[d.threadId]; }
    } else if (d.type === 'loupe:check-anchors') {
      var results = [];
      for (var ai = 0; ai < d.threads.length; ai++) {
        results.push(checkAnchor(d.threads[ai].threadId, d.threads[ai].selector, d.threads[ai].contentSnippet));
      }
      window.parent.postMessage({ type: 'loupe:anchor-report', results: results }, '*');
    }
  });

  function checkAnchor(threadId, selector, contentSnippet) {
    if (selector && document.querySelector(selector)) {
      return { threadId: threadId, selector: selector, orphaned: false };
    }
    if (contentSnippet) {
      var snippet = contentSnippet.replace(/\\u2026$/, '');
      var found = null;
      var ambiguous = false;
      var all = document.body ? document.body.querySelectorAll('*') : [];
      for (var i = 0; i < all.length; i++) {
        var node = all[i];
        if (isLoupeEl(node)) continue;
        var text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
        if (text === snippet || (contentSnippet.slice(-1) === '\\u2026' && text.startsWith(snippet))) {
          if (found) { ambiguous = true; break; }
          found = node;
        }
      }
      if (found && !ambiguous) {
        return { threadId: threadId, selector: buildSelector(found), orphaned: false, reanchored: true };
      }
    }
    return { threadId: threadId, selector: null, orphaned: true };
  }

  /* ---- hover ---- */
  document.addEventListener('mouseover', function(e) {
    if (isLoupeEl(e.target)) return;
    if (selectedEl) return;
    var ov = ensureHoverOv();
    placeOv(ov, e.target);
    ov.style.display = 'block';
  });

  document.addEventListener('mouseout', function(e) {
    if (isLoupeEl(e.target)) return;
    if (!selectedEl && hoverOv) hoverOv.style.display = 'none';
  });

  /* ---- click (capture) ---- */
  document.addEventListener('click', function(e) {
    if (isLoupeEl(e.target)) return;

    if (e.target === document.body || e.target === document.documentElement) {
      closeCompose();
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    var selector = buildSelector(e.target);
    selectedEl = e.target;
    if (hoverOv) hoverOv.style.display = 'none';
    showSelOv(e.target);
    openCompose(e.target, selector);
    window.parent.postMessage({ type: 'loupe:element', selector: selector, rect: rectOf(e.target) }, '*');
  }, true);

  /* ---- text selection ---- */
  document.addEventListener('mouseup', function() {
    var sel = window.getSelection();
    if (sel && sel.toString().trim()) {
      var text = sel.toString().trim();
      var rect = { top: 0, left: 0, width: 0, height: 0 };
      if (sel.rangeCount > 0) {
        var r = sel.getRangeAt(0).getBoundingClientRect();
        rect = { top: r.top, left: r.left, width: r.width, height: r.height };
      }
      window.parent.postMessage({ type: 'loupe:selection', text: text, rect: rect }, '*');
    }
  });
})();
`;
