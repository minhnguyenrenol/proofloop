/* Proofloop recorder snippet for code prototypes (T2).
 * Add to your prototype: <script src="proofloop-recorder.js" data-parent="https://your-runner-host"></script>
 * It tells the study page about clicks, page changes and errors. It never
 * sends what people type, and does nothing unless it runs inside the
 * study page (window.parent !== window). */
(function () {
  'use strict';
  if (window.parent === window) return;
  const script = document.currentScript;
  const parentOrigin = script && script.dataset.parent;
  // Without the study page's origin we don't know who would receive the events.
  if (!parentOrigin || parentOrigin === '*') { console.warn('proofloop-recorder: set data-parent to the study page origin'); return; }
  const send = (msg) => window.parent.postMessage(Object.assign({ source: 'proofloop' }, msg), parentOrigin);
  const route = () => location.pathname + location.hash;

  function selectorOf(el) {
    const parts = [];
    for (let n = el, i = 0; n && n.nodeType === 1 && i < 4; n = n.parentElement, i++) {
      let s = n.tagName.toLowerCase();
      if (n.id) { parts.unshift(s + '#' + n.id); break; }
      const label = n.getAttribute('aria-label') || n.getAttribute('data-testid');
      if (label) s += '[' + (n.hasAttribute('aria-label') ? 'aria-label' : 'data-testid') + '="' + label.slice(0, 40) + '"]';
      parts.unshift(s);
    }
    return parts.join(' > ');
  }
  function isInteractive(el) {
    return !!el.closest('a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[onclick],[tabindex]');
  }
  let last = route();
  let mutations = 0;
  new MutationObserver((m) => { mutations += m.length; }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  document.addEventListener('click', (e) => {
    const el = e.target;
    const before = mutations;
    const startRoute = route();
    // A click counts as "handled" if it hits something interactive or
    // changes the page within a second (dead-click detection, H.1).
    // Interactive targets are sent at once so a click just before the
    // participant presses "I've finished" still belongs to the task.
    if (isInteractive(el)) { send({ type: 'click', route: startRoute, selector: selectorOf(el), handled: true, x: e.clientX, y: e.clientY }); return; }
    setTimeout(() => {
      const changed = route() !== startRoute || mutations !== before;
      send({ type: 'click', route: startRoute, selector: selectorOf(el), handled: changed, x: e.clientX, y: e.clientY });
    }, 1000);
  }, true);
  const check = () => { const r = route(); if (r !== last) { last = r; send({ type: 'navigate', route: r }); } };
  ['popstate', 'hashchange'].forEach((ev) => window.addEventListener(ev, check));
  const wrap = (k) => { const orig = history[k]; history[k] = function () { const out = orig.apply(this, arguments); check(); return out; }; };
  wrap('pushState'); wrap('replaceState');
  window.addEventListener('error', (e) => send({ type: 'error', message: String(e.message || 'error') }));
  window.addEventListener('unhandledrejection', (e) => send({ type: 'error', message: String((e.reason && e.reason.message) || 'unhandled rejection') }));
  send({ type: 'navigate', route: route() });
})();
