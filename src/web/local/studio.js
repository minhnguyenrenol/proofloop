/* Proofloop Studio: records the call window (with the participant's audio)
 * and the moderator's microphone as separate tracks, straight into the
 * laptop study folder through the local plugin server. */
(function () {
  'use strict';
  const h = new URLSearchParams(location.hash.slice(1));
  const key = h.get('k');
  const study = h.get('study');
  const p = h.get('p');
  const api = (path, opts) => fetch('/api/studio/' + encodeURIComponent(study) + '/' + encodeURIComponent(p) + path, Object.assign({}, opts, { headers: Object.assign({ 'x-proofloop-key': key }, (opts && opts.headers) || {}) }));
  const $ = (id) => document.getElementById(id);
  let display = null;
  let mic = null;
  let startedAt = 0;
  const recorders = [];
  const uploads = { screen: Promise.resolve(), mic: Promise.resolve() };
  let failed = false;

  // Serious problems (save failed, sharing stopped) stay up until cleared on purpose;
  // the silence notice has its own quieter slot so it can't hide them.
  function warn(msg) { const w = $('warn'); if (w.textContent === msg) return; w.textContent = msg; w.hidden = !msg; }
  function quiet(msg) { const q = $('quiet'); if (q.textContent !== msg) q.textContent = msg; q.hidden = !msg; }
  let resumed = false; // page reloaded while the plugin still holds a running recording
  function ready() {
    $('start').disabled = !(display && mic && consentOk) || recorders.length > 0 || resumed;
    const todo = [!consentOk && 'record consent in Claude', !display && 'choose the call window', !mic && 'turn on your microphone'].filter(Boolean);
    $('start-hint').textContent = recorders.length ? '' : todo.length ? 'To start: ' + todo.join(', ') + '.' : 'Ready to record.';
  }
  let consentOk = false;

  api('').then((r) => r.json()).then((info) => {
    if (info.error) { warn(info.error); return; }
    $('title').textContent = info.study + ' · ' + info.participant;
    consentOk = info.consent;
    $('script').textContent = '"Before we begin: this session is being recorded so the team can review it. The recording stays inside the company and is deleted after ' + info.mediaDays + ' days. You can ask me to stop at any time."';
    $('consent').textContent = info.consent ? 'Consent is on file for ' + info.participant + '.' : 'No consent record for ' + info.participant + '. Recording stays off until consent is recorded.';
    $('consent').className = info.consent ? 'note ok' : 'note bad';
    if (info.already) warn('This participant already has a recording. Use a new participant id for a new session.');
    if (info.recording) {
      // The page was reloaded mid-call: the plugin still holds what was recorded.
      resumed = true;
      $('stop').disabled = false;
      warn('This page was reloaded during the recording, so recording has paused. Press Stop and save to keep what was recorded so far.');
    }
    const ul = $('sections');
    info.sections.forEach((s) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.textContent = s.title;
      b.disabled = true;
      b.dataset.section = s.id;
      b.onclick = () => { document.querySelectorAll('#sections button').forEach((x) => x.removeAttribute('aria-current')); b.setAttribute('aria-current', 'step'); marker('section', s.title); };
      li.appendChild(b);
      ul.appendChild(li);
    });
    ready();
  }).catch(() => warn('Cannot reach the plugin. Is Claude Code or Cursor still running?'));

  function meter(stream, el, onSilent) {
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    let lastSound = Date.now();
    (function tick() {
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      el.style.width = Math.min(100, peak * 2) + '%';
      if (peak > 6) lastSound = Date.now();
      if (onSilent) onSilent(Date.now() - lastSound);
      requestAnimationFrame(tick);
    })();
  }

  $('pick').onclick = async () => {
    try {
      display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: { suppressLocalAudioPlayback: false, echoCancellation: false, noiseSuppression: false }, systemAudio: 'include', windowAudio: 'system', selfBrowserSurface: 'exclude', surfaceSwitching: 'include' });
      const hasAudio = display.getAudioTracks().length > 0;
      $('pick-state').textContent = hasAudio ? 'Call window and its audio selected.' : 'Selected, but without audio.';
      if (!hasAudio) {
        warn('No call audio was shared, so the participant\'s voice would not be recorded. Choose the window again and tick "Share audio". On a Mac this needs macOS 14.2 or later and Chrome 141 or later; otherwise open the call in a Chrome tab and share that tab.');
        display.getTracks().forEach((t) => t.stop());
        display = null;
      } else {
        if (!resumed) warn('');
        meter(new MediaStream(display.getAudioTracks()), $('lv-sys'), (ms) => {
          if (recorders.length && ms > 10000) quiet('No sound from the participant for 10 seconds. Check they are not muted and that call audio is still shared.');
          else quiet('');
        });
      }
      ready();
    } catch (e) { $('pick-state').textContent = 'Not selected.'; }
  };
  $('mic').onclick = async () => {
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      $('mic-state').textContent = 'On';
      meter(mic, $('lv-mic'));
      ready();
    } catch (e) { $('mic-state').textContent = 'Your browser blocked the microphone. Allow it for this page (icon next to the address), then select Turn on your microphone again.'; }
  };

  function startTrack(stream, track, mime) {
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2500000, audioBitsPerSecond: 128000 });
    let seq = 0;
    rec.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      const n = seq++;
      const blob = e.data;
      // Pieces are written in order; a failed write is retried before the next one.
      uploads[track] = uploads[track].then(async () => {
        for (let attempt = 0; attempt < 5; attempt++) {
          const r = await api('/chunk?track=' + track + '&seq=' + n, { method: 'POST', body: blob }).catch(() => null);
          if (r && r.ok) return;
          // The first try was written but its reply was lost: the server already expects a later piece.
          if (r && r.status === 409) { const j = await r.json().catch(() => ({})); if (j.expected > n) return; }
          await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
        }
        failed = true;
        warn('Saving to the study folder failed. Keep the call going; stop and check the plugin is running.');
      });
    };
    rec.start(5000);
    recorders.push(rec);
  }
  const pick = (kinds) => kinds.find((t) => MediaRecorder.isTypeSupported(t));

  $('start').onclick = async () => {
    $('start').disabled = true; // a double click must not start two recordings
    const t0 = Date.now();
    const r = await api('/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ started_at: t0, tracks: ['screen', 'mic'], capture: display.getVideoTracks()[0].getSettings().displaySurface || 'unknown' }) }).catch(() => null);
    if (!r || !r.ok) { warn(r ? (await r.json()).error : 'Cannot reach the plugin. Is Claude Code or Cursor still running?'); ready(); return; }
    startedAt = t0;
    startTrack(display, 'screen', pick(['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']));
    startTrack(mic, 'mic', pick(['audio/webm;codecs=opus', 'audio/webm']));
    $('rec').hidden = false;
    $('start').disabled = true;
    $('stop').disabled = false;
    $('note').disabled = false;
    document.querySelectorAll('#sections button').forEach((b) => { b.disabled = false; });
    marker('consent_script', 'Recording notice read aloud');
    setInterval(() => { const s = Math.floor((Date.now() - startedAt) / 1000); $('clock').textContent = [s / 3600, (s % 3600) / 60, s % 60].map((x) => String(Math.floor(x)).padStart(2, '0')).join(':'); }, 1000);
    display.getVideoTracks()[0].onended = () => warn('Window sharing stopped. Choose Stop and save, or the rest of the call will not be recorded.');
  };
  $('stop').onclick = async () => {
    $('stop').disabled = true;
    $('saved').textContent = 'Saving…';
    // A recorder whose shared window already closed has stopped on its own;
    // calling stop() on it again would throw and the session would never be saved.
    try {
      await Promise.all(recorders.filter((r) => r.state !== 'inactive').map((r) => new Promise((res) => { r.addEventListener('stop', res, { once: true }); try { r.stop(); } catch (e) { res(); } })));
      await Promise.all(Object.values(uploads));
    } catch (e) { failed = true; }
    [display, mic].forEach((s) => s && s.getTracks().forEach((t) => t.stop()));
    let r = null;
    let j = {};
    try {
      r = await api('/stop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(recorders.length ? { duration_ms: Date.now() - startedAt } : {}) });
      j = await r.json();
    } catch (e) { j = { error: 'Cannot reach the plugin. Is Claude Code or Cursor still running?' }; }
    $('rec').hidden = true;
    $('saved').textContent = r && r.ok && !failed ? 'Saved to the study folder. You can close this page and ask Claude to analyse the session.' : 'Saved with problems: ' + (j.error || 'some pieces failed to save') + '.';
  };

  function marker(kind, text) {
    if (!startedAt) return;
    const t = Date.now() - startedAt;
    api('/marker', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t_ms: t, kind: kind, text: text }) });
    if (kind !== 'section' && kind !== 'consent_script') {
      const li = document.createElement('li');
      li.textContent = new Date(t).toISOString().slice(11, 19) + ' · ' + kind + ' · ' + text;
      $('notes').prepend(li);
    }
  }
  $('note-form').onsubmit = (e) => {
    e.preventDefault();
    const v = $('note').value.trim();
    if (!v) return;
    marker(document.querySelector('input[name=kind]:checked').value, v);
    $('note').value = '';
  };
  document.addEventListener('keydown', (e) => {
    if (e.altKey && /^[1-4]$/.test(e.key)) { const r = document.querySelectorAll('input[name=kind]')[Number(e.key) - 1]; r.checked = true; $('note').focus(); e.preventDefault(); }
  });
  window.addEventListener('beforeunload', (e) => { if (recorders.some((r) => r.state === 'recording')) { e.preventDefault(); e.returnValue = ''; } });
})();
