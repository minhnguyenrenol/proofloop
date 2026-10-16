/* Proofloop affinity board: themes → groups → notes. Every change is an
 * operation saved by the plugin to affinity/board.json. */
(function () {
  'use strict';
  const h = new URLSearchParams(location.hash.slice(1));
  const key = h.get('k');
  const study = h.get('study');
  const $ = (id) => document.getElementById(id);
  let board = null;
  let summary = null;
  let selected = null;
  const COLORS = 8;

  const api = (path, body) => fetch('/api/board/' + encodeURIComponent(study) + path, body ? { method: 'POST', headers: { 'x-proofloop-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) } : { headers: { 'x-proofloop-key': key } }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; });
  const say = (m) => { $('msg').textContent = m; };

  async function op(o) {
    try { const j = await api('/op', o); board = j.board; summary = j.summary; render(); return j.op; } catch (e) { say(e.message); return null; }
  }
  function load() { api('').then((j) => { board = j.board; summary = j.summary; render(); }).catch((e) => say(e.message)); }

  const participants = () => [...new Set(board.notes.map((n) => n.participant))].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  function noteEl(n) {
    const li = document.createElement('li');
    li.className = 'sticky c' + (participants().indexOf(n.participant) % COLORS);
    li.draggable = board.status !== 'done';
    li.tabIndex = 0;
    li.dataset.note = n.id;
    li.dataset.fk = 'note:' + n.id;
    li.setAttribute('aria-describedby', 'note-hint');
    const quote = (n.evidence || []).find((e) => e.kind === 'quote');
    li.innerHTML = '<span class="who"></span><span class="txt"></span>' + (quote ? '<q></q>' : '');
    li.querySelector('.who').textContent = n.participant + (n.task_id ? ' · ' + n.task_id : '');
    li.querySelector('.txt').textContent = n.text;
    if (quote) li.querySelector('q').textContent = quote.quote;
    if (board.status !== 'done') {
      const mv = document.createElement('button');
      mv.className = 'move';
      mv.textContent = 'Move…';
      mv.setAttribute('aria-label', 'Move note from ' + n.participant);
      mv.dataset.fk = 'move:' + n.id;
      mv.onclick = () => openMove(n.id);
      li.appendChild(mv);
    }
    li.ondragstart = (e) => { e.dataTransfer.setData('text/plain', n.id); };
    li.onfocus = () => { selected = n.id; };
    li.onkeydown = (e) => { if (e.target === li && (e.key === 'm' || e.key === 'M') && board.status !== 'done') { e.preventDefault(); openMove(n.id); } };
    return li;
  }
  function dropZone(el, to) {
    el.ondragover = (e) => { e.preventDefault(); el.classList.add('over'); };
    el.ondragleave = () => el.classList.remove('over');
    el.ondrop = (e) => { e.preventDefault(); el.classList.remove('over'); const id = e.dataTransfer.getData('text/plain'); if (id) op({ op: 'move_note', note_id: id, to: to }); };
  }
  function editable(text, label, onSave, fk) {
    const input = document.createElement('input');
    input.dataset.fk = fk;
    input.value = text;
    input.className = 'label-input';
    input.setAttribute('aria-label', label);
    input.disabled = board.status === 'done';
    input.onchange = () => { const v = input.value.trim(); if (v && v !== text) onSave(v); };
    return input;
  }
  function groupEl(g) {
    const s = summary.groups.find((x) => x.id === g.id) || {};
    const sec = document.createElement('section');
    sec.className = 'group';
    sec.setAttribute('aria-label', 'Group: ' + g.label);
    const head = document.createElement('div');
    head.className = 'group-head';
    const gh = document.createElement('h3');
    gh.className = 'vh';
    gh.textContent = 'Group: ' + g.label;
    head.appendChild(gh);
    head.appendChild(editable(g.label, 'Group label', (v) => op({ op: 'rename_group', group_id: g.id, label: v }), 'label:' + g.id));
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = (s.n_of_N || '') + ' participants · ' + g.note_ids.length + ' notes · ' + (s.confidence || '') + ' confidence';
    head.appendChild(meta);
    const tools = document.createElement('div');
    tools.className = 'tools';
    const themeSel = document.createElement('select');
    themeSel.setAttribute('aria-label', 'Theme for this group');
    themeSel.dataset.fk = 'theme:' + g.id;
    themeSel.disabled = board.status === 'done';
    themeSel.innerHTML = '<option value="">No theme</option>';
    board.themes.forEach((t) => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.label; if (t.group_ids.includes(g.id)) o.selected = true; themeSel.appendChild(o); });
    themeSel.onchange = () => op({ op: 'set_group_theme', group_id: g.id, theme_id: themeSel.value || null });
    tools.appendChild(themeSel);
    const merge = document.createElement('select');
    merge.setAttribute('aria-label', 'Merge this group into');
    merge.dataset.fk = 'merge:' + g.id;
    merge.disabled = board.status === 'done';
    merge.innerHTML = '<option value="">Merge into…</option>';
    board.groups.filter((x) => x.id !== g.id).forEach((x) => { const o = document.createElement('option'); o.value = x.id; o.textContent = x.label; merge.appendChild(o); });
    tools.appendChild(merge);
    // Selects only choose; nothing happens until the button is pressed and confirmed.
    const mergeBtn = document.createElement('button');
    mergeBtn.textContent = 'Merge';
    mergeBtn.dataset.fk = 'mergebtn:' + g.id;
    mergeBtn.disabled = board.status === 'done';
    mergeBtn.onclick = async () => {
      const into = board.groups.find((x) => x.id === merge.value);
      if (!into) { say('Choose the group to merge into first.'); merge.focus(); return; }
      if (await confirmDlg('Merge "' + g.label + '" into "' + into.label + '"? Its ' + g.note_ids.length + ' notes will move there.', 'Merge groups')) {
        if (await op({ op: 'merge_groups', from: g.id, into: into.id })) { say('Merged into "' + into.label + '".'); focusKey('label:' + into.id); }
      }
    };
    tools.appendChild(mergeBtn);
    const del = document.createElement('button');
    del.textContent = 'Remove group';
    del.dataset.fk = 'del:' + g.id;
    del.disabled = board.status === 'done';
    del.onclick = async () => {
      if (!(await confirmDlg('Remove "' + g.label + '"? Its notes go back to Unsorted.', 'Remove group'))) return;
      if (await op({ op: 'delete_group', group_id: g.id })) { say('Group removed. Its notes are in Unsorted.'); focusKey('heading:unsorted'); }
    };
    tools.appendChild(del);
    head.appendChild(tools);
    sec.appendChild(head);
    const ul = document.createElement('ul');
    ul.className = 'notes-list';
    g.note_ids.forEach((id) => { const n = board.notes.find((x) => x.id === id); if (n) ul.appendChild(noteEl(n)); });
    dropZone(sec, g.id);
    sec.appendChild(ul);
    return sec;
  }
  function focusKey(k) { const el = document.querySelector('[data-fk="' + k + '"]'); if (el) { if (el.tagName === 'H2') el.tabIndex = -1; el.focus(); return true; } return false; }
  function confirmDlg(text, okLabel) {
    const dlg = $('confirm-dlg');
    $('confirm-text').textContent = text;
    $('confirm-ok').textContent = okLabel;
    dlg.returnValue = '';
    dlg.showModal();
    return new Promise((resolve) => { dlg.onclose = () => resolve(dlg.returnValue === 'ok'); });
  }
  function render() {
    // Rebuilding the board must not lose the keyboard user's place.
    const fk = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk : null;
    $('title').textContent = board.study + ' · ' + board.notes.length + ' notes from ' + board.n_included + ' participants';
    $('state').textContent = board.status === 'done' ? 'Done' : 'Draft';
    $('done').textContent = board.status === 'done' ? 'Reopen board' : 'Mark board done';
    ['new-group', 'new-theme'].forEach((id) => { $(id).disabled = board.status === 'done'; });
    const root = $('board');
    root.innerHTML = '';
    const inTheme = new Set(board.themes.flatMap((t) => t.group_ids));
    board.themes.forEach((t) => {
      const s = summary.themes.find((x) => x.id === t.id) || {};
      const col = document.createElement('section');
      col.className = 'theme';
      const head = document.createElement('div');
      head.className = 'theme-head';
      col.setAttribute('aria-label', 'Theme: ' + t.label);
      const th = document.createElement('h2');
      th.className = 'vh';
      th.textContent = 'Theme: ' + t.label;
      head.appendChild(th);
      head.appendChild(editable(t.label, 'Theme label', (v) => op({ op: 'rename_theme', theme_id: t.id, label: v }), 'tlabel:' + t.id));
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = 'Theme · ' + (s.n_of_N || '') + ' participants';
      head.appendChild(meta);
      col.appendChild(head);
      t.group_ids.forEach((gid) => { const g = board.groups.find((x) => x.id === gid); if (g) col.appendChild(groupEl(g)); });
      root.appendChild(col);
    });
    const loose = board.groups.filter((g) => !inTheme.has(g.id));
    if (loose.length) {
      const col = document.createElement('section');
      col.className = 'theme loose';
      col.innerHTML = '<div class="theme-head"><h2>Groups without a theme</h2></div>';
      loose.forEach((g) => col.appendChild(groupEl(g)));
      root.appendChild(col);
    }
    const un = document.createElement('section');
    un.className = 'theme unsorted';
    un.innerHTML = '<div class="theme-head"><h2 data-fk="heading:unsorted">Unsorted</h2><div class="meta">Notes that don\'t fit a group yet. That\'s fine; don\'t force them.</div></div>';
    const ul = document.createElement('ul');
    ul.className = 'notes-list';
    board.unsorted.forEach((id) => { const n = board.notes.find((x) => x.id === id); if (n) ul.appendChild(noteEl(n)); });
    un.appendChild(ul);
    dropZone(un, 'unsorted');
    root.appendChild(un);
    if (fk && focusKey(fk)) return;
    if (selected) { const el = root.querySelector('[data-note="' + selected + '"]'); if (el) el.focus(); }
  }
  function openMove(noteId) {
    const sel = $('move-to');
    sel.innerHTML = '';
    const current = (board.groups.find((g) => g.note_ids.includes(noteId)) || { id: 'unsorted' }).id;
    board.groups.forEach((g) => { const o = document.createElement('option'); o.value = g.id; o.textContent = g.label; sel.appendChild(o); });
    const o = document.createElement('option'); o.value = 'unsorted'; o.textContent = 'Unsorted'; sel.appendChild(o);
    sel.value = current;
    const dlg = $('move-dlg');
    dlg.returnValue = '';
    dlg.onclose = () => {
      if (dlg.returnValue !== 'ok' || sel.value === current) { focusKey('note:' + noteId); return; }
      selected = noteId;
      const label = sel.value === 'unsorted' ? 'Unsorted' : sel.options[sel.selectedIndex].textContent;
      op({ op: 'move_note', note_id: noteId, to: sel.value }).then((r) => { if (r) { say('Moved to "' + label + '".'); focusKey('note:' + noteId); } });
    };
    dlg.showModal();
    sel.focus();
  }
  $('new-group').onclick = async () => {
    const r = await op({ op: 'create_group', label: 'New group: describe what people experienced' });
    if (r) { const inp = document.querySelectorAll('.group .label-input'); const last = [...inp].find((i) => i.value.startsWith('New group')); if (last) { last.focus(); last.select(); } }
  };
  $('new-theme').onclick = () => op({ op: 'create_theme', label: 'New theme' });
  $('done').onclick = async () => {
    if (board.status === 'done') { await op({ op: 'reopen' }); return; }
    const r = await op({ op: 'mark_done' });
    if (r) say('Board marked done. Go back to Claude and ask it to write the insights.');
  };
  load();
})();
