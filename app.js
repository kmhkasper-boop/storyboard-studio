/* Storyboard Studio – app. Plain JS, no build step. */
(function () {
  'use strict';
  const S = window.SB;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) e.style.setProperty(sk, sv); else e.style[sk] = sv; } }
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
    return e;
  }

  const IMG_EXT = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;
  const VID_EXT = /\.(mp4|m4v|mov|webm)$/i;
  const AUD_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|flac)$/i;
  const SB_FILE = /(^|\/)([^/]*\.storyboard\.json|storyboard\.json)$/i;
  const LS_AUTOSAVE = 'sbs.autosave.v1';
  const LS_PREFS = 'sbs.prefs.v1';
  const HAS_FSA = typeof window.showDirectoryPicker === 'function';

  // ---------- state ----------
  let doc = null;
  let selected = null;
  let view = 'board';
  let undoStack = [], redoStack = [], lastKey = null, lastKeyTime = 0;
  let dirty = false;
  let prefs = Object.assign({ name: 'Lucas', autosave: true, zoom: 240, showText: true }, safeJson(localStorage.getItem(LS_PREFS)) || {});
  const local = { kind: null, root: null, name: '', files: new Map(), lower: new Map(), base: '', jsonPath: '', jsonHandle: null, jsonMtime: 0, jsonName: '', single: false };
  let remoteBase = null; // URL the doc was fetched from (media paths resolve relative to it)
  const urlCache = new Map();
  const sortables = [];

  function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
  function savePrefs() { localStorage.setItem(LS_PREFS, JSON.stringify(prefs)); }

  // ---------- toast / modal ----------
  let toastT = 0;
  function toast(msg, ms = 2600) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms);
  }
  function modal(contentEl, { wide } = {}) {
    const m = $('#modal'), b = $('#modalBody');
    b.innerHTML = ''; b.append(contentEl); m.hidden = false;
    $('.modal-card', m).style.maxWidth = wide ? '980px' : '760px';
    const f = b.querySelector('input,textarea,select'); if (f) setTimeout(() => f.focus(), 30);
  }
  function closeModal() { $('#modal').hidden = true; $('#modalBody').innerHTML = ''; }
  function ask(title, text, buttons) {
    return new Promise(res => {
      const box = el('div', null, el('h2', null, title), el('p', { html: text }),
        el('div', { class: 'modal-actions' }, buttons.map(b => el('button', { class: b.cls || '', onclick: () => { closeModal(); res(b.value); } }, b.label))));
      modal(box);
    });
  }
  function promptModal(title, fields, okLabel = 'OK') {
    return new Promise(res => {
      const inputs = {};
      const form = el('form', { onsubmit: (e) => { e.preventDefault(); const r = {}; for (const k in inputs) r[k] = inputs[k].value; closeModal(); res(r); } },
        el('h2', null, title),
        fields.map(f => el('div', { class: 'fld' }, el('label', null, f.label),
          inputs[f.key] = f.multiline ? el('textarea', { rows: f.rows || 10, placeholder: f.placeholder || '' }) : el('input', { placeholder: f.placeholder || '', value: f.value || '' }),
          f.help ? el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '3px' } }, f.help) : null)),
        el('div', { class: 'modal-actions' }, el('button', { type: 'button', onclick: () => { closeModal(); res(null); } }, 'Cancel'), el('button', { class: 'primary', type: 'submit' }, okLabel)));
      fields.forEach(f => { if (f.value && f.multiline) inputs[f.key].value = f.value; });
      modal(form);
    });
  }

  // ---------- doc helpers ----------
  const allPages = () => S.allPages(doc);
  function findPage(id) {
    for (const s of doc.scenes) { const i = s.pages.findIndex(p => p.id === id); if (i >= 0) return { scene: s, page: s.pages[i], index: i }; }
    return null;
  }
  function pageNumber(id) { return allPages().findIndex(p => p.id === id) + 1; }
  const dur = (p) => S.pageDuration(p, doc);
  const charById = (id) => doc.characters.find(c => c.id === id) || { id, name: id, color: '#888' };

  // ---------- undo / mutate ----------
  function mutate(fn, key, opts = {}) {
    const now = Date.now();
    if (!(key && key === lastKey && now - lastKeyTime < 1500)) {
      undoStack.push(JSON.stringify(doc)); if (undoStack.length > 200) undoStack.shift();
      redoStack = [];
    }
    lastKey = key || null; lastKeyTime = now;
    fn(doc);
    markDirty();
    if (opts.render !== false) render();
  }
  function undo() {
    if (!undoStack.length) return toast('Nothing to undo');
    redoStack.push(JSON.stringify(doc)); doc = JSON.parse(undoStack.pop()); lastKey = null;
    if (selected && !findPage(selected)) selected = null;
    markDirty(); render(); toast('Undone', 1000);
  }
  function redo() {
    if (!redoStack.length) return toast('Nothing to redo');
    undoStack.push(JSON.stringify(doc)); doc = JSON.parse(redoStack.pop()); lastKey = null;
    markDirty(); render(); toast('Redone', 1000);
  }
  let autosaveT = 0;
  function markDirty() {
    dirty = true; updateSaveState();
    try { localStorage.setItem(LS_AUTOSAVE, JSON.stringify({ at: Date.now(), source: local.kind ? local.name + '/' + local.jsonPath : 'browser', doc })); } catch { /* quota */ }
    if ((local.kind === 'fsa' || local.single) && local.jsonHandle && prefs.autosave) {
      clearTimeout(autosaveT); autosaveT = setTimeout(() => save({ auto: true }), 1500);
    }
  }
  function updateSaveState() {
    const s = $('#saveState');
    if (!doc) { s.textContent = ''; return; }
    const live = (local.kind === 'fsa' || local.single) && local.jsonHandle;
    s.textContent = dirty ? (live && prefs.autosave ? 'Saving…' : 'Unsaved changes') : (live ? 'Saved' : 'Saved (download)');
    s.classList.toggle('dirty', dirty);
    $('#btnUndo').disabled = !undoStack.length; $('#btnRedo').disabled = !redoStack.length;
  }

  // ---------- media resolving ----------
  function normPath(p) { return String(p || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').normalize('NFC'); }
  function joinPath(base, rel) {
    const parts = (base ? base.split('/') : []).concat(normPath(rel).split('/'));
    const out = [];
    for (const x of parts) { if (!x || x === '.') continue; if (x === '..') out.pop(); else out.push(x); }
    return out.join('/');
  }
  function relFromBase(full) {
    if (!local.base) return full;
    return full.startsWith(local.base + '/') ? full.slice(local.base.length + 1) : '../'.repeat(local.base.split('/').length) + full;
  }
  function localEntry(rel) {
    if (!local.kind || !rel) return null;
    const full = joinPath(local.base, rel);
    return local.files.get(full) || local.lower.get(full.toLowerCase()) || null;
  }
  async function entryUrl(entry) {
    if (urlCache.has(entry.path)) return urlCache.get(entry.path);
    const p = (async () => { const f = entry.file || await entry.handle.getFile(); return URL.createObjectURL(f); })();
    urlCache.set(entry.path, p);
    try { return await p; } catch (e) { urlCache.delete(entry.path); throw e; }
  }
  const driveThumb = (id, w = 1280) => 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w' + w;
  const driveView = (id) => 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/view';
  const drivePreview = (id) => 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/preview';

  /** Returns {src, kind:'local'|'remote'|'url'|'drive', playable} or null. */
  async function resolveMedia(m) {
    if (!m) return null;
    const e = localEntry(m.path);
    if (e) return { src: await entryUrl(e), kind: 'local', playable: true };
    if (m.url) return { src: m.url, kind: 'url', playable: true };
    if (m.path && remoteBase) return { src: new URL(m.path.split('/').map(encodeURIComponent).join('/'), remoteBase).href, kind: 'remote', playable: true };
    if (m.driveId) return { src: driveThumb(m.driveId), kind: 'drive', playable: false };
    return null;
  }
  function mediaLabel(m) {
    if (!m) return 'none';
    const bits = [];
    if (m.path) bits.push((local.kind ? (localEntry(m.path) ? '✓ ' : '✗ not in folder: ') : '') + m.path);
    if (m.driveId) bits.push('Drive ' + m.driveId.slice(0, 10) + '…');
    if (m.url) bits.push(m.url.startsWith('data:') ? 'embedded image' : m.url.slice(0, 60));
    return bits.join(' · ');
  }
  /** Fills a container with the best visual for a page (image, else video frame, else Drive thumb, else placeholder). */
  function fillThumb(box, p, { w = 640 } = {}) {
    const ph = (txt) => { box.querySelectorAll('img,video').forEach(n => n.remove()); if (!box.querySelector('.ph')) box.prepend(el('div', { class: 'ph' }, txt)); };
    const tryImg = (src, fallback) => {
      const img = el('img', { alt: '', loading: 'lazy', draggable: 'false' });
      img.onerror = () => { img.remove(); fallback(); };
      img.src = src; box.prepend(img);
    };
    (async () => {
      const im = p.image, vi = p.video;
      const drivePh = (m) => () => ph(m && m.driveId ? 'Drive file not visible here. Sign in to Google in this browser, or open the folder locally.' : 'Missing file: ' + (m && m.path || ''));
      const imgR = await resolveMedia(im).catch(() => null);
      if (imgR) {
        if (imgR.kind === 'drive') return tryImg(driveThumb(im.driveId, w), drivePh(im));
        return tryImg(imgR.src, () => (im.driveId ? tryImg(driveThumb(im.driveId, w), drivePh(im)) : drivePh(im)()));
      }
      const vidR = await resolveMedia(vi).catch(() => null);
      if (vidR && vidR.playable) {
        const v = el('video', { preload: 'metadata', playsinline: true });
        v.muted = true; v.src = vidR.src + '#t=0.1';
        v.onerror = () => { v.remove(); vi.driveId ? tryImg(driveThumb(vi.driveId, w), drivePh(vi)) : ph('Missing video: ' + vi.path); };
        box.prepend(v); return;
      }
      if (vi && vi.driveId) return tryImg(driveThumb(vi.driveId, w), drivePh(vi));
      if (im || vi) return ph(local.kind ? 'Missing: ' + ((im || vi).path || '?') : 'Open the project folder to see this file');
      ph('No image yet. Drop one here');
    })();
  }

  // ---------- rendering ----------
  function render() {
    const has = !!doc;
    $('#empty').hidden = has; $('#toolbar').style.display = has ? '' : 'none'; $('#sidebar').style.display = has ? '' : 'none';
    $('#board').hidden = !has || view !== 'board'; $('#script').hidden = !has || view !== 'script';
    $$('#topbar > button, #topbar .seg, #docTitle, #runtime').forEach(n => { if (n.id !== 'btnMenu') n.style.visibility = has ? '' : 'hidden'; });
    renderModeBadge();
    if (!has) { $('#editor').hidden = true; updateSaveState(); return; }
    document.documentElement.style.setProperty('--card', prefs.zoom + 'px');
    const [aw, ah] = doc.aspect.split(':'); document.documentElement.style.setProperty('--aspect', aw + '/' + ah);
    if (document.activeElement !== $('#docTitle')) $('#docTitle').value = doc.title;
    renderFilters(); renderHeader(); renderSidebar();
    if (view === 'board') renderBoard(); else renderScript();
    renderEditor(); updateSaveState();
  }
  function renderModeBadge() {
    const b = $('#modeBadge');
    if (local.kind === 'fsa') b.textContent = '📂 ' + local.name + (local.jsonPath ? ' / ' + local.jsonPath : '') + ' · live save';
    else if (local.kind === 'files') b.textContent = '📂 ' + local.name + ' · read-only (Save downloads)';
    else if (local.single) b.textContent = '📄 ' + local.jsonName + ' · live save';
    else if (doc) b.textContent = remoteBase ? '🌐 online sample' : '🌐 online · Drive thumbnails';
    else b.textContent = '';
    b.title = local.kind === 'files' ? 'This browser cannot write into folders. Save downloads the storyboard file; put it back in the folder.' : '';
  }
  function renderHeader() {
    let total = 0, n = 0; for (const p of allPages()) { n++; if (p.status !== 'cut') total += dur(p); }
    $('#runtime').textContent = n + ' pages · ' + S.fmtTime(total);
  }
  function renderFilters() {
    const fs = $('#fStatus'), fc = $('#fChar');
    if (fs.options.length === 1) S.STATUSES.forEach(s => fs.append(el('option', { value: s.id }, s.label)));
    const cur = fc.value; fc.innerHTML = '<option value="">All characters</option>';
    doc.characters.forEach(c => fc.append(el('option', { value: c.id }, c.name))); fc.value = cur;
  }
  function pageMatches(p) {
    const q = $('#search').value.trim().toLowerCase(), st = $('#fStatus').value, ch = $('#fChar').value;
    if (st && p.status !== st) return false;
    if (ch && !p.characters.includes(ch)) return false;
    if (q) { const hay = [p.title, p.code, p.lyric, p.description, p.camera, p.notes, p.imagePrompt, p.clipPrompt, p.flag].join(' ').toLowerCase(); if (!hay.includes(q)) return false; }
    return true;
  }
  function renderSidebar() {
    const ol = $('#sceneList'); ol.innerHTML = '';
    doc.scenes.forEach(s => {
      const t = s.pages.reduce((a, p) => a + (p.status === 'cut' ? 0 : dur(p)), 0);
      ol.append(el('li', { dataset: { id: s.id }, onclick: () => { const n = document.getElementById('scene-' + s.id); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
        el('span', { class: 'sw', style: { background: s.color } }), el('span', { class: 'nm' }, s.title), el('span', { class: 'ct' }, s.pages.length + ' · ' + S.fmtTime(t))));
    });
  }
  function cardEl(p, num) {
    const thumb = el('div', { class: 'thumb' }, el('span', { class: 'num' }, String(num) + (p.code && p.code !== S.pad2(num) && p.code !== String(num) ? ' · ' + p.code : '')));
    if (p.video) thumb.append(el('span', { class: 'badge-vid', title: 'Has video: ' + mediaLabel(p.video) }, '🎞'));
    const open = p.comments.filter(c => !c.done).length;
    if (open) thumb.append(el('span', { class: 'badge-cm', title: open + ' open comment(s)' }, '💬 ' + open));
    if (p.flag) thumb.append(el('span', { class: 'flag', title: p.flag }, '⚑ ' + p.flag.slice(0, 18)));
    fillThumb(thumb, p);
    const tc = [p.start, p.end].filter(Boolean).join('–');
    const card = el('div', { class: 'card' + (p.id === selected ? ' sel' : '') + (pageMatches(p) ? '' : ' filtered-out'), dataset: { id: p.id }, tabindex: 0 },
      thumb,
      el('div', { class: 'body' },
        el('div', { class: 'row1' }, el('span', { class: 'st st-' + p.status, title: p.status }), tc ? el('span', { class: 'tc' }, tc) : null, el('span', { class: 'dur' }, (Math.round(dur(p) * 10) / 10) + 's')),
        p.title ? el('div', { class: 'ttl' }, p.title) : null,
        p.lyric ? el('div', { class: 'lyr' }, p.lyric) : null,
        p.description ? el('div', { class: 'desc' }, p.description) : null,
        p.characters.length ? el('div', { class: 'chars' }, p.characters.map(c => el('span', { class: 'chip', style: { borderColor: charById(c).color } }, charById(c).name))) : null));
    card.addEventListener('click', () => select(p.id));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter') select(p.id); });
    addMediaDrop(card, p.id, null);
    return card;
  }
  function updateCard(id) {
    const old = document.querySelector('.card[data-id="' + CSS.escape(id) + '"]');
    if (!old) return;
    old.replaceWith(cardEl(findPage(id).page, pageNumber(id)));
  }
  function renderBoard() {
    sortables.splice(0).forEach(s => s.destroy());
    const board = $('#board'); const scrollTop = $('#main').scrollTop;
    board.innerHTML = ''; board.classList.toggle('hide-text', !prefs.showText);
    let n = 0;
    doc.scenes.forEach((s, si) => {
      const grid = el('div', { class: 'grid', dataset: { scene: s.id } });
      s.pages.forEach(p => grid.append(cardEl(p, ++n)));
      grid.append(el('button', { class: 'add-card', title: 'Add a page to this scene', onclick: () => addPage(s.id) }, '+ Page'));
      const t = s.pages.reduce((a, p) => a + (p.status === 'cut' ? 0 : dur(p)), 0);
      const title = el('input', { class: 'sc-title', value: s.title, 'aria-label': 'Scene title' });
      title.addEventListener('input', () => mutate(d => { d.scenes.find(x => x.id === s.id).title = title.value; }, 'scene-title:' + s.id, { render: false }));
      title.addEventListener('change', () => renderSidebar());
      const color = el('input', { type: 'color', value: s.color, title: 'Scene colour', style: { width: '28px', height: '24px', padding: '0', border: '0', background: 'none' } });
      color.addEventListener('change', () => mutate(d => { d.scenes.find(x => x.id === s.id).color = color.value; }));
      const sec = el('section', { class: 'scene' + (s.collapsed ? ' collapsed' : ''), id: 'scene-' + s.id, dataset: { id: s.id }, style: { '--sc': s.color } },
        el('div', { class: 'scene-head' },
          el('span', { class: 'grip', title: 'Drag to reorder scenes' }, '⠿'), color, title,
          el('span', { class: 'meta' }, s.pages.length + ' pages · ' + S.fmtTime(t)),
          el('div', { class: 'tools' },
            el('button', { title: 'Collapse/expand', onclick: () => mutate(d => { const x = d.scenes.find(x => x.id === s.id); x.collapsed = !x.collapsed; }) }, s.collapsed ? '▸' : '▾'),
            el('button', { title: 'Move scene up', class: 'sc-up', disabled: si === 0, onclick: () => moveScene(s.id, -1) }, '↑'),
            el('button', { title: 'Move scene down', class: 'sc-down', disabled: si === doc.scenes.length - 1, onclick: () => moveScene(s.id, 1) }, '↓'),
            el('button', { title: 'Scene notes', onclick: () => editSceneNotes(s.id) }, '✎ notes'),
            el('button', { title: 'Duplicate scene', onclick: () => duplicateScene(s.id) }, '⧉'),
            el('button', { title: 'Delete scene', class: 'danger', onclick: () => deleteScene(s.id) }, '🗑'))),
        s.notes ? el('div', { class: 'muted', style: { margin: '-2px 0 8px 30px', fontSize: '12.5px', whiteSpace: 'pre-wrap' } }, s.notes) : null,
        grid);
      board.append(sec);
      sortables.push(Sortable.create(grid, {
        group: 'pages', draggable: '.card', filter: '.add-card', preventOnFilter: false, animation: 150, delayOnTouchOnly: true, delay: 180,
        ghostClass: 'sortable-ghost', chosenClass: 'sortable-chosen', onEnd: syncPagesFromDom
      }));
    });
    sortables.push(Sortable.create(board, { handle: '.grip', draggable: '.scene', animation: 150, onEnd: () => syncScenesFromDom($$('#board > .scene').map(n => n.dataset.id)) }));
    sortables.push(Sortable.create($('#sceneList'), { animation: 150, delayOnTouchOnly: true, delay: 180, onEnd: () => syncScenesFromDom($$('#sceneList li').map(n => n.dataset.id)) }));
    $('#main').scrollTop = scrollTop;
  }
  function syncPagesFromDom() {
    const map = new Map(allPages().map(p => [p.id, p]));
    const order = $$('#board .grid').map(g => ({ scene: g.dataset.scene, ids: $$('.card', g).map(c => c.dataset.id) }));
    const before = doc.scenes.map(s => s.pages.map(p => p.id).join(',')).join('|');
    const after = order.map(o => o.ids.join(',')).join('|');
    if (before === after) return render();
    mutate(d => { for (const o of order) d.scenes.find(s => s.id === o.scene).pages = o.ids.map(id => map.get(id)); });
  }
  function syncScenesFromDom(ids) {
    if (ids.join() === doc.scenes.map(s => s.id).join()) return render();
    mutate(d => { const m = new Map(d.scenes.map(s => [s.id, s])); d.scenes = ids.map(id => m.get(id)); });
  }
  function renderScript() {
    const box = $('#script'); box.innerHTML = '';
    box.append(el('h1', null, doc.title), doc.project ? el('p', { class: 'muted' }, doc.project) : '', doc.notes ? el('p', { class: 'notes' }, doc.notes) : '');
    let n = 0, t = 0;
    doc.scenes.forEach((s, si) => {
      box.append(el('h2', null, (si + 1) + '. ' + s.title), s.notes ? el('p', { class: 'notes' }, s.notes) : '');
      s.pages.forEach(p => {
        n++;
        const d = dur(p); const at = t; if (p.status !== 'cut') t += d;
        const head = ['PAGE ' + S.pad2(n), p.start ? [p.start, p.end].filter(Boolean).join('–') : '@' + S.fmtTime(at), (Math.round(d * 10) / 10) + 's', p.camera, p.status.toUpperCase()].filter(Boolean).join(' · ');
        const chars = p.characters.map(c => charById(c).name).join(', ');
        const sp = el('div', { class: 'sp' + (pageMatches(p) ? '' : ' filtered-out'), dataset: { id: p.id }, onclick: () => select(p.id) },
          el('div', { class: 'h' }, head + (p.title ? ' — ' + p.title : '')),
          p.lyric ? el('div', { class: 'l' }, '♪ ' + p.lyric) : null,
          p.description ? el('div', null, (chars ? chars.toUpperCase() + ' — ' : '') + p.description) : (chars ? el('div', null, chars) : null),
          p.notes ? el('div', { class: 'c' }, 'Note: ' + p.notes) : null,
          p.status === 'cut' ? el('div', { class: 'c' }, '(cut)') : null);
        if (p.status === 'cut') sp.style.opacity = '.5';
        box.append(sp);
      });
    });
    box.append(el('p', { class: 'muted' }, n + ' pages · ' + S.fmtTime(t)));
  }

  // ---------- editor ----------
  function select(id) {
    selected = id;
    $$('.card.sel').forEach(c => c.classList.remove('sel'));
    const c = id && document.querySelector('.card[data-id="' + CSS.escape(id) + '"]'); if (c) c.classList.add('sel');
    renderEditor();
  }
  function renderEditor() {
    const ed = $('#editor');
    const f = selected && doc && findPage(selected);
    if (!f) { ed.hidden = true; ed.innerHTML = ''; return; }
    const { page: p, scene } = f; const num = pageNumber(p.id);
    const keepScroll = ed.scrollTop; ed.hidden = false; ed.innerHTML = '';
    const total = allPages().length;
    const field = (key, label, opts = {}) => {
      const inp = opts.multiline ? el('textarea', { rows: opts.rows || 3, placeholder: opts.placeholder || '' }) : el('input', { placeholder: opts.placeholder || '' });
      inp.value = p[key] == null ? '' : p[key]; inp.dataset.field = key;
      inp.addEventListener('input', () => {
        mutate(() => { const x = findPage(p.id).page; x[key] = opts.number ? (parseFloat(inp.value) > 0 ? parseFloat(inp.value) : null) : inp.value; }, 'f:' + p.id + ':' + key, { render: false });
        updateCard(p.id); renderHeader(); if (view === 'script') renderScript();
      });
      return el('div', { class: 'fld' }, el('label', null, label), inp);
    };
    const statusSel = el('select', { 'data-field': 'status' }, S.STATUSES.map(s => el('option', { value: s.id }, s.label))); statusSel.value = p.status;
    statusSel.addEventListener('change', () => mutate(() => { findPage(p.id).page.status = statusSel.value; }));
    const sceneSel = el('select', { title: 'Move to scene', 'data-field': 'scene' }, doc.scenes.map(s => el('option', { value: s.id }, s.title))); sceneSel.value = scene.id;
    sceneSel.addEventListener('change', () => movePageToScene(p.id, sceneSel.value));
    ed.append(
      el('div', { class: 'ed-head' },
        el('button', { title: 'Previous page', disabled: num <= 1, onclick: () => select(allPages()[num - 2].id) }, '‹'),
        el('h2', null, 'Page ' + num + ' / ' + total),
        el('button', { title: 'Next page', disabled: num >= total, onclick: () => select(allPages()[num].id) }, '›'),
        el('button', { title: 'Close', class: 'ed-close', onclick: () => select(null) }, '✕')),
      el('div', { class: 'ed-tools' },
        el('button', { class: 'ed-up', onclick: () => movePage(p.id, -1), title: 'Move earlier' }, '↑ Earlier'),
        el('button', { class: 'ed-down', onclick: () => movePage(p.id, 1), title: 'Move later' }, '↓ Later'),
        el('button', { onclick: () => addPage(scene.id, p.id), title: 'Insert a new page after this one' }, '+ After'),
        el('button', { class: 'ed-dup', onclick: () => duplicatePage(p.id) }, '⧉ Duplicate'),
        el('button', { onclick: () => play(p.id) }, '▶ From here'),
        el('button', { class: 'danger ed-del', onclick: () => deletePage(p.id) }, '🗑 Delete')),
      el('div', { class: 'row' }, el('div', { class: 'fld' }, el('label', null, 'Status'), statusSel), el('div', { class: 'fld' }, el('label', null, 'Scene'), sceneSel)),
      mediaSlot(p, 'image'), mediaSlot(p, 'video'),
      el('div', { class: 'row' }, field('start', 'Start (song time)', { placeholder: '1:57' }), field('end', 'End', { placeholder: '2:03' }), field('duration', 'Duration (s)', { number: true, placeholder: 'auto ' + (Math.round(dur(p) * 10) / 10) })),
      el('div', { class: 'row' }, field('title', 'Short title', { placeholder: 'e.g. First breath' }), field('code', 'Code / old page no.', { placeholder: 'e.g. 03' })),
      field('lyric', 'Lyric / dialogue', { multiline: true, rows: 2 }),
      field('description', 'Description / action', { multiline: true, rows: 4 }),
      field('camera', 'Camera', { placeholder: 'e.g. medium shot, fast push-in' }),
      charPicker(p),
      field('imagePrompt', 'Image prompt', { multiline: true, rows: 4 }),
      field('clipPrompt', 'Clip prompt (image-to-video)', { multiline: true, rows: 3 }),
      field('notes', 'Notes', { multiline: true, rows: 2 }),
      field('flag', 'Flag (needs Lucas OK…)', { placeholder: 'e.g. drink – Lucas to OK' }),
      commentsBox(p),
      el('div', { class: 'muted', style: { fontSize: '11px', marginTop: '10px' } }, 'id: ' + p.id)
    );
    ed.scrollTop = keepScroll;
  }
  function charPicker(p) {
    const box = el('div', { class: 'charpick' });
    doc.characters.forEach(c => {
      const cb = el('input', { type: 'checkbox' }); cb.checked = p.characters.includes(c.id);
      cb.addEventListener('change', () => { mutate(() => { const x = findPage(p.id).page; x.characters = cb.checked ? [...new Set([...x.characters, c.id])] : x.characters.filter(i => i !== c.id); }, null, { render: false }); updateCard(p.id); });
      box.append(el('label', { style: { borderColor: c.color } }, cb, c.name));
    });
    box.append(el('button', { style: { fontSize: '12px', padding: '2px 8px' }, onclick: addCharacterPrompt }, '+ character'));
    return el('div', { class: 'fld' }, el('label', null, 'Characters'), box);
  }
  async function addCharacterPrompt() {
    const r = await promptModal('Add character', [{ key: 'name', label: 'Name', placeholder: 'e.g. Saisha' }]);
    if (!r || !r.name.trim()) return;
    mutate(d => { const id = S.slug(r.name); if (!d.characters.find(c => c.id === id)) d.characters.push({ id, name: r.name.trim(), color: S.SCENE_COLORS[d.characters.length % S.SCENE_COLORS.length] }); });
  }
  function commentsBox(p) {
    const list = el('div', { class: 'comments' });
    p.comments.forEach(c => {
      const done = el('input', { type: 'checkbox', title: 'Resolved' }); done.checked = c.done;
      done.addEventListener('change', () => mutate(() => { findPage(p.id).page.comments.find(x => x.id === c.id).done = done.checked; }));
      list.append(el('div', { class: 'cm' + (c.done ? ' done' : '') }, done, ' ', el('b', null, c.by || '?'), el('span', { class: 'when' }, (c.at || '').slice(0, 16).replace('T', ' ')),
        el('div', { style: { whiteSpace: 'pre-wrap' } }, c.text)));
    });
    const ta = el('textarea', { rows: 2, placeholder: 'Comment for Mirrage / Lucas…', class: 'cm-new' });
    const add = el('button', { class: 'cm-add', onclick: () => { if (!ta.value.trim()) return; mutate(() => { findPage(p.id).page.comments.push({ id: S.uid('c'), by: prefs.name || 'Lucas', at: new Date().toISOString(), text: ta.value.trim(), done: false }); }); } }, 'Add comment');
    return el('div', { class: 'fld' }, el('label', null, 'Comments (' + p.comments.filter(c => !c.done).length + ' open)'), list, ta, el('div', { style: { marginTop: '4px' } }, add));
  }
  function mediaSlot(p, type) {
    const m = p[type];
    const prev = el('div', { class: 'prev' });
    const note = (t) => el('div', { class: 'muted', style: { fontSize: '12px', padding: '8px', textAlign: 'center' } }, t);
    (async () => {
      const r = await resolveMedia(m).catch(() => null);
      if (!r) { prev.append(note(m ? (local.kind ? 'File not found in the opened folder' : 'Open the project folder to see this file') : 'Drop ' + (type === 'image' ? 'an image' : 'a video') + ' here')); return; }
      if (type === 'video' && r.playable) prev.append(el('video', { src: r.src, controls: true, playsinline: true, preload: 'metadata' }));
      else {
        const img = el('img', { src: r.kind === 'drive' ? driveThumb(m.driveId, 800) : r.src, alt: '' });
        img.onerror = () => img.replaceWith(note(type === 'video' ? 'Video on Drive. Open the folder locally to play it here, or use ↗ Drive.' : 'Drive image not visible. Sign in to Google in this browser, or open the folder locally.'));
        prev.append(img);
      }
    })();
    const btns = el('div', { class: 'btns' },
      el('button', { class: 'm-file', onclick: () => pickFileFor(p.id, type), title: 'Choose a file from this computer' }, '📁 File…'),
      hasFolder() ? el('button', { class: 'm-folder', onclick: () => pickFromFolder(p.id, type), title: 'Pick a file that is already in the project folder' }, '🗂 From folder…') : null,
      el('button', { class: 'm-link', onclick: () => linkDialog(p.id, type), title: 'Paste a Google Drive link or ID, or type a path' }, '🔗 Drive link / path…'),
      m && m.driveId ? el('a', { href: driveView(m.driveId), target: '_blank', rel: 'noopener' }, el('button', { type: 'button' }, '↗ Drive')) : null,
      type === 'video' && m && m.driveId && !localEntry(m.path) ? el('button', { title: 'Try the Drive player (needs Google sign-in; may not work in every browser)', onclick: () => { prev.innerHTML = ''; prev.append(el('iframe', { src: drivePreview(m.driveId), allow: 'autoplay; fullscreen', allowfullscreen: true })); } }, '▶ Drive player') : null,
      m ? el('button', { class: 'danger m-clear', title: 'Remove', onclick: () => mutate(() => { findPage(p.id).page[type] = null; }) }, '✕') : null);
    const slot = el('div', { class: 'slot slot-' + type }, el('div', { class: 'slot-title' }, type === 'image' ? '🖼 Image' : '🎞 Video / animated'), prev, el('div', { class: 'src' }, mediaLabel(m)), btns);
    addMediaDrop(slot, p.id, type);
    return slot;
  }

  // ---------- page/scene operations ----------
  function addPage(sceneId, afterId) {
    const np = S.normPage({ id: S.uid('p') });
    mutate(d => { const s = d.scenes.find(x => x.id === sceneId); const i = afterId ? s.pages.findIndex(p => p.id === afterId) + 1 : s.pages.length; s.pages.splice(i, 0, np); });
    select(np.id);
    const c = document.querySelector('.card[data-id="' + np.id + '"]'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'nearest' });
    const t = $('#editor textarea[data-field="description"]'); if (t) t.focus();
    return np.id;
  }
  function duplicatePage(id) {
    const f = findPage(id); const cp = JSON.parse(JSON.stringify(f.page)); cp.id = S.uid('p'); cp.comments = [];
    mutate(d => { const s = d.scenes.find(x => x.id === f.scene.id); s.pages.splice(s.pages.findIndex(p => p.id === id) + 1, 0, cp); });
    select(cp.id); toast('Page duplicated');
  }
  function deletePage(id) {
    const n = pageNumber(id);
    mutate(d => { for (const s of d.scenes) s.pages = s.pages.filter(p => p.id !== id); });
    if (selected === id) select(null);
    toast('Page ' + n + ' deleted · Undo with Ctrl/Cmd+Z');
  }
  function movePage(id, delta) {
    const f = findPage(id);
    mutate(d => {
      const s = d.scenes.find(x => x.id === f.scene.id); const i = s.pages.findIndex(p => p.id === id);
      if (delta < 0 && i > 0) { [s.pages[i - 1], s.pages[i]] = [s.pages[i], s.pages[i - 1]]; }
      else if (delta > 0 && i < s.pages.length - 1) { [s.pages[i + 1], s.pages[i]] = [s.pages[i], s.pages[i + 1]]; }
      else { const si = d.scenes.indexOf(s); const tgt = d.scenes[si + delta]; if (!tgt) return; const [pg] = s.pages.splice(i, 1); if (delta < 0) tgt.pages.push(pg); else tgt.pages.unshift(pg); }
    });
  }
  function movePageToScene(id, sceneId) {
    mutate(d => { let pg; for (const s of d.scenes) { const i = s.pages.findIndex(p => p.id === id); if (i >= 0) pg = s.pages.splice(i, 1)[0]; } d.scenes.find(s => s.id === sceneId).pages.push(pg); });
  }
  function addScene() {
    const s = S.normScene({ title: 'Scene ' + (doc.scenes.length + 1), pages: [] }, doc.scenes.length);
    mutate(d => d.scenes.push(s));
    setTimeout(() => { const n = document.getElementById('scene-' + s.id); if (n) { n.scrollIntoView({ behavior: 'smooth' }); n.querySelector('.sc-title').select(); } }, 50);
  }
  function moveScene(id, delta) {
    mutate(d => { const i = d.scenes.findIndex(s => s.id === id); const j = i + delta; if (j < 0 || j >= d.scenes.length) return; [d.scenes[i], d.scenes[j]] = [d.scenes[j], d.scenes[i]]; });
  }
  function duplicateScene(id) {
    mutate(d => { const i = d.scenes.findIndex(s => s.id === id); const cp = JSON.parse(JSON.stringify(d.scenes[i])); cp.id = S.uid('s'); cp.title += ' (copy)'; cp.pages.forEach(p => { p.id = S.uid('p'); p.comments = []; }); d.scenes.splice(i + 1, 0, cp); });
  }
  async function deleteScene(id) {
    const s = doc.scenes.find(x => x.id === id);
    if (s.pages.length) {
      const r = await ask('Delete scene?', 'Delete <b>' + esc(s.title) + '</b> and its ' + s.pages.length + ' page(s)? You can undo this.', [{ label: 'Cancel', value: false }, { label: 'Delete', value: true, cls: 'danger' }]);
      if (!r) return;
    }
    mutate(d => { d.scenes = d.scenes.filter(x => x.id !== id); if (!d.scenes.length) d.scenes.push(S.normScene({ title: 'Scene 1' }, 0)); });
    if (selected && !findPage(selected)) select(null);
  }
  async function editSceneNotes(id) {
    const s = doc.scenes.find(x => x.id === id);
    const r = await promptModal('Notes for ' + s.title, [{ key: 'notes', label: 'Scene notes (mood, location, purpose…)', multiline: true, rows: 6, value: s.notes }], 'Save');
    if (r) mutate(d => { d.scenes.find(x => x.id === id).notes = r.notes; });
  }

  // ---------- media replacement ----------
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  function addMediaDrop(node, pageId, type) {
    node.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); node.classList.add('dragover'); });
    node.addEventListener('dragleave', () => node.classList.remove('dragover'));
    node.addEventListener('drop', (e) => {
      node.classList.remove('dragover');
      const files = e.dataTransfer && e.dataTransfer.files; if (!files || !files.length) return;
      e.preventDefault(); e.stopPropagation(); $('#dropHint').hidden = true;
      attachFiles(pageId, Array.from(files), type);
    });
  }
  async function attachFiles(pageId, files, forceType) {
    for (const file of files) {
      const t = forceType || (file.type.startsWith('video') || VID_EXT.test(file.name) ? 'video' : file.type.startsWith('image') || IMG_EXT.test(file.name) ? 'image' : null);
      if (!t) { toast('Not an image or video: ' + file.name); continue; }
      const m = await mediaFromFile(file, t);
      if (!m) continue;
      mutate(() => {
        const pg = findPage(pageId).page; pg[t] = m;
        if (t === 'image' && pg.status === 'idea') pg.status = 'image';
        if (t === 'video' && (pg.status === 'idea' || pg.status === 'image')) pg.status = 'animated';
      });
      if (!m.url || !m.url.startsWith('data:')) toast((t === 'image' ? 'Image' : 'Video') + ' set: ' + (m.path || m.name));
    }
  }
  /** Turns a dropped/picked file into a media reference. Reuses a matching file already in the folder, copies into media/ when writable. */
  async function mediaFromFile(file, type) {
    const name = file.name.normalize('NFC');
    if (local.kind) {
      for (const e of local.files.values()) {
        if (e.name === name && !e.path.startsWith('session:')) {
          const f = e.file || await e.handle.getFile().catch(() => null);
          if (f && f.size === file.size) return { driveId: '', path: relFromBase(e.path), url: '', name };
        }
      }
    }
    if (local.kind === 'fsa') {
      try {
        let dir = local.root; for (const part of local.base ? local.base.split('/') : []) dir = await dir.getDirectoryHandle(part);
        const mdir = await dir.getDirectoryHandle('media', { create: true });
        let fname = name, i = 1;
        while (true) { try { await mdir.getFileHandle(fname); fname = name.replace(/(\.[^.]+)?$/, '-' + (++i) + '$1'); } catch { break; } }
        const fh = await mdir.getFileHandle(fname, { create: true });
        const w = await fh.createWritable(); await w.write(file); await w.close();
        const full = joinPath(local.base, 'media/' + fname);
        const entry = { path: full, name: fname, handle: fh, type };
        local.files.set(full, entry); local.lower.set(full.toLowerCase(), entry);
        return { driveId: '', path: 'media/' + fname, url: '', name: fname };
      } catch (e) { console.warn(e); toast('Could not copy into the folder: ' + e.message); }
    }
    if (type === 'image') {
      const url = await downscale(file, 1280, 0.82);
      toast('Image embedded in the storyboard file. Better: put it in the Drive folder and link it.', 4500);
      return { driveId: '', path: '', url, name };
    }
    // video without a writable folder: link by name; plays this session only
    const full = joinPath(local.base, name);
    const entry = { path: full, name, file, type, session: true };
    local.files.set(full, entry); local.lower.set(full.toLowerCase(), entry);
    if (!local.kind) local.kind = 'session';
    toast('Video linked by file name "' + name + '". Put it in the project folder so it plays next time.', 5000);
    return { driveId: '', path: name, url: '', name };
  }
  function downscale(file, max, q) {
    return new Promise((res, rej) => {
      const img = new Image(); const u = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        res(c.toDataURL('image/jpeg', q));
      };
      img.onerror = () => rej(new Error('Unreadable image')); img.src = u;
    });
  }
  function pickFileFor(pageId, type) {
    const inp = $('#fileMedia'); inp.accept = type === 'image' ? 'image/*' : 'video/*'; inp.value = '';
    inp.onchange = () => { if (inp.files.length) attachFiles(pageId, [inp.files[0]], type); };
    inp.click();
  }
  async function linkDialog(pageId, type) {
    const m = findPage(pageId).page[type] || {};
    const r = await promptModal((type === 'image' ? 'Image' : 'Video') + ' link', [
      { key: 'drive', label: 'Google Drive link or file ID', value: m.driveId || (m.url && !m.url.startsWith('data:') ? m.url : ''), placeholder: 'https://drive.google.com/file/d/…/view', help: 'In Drive: right-click the file → Share → Copy link. Used for thumbnails online.' },
      { key: 'path', label: 'Path inside the project folder', value: m.path || '', placeholder: 'e.g. bp-sb2-clips/SB2_03_v2.mp4', help: 'Relative to the folder that holds the storyboard file. Used when the folder is opened on your computer.' }
    ], 'Set');
    if (!r) return;
    const raw = r.drive.trim(); const id = S.parseDriveId(raw); const isUrl = !id && /^https?:/.test(raw);
    if (raw && !id && !isUrl) return toast('That does not look like a Drive link or ID');
    const nm = S.normMedia({ driveId: id || '', path: normPath(r.path.trim()), url: isUrl ? raw : '' });
    mutate(() => { findPage(pageId).page[type] = nm; });
  }
  function pickFromFolder(pageId, type, onPick) {
    const re = type === 'image' ? IMG_EXT : type === 'video' ? VID_EXT : AUD_EXT;
    const items = Array.from(local.files.values()).filter(e => re.test(e.name) && !e.session).sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
    const q = el('input', { type: 'search', placeholder: 'Filter ' + items.length + ' files…', style: { width: '100%', marginBottom: '8px' } });
    const grid = el('div', { class: 'picker-grid' });
    const draw = () => {
      grid.innerHTML = ''; const f = q.value.toLowerCase();
      items.filter(e => e.path.toLowerCase().includes(f)).slice(0, 300).forEach(e => {
        const t = el('div', { class: 't' });
        if (type === 'image') entryUrl(e).then(u => t.append(el('img', { src: u, loading: 'lazy' }))).catch(() => {});
        else if (type === 'video') entryUrl(e).then(u => { const v = el('video', { src: u + '#t=0.1', preload: 'metadata' }); v.muted = true; t.append(v); }).catch(() => {});
        else t.append('♪');
        grid.append(el('div', { class: 'it', title: e.path, onclick: () => {
          closeModal(); const rel = relFromBase(e.path);
          if (onPick) return onPick(rel);
          mutate(() => { const pg = findPage(pageId).page; pg[type] = { driveId: '', path: rel, url: '', name: e.name }; if (type === 'image' && pg.status === 'idea') pg.status = 'image'; if (type === 'video' && /idea|image/.test(pg.status)) pg.status = 'animated'; });
        } }, t, el('div', { class: 'n' }, relFromBase(e.path))));
      });
    };
    q.addEventListener('input', draw); draw();
    modal(el('div', null, el('h2', null, 'Pick ' + (type === 'image' ? 'an image' : type === 'video' ? 'a video' : 'audio') + ' from ' + local.name), q, grid,
      el('div', { class: 'modal-actions' }, el('button', { onclick: closeModal }, 'Cancel'))), { wide: true });
  }

  // ---------- open / save ----------
  const hasFolder = () => local.kind === 'fsa' || local.kind === 'files';
  function setDoc(d, { keepUndo } = {}) {
    doc = S.normalizeDoc(d);
    if (!keepUndo) { undoStack = []; redoStack = []; }
    selected = null; dirty = false; lastKey = null;
    render(); updateSaveState();
  }
  function resetLocal() {
    for (const p of urlCache.values()) p.then(u => URL.revokeObjectURL(u)).catch(() => {});
    urlCache.clear();
    Object.assign(local, { kind: null, root: null, name: '', files: new Map(), lower: new Map(), base: '', jsonPath: '', jsonHandle: null, jsonMtime: 0, jsonName: '', single: false });
    remoteBase = null;
  }
  async function walk(dir, prefix, depth, out) {
    if (depth > 8) return;
    for await (const [name, h] of dir.entries()) {
      if (name.startsWith('.') || name === 'node_modules' || name.endsWith('.app')) continue;
      const path = (prefix ? prefix + '/' : '') + name.normalize('NFC');
      if (h.kind === 'directory') await walk(h, path, depth + 1, out);
      else if (IMG_EXT.test(name) || VID_EXT.test(name) || AUD_EXT.test(name) || /\.json$/i.test(name)) out.push({ path, name: name.normalize('NFC'), handle: h });
    }
  }
  function indexEntries(entries) {
    local.files = new Map(); local.lower = new Map();
    for (const e of entries) {
      e.type = IMG_EXT.test(e.name) ? 'image' : VID_EXT.test(e.name) ? 'video' : AUD_EXT.test(e.name) ? 'audio' : 'json';
      local.files.set(e.path, e); local.lower.set(e.path.toLowerCase(), e);
    }
  }
  async function openFolder() {
    if (dirty && doc && !(await confirmDiscard())) return;
    if (!HAS_FSA) { const inp = $('#fileDir'); inp.value = ''; inp.click(); return; }
    let dir;
    try { dir = await window.showDirectoryPicker({ id: 'storyboard', mode: 'readwrite' }); } catch (e) { if (e.name !== 'AbortError') toast('Could not open folder: ' + e.message); return; }
    await loadFolderHandle(dir);
  }
  async function loadFolderHandle(dir) {
    toast('Reading folder…', 8000);
    const entries = []; await walk(dir, '', 0, entries);
    resetLocal(); local.kind = 'fsa'; local.root = dir; local.name = dir.name; indexEntries(entries);
    idbSet('lastDir', dir).catch(() => {});
    await chooseJsonInFolder();
  }
  async function onDirInput(files) {
    if (!files.length) return;
    const entries = []; let rootName = '';
    for (const f of files) {
      const parts = (f.webkitRelativePath || f.name).split('/'); rootName = parts.length > 1 ? parts[0] : 'folder';
      const path = (parts.length > 1 ? parts.slice(1) : parts).join('/').normalize('NFC');
      if (path.split('/').some(x => x.startsWith('.'))) continue;
      if (IMG_EXT.test(f.name) || VID_EXT.test(f.name) || AUD_EXT.test(f.name) || /\.json$/i.test(f.name)) entries.push({ path, name: f.name.normalize('NFC'), file: f });
    }
    resetLocal(); local.kind = 'files'; local.name = rootName; indexEntries(entries);
    await chooseJsonInFolder();
  }
  async function chooseJsonInFolder() {
    const jsons = Array.from(local.files.values()).filter(e => SB_FILE.test(e.path)).sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path));
    let pick = jsons[0];
    if (jsons.length > 1) {
      pick = await new Promise(res => modal(el('div', null, el('h2', null, 'Which storyboard?'), el('p', { class: 'muted' }, 'This folder has several storyboard files.'),
        jsons.map(j => el('div', { style: { margin: '6px 0' } }, el('button', { class: 'pick-json', style: { width: '100%', textAlign: 'left' }, onclick: () => { closeModal(); res(j); } }, '📄 ' + j.path))),
        el('div', { class: 'modal-actions' }, el('button', { onclick: () => { closeModal(); res(null); } }, 'Cancel')))));
      if (!pick) { render(); return; }
    }
    if (!pick) {
      const imgs = Array.from(local.files.values()).filter(e => e.type === 'image').length;
      const r = await ask('No storyboard in “' + esc(local.name) + '” yet', 'Start a new storyboard file in this folder?' + (imgs ? '<br>I found <b>' + imgs + '</b> images; I can make one page per image (sorted by name).' : ''), [
        { label: 'Cancel', value: null }, { label: 'Empty storyboard', value: 'empty' }, imgs ? { label: 'One page per image', value: 'images', cls: 'primary' } : null].filter(Boolean));
      if (!r) { resetLocal(); render(); return; }
      const d = S.normalizeDoc({ title: local.name, scenes: [{ title: 'Scene 1', pages: r === 'empty' ? [{}] : [] }] });
      if (r === 'images') {
        const list = Array.from(local.files.values()).filter(e => e.type === 'image').sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
        d.scenes[0].pages = list.map(e => { const m = S.matchNumber(e.name); return S.normPage({ image: { path: e.path, name: e.name }, status: 'image', code: m ? S.pad2(m.num) : '' }); });
      }
      local.jsonPath = 'storyboard.json'; local.jsonName = 'storyboard.json'; local.base = '';
      setDoc(d);
      if (local.kind === 'fsa') {
        local.jsonHandle = await local.root.getFileHandle('storyboard.json', { create: true });
        await save({ force: true }); toast('Created storyboard.json in ' + local.name);
      } else { dirty = true; updateSaveState(); toast('Read-only folder: use Save to download storyboard.json, then put it in the folder.', 5000); }
      return;
    }
    await loadJsonEntry(pick);
  }
  async function loadJsonEntry(e) {
    const f = e.file || await e.handle.getFile();
    const d = safeJson(await f.text());
    if (!d) { await ask('Could not read ' + esc(e.path), 'The file is not valid JSON. If Mirrage just edited it, ask Mirrage to check the file. Nothing was changed.', [{ label: 'OK', value: 1 }]); return false; }
    local.jsonPath = e.path; local.jsonName = e.name; local.jsonHandle = e.handle || null; local.jsonMtime = f.lastModified;
    local.base = e.path.includes('/') ? e.path.slice(0, e.path.lastIndexOf('/')) : '';
    setDoc(d);
    const missing = allPages().reduce((a, p) => a + [p.image, p.video].filter(m => m && m.path && !localEntry(m.path)).length, 0);
    toast('Opened ' + e.path + (missing ? ' · ' + missing + ' linked file(s) not found in this folder' : ''), 3500);
    return true;
  }
  async function openFile() {
    if (dirty && doc && !(await confirmDiscard())) return;
    if (window.showOpenFilePicker) {
      try {
        const [h] = await window.showOpenFilePicker({ id: 'storyboard', types: [{ description: 'Storyboard', accept: { 'application/json': ['.json'] } }] });
        const f = await h.getFile(); const d = safeJson(await f.text()); if (!d) return toast('Not valid JSON');
        resetLocal(); local.jsonHandle = h; local.jsonName = f.name; local.jsonMtime = f.lastModified; local.single = true;
        setDoc(d); toast('Opened ' + f.name + '. Open the whole folder to see local images and videos.', 4000);
      } catch (e) { if (e.name !== 'AbortError') toast(e.message); }
      return;
    }
    const inp = $('#fileJson'); inp.value = ''; inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return; const d = safeJson(await f.text()); if (!d) return toast('Not valid JSON');
      resetLocal(); local.jsonName = f.name; setDoc(d);
    }; inp.click();
  }
  async function openUrl(url) {
    try {
      const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json(); resetLocal(); remoteBase = new URL(url, location.href).href; local.jsonName = url.split('/').pop();
      setDoc(d); return true;
    } catch (e) { toast('Could not load ' + url + ' (' + e.message + ')'); return false; }
  }
  function confirmDiscard() {
    return ask('Unsaved changes', 'You have unsaved changes in this storyboard. Discard them?', [{ label: 'Keep editing', value: false }, { label: 'Discard', value: true, cls: 'danger' }]);
  }
  function stamp() { doc.updated = new Date().toISOString(); doc.updatedBy = (prefs.name || 'Lucas') + ' (app)'; }
  let saving = false;
  async function save({ auto, force } = {}) {
    if (!doc) return;
    const handle = local.jsonHandle;
    if (handle && (local.kind === 'fsa' || local.single)) {
      if (saving) return; saving = true;
      try {
        const cur = await handle.getFile();
        if (!force && local.jsonMtime && cur.lastModified !== local.jsonMtime) {
          saving = false;
          const r = await ask('The file changed on disk', 'Someone (for example Mirrage, through Drive) changed <b>' + esc(local.jsonName) + '</b> after you opened it.', [
            { label: 'Load their version', value: 'reload' }, { label: 'Save mine as a copy', value: 'copy' }, { label: 'Overwrite with mine', value: 'overwrite', cls: 'danger' }]);
          if (r === 'reload') return reloadFromDisk(true);
          if (r === 'copy') return saveCopy();
          return save({ force: true });
        }
        stamp();
        const w = await handle.createWritable(); await w.write(S.serialize(doc)); await w.close();
        local.jsonMtime = (await handle.getFile()).lastModified; dirty = false; updateSaveState();
        if (!auto) toast('Saved to ' + (local.jsonPath || local.jsonName));
      } catch (e) {
        console.error(e); toast('Save failed: ' + e.message + '. Use ☰ → Download storyboard JSON.', 6000);
      } finally { saving = false; }
      return;
    }
    downloadJson(); dirty = false; updateSaveState();
  }
  async function saveCopy() {
    const name = (local.jsonName || 'storyboard.json').replace(/(\.storyboard)?\.json$/i, '') + ' (' + (prefs.name || 'Lucas') + ' ' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + ').storyboard.json';
    if (local.kind === 'fsa') {
      let dir = local.root; for (const part of local.base ? local.base.split('/') : []) dir = await dir.getDirectoryHandle(part);
      const fh = await dir.getFileHandle(name, { create: true }); stamp();
      const w = await fh.createWritable(); await w.write(S.serialize(doc)); await w.close();
      local.jsonHandle = fh; local.jsonName = name; local.jsonPath = joinPath(local.base, name); local.jsonMtime = (await fh.getFile()).lastModified;
      dirty = false; render(); toast('Saved as ' + name);
    } else downloadJson(name);
  }
  function downloadJson(name) {
    stamp();
    const blob = new Blob([S.serialize(doc)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: name || local.jsonName || (S.slug(doc.title) + '.storyboard.json') });
    document.body.append(a); a.click(); a.remove();
    toast('Downloaded ' + a.download + (local.kind === 'files' ? '. Put it back in the project folder (replace the old one).' : ''), 4500);
  }
  async function reloadFromDisk(silent) {
    if (!local.jsonHandle) return toast('Nothing to reload: no file is open from disk');
    if (!silent && dirty && !(await confirmDiscard())) return;
    const sel = selected;
    if (local.kind === 'fsa' && local.root) {
      const entries = []; await walk(local.root, '', 0, entries); indexEntries(entries);
      const e = local.files.get(local.jsonPath); if (e && await loadJsonEntry(e)) { if (sel && findPage(sel)) select(sel); }
      return;
    }
    const f = await local.jsonHandle.getFile(); const d = safeJson(await f.text()); if (d) { local.jsonMtime = f.lastModified; setDoc(d); if (sel && findPage(sel)) select(sel); toast('Reloaded'); }
  }
  // Watch for outside changes (Mirrage editing through Drive for desktop)
  async function checkExternal() {
    if (!doc || !local.jsonHandle || saving) return;
    try {
      const f = await local.jsonHandle.getFile();
      if (local.jsonMtime && f.lastModified !== local.jsonMtime) {
        if (!dirty) {
          const d = safeJson(await f.text()); if (!d) return;
          const sel = selected; undoStack.push(JSON.stringify(doc)); local.jsonMtime = f.lastModified;
          doc = S.normalizeDoc(d); selected = sel && findPage(sel) ? sel : null; render();
          toast('Updated from disk' + (d.updatedBy ? ' (by ' + d.updatedBy + ')' : ''));
        } else $('#saveState').textContent = '⚠ Changed on disk';
      }
    } catch { /* file moved or permission gone */ }
  }
  setInterval(() => { if (!document.hidden) checkExternal(); }, 5000);

  // ---------- auto-link, import, export, print ----------
  function autoLinkDialog() {
    if (!hasFolder()) return ask('Open the project folder first', 'Auto-link matches numbered files in the opened folder (e.g. <code>shot 03.jpg</code>, <code>SB2_03_v2.mp4</code>) to pages.', [{ label: 'OK', value: 1 }]);
    const filter = el('input', { placeholder: 'only paths containing… (e.g. bp-sb2-clips)', style: { width: '100%' }, class: 'al-filter' });
    const cb = (on, cls) => { const c = el('input', { type: 'checkbox', class: cls }); c.checked = on; return c; };
    const cbI = cb(true, 'al-img'), cbV = cb(true, 'al-vid'), cbE = cb(true, 'al-empty'), cbN = cb(false, 'al-new');
    const by = el('select', { class: 'al-by' }, el('option', { value: 'code' }, 'page code (old page no.), else position'), el('option', { value: 'pos' }, 'position in the board'));
    const out = el('pre', { class: 'al-out', style: { whiteSpace: 'pre-wrap', fontSize: '12px', maxHeight: '30vh', overflow: 'auto', background: '#121218', padding: '8px', borderRadius: '8px' } });
    const plan = () => {
      const f = filter.value.trim().toLowerCase();
      const files = Array.from(local.files.values()).filter(e => !e.session && ((e.type === 'image' && cbI.checked) || (e.type === 'video' && cbV.checked)))
        .filter(e => !f || e.path.toLowerCase().includes(f)).filter(e => !local.base || e.path.startsWith(local.base + '/'));
      const best = new Map();
      for (const e of files) { const m = S.matchNumber(e.name); if (!m) continue; const k = e.type + ':' + m.num; const cur = best.get(k); if (!cur || m.ver > cur.ver || (m.ver === cur.ver && e.path < cur.e.path)) best.set(k, { e, ver: m.ver, num: m.num }); }
      const pages = allPages(); const changes = []; const used = new Set();
      pages.forEach((p, i) => {
        const num = by.value === 'code' && parseInt(p.code, 10) > 0 ? parseInt(p.code, 10) : i + 1;
        for (const t of ['image', 'video']) {
          const b = best.get(t + ':' + num); if (!b) continue; used.add(t + ':' + num);
          if (cbE.checked && p[t]) continue;
          const rel = relFromBase(b.e.path); if (p[t] && p[t].path === rel) continue;
          changes.push({ id: p.id, t, rel, name: b.e.name, n: i + 1 });
        }
      });
      const extra = cbN.checked ? Array.from(best.entries()).filter(([k]) => k.startsWith('image:') && !used.has(k)).map(([, b]) => b).sort((a, b) => a.num - b.num) : [];
      out.textContent = (changes.map(c => 'Page ' + c.n + ' ' + c.t + ' ← ' + c.rel).join('\n') + (extra.length ? '\n+ ' + extra.length + ' new page(s): ' + extra.map(b => b.e.name).join(', ') : '')) || 'No matches. Files need a number in their name, e.g. "shot 03.jpg" or "SB2_03_v2.mp4".';
      return { changes, extra };
    };
    filter.addEventListener('input', plan); [cbI, cbV, cbE, cbN, by].forEach(n => n.addEventListener('change', plan));
    modal(el('div', null, el('h2', null, '🔗 Auto-link media by number'),
      el('p', { class: 'muted' }, 'Matches the number in each file name to a page. The highest _v2/_v3 version wins.'),
      el('div', { class: 'fld' }, el('label', null, 'Folder filter'), filter),
      el('div', { class: 'fld' }, el('label', null, 'Match the number to'), by),
      el('div', { class: 'row', style: { flexWrap: 'wrap' } }, el('label', { class: 'chk' }, cbI, 'images'), el('label', { class: 'chk' }, cbV, 'videos'), el('label', { class: 'chk' }, cbE, 'only fill empty slots'), el('label', { class: 'chk' }, cbN, 'add pages for unmatched images')),
      el('h3', null, 'Preview'), out,
      el('div', { class: 'modal-actions' }, el('button', { onclick: closeModal }, 'Cancel'), el('button', { class: 'primary al-apply', onclick: () => {
        const { changes, extra } = plan(); closeModal();
        if (!changes.length && !extra.length) return toast('Nothing to link');
        mutate(() => {
          for (const c of changes) { const p = findPage(c.id).page; p[c.t] = { driveId: '', path: c.rel, url: '', name: c.name }; if (c.t === 'image' && p.status === 'idea') p.status = 'image'; if (c.t === 'video' && /idea|image/.test(p.status)) p.status = 'animated'; }
          const last = doc.scenes[doc.scenes.length - 1];
          for (const b of extra) last.pages.push(S.normPage({ image: { path: relFromBase(b.e.path), name: b.e.name }, status: 'image', code: S.pad2(b.num) }));
        });
        toast('Linked ' + changes.length + ' file(s)' + (extra.length ? ', added ' + extra.length + ' page(s)' : ''));
      } }, 'Apply'))));
    plan();
  }
  async function importTextDialog() {
    const r = await promptModal('Import Mirrage storyboard text', [{ key: 'text', label: 'Paste the storyboard doc text (PAGE 01 · 0:37-0:39, Lyric:, Description:, IMAGE PROMPT:, CLIP PROMPT:)', multiline: true, rows: 14 }], 'Import');
    if (!r || !r.text.trim()) return;
    const scenes = S.parseMirrageText(r.text);
    const n = scenes.reduce((a, s) => a + s.pages.length, 0);
    if (!n) return toast('No "PAGE nn" blocks found');
    if (!doc) setDoc({ title: (r.text.match(/^#\s*(.+)$/m) || [0, 'Imported storyboard'])[1].replace(/\\/g, '').trim(), scenes: [] });
    mutate(d => { d.scenes = d.scenes.filter(s => s.pages.length).concat(scenes); });
    toast('Imported ' + n + ' pages in ' + scenes.length + ' scene(s)');
  }
  function downloadBlob(text, type, name) {
    const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.append(a); a.click(); a.remove();
  }
  function exportMd() { downloadBlob(S.toMarkdown(doc), 'text/markdown', S.slug(doc.title) + '.md'); }
  async function printBoard() {
    const pr = $('#print'); pr.innerHTML = '';
    pr.append(el('div', { class: 'pr-head' }, el('span', null, doc.title + (doc.project ? ' · ' + doc.project : '')), el('span', null, $('#runtime').textContent + ' · ' + new Date().toLocaleDateString())));
    let n = 0; const waits = [];
    for (const s of doc.scenes) {
      pr.append(el('div', { class: 'pr-scene' }, s.title));
      const g = el('div', { class: 'pr-grid' });
      for (const p of s.pages) {
        n++; const im = el('div', { class: 'im' });
        const r = await resolveMedia(p.image).catch(() => null) || (p.video && p.video.driveId ? { src: driveThumb(p.video.driveId) } : null);
        if (r) { const img = el('img', { src: r.src }); waits.push(new Promise(ok => { img.onload = ok; img.onerror = () => { img.remove(); ok(); }; })); im.append(img); } else im.append(el('span', null, p.title || ''));
        g.append(el('div', { class: 'pr-card' }, im, el('div', { class: 'tx' },
          el('div', { class: 'h' }, n + (p.start ? ' · ' + [p.start, p.end].filter(Boolean).join('–') : '') + ' · ' + (Math.round(dur(p) * 10) / 10) + 's' + (p.camera ? ' · ' + p.camera : '')),
          p.lyric ? el('div', { class: 'l' }, p.lyric) : null, p.description ? el('div', null, p.description) : null)));
      }
      pr.append(g);
    }
    await Promise.race([Promise.all(waits), new Promise(r => setTimeout(r, 5000))]);
    window.print();
  }

  // ---------- settings / help ----------
  function settingsDialog() {
    const t = el('input', { value: doc.title, class: 'set-title' }), pj = el('input', { value: doc.project, placeholder: 'e.g. Rich by Friday' });
    const asp = el('select', null, ['16:9', '9:16', '4:3', '1:1', '2.39:1', '4:5'].map(a => el('option', { value: a }, a))); asp.value = doc.aspect;
    const dd = el('input', { type: 'number', min: '0.5', step: '0.5', value: doc.defaultDuration });
    const fid = el('input', { value: doc.driveFolderId, placeholder: 'Drive folder link or ID (optional)' });
    const nm = el('input', { value: prefs.name }); const au = el('input', { type: 'checkbox' }); au.checked = prefs.autosave;
    const notes = el('textarea', { rows: 3 }); notes.value = doc.notes;
    const audioPath = el('input', { value: doc.audio ? doc.audio.path : '', placeholder: 'e.g. audio/Bleeding Page.mp3', class: 'set-audio' });
    const audioOff = el('input', { type: 'number', step: '0.1', value: doc.audioOffset || 0 });
    const chars = el('div');
    const charList = doc.characters.map(c => Object.assign({}, c));
    const drawChars = () => {
      chars.innerHTML = '';
      charList.forEach((c, i) => {
        const n = el('input', { value: c.name, style: { flex: 1 } }); n.oninput = () => { c.name = n.value; };
        const col = el('input', { type: 'color', value: c.color, style: { width: '36px', padding: 0 } }); col.oninput = () => { c.color = col.value; };
        chars.append(el('div', { class: 'row', style: { marginBottom: '4px' } }, col, n, el('button', { class: 'danger', onclick: () => { charList.splice(i, 1); drawChars(); } }, '✕')));
      });
      chars.append(el('button', { onclick: () => { charList.push({ id: '', name: '', color: S.SCENE_COLORS[charList.length % 8] }); drawChars(); } }, '+ character'));
    };
    drawChars();
    const box = el('div', null, el('h2', null, '⚙ Project settings'),
      el('div', { class: 'row' }, el('div', { class: 'fld' }, el('label', null, 'Title'), t), el('div', { class: 'fld' }, el('label', null, 'Project / album'), pj)),
      el('div', { class: 'row' }, el('div', { class: 'fld' }, el('label', null, 'Aspect ratio'), asp), el('div', { class: 'fld' }, el('label', null, 'Default page duration (s)'), dd)),
      el('div', { class: 'fld' }, el('label', null, 'Drive folder (for reference)'), fid),
      el('div', { class: 'row' }, el('div', { class: 'fld', style: { flex: 3 } }, el('label', null, 'Song audio (path in the project folder), plays in ▶ Play'), audioPath,
        hasFolder() ? el('button', { style: { marginTop: '4px', fontSize: '12px' }, onclick: () => { pickFromFolder(null, 'audio', (rel) => { audioPath.value = rel; modal(box); }); } }, 'Pick from folder…') : null),
        el('div', { class: 'fld' }, el('label', null, 'Song time at page 1 (s)'), audioOff)),
      el('div', { class: 'fld' }, el('label', null, 'Characters'), chars),
      el('div', { class: 'fld' }, el('label', null, 'Storyboard notes'), notes),
      el('div', { class: 'row' }, el('div', { class: 'fld' }, el('label', null, 'Your name (comments and "updatedBy")'), nm), el('div', { class: 'fld' }, el('label', null, 'Autosave to the file'), el('label', { class: 'chk' }, au, 'save automatically while editing'))),
      el('div', { class: 'modal-actions' }, el('button', { onclick: closeModal }, 'Cancel'), el('button', { class: 'primary set-save', onclick: () => {
        prefs.name = nm.value.trim() || 'Lucas'; prefs.autosave = au.checked; savePrefs();
        mutate(d => {
          d.title = t.value.trim() || 'Untitled storyboard'; d.project = pj.value.trim(); d.aspect = asp.value; d.defaultDuration = parseFloat(dd.value) > 0 ? parseFloat(dd.value) : 3;
          d.driveFolderId = S.parseDriveId(fid.value) || fid.value.trim(); d.notes = notes.value;
          const ap = normPath(audioPath.value.trim());
          d.audio = ap ? Object.assign({}, d.audio && d.audio.path === ap ? d.audio : { driveId: '' }, { path: ap, url: '', name: ap.split('/').pop() }) : null; d.audioOffset = parseFloat(audioOff.value) || 0;
          d.characters = charList.filter(c => c.name.trim()).map(c => ({ id: c.id || S.slug(c.name), name: c.name.trim(), color: c.color }));
        });
        closeModal();
      } }, 'Save')));
    modal(box);
  }
  function helpDialog() {
    modal(el('div', null, el('div', { html: `<h2>❓ How it works</h2>
<p><b>The storyboard is one plain file</b> (<code>storyboard.json</code> or <code>Name.storyboard.json</code>) in the Drive project folder. Mirrage reads and edits that file; you edit it here. Pages point to images and clips by <b>path inside the folder</b> and by <b>Drive file ID</b>.</p>
<ul>
<li><b>Reorder:</b> drag pages (also into another scene); drag scenes by ⠿ or in the left list. The ↑/↓ buttons do the same.</li>
<li><b>Replace an image or clip:</b> drop a file on a page, or select the page and use File…, From folder…, or Drive link / path….</li>
<li><b>▶ Play</b> runs the animatic: pages in order with their durations; local clips play inline; the song plays if you set it in ⚙ settings.</li>
<li><b>Open project folder</b> (Chrome or Edge): pick the folder on your Mac (Google Drive for desktop, or a downloaded copy). Changes save straight into the file, and when Mirrage changes it the board updates by itself.</li>
<li><b>Safari / iPhone:</b> folders open read-only, so Save downloads the file.</li>
<li><b>Online without the folder:</b> images show as Drive thumbnails if you're signed in to Google in this browser. Videos show a still and an ↗ Drive link.</li>
</ul>
<p>Shortcuts: <code>Ctrl/Cmd+Z</code> undo · <code>Ctrl/Cmd+Shift+Z</code> redo · <code>Ctrl/Cmd+S</code> save · <code>P</code> play · <code>N</code> new page after the selected one · <code>←/→</code> previous/next page · paste an image or Drive link to put it on the selected page.</p>` }),
      el('div', { class: 'modal-actions' }, el('button', { class: 'primary', onclick: closeModal }, 'OK'))));
  }

  // ---------- player (animatic) ----------
  const pl = { seq: [], i: 0, t0: 0, elapsed: 0, playing: false, raf: 0, total: 0, starts: [], token: 0 };
  async function play(fromId) {
    if (!doc) return;
    pl.seq = allPages().filter(p => p.status !== 'cut');
    if (!pl.seq.length) return toast('No pages to play');
    pl.starts = []; let t = 0; for (const p of pl.seq) { pl.starts.push(t); t += dur(p); } pl.total = t;
    pl.i = Math.max(0, fromId ? pl.seq.findIndex(p => p.id === fromId) : 0);
    $('#player').hidden = false;
    const ticks = $('#plTicks'); ticks.innerHTML = ''; pl.starts.forEach(s => ticks.append(el('span', { style: { left: (s / pl.total * 100) + '%' } })));
    const a = $('#plAudio'); const ar = doc.audio ? await resolveMedia(doc.audio).catch(() => null) : null;
    a.removeAttribute('src'); if (ar && ar.playable) a.src = ar.src;
    $('#plSong').parentElement.style.display = ar && ar.playable ? '' : 'none';
    $('#plSync').parentElement.style.display = ar && ar.playable ? '' : 'none';
    try { if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); } catch { /* not allowed */ }
    pl.elapsed = 0; await showStep(pl.i, 0); resume();
  }
  function songOn() { return !!$('#plAudio').getAttribute('src') && $('#plSong').checked; }
  async function showStep(i, offset) {
    pl.i = i; pl.elapsed = offset || 0;
    const p = pl.seq[i]; const img = $('#plImg'), vid = $('#plVid'), blank = $('#plBlank');
    $('#plInfo').textContent = 'Page ' + pageNumber(p.id) + ' / ' + allPages().length + (p.title ? ' · ' + p.title : '') + (p.start ? ' · ' + p.start : '');
    $('#plCaption').textContent = $('#plCaptions').checked ? p.lyric : '';
    const token = pl.token = Math.random();
    const vr = await resolveMedia(p.video).catch(() => null);
    const ir = vr && vr.playable ? null : (await resolveMedia(p.image).catch(() => null) || (vr && vr.kind === 'drive' ? vr : null));
    if (token !== pl.token) return;
    img.hidden = true; vid.hidden = true; blank.textContent = ''; vid.pause();
    if (vr && vr.playable) {
      if (vid.getAttribute('src') !== vr.src) vid.src = vr.src;
      vid.muted = songOn(); vid.hidden = false;
      try { vid.currentTime = offset || 0; } catch { }
      if (pl.playing) vid.play().catch(() => { vid.muted = true; vid.play().catch(() => {}); });
    } else if (ir) {
      img.classList.remove('kb'); void img.offsetWidth; img.style.setProperty('--kbdur', dur(p) + 's');
      img.onerror = () => { img.hidden = true; blank.textContent = p.description || p.lyric || ''; };
      img.src = ir.kind === 'drive' ? driveThumb((p.image && p.image.driveId) || p.video.driveId, 1920) : ir.src;
      img.hidden = false; img.classList.add('kb'); img.style.animationPlayState = pl.playing ? 'running' : 'paused';
    } else blank.textContent = (p.title ? p.title + ' — ' : '') + (p.description || '(no image yet)');
    syncAudio(true);
  }
  function syncAudio(seek) {
    const a = $('#plAudio'); if (!a.getAttribute('src')) return;
    if (!songOn() || !pl.playing) { a.pause(); return; }
    const p = pl.seq[pl.i];
    const st = $('#plSync').checked ? S.parseTime(p.start) : null;
    const want = (st !== null ? st : (doc.audioOffset || 0) + pl.starts[pl.i]) + pl.elapsed;
    if (seek || Math.abs(a.currentTime - want) > 0.35) { try { a.currentTime = want; } catch { } }
    if (a.paused) a.play().catch(() => {});
  }
  function tick(now) {
    if (!pl.playing) return;
    const p = pl.seq[pl.i]; pl.elapsed = (now - pl.t0) / 1000;
    if (pl.elapsed >= dur(p)) {
      if (pl.i + 1 >= pl.seq.length) { pl.elapsed = dur(p); updateBar(); pause(); $('#plInfo').textContent += ' · end'; return; }
      pl.t0 = now; showStep(pl.i + 1, 0);
    } else if (!$('#plSync').checked) syncAudio(false);
    updateBar(); pl.raf = requestAnimationFrame(tick);
  }
  function updateBar() {
    const t = pl.starts[pl.i] + Math.min(pl.elapsed, dur(pl.seq[pl.i]));
    $('#plFill').style.width = (t / pl.total * 100) + '%';
    $('#plTime').textContent = S.fmtTime(t) + ' / ' + S.fmtTime(pl.total);
  }
  function resume() {
    pl.playing = true; pl.t0 = performance.now() - pl.elapsed * 1000; $('#plToggle').textContent = '⏸';
    const v = $('#plVid'); if (!v.hidden) { v.muted = songOn(); v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); }
    $('#plImg').style.animationPlayState = 'running';
    syncAudio(true); cancelAnimationFrame(pl.raf); pl.raf = requestAnimationFrame(tick);
  }
  function pause() {
    pl.playing = false; $('#plToggle').textContent = '▶'; cancelAnimationFrame(pl.raf);
    $('#plVid').pause(); $('#plAudio').pause(); $('#plImg').style.animationPlayState = 'paused';
  }
  function stepTo(i) { i = Math.max(0, Math.min(pl.seq.length - 1, i)); pl.t0 = performance.now(); showStep(i, 0); updateBar(); }
  function closePlayer() {
    pause(); $('#player').hidden = true; $('#plVid').removeAttribute('src'); $('#plVid').load();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    const cur = pl.seq[pl.i]; if (cur) select(cur.id);
  }
  $('#plToggle').onclick = () => (pl.playing ? pause() : resume());
  $('#plPrev').onclick = () => stepTo(pl.i - 1);
  $('#plNext').onclick = () => stepTo(pl.i + 1);
  $('#plClose').onclick = closePlayer;
  $('#plCaptions').onchange = () => { $('#plCaption').textContent = $('#plCaptions').checked ? pl.seq[pl.i].lyric : ''; };
  $('#plSong').onchange = () => { $('#plVid').muted = songOn(); syncAudio(true); };
  $('#plSync').onchange = () => syncAudio(true);
  $('#plProgress').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect(); const t = (e.clientX - r.left) / r.width * pl.total;
    let i = pl.starts.findIndex((s, k) => t >= s && (k === pl.starts.length - 1 || t < pl.starts[k + 1]));
    if (i < 0) i = 0; const off = t - pl.starts[i]; pl.t0 = performance.now() - off * 1000; showStep(i, off); updateBar();
  });

  // ---------- IndexedDB (remember the last folder) ----------
  function idb() { return new Promise((res, rej) => { const r = indexedDB.open('storyboard-studio', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  async function idbSet(k, v) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
  async function idbGet(k) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('kv'); const r = tx.objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

  // ---------- wiring ----------
  async function loadSample() {
    if (dirty && doc && !(await confirmDiscard())) return;
    if (location.protocol.startsWith('http') && await openUrl('sample/storyboard.json')) return toast('Sample loaded. Edits stay in this browser; Save downloads a copy.', 3500);
    resetLocal(); setDoc(window.SB_SAMPLE || { title: 'Sample storyboard', scenes: [{ title: 'Scene 1', pages: [{ description: 'Open the sample-project folder from the starter kit to see images and clips.' }] }] });
  }
  async function newDoc() {
    if (dirty && doc && !(await confirmDiscard())) return;
    resetLocal(); setDoc({ title: 'New storyboard', scenes: [{ title: 'Scene 1', pages: [{}, {}, {}] }] });
    toast('New storyboard. Save downloads it; or open a project folder to keep it there.', 4000);
  }
  const actions = {
    openFolder, openFile, sample: loadSample, new: newDoc, reload: () => reloadFromDisk(false), autolink: autoLinkDialog, importText: importTextDialog,
    downloadJson: () => doc && downloadJson(), exportMd: () => doc && exportMd(), print: () => doc && printBoard(), settings: () => doc && settingsDialog(), help: helpDialog
  };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]'); if (a) { $('#menu').hidden = true; if (actions[a.dataset.act]) actions[a.dataset.act](); return; }
    if (!e.target.closest('.menu-wrap')) $('#menu').hidden = true;
  });
  $('#btnMenu').onclick = () => { $('#menu').hidden = !$('#menu').hidden; };
  $('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
  $('#btnSave').onclick = () => save(); $('#btnPlay').onclick = () => play(selected);
  $('#btnAddScene').onclick = addScene;
  $('#docTitle').addEventListener('input', () => mutate(d => { d.title = $('#docTitle').value; }, 'doc-title', { render: false }));
  $$('.seg button').forEach(b => b.onclick = () => { view = b.dataset.view; $$('.seg button').forEach(x => x.classList.toggle('on', x === b)); render(); });
  const applyFilter = () => { $$('.card').forEach(c => c.classList.toggle('filtered-out', !pageMatches(findPage(c.dataset.id).page))); $$('#script .sp').forEach(c => c.classList.toggle('filtered-out', !pageMatches(findPage(c.dataset.id).page))); };
  $('#search').addEventListener('input', applyFilter); $('#fStatus').addEventListener('change', applyFilter); $('#fChar').addEventListener('change', applyFilter);
  $('#zoom').value = prefs.zoom; $('#zoom').oninput = () => { prefs.zoom = +$('#zoom').value; savePrefs(); document.documentElement.style.setProperty('--card', prefs.zoom + 'px'); };
  $('#showText').checked = prefs.showText; $('#showText').onchange = () => { prefs.showText = $('#showText').checked; savePrefs(); $('#board').classList.toggle('hide-text', !prefs.showText); };
  $('#fileDir').addEventListener('change', (e) => onDirInput(Array.from(e.target.files)));
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey; const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (!$('#player').hidden) {
      if (e.key === 'Escape') closePlayer(); else if (e.key === ' ') { e.preventDefault(); pl.playing ? pause() : resume(); } else if (e.key === 'ArrowRight') stepTo(pl.i + 1); else if (e.key === 'ArrowLeft') stepTo(pl.i - 1);
      return;
    }
    if (e.key === 'Escape' && !$('#modal').hidden) return closeModal();
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); return save(); }
    if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
    if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); return redo(); }
    if (typing || mod || e.altKey || !doc || !$('#modal').hidden) return;
    if (e.key === 'p' || e.key === 'P') play(selected);
    else if ((e.key === 'n' || e.key === 'N') && doc.scenes.length) { e.preventDefault(); const f = selected && findPage(selected); addPage(f ? f.scene.id : doc.scenes[doc.scenes.length - 1].id, f ? selected : null); }
    else if (e.key === 'Escape') select(null);
    else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && selected) { const ps = allPages(); const i = ps.findIndex(p => p.id === selected) + (e.key === 'ArrowRight' ? 1 : -1); if (ps[i]) select(ps[i].id); }
  });
  document.addEventListener('paste', (e) => {
    if (!selected || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const files = Array.from(e.clipboardData.files || []); if (files.length) { e.preventDefault(); attachFiles(selected, files); return; }
    const id = S.parseDriveId(e.clipboardData.getData('text'));
    if (id) { e.preventDefault(); mutate(() => { findPage(selected).page.image = { driveId: id, path: '', url: '', name: '' }; }); toast('Drive image linked to the selected page'); }
  });
  let dragDepth = 0;
  document.addEventListener('dragenter', (e) => { if (doc && hasFiles(e)) { dragDepth++; $('#dropHint').hidden = false; } });
  document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#dropHint').hidden = true; } });
  document.addEventListener('drop', (e) => { dragDepth = 0; $('#dropHint').hidden = true; if (e.dataTransfer && e.dataTransfer.files.length) e.preventDefault(); });
  document.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('beforeunload', (e) => { if (dirty && !((local.kind === 'fsa' || local.single) && prefs.autosave)) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- init ----------
  async function init() {
    $('#fsaNote').innerHTML = HAS_FSA
      ? 'Tip: open the Drive folder through <b>Google Drive for desktop</b> (Finder → Google Drive → My Drive → …). Every change then saves straight to Drive, where Mirrage sees it.'
      : 'This browser opens folders <b>read-only</b> (Safari, iPhone, Firefox): Save downloads the file. Use Chrome or Edge on your Mac to save straight into the folder.';
    const params = new URLSearchParams(location.search);
    render();
    if (params.get('open')) { await openUrl(params.get('open')); return; }
    if (params.has('sample')) { await loadSample(); return; }
    if (HAS_FSA) {
      const last = await idbGet('lastDir').catch(() => null);
      if (last) $('.empty-actions').prepend(el('button', { class: 'primary', onclick: async () => {
        try { if ((await last.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await last.requestPermission({ mode: 'readwrite' })) !== 'granted') return toast('Permission denied'); await loadFolderHandle(last); } catch (e) { toast('Could not reopen: ' + e.message); }
      } }, '↻ Reopen “' + last.name + '”'));
    }
    const auto = safeJson(localStorage.getItem(LS_AUTOSAVE));
    if (auto && auto.doc) $('.empty-actions').append(el('button', { class: 'restore', onclick: () => { setDoc(auto.doc); dirty = true; updateSaveState(); toast('Restored the copy autosaved in this browser (' + new Date(auto.at).toLocaleString() + '). Save to keep it.', 5000); } }, '⟲ Restore browser copy (' + new Date(auto.at).toLocaleDateString() + ')'));
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  // test/automation hook
  window.__sb = { get doc() { return doc; }, get local() { return local; }, get dirty() { return dirty; }, get selected() { return selected; }, get undoDepth() { return undoStack.length; }, setDoc, select, save, undo, redo, play, attachFiles, loadFolderHandle, movePage, addPage, checkExternal, onDirInput };
  init();
})();
