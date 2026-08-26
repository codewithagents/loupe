export const clientSdkSource = `(function() {
  'use strict';

  var key = (function() {
    var m = new URLSearchParams(document.currentScript.src.split('?')[1] || '').get('key');
    return m || '';
  })();

  var overlay = null;

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

  function showOverlay(el) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #f59e0b;border-radius:2px;box-sizing:border-box;z-index:2147483647;transition:all 0.1s';
      document.body.appendChild(overlay);
    }
    var r = el.getBoundingClientRect();
    overlay.style.top = (r.top + window.scrollY) + 'px';
    overlay.style.left = (r.left + window.scrollX) + 'px';
    overlay.style.width = r.width + 'px';
    overlay.style.height = r.height + 'px';
    overlay.style.display = 'block';
  }

  function hideOverlay() {
    if (overlay) overlay.style.display = 'none';
  }

  document.addEventListener('mouseover', function(e) {
    if (e.target === overlay) return;
    showOverlay(e.target);
  });

  document.addEventListener('mouseout', function() {
    hideOverlay();
  });

  document.addEventListener('click', function(e) {
    var selector = buildSelector(e.target);
    window.parent.postMessage({
      type: 'loupe:element',
      selector: selector,
      rect: rectOf(e.target)
    }, '*');
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

  document.addEventListener('selectionchange', function() {
    var sel = window.getSelection();
    if (sel && sel.toString().trim()) {
      // tracked via mouseup for rect; this keeps text fresh
    }
  });
})();
`;
