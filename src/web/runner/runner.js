/* Proofloop participant runner (FR-PLG-007, FR-PLG-016 moderated mode).
 * Static page: consent → device check → tasks on the prototype → questions → done.
 * Recordings are cut into 5-second pieces, queued in IndexedDB, and uploaded
 * through the short relay. Nothing is sent anywhere else. */
(function () {
  'use strict';
  const S = window.PROOFLOOP_STUDY;
  const params = new URLSearchParams(location.search);
  const token = params.get('t') || '';
  const moderated = S.mode === 'moderated' || params.get('mode') === 'moderated';
  const main = document.getElementById('main');
  const statusEl = document.getElementById('status');
  const recEl = document.getElementById('rec');
  const progressEl = document.getElementById('progress');
  document.getElementById('study-name').textContent = S.name;
  document.title = S.name;

  const storeKey = 'proofloop-' + token.slice(-16);
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(storeKey) || 'null'); } catch (e) { saved = null; }
  const sessionStart = (saved && saved.sessionStart) || Date.now();
  const state = { step: 0, answers: {}, tasks: {}, consent: null, device: {}, sessionStart: sessionStart, eventSeq: 0, eventFile: 0 };
  // Events not yet queued for upload survive a reload through localStorage,
  // which (unlike IndexedDB) can be written synchronously while the page closes.
  const events = (saved && saved.pendingEvents) || [];
  let eventSeq = (saved && saved.eventSeq) || 0;
  let eventFile = (saved && saved.eventFile) || 0;
  let currentTask = null;
  let lastOutcome = null;

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const say = (msg) => { statusEl.textContent = linkDead && msg !== LINK_DEAD ? LINK_DEAD : msg; };
  function render(html, focusSel) {
    say(linkDead ? LINK_DEAD : ''); // a refused link stays on screen
    main.innerHTML = html;
    const f = focusSel ? main.querySelector(focusSel) : main.querySelector('h1');
    if (f) { f.setAttribute('tabindex', '-1'); f.focus(); }
  }
  function logEvent(type, data) {
    const e = Object.assign({ id: 'e' + String(++eventSeq).padStart(5, '0'), t_ms: Date.now() - sessionStart, at: Date.now(), type: type, task_id: currentTask }, data || {});
    events.push(e);
    return e;
  }

  // ---------- upload queue (IndexedDB → relay) ----------
  let db = null;
  function openDb() {
    return new Promise((resolve) => {
      if (!('indexedDB' in window)) return resolve(null);
      const req = indexedDB.open('proofloop-' + token.slice(-16), 1);
      req.onupgradeneeded = () => req.result.createObjectStore('pending', { keyPath: 'name' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }
  const memQueue = [];
  function enqueue(name, blob) {
    if (!db) { memQueue.push({ name: name, blob: blob }); return pump(); }
    const tx = db.transaction('pending', 'readwrite');
    tx.objectStore('pending').put({ name: name, blob: blob });
    tx.oncomplete = pump;
  }
  function nextPending() {
    if (!db) return Promise.resolve(memQueue[0] || null);
    return new Promise((resolve) => {
      const req = db.transaction('pending').objectStore('pending').openCursor();
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => resolve(null);
    });
  }
  function removePending(name) {
    if (!db) { const i = memQueue.findIndex((x) => x.name === name); if (i >= 0) memQueue.splice(i, 1); return Promise.resolve(); }
    return new Promise((resolve) => { const tx = db.transaction('pending', 'readwrite'); tx.objectStore('pending').delete(name); tx.oncomplete = resolve; });
  }
  function countPending() {
    if (!db) return Promise.resolve(memQueue.length);
    return new Promise((resolve) => { const r = db.transaction('pending').objectStore('pending').count(); r.onsuccess = () => resolve(r.result); r.onerror = () => resolve(0); });
  }
  let pumping = false;
  let backoff = 1000;
  // The relay refused the link itself (expired or not valid): retrying can't help.
  const LINK_DEAD = 'This link has expired or is no longer valid, so your session can\'t be sent. What you did is saved on this device. Please contact the researcher who sent you the link.';
  let linkDead = false;
  async function pump() {
    if (pumping || !S.relay || linkDead) return;
    pumping = true;
    try {
      for (;;) {
        const item = await nextPending();
        if (!item) break;
        try {
          const r = await fetch(S.relay + '/upload-url', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: token, name: item.name, size: item.blob.size }) });
          // 409: already received (or the session is finished). 400: this piece can never be accepted.
          if (r.status === 409 || r.status === 400) { await removePending(item.name); continue; }
          if (r.status === 401 || r.status === 403) { linkDead = true; say(LINK_DEAD); break; }
          if (!r.ok) throw new Error('relay ' + r.status);
          const { url } = await r.json();
          const put = await fetch(url, { method: 'PUT', body: item.blob, headers: { 'content-type': item.blob.type || 'application/octet-stream' } });
          if (!put.ok) throw new Error('upload ' + put.status);
          await removePending(item.name);
          backoff = 1000;
        } catch (err) {
          say('Connection problem. Your answers are saved on this device and will upload when the connection is back.');
          await new Promise((res) => setTimeout(res, backoff));
          backoff = Math.min(backoff * 2, 30000);
        }
      }
      if (statusEl.textContent.startsWith('Connection problem')) say('');
    } finally { pumping = false; }
  }
  window.addEventListener('online', pump);
  function flushEvents(final) {
    if (!events.length && !final) return;
    const batch = events.splice(0, events.length);
    state.eventSeq = eventSeq; state.eventFile = ++eventFile; state.pendingEvents = []; save();
    enqueue('events-' + String(eventFile).padStart(4, '0') + '.json', new Blob([JSON.stringify({ session_start: sessionStart, events: batch })], { type: 'application/json' }));
  }
  setInterval(flushEvents, 10000);
  window.addEventListener('pagehide', () => { state.eventSeq = eventSeq; state.pendingEvents = events.slice(); save(); });

  // ---------- recording ----------
  const recorders = [];
  let screenStream = null;
  let micStream = null;
  function startRecorder(stream, track) {
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'audio/webm;codecs=opus', 'audio/webm'];
    const mimeType = types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t) && (track === 'screen' ? t.startsWith('video') : t.startsWith('audio')));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType: mimeType, videoBitsPerSecond: 1500000, audioBitsPerSecond: 64000 } : undefined);
    let n = 0;
    rec.ondataavailable = (e) => { if (e.data && e.data.size) enqueue('chunk-' + track + '-' + String(n++).padStart(6, '0') + '.webm', e.data); };
    rec.start(5000);
    recorders.push(rec);
    logEvent('recording_start', { track: track, mime: rec.mimeType });
  }
  function stopRecording() {
    recorders.forEach((r) => { if (r.state !== 'inactive') r.stop(); });
    [screenStream, micStream].forEach((s) => s && s.getTracks().forEach((t) => t.stop()));
    recEl.hidden = true;
  }
  function canScreenRecord() { return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !/Android|iPhone|iPad/i.test(navigator.userAgent); }

  // ---------- prototype embedding ----------
  function prototypeSrc() {
    const p = S.prototype;
    if (p.figma) {
      const u = new URL(p.figma.replace('www.figma.com', 'embed.figma.com'));
      u.searchParams.set('embed-host', 'proofloop');
      if (p.figmaClientId) u.searchParams.set('client-id', p.figmaClientId);
      u.searchParams.set('hide-ui', '1');
      return u.toString();
    }
    return p.url;
  }
  window.addEventListener('message', (ev) => {
    const d = ev.data || {};
    if (/^https:\/\/(www|embed)\.figma\.com$/.test(ev.origin)) {
      if (d.type === 'PRESENTED_NODE_CHANGED') { const e = logEvent('navigate', { frame: d.data && d.data.presentedNodeId }); checkSuccess(e); }
      else if (d.type === 'MOUSE_PRESS_OR_RELEASE') {
        const pos = (d.data && (d.data.nearestScrollingFrameMousePosition || d.data.targetNodeMousePosition)) || {};
        logEvent('click', { frame: d.data && d.data.presentedNodeId, target: d.data && d.data.targetNodeId, handled: !!(d.data && d.data.handled), x: pos.x, y: pos.y });
      } else if (d.type === 'INITIAL_LOAD') logEvent('prototype_loaded', {});
      else if (d.type === 'LOGIN_SCREEN_SHOWN') { logEvent('prototype_login_required', {}); say('This design is asking you to log in. Please don\'t enter any real details. Select Skip this task to move on.'); }
      return;
    }
    if (S.prototypeOrigin && ev.origin === S.prototypeOrigin && d.source === 'proofloop') {
      if (d.type === 'navigate') checkSuccess(logEvent('navigate', { route: String(d.route || '').slice(0, 300) }));
      else if (d.type === 'click') logEvent('click', { route: d.route, selector: String(d.selector || '').slice(0, 200), handled: d.handled !== false, x: d.x, y: d.y });
      else if (d.type === 'error') logEvent('js_error', { message: String(d.message || '').slice(0, 300) });
    }
  });
  function checkSuccess(e) {
    if (!currentTask) return;
    const t = S.tasks.find((x) => x.id === currentTask);
    const s = t && t.success;
    if (!s) return;
    const hit = (s.reachNode && e.frame === s.reachNode) || (s.urlMatches && e.route && new RegExp('^' + s.urlMatches.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(e.route));
    if (hit && !state.tasks[currentTask].reached) { state.tasks[currentTask].reached = true; logEvent('success_reached', {}); }
  }

  // ---------- steps ----------
  const steps = [];
  if (!moderated) steps.push(welcome, consent, deviceCheck);
  else steps.push(moderatedWelcome);
  S.blocks.forEach((b) => {
    if (b.type === 'instructions' && !moderated) steps.push(() => instructions(b));
    if (b.type === 'task') { steps.push(() => task(b)); if (b.followUps && b.followUps.length) steps.push(() => followUps(b)); }
    if (b.type === 'question' && !moderated) steps.push(() => question(b));
  });
  steps.push(finish);
  const next = () => { state.step++; save(); steps[state.step](); };
  function save() { try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch (e) { /* storage blocked: continue without resume */ } }
  function updateProgress() {
    const total = S.tasks.length;
    const done = Object.values(state.tasks).filter((t) => t.outcome).length;
    progressEl.textContent = total ? 'Task ' + Math.min(done + (currentTask ? 1 : 0), total) + ' of ' + total : '';
  }

  function welcome() {
    render('<section class="panel"><h1>' + esc(S.name) + '</h1>' +
      '<p>Thanks for helping us improve an early design. It takes about <strong>' + esc(S.targetMinutes) + ' minutes</strong>.</p>' +
      '<p>You\'ll try a few tasks on a design that is not finished. <strong>We\'re testing the design, not you.</strong> There are no wrong answers, and if something is hard, that is useful for us to know.</p>' +
      '<p>We\'ll ask to record your voice and this browser tab while you try the design. You can stop at any time by closing the page.</p>' +
      '<p class="muted">You\'ll need a quiet place, a computer with a microphone, and Chrome or Edge.</p>' +
      '<div class="actions"><button class="primary" id="go">Get started</button></div></section>');
    document.getElementById('go').onclick = next;
  }
  function moderatedWelcome() {
    render('<section class="panel"><h1>' + esc(S.name) + '</h1><p>Your researcher will guide you on the call. Keep this page open and use the design here when they ask you to.</p>' +
      '<p class="muted">This page notes where you click on the design. It does not record your screen, camera or voice; the call recording is covered by the consent you gave.</p>' +
      '<div class="actions"><button class="primary" id="go">I\'m ready</button></div></section>');
    document.getElementById('go').onclick = () => { logEvent('session_start', { mode: 'moderated' }); next(); };
  }
  function consent() {
    render('<section class="panel"><h1>Before you start</h1><h2 id="consent-h">What you\'re agreeing to</h2><div class="consent" role="region" tabindex="0" aria-labelledby="consent-h">' + S.consentHtml + '</div>' +
      '<label class="check"><input type="checkbox" id="agree"> <span>I\'ve read the information above. I agree to take part and to have my voice and this tab recorded.</span></label>' +
      '<p class="muted" id="agree-hint">Tick the box to continue.</p>' +
      '<div class="actions"><button class="primary" id="go" disabled aria-describedby="agree-hint">Continue</button><button id="no">I don\'t want to take part</button></div></section>');
    const agree = document.getElementById('agree');
    const go = document.getElementById('go');
    agree.onchange = () => { go.disabled = !agree.checked; };
    go.onclick = () => {
      state.consent = { agreed: true, version: S.consentVersion, at: new Date().toISOString(), mode: 'self' };
      enqueue('meta.json', new Blob([JSON.stringify({ consent: state.consent, userAgent: navigator.userAgent, screen: [screen.width, screen.height], session_start: sessionStart })], { type: 'application/json' }));
      next();
    };
    document.getElementById('no').onclick = () => render('<section class="panel"><h1>No problem</h1><p>Nothing has been recorded. You can close this page.</p></section>');
  }
  function deviceCheck() {
    const wantScreen = S.recording.screen && canScreenRecord();
    render('<section class="panel"><h1>Check your microphone' + (wantScreen ? ' and screen sharing' : '') + '</h1>' +
      '<p>Please say what you\'re thinking as you go. Your voice helps us understand what\'s clear and what isn\'t.</p>' +
      '<div class="check-row"><button id="mic">Turn on microphone</button> <span id="mic-state" class="state" role="status"></span></div>' +
      '<div class="check-row"><span class="meter" aria-hidden="true"><span id="level"></span></span><span class="muted" id="level-text" role="status">Say something to test it.</span></div>' +
      (wantScreen ? '<div class="check-row"><button id="scr">Share this tab</button> <span id="scr-state" class="state" role="status"></span></div><p class="muted">When asked, choose <strong>this tab</strong>. Only this tab is recorded, not the rest of your screen.</p>' : (S.recording.screen ? '<p class="muted">Screen recording isn\'t available on this device. We\'ll record your voice and clicks only.</p>' : '')) +
      '<p class="muted" id="go-hint">Continue becomes available once your microphone is on' + (wantScreen ? ' and this tab is shared' : '') + '.</p>' +
      '<div class="actions"><button class="primary" id="go" disabled aria-describedby="go-hint">Continue</button></div></section>');
    const go = document.getElementById('go');
    let micOk = !S.recording.microphone;
    let scrOk = !wantScreen;
    const ready = () => { go.disabled = !(micOk && scrOk); const h = document.getElementById('go-hint'); if (h) h.hidden = !go.disabled; };
    ready();
    document.getElementById('mic').onclick = async () => {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        micOk = true; ready();
        document.getElementById('mic-state').textContent = 'On'; document.getElementById('mic-state').className = 'state ok';
        const ctx = new AudioContext(); const an = ctx.createAnalyser(); ctx.createMediaStreamSource(micStream).connect(an);
        const buf = new Uint8Array(an.fftSize); let heard = false;
        (function tick() { an.getByteTimeDomainData(buf); let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v - 128)); const lv = document.getElementById('level'); if (!lv) return; lv.style.width = Math.min(100, peak * 2) + '%'; if (peak > 12 && !heard) { heard = true; document.getElementById('level-text').textContent = 'We can hear you.'; } requestAnimationFrame(tick); })();
      } catch (e) {
        document.getElementById('mic-state').textContent = 'Your browser didn\'t let us use the microphone. Select the icon next to the web address, choose Allow for the microphone, then select Turn on microphone again. If it still doesn\'t work, you can close this page and contact the person who sent you the link.'; document.getElementById('mic-state').className = 'state bad';
      }
    };
    if (wantScreen) document.getElementById('scr').onclick = async () => {
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser', frameRate: 15 }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude' });
        const settings = screenStream.getVideoTracks()[0].getSettings();
        if (settings.displaySurface && settings.displaySurface !== 'browser') {
          screenStream.getTracks().forEach((t) => t.stop()); screenStream = null;
          document.getElementById('scr-state').textContent = 'Please choose this tab, not your whole screen or a window.'; document.getElementById('scr-state').className = 'state bad';
          return;
        }
        screenStream.getVideoTracks()[0].onended = () => { logEvent('screen_share_stopped', {}); say('Screen sharing stopped. We\'ll keep recording your voice and clicks.'); };
        scrOk = true; ready();
        document.getElementById('scr-state').textContent = 'Sharing this tab'; document.getElementById('scr-state').className = 'state ok';
      } catch (e) {
        document.getElementById('scr-state').textContent = 'Not shared. Choose this tab when asked, then select Share.'; document.getElementById('scr-state').className = 'state bad';
      }
    };
    go.onclick = () => {
      state.device = { screen: !!screenStream, mic: !!micStream };
      if (screenStream) startRecorder(screenStream, 'screen');
      if (micStream) startRecorder(micStream, 'mic');
      if (screenStream || micStream) recEl.hidden = false;
      logEvent('session_start', { mode: 'unmoderated', device: state.device });
      next();
    };
  }
  function instructions(b) {
    render('<section class="panel"><h1>Before the tasks</h1><p>' + esc(b.text) + '</p><div class="actions"><button class="primary" id="go">Continue</button></div></section>');
    document.getElementById('go').onclick = next;
  }
  function task(b) {
    currentTask = b.id;
    state.tasks[b.id] = state.tasks[b.id] || {};
    updateProgress();
    render('<div class="task-layout"><section class="task-panel" aria-labelledby="task-h"><h1 id="task-h" class="muted">' + esc(progressEl.textContent) + '</h1>' +
      (b.scenario ? '<p>' + esc(b.scenario) + '</p>' : '') + '<p class="instruction">' + esc(b.instruction) + '</p>' +
      (moderated ? '' : '<p class="muted">Say what you\'re thinking as you go. You have up to ' + Math.max(1, Math.round((b.maxSeconds || 300) / 60)) + ' minutes; take your time. It\'s fine to skip if you get stuck.</p>') +
      '<div class="actions" id="start-wrap"><button class="primary" id="start">Start task</button></div>' +
      '<div class="actions" id="end-wrap" hidden><button class="primary" id="done">I\'ve finished this task</button><button id="giveup">Skip this task</button></div>' +
      '<div id="time-warn" hidden><p>About a minute left on this task. Need more time?</p><button id="more">Give me 2 more minutes</button></div></section>' +
      '<div class="frame-wrap"><iframe id="proto" title="Design for ' + esc(progressEl.textContent.toLowerCase() || 'this task') + '" src="about:blank" inert allow="clipboard-write" referrerpolicy="no-referrer"></iframe></div></div>', '#task-h');
    const frame = document.getElementById('proto');
    let timer = null;
    let warnTimer = null;
    const arm = (ms) => {
      clearTimeout(timer); clearTimeout(warnTimer);
      if (moderated) return;
      warnTimer = setTimeout(() => { const w = document.getElementById('time-warn'); if (w) { w.hidden = false; say('About a minute left on this task.'); document.getElementById('more').focus(); } }, Math.max(0, ms - 60000));
      timer = setTimeout(() => end('timeout'), ms);
    };
    const end = (outcome) => {
      clearTimeout(timer); clearTimeout(warnTimer);
      lastOutcome = outcome;
      state.tasks[b.id].outcome = outcome;
      logEvent('task_end', { outcome: outcome, reached: !!state.tasks[b.id].reached });
      currentTask = null; flushEvents(); next();
    };
    document.getElementById('start').onclick = () => {
      frame.src = prototypeSrc();
      logEvent('task_start', {});
      document.getElementById('start-wrap').hidden = true;
      document.getElementById('end-wrap').hidden = false;
      frame.removeAttribute('inert');
      document.getElementById('done').focus();
      arm((b.maxSeconds || 300) * 1000);
    };
    document.getElementById('more').onclick = () => { logEvent('time_extended', { seconds: 120 }); document.getElementById('time-warn').hidden = true; arm(120000 + 60000); document.getElementById('done').focus(); };
    document.getElementById('done').onclick = () => end(state.tasks[b.id].reached || !b.success || (b.success && b.success.selfReport) ? 'completed' : 'completed_unverified');
    document.getElementById('giveup').onclick = () => end('gave_up');
  }
  function scaleHtml(name, n, low, high, legend) {
    let h = '<fieldset class="scale" id="fs-' + name + '" aria-describedby="err-' + name + '"><legend>' + esc(legend) + ' <span class="err" id="err-' + name + '" hidden>Choose a number from 1 to ' + n + '.</span></legend>';
    for (let i = 1; i <= n; i++) h += '<label><input type="radio" name="' + name + '" value="' + i + '"> ' + i + (i === 1 ? '<span class="vh">, ' + esc(low) + '</span>' : i === n ? '<span class="vh">, ' + esc(high) + '</span>' : '') + '</label>';
    return h + '</fieldset><div class="scale-ends" aria-hidden="true"><span>' + esc(low) + '</span><span>' + esc(high) + '</span></div>';
  }
  // Mark unanswered rating groups, explain inline, and move focus to the first.
  function flagMissing(names, summary) {
    document.querySelectorAll('.err').forEach((x) => { x.hidden = true; });
    document.querySelectorAll('fieldset[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
    names.forEach((n) => { const fs = document.getElementById('fs-' + n); if (fs) fs.setAttribute('aria-invalid', 'true'); const er = document.getElementById('err-' + n); if (er) er.hidden = false; });
    say(summary);
    const first = document.querySelector('#fs-' + names[0] + ' input');
    if (first) first.focus();
  }
  function followUps(b) {
    let h = '<section class="panel"><h1>About that task</h1>' + (lastOutcome === 'timeout' ? '<p>Time\'s up for that task. That\'s fine: it tells us something useful.</p>' : '') + '<form id="f">';
    b.followUps.forEach((f) => {
      if (f.type === 'seq') h += scaleHtml(f.id, 7, '1 = Very difficult', '7 = Very easy', 'Overall, how difficult or easy was that task?');
      else if (f.type === 'rating') h += scaleHtml(f.id, 5, '1 = Not at all', '5 = Very much', f.text || 'Your rating');
      else if (f.type === 'single_choice') h += '<fieldset class="scale"><legend>' + esc(f.text) + '</legend>' + (f.options || []).map((o) => '<label><input type="radio" name="' + f.id + '" value="' + esc(o) + '"> ' + esc(o) + '</label>').join('') + '</fieldset>';
      else h += '<label for="' + f.id + '">' + esc(f.text || 'Anything to add?') + (f.required ? '' : ' <span class="muted">(optional)</span>') + '</label><textarea id="' + f.id + '" name="' + f.id + '"></textarea>';
    });
    h += '<div class="actions"><button class="primary" type="submit">Continue</button></div></form></section>';
    render(h);
    document.getElementById('f').onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const missing = b.followUps.filter((f) => (f.type === 'seq' || f.required) && !fd.get(f.id));
      if (missing.length) { flagMissing(missing.map((f) => f.id), missing.length === 1 ? 'One question still needs an answer.' : missing.length + ' questions still need an answer.'); return; }
      b.followUps.forEach((f) => { const v = fd.get(f.id); state.answers[f.id] = f.type === 'seq' || f.type === 'rating' ? Number(v) : v; });
      next();
    };
  }
    // Standard SUS items with two validated substitutions: "design" for
  // "system" (Bangor et al. 2008) and "awkward" for "cumbersome" (Finstad 2006).
  // Further rewording would break comparison with SUS benchmarks.
  const SUS = ['I think that I would like to use this design frequently.', 'I found the design unnecessarily complex.', 'I thought the design was easy to use.', 'I think that I would need the support of a technical person to be able to use this design.', 'I found the various functions in this design were well integrated.', 'I thought there was too much inconsistency in this design.', 'I would imagine that most people would learn to use this design very quickly.', 'I found the design very awkward to use.', 'I felt very confident using the design.', 'I needed to learn a lot of things before I could get going with this design.'];
  function question(b) {
    let h = '<section class="panel"><h1>' + (b.questionType === 'sus' ? 'A few statements about the design' : 'One more question') + '</h1>' + (b.questionType === 'sus' ? '<p>Think about the design you just tried. There are no right or wrong answers.</p>' : '') + '<form id="f">';
    if (b.questionType === 'sus') SUS.forEach((q, i) => { h += scaleHtml(b.id + '_' + (i + 1), 5, '1 = Strongly disagree', '5 = Strongly agree', 'Statement ' + (i + 1) + ' of 10: ' + q); });
    else if (b.questionType === 'rating') h += scaleHtml(b.id, 5, '1 = Not at all', '5 = Very much', b.text);
    else if (b.questionType === 'single_choice') h += '<fieldset class="scale"><legend>' + esc(b.text) + '</legend>' + (b.options || []).map((o) => '<label><input type="radio" name="' + b.id + '" value="' + esc(o) + '"> ' + esc(o) + '</label>').join('') + '</fieldset>';
    else h += '<label for="' + b.id + '">' + esc(b.text) + '</label><textarea id="' + b.id + '" name="' + b.id + '"></textarea>';
    h += '<div class="actions"><button class="primary" type="submit">Continue</button></div></form></section>';
    render(h);
    document.getElementById('f').onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if (b.questionType === 'sus') {
        const vals = SUS.map((_, i) => Number(fd.get(b.id + '_' + (i + 1))));
        const miss = vals.map((v, i) => (v ? null : b.id + '_' + (i + 1))).filter(Boolean);
        if (miss.length) { flagMissing(miss, miss.length + (miss.length === 1 ? ' statement still needs' : ' statements still need') + ' an answer. The first one is statement ' + miss[0].split('_').pop() + '.'); return; }
        state.answers[b.id] = vals;
      } else state.answers[b.id] = fd.get(b.id);
      next();
    };
  }
  async function finish() {
    currentTask = null;
    logEvent('session_end', {});
    stopRecording();
    flushEvents(true);
    enqueue('answers.json', new Blob([JSON.stringify({ answers: state.answers, tasks: state.tasks, device: state.device })], { type: 'application/json' }));
    render('<section class="panel"><h1>Thank you</h1><p id="up" role="status">Sending your session. Please keep this page open.</p></section>');
    progressEl.textContent = '';
    const poll = async () => {
      if (linkDead) { document.getElementById('up').textContent = LINK_DEAD; return; }
      const left = await countPending();
      if (left > 0) { document.getElementById('up').textContent = 'Sending your session (' + left + ' parts left). Please keep this page open.'; await pump(); return setTimeout(poll, 1500); }
      enqueue('done.json', new Blob([JSON.stringify({ finished_at: new Date().toISOString() })], { type: 'application/json' }));
      await pump();
      // Only say it's sent once it really is; keep the saved state otherwise.
      if (linkDead) { document.getElementById('up').textContent = LINK_DEAD; return; }
      if (await countPending()) return setTimeout(poll, 1500);
      document.getElementById('up').textContent = 'All done. Your session has been sent. You can close this page.';
      try { localStorage.removeItem(storeKey); } catch (e) { /* ignore */ }
    };
    poll();
  }

  // A reload stops the recording, and a new recording can't be joined onto
  // the old one. So after a reload mid-test we keep and send what was
  // recorded, mark the session interrupted, and don't record again.
  const firstTaskStep = moderated ? 1 : 3;
  function interrupted() {
    Object.assign(state, saved);
    render('<section class="panel"><h1>Your session was interrupted</h1><p>The page was reloaded or closed, so the recording stopped. Thank you: what you did up to that point is kept and is still useful.</p><p id="up" role="status">Sending what was recorded. Please keep this page open.</p></section>');
    logEvent('session_interrupted', { at_step: saved.step });
    flushEvents(true);
    enqueue('answers.json', new Blob([JSON.stringify({ answers: state.answers, tasks: state.tasks, device: state.device, interrupted: true })], { type: 'application/json' }));
    const poll = async () => {
      if (linkDead) { document.getElementById('up').textContent = LINK_DEAD; return; }
      const left = await countPending();
      if (left > 0) { await pump(); return setTimeout(poll, 1500); }
      enqueue('done.json', new Blob([JSON.stringify({ finished_at: new Date().toISOString(), interrupted: true })], { type: 'application/json' }));
      await pump();
      if (linkDead) { document.getElementById('up').textContent = LINK_DEAD; return; }
      if (await countPending()) return setTimeout(poll, 1500);
      document.getElementById('up').textContent = 'Sent. You can close this page. If you\'d like to try again, please contact the researcher who sent you the link.';
      try { localStorage.removeItem(storeKey); } catch (e) { /* ignore */ }
    };
    poll();
  }
  window.addEventListener('beforeunload', (e) => { if (recorders.some((r) => r.state === 'recording') || memQueue.length) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- start ----------
  if (!token && S.relay) { render('<section class="panel"><h1>This link is incomplete</h1><p>Please open the full link you were sent.</p></section>'); return; }
  openDb().then((d) => {
    db = d;
    pump();
    // Moderated mode records clicks only, so it can carry on where it was.
    if (saved && moderated && saved.step > 0 && saved.step < steps.length - 1) { Object.assign(state, saved); steps[state.step](); }
    else if (saved && saved.step >= firstTaskStep && saved.step < steps.length - 1) interrupted();
    else if (saved && saved.step === steps.length - 1) { Object.assign(state, saved); finish(); }
    else steps[0]();
  });
})();
