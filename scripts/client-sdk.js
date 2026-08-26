export const clientSdkSource = `(function() {
  'use strict';

  var key = (function() {
    var m = new URLSearchParams(document.currentScript.src.split('?')[1] || '').get('key');
    return m || '';
  })();

  var overlay = null;
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

  function getMarkerContainer() {
    if (!markerContainer) {
      markerContainer = document.createElement('div');
      markerContainer.setAttribute('data-loupe-container', '1');
      markerContainer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000;overflow:visible';
      document.body.appendChild(markerContainer);
    }
    return markerContainer;
  }

  function makeMarkerEl(threadId, count, pending) {
    var el = document.createElement('button');
    el.setAttribute('data-loupe-marker', threadId);
    el.style.cssText = 'position:absolute;pointer-events:auto;width:22px;height:22px;border-radius:50%;border:2px solid rgba(0,0,0,0.15);font-size:10px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.35);line-height:1;padding:0;transition:transform 0.1s;';
    updateMarkerStyle(el, count, pending);
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault();
      window.parent.postMessage({ type: 'loupe:marker-click', threadId: threadId }, '*');
    });
    el.addEventListener('mouseenter', function() { el.style.transform = 'scale(1.2)'; });
    el.addEventListener('mouseleave', function() { el.style.transform = ''; });
    return el;
  }

  function updateMarkerStyle(el, count, pending) {
    el.style.background = pending ? '#f59e0b' : '#3b82f6';
    el.style.color = pending ? '#000' : '#fff';
    el.textContent = String(count);
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

  function tickMarkers() {
    for (var tid in markers) {
      positionMarker(markers[tid].el, markers[tid].selector);
    }
    requestAnimationFrame(tickMarkers);
  }
  requestAnimationFrame(tickMarkers);

  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'object') return;
    var d = e.data;
    if (d.type === 'loupe:add-marker') {
      var container = getMarkerContainer();
      if (markers[d.threadId]) {
        updateMarkerStyle(markers[d.threadId].el, d.count, d.pending);
        markers[d.threadId].selector = d.selector;
      } else {
        var el = makeMarkerEl(d.threadId, d.count, d.pending);
        container.appendChild(el);
        markers[d.threadId] = { el: el, selector: d.selector };
      }
    } else if (d.type === 'loupe:clear-markers') {
      for (var tid in markers) { markers[tid].el.remove(); }
      markers = {};
    }
  });

  function showOverlay(el) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #f59e0b;border-radius:2px;box-sizing:border-box;z-index:2147483646;transition:all 0.08s';
      document.body.appendChild(overlay);
    }
    var r = el.getBoundingClientRect();
    overlay.style.top = r.top + 'px';
    overlay.style.left = r.left + 'px';
    overlay.style.width = r.width + 'px';
    overlay.style.height = r.height + 'px';
    overlay.style.display = 'block';
  }

  function hideOverlay() {
    if (overlay) overlay.style.display = 'none';
  }

  function isLoupeEl(el) {
    return markerContainer && markerContainer.contains(el);
  }

  document.addEventListener('mouseover', function(e) {
    if (isLoupeEl(e.target)) return;
    showOverlay(e.target);
  });

  document.addEventListener('mouseout', function(e) {
    if (isLoupeEl(e.target)) return;
    hideOverlay();
  });

  document.addEventListener('click', function(e) {
    if (isLoupeEl(e.target)) return;
    var selector = buildSelector(e.target);
    window.parent.postMessage({ type: 'loupe:element', selector: selector, rect: rectOf(e.target) }, '*');
    e.preventDefault();
    e.stopPropagation();
  }, true);

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
