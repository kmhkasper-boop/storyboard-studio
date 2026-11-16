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
  const local = { kind: null, root: null, name: '', files: new Map(), lower: new Map(), base: '', jsonPath: '', jsonHandle: null, jsonMtime: 0, jsonRev: undefined, jsonText: undefined, jsonName: '', single: false };
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
          inputs[f.key] = f.multiline ? el('textarea', { rows: f.rows || 10, placeholder: f.placeholder || '' }) : el('input', { placeholder: f.placeholder || '', value: f.value || '', list: f.list || null, 'data-key': f.key }),
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
  const activePages = () => S.activePages(doc);
  /** Page label: active pages 1…N, inactive alternatives "5·alt" / "alt" */
  function pageNumber(id) { return S.pageLabels(doc).get(id) || '?'; }
  const sceneOf = (id) => doc.scenes.find(x => x.id === id);
  const fmtDiff = (x) => (Math.abs(x) < 0.05 ? '±0:00' : (x > 0 ? '+' : '−') + S.fmtTime(Math.abs(x)));
  const peek = new Set(); // inactive scene alternatives the user expanded
  const dur = (p) => S.pageDuration(p, doc);
  /** Attaching media moves a page up the ladder: image -> rendered, video -> picked (never down). */
  function bumpStatus(pg, type) { const rank = (x) => S.STATUS_IDS.indexOf(x); const want = type === 'video' ? 'picked' : 'rendered'; if (pg.status !== 'cut' && rank(pg.status) < rank(want)) pg.status = want; }
  const lyr = (p) => S.lyricsFor(p, doc);
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
    S.regroup(doc);
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
  /** v3: a media object with a Drive ID but no relative path is valid: "online only" (Drive thumbnail + ↗ Drive). */
  const onlineOnly = (m) => !!(m && m.driveId && !m.path && !m.url);
  function mediaLabel(m) {
    if (!m) return 'none';
    if (onlineOnly(m)) return '☁ online only · Drive ' + m.driveId.slice(0, 10) + '…';
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
    renderFilters(); renderHeader(); renderSidebar(); renderVariantBar();
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
    const tl = S.timeline(doc); const ap = activePages(); const n = ap.filter(p => p.status !== 'cut').length; const nc = ap.length - n; const na = allPages().length - ap.length;
    $('#runtime').textContent = n + ' pages · ' + S.fmtTime(tl.screen);
    $('#runtime').title = 'Total screen time of the active cut' + (nc ? '. ' + nc + ' page(s) with status "cut" are not counted (their song time shows as a gap)' : '') + (na ? '. ' + na + ' page(s) in inactive alternatives are not counted' : '');
    const sp = $('#songSpan');
    sp.textContent = tl.songSpan !== null ? '♪ song ' + S.fmtTime(tl.songStart) + '–' + S.fmtTime(tl.songEnd) + ' (' + S.fmtTime(tl.songSpan) + ')' : '';
    sp.title = 'Song span covered by page timecodes';
    const g = $('#gapPill'); const bad = tl.gaps.length + tl.overlaps.length;
    g.textContent = bad ? '⚠ ' + (tl.gaps.length ? tl.gaps.length + ' gap' + (tl.gaps.length > 1 ? 's' : '') : '') + (tl.gaps.length && tl.overlaps.length ? ', ' : '') + (tl.overlaps.length ? tl.overlaps.length + ' overlap' + (tl.overlaps.length > 1 ? 's' : '') : '') : '';
    g.title = tl.gaps.map(x => 'gap ' + S.fmtTime(x.from, true) + ' → ' + S.fmtTime(x.to, true) + ' before page ' + pageNumber(x.pageId)).concat(tl.overlaps.map(x => 'overlap ' + S.fmtTime(x.from, true) + '–' + S.fmtTime(x.to, true) + ' at page ' + pageNumber(x.pageId))).join('\n') + (bad ? '\nClick to jump to the first one.' : '');
    g.onclick = () => { const f = tl.gaps[0] || tl.overlaps[0]; if (f) { select(f.pageId); const c = document.querySelector('.card[data-id="' + f.pageId + '"]'); if (c) c.scrollIntoView({ block: 'center' }); } };
    timelineCache = tl;
  }
  let timelineCache = null;
  function gapFor(id) { const tl = timelineCache || S.timeline(doc); return { gap: tl.gaps.find(x => x.pageId === id), overlap: tl.overlaps.find(x => x.pageId === id) }; }
  function renderFilters() {
    const fs = $('#fStatus'), fc = $('#fChar');
    if (fs.options.length === 1) S.STATUSES.forEach(s => fs.append(el('option', { value: s.id }, s.label)));
    const cur = fc.value; fc.innerHTML = '<option value="">All characters</option>';
    doc.characters.forEach(c => fc.append(el('option', { value: c.id }, c.name))); fc.value = cur;
  }
  function pageMatches(p) {
    const q = $('#search').value.trim().toLowerCase(), st = $('#fStatus').value, ch = $('#fChar').value;
    if (st && p.status !== st) return false;
    if (ch && !p.characters.some(r => r.charId === ch)) return false;
    if (q) { const hay = [p.title, p.code, p.lyrics, p.description, p.camera, p.mood, p.notes, p.imagePrompt, p.videoPrompt, p.negativePrompt, p.flag].join(' ').toLowerCase(); if (!hay.includes(q)) return false; }
    return true;
  }
  function renderSidebar() {
    const ol = $('#sceneList'); ol.innerHTML = '';
    for (const it of S.sceneItems(doc)) {
      const act = it.scenes.find(x => x.active !== false) || it.scenes[0];
      const t = act.pages.reduce((a, p) => a + (p.status === 'cut' || p.active === false ? 0 : dur(p)), 0);
      const alt = it.scenes.length > 1;
      ol.append(el('li', { dataset: { id: act.id, ids: it.scenes.map(x => x.id).join(',') }, class: alt ? 'slot' : '', title: alt ? 'Alternatives: ' + it.scenes.map(x => (x.altLabel || x.title) + (x.active !== false ? ' (active)' : '')).join(' / ') : '', onclick: () => { const n = document.getElementById('scene-' + act.id); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
        el('span', { class: 'sw', style: { background: act.color } }), el('span', { class: 'nm' }, (alt ? '⇄ ' : '') + act.title), el('span', { class: 'ct' }, (alt ? it.scenes.length + ' alts · ' : '') + act.pages.filter(p => p.active !== false).length + ' · ' + S.fmtTime(t))));
    }
  }
  function cardEl(p, num) {
    const thumb = el('div', { class: 'thumb' }, el('span', { class: 'num' }, String(num) + (p.code && p.code !== S.pad2(num) && p.code !== String(num) ? ' · ' + p.code : '')));
    if (p.video) thumb.append(el('span', { class: 'badge-vid', title: 'Has video: ' + mediaLabel(p.video) }, '🎞'));
    if ([p.image, p.video].some(onlineOnly) && ![p.image, p.video].some(m => m && !onlineOnly(m))) thumb.append(el('span', { class: 'badge-online', title: 'Online only: linked by Drive ID, no file path. Shows the Drive thumbnail; use ↗ Drive to open it.' }, '☁ online'));
    const open = p.comments.filter(c => !c.done).length;
    if (open) thumb.append(el('span', { class: 'badge-cm', title: open + ' open comment(s)' }, '💬 ' + open));
    if (p.flag) thumb.append(el('span', { class: 'flag', title: p.flag }, '⚑ ' + p.flag.slice(0, 18)));
    if (p.role && p.role !== 'linear') thumb.append(el('span', { class: 'role role-' + p.role, title: S.ROLES.find(r => r.id === p.role).label }, { insert: 'INSERT', flashForward: '⏩ FLASH-FWD', flashBack: '⏪ FLASHBACK' }[p.role]));
    fillThumb(thumb, p);
    const sp = S.speedOf(p); const warn = S.durationWarning(p, doc); const gi = gapFor(p.id);
    const chips2 = [
      sp !== 1 ? el('span', { class: 'chip spd', title: 'Playback speed' + (p.retime ? ' · ' + p.retime : '') }, (sp < 0 ? '◀◀ ' + Math.abs(sp) + '×' : Math.round(sp * 100) + '%') + (p.retime ? ' · ' + ({ frame: 'frame', blend: 'blend', opticalFlow: 'opt. flow', speedWarp: 'warp' }[p.retime]) : '')) : null,
      p.effect ? el('span', { class: 'chip spd', title: 'Effect' }, '✦ ' + p.effect) : null,
      p.cuts.length ? el('span', { class: 'chip', title: 'Cut sequence' }, '✂ ' + p.cuts.length + ' cuts') : null,
      p.video && (p.video.in !== undefined || p.video.out !== undefined) ? el('span', { class: 'chip', title: 'Source in/out' }, '⇤⇥ ' + (p.video.in ?? 0) + '–' + (p.video.out ?? 'end') + 's') : null,
      warn ? el('span', { class: 'chip warn', title: warn }, p.cuts.length ? '⏱ cut source' : '⏱ gen ' + p.genSeconds + 's too short') : null,
      (() => { const o = S.cutsOverrun(p, doc); return o ? el('span', { class: 'chip warn overrun', title: 'The cuts add up to ' + o.total + ' s on a ' + (Math.round(o.page * 1000) / 1000) + ' s page. Open the page to trim the last cut or stretch the page.' }, '✂ +' + o.over + 's over') : null; })(),
      p.status === 'cut' && p.bridged ? el('span', { class: 'chip bridged', title: 'Cut, but the edit bridges its song time: no gap' }, '⇢ bridged') : null,
      gi.gap ? el('span', { class: 'gapchip', title: 'Song-time gap before this page' }, '⚠ gap ' + S.fmtTime(gi.gap.from, true) + '→' + S.fmtTime(gi.gap.to, true)) : null,
      gi.overlap ? el('span', { class: 'gapchip', title: 'Overlaps the previous linear page' }, '⚠ overlap ' + (Math.round(gi.overlap.seconds * 10) / 10) + 's') : null
    ].filter(Boolean);
    const tc = [p.start, p.end].filter(Boolean).join('–');
    const card = el('div', { class: 'card' + (p.id === selected ? ' sel' : '') + (pageMatches(p) ? '' : ' filtered-out') + (p.role ? ' r-' + p.role : '') + (p.active === false ? ' alt-off' : ''), dataset: { id: p.id }, tabindex: 0 },
      thumb,
      el('div', { class: 'body' },
        el('div', { class: 'row1' }, el('span', { class: 'st st-' + p.status, title: p.status }), tc ? el('span', { class: 'tc' }, tc) : null, el('span', { class: 'dur' }, (Math.round(dur(p) * 10) / 10) + 's')),
        p.title ? el('div', { class: 'ttl' }, p.title) : null,
        lyr(p) ? el('div', { class: 'lyr' + (p.lyrics ? '' : ' auto'), title: p.lyrics ? '' : 'From the song lyrics' }, lyr(p)) : null,
        p.description ? el('div', { class: 'desc' }, p.description) : null,
        p.characters.length ? el('div', { class: 'chars' }, p.characters.map(r => castChip(p, r))) : null,
        chips2.length ? el('div', { class: 'chips2' }, chips2) : null));
    card.addEventListener('click', () => select(p.id));
    card.addEventListener('dblclick', () => { drawer = true; select(p.id); renderEditor(); });
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter') select(p.id); });
    addMediaDrop(card, p.id, null);
    return card;
  }
  function updateCard(id) {
    const old = document.querySelector('.card[data-id="' + CSS.escape(id) + '"]');
    if (!old) return;
    const nc = cardEl(findPage(id).page, pageNumber(id)); const tabs = old.querySelector('.alt-tabs'); if (tabs) nc.prepend(tabs); old.replaceWith(nc);
  }
  function renderBoard() {
    sortables.splice(0).forEach(x => x.destroy());
    const board = $('#board'); const scrollTop = $('#main').scrollTop;
    board.innerHTML = ''; board.classList.toggle('hide-text', !prefs.showText);
    const labels = S.pageLabels(doc); const items = S.sceneItems(doc); const baseScreen = S.timeline(doc).screen;
    const sceneSection = (s, si, inGroup) => {
      const grid = el('div', { class: 'grid', dataset: { scene: s.id } });
      for (const it of S.pageItems(s)) {
        if (it.pages.length === 1) { grid.append(cardEl(it.root, labels.get(it.root.id))); continue; }
        // page alternatives: one stacked item with tabs; the active card first, inactive ones dimmed after it
        const act = it.pages.find(p => p.active !== false) || it.root;
        const tabs = el('div', { class: 'alt-tabs', title: 'Alternative shots: click to make one active' }, it.pages.map((p, k) => {
          const diff = s.active !== false ? S.timeline(S.setActivePage(JSON.parse(JSON.stringify(doc)), p.id)).screen - baseScreen : 0;
          return el('button', { class: 'alt-tab' + (p.active !== false ? ' on' : ''), dataset: { id: p.id }, title: (p.title || '') + (p.active !== false ? ' (active)' : ' · ' + fmtDiff(diff) + ' runtime'), onclick: (e) => { e.stopPropagation(); if (p.active === false) setActivePageUI(p.id); } }, (p.altLabel || String.fromCharCode(65 + k)) + (p.active === false && Math.abs(diff) >= 0.05 ? ' ' + fmtDiff(diff) : ''));
        }));
        const g = el('div', { class: 'pgroup', dataset: { root: it.root.id } }, tabs, cardEl(act, labels.get(act.id)), it.pages.filter(p => p !== act).map(p => cardEl(p, labels.get(p.id))));
        grid.append(g);
      }
      grid.append(el('button', { class: 'add-card', title: 'Add a page to this scene', onclick: () => addPage(s.id) }, '+ Page'));
      const t = s.pages.reduce((a, p) => a + (p.status === 'cut' || p.active === false ? 0 : dur(p)), 0);
      const title = el('input', { class: 'sc-title', value: s.title, 'aria-label': 'Scene title' });
      title.addEventListener('input', () => mutate(d => { d.scenes.find(x => x.id === s.id).title = title.value; }, 'scene-title:' + s.id, { render: false }));
      title.addEventListener('change', () => renderSidebar());
      const color = el('input', { type: 'color', value: s.color, title: 'Scene colour', style: { width: '28px', height: '24px', padding: '0', border: '0', background: 'none' } });
      color.addEventListener('change', () => mutate(d => { d.scenes.find(x => x.id === s.id).color = color.value; }));
      const off = s.active === false; const hideBody = s.collapsed || (off && !peek.has(s.id));
      const sec = el('section', { class: 'scene' + (hideBody ? ' collapsed' : '') + (off ? ' alt-off' : '') + (inGroup ? ' in-slot' : ' bitem'), id: 'scene-' + s.id, dataset: { id: s.id, ids: s.id }, style: { '--sc': s.color } },
        el('div', { class: 'scene-head' },
          inGroup ? null : el('span', { class: 'grip', title: 'Drag to reorder scenes' }, '⠿'), color, title,
          el('span', { class: 'meta' }, s.pages.length + ' pages · ' + S.fmtTime(t) + (off ? ' · inactive alternative' : '')),
          el('div', { class: 'tools' },
            off ? el('button', { class: 'sc-peek', title: 'Show or hide this alternative', onclick: () => { peek.has(s.id) ? peek.delete(s.id) : peek.add(s.id); renderBoard(); } }, peek.has(s.id) ? 'hide' : 'show') : el('button', { title: 'Collapse/expand', onclick: () => mutate(d => { const x = d.scenes.find(x => x.id === s.id); x.collapsed = !x.collapsed; }) }, s.collapsed ? '▸' : '▾'),
            el('button', { title: 'Move scene up (with its alternatives)', class: 'sc-up', disabled: si === 0, onclick: () => moveScene(s.id, -1) }, '↑'),
            el('button', { title: 'Move scene down (with its alternatives)', class: 'sc-down', disabled: si === items.length - 1, onclick: () => moveScene(s.id, 1) }, '↓'),
            el('button', { title: 'Scene notes', onclick: () => editSceneNotes(s.id) }, '✎ notes'),
            el('button', { title: 'Add an alternative of this scene (duplicate as an inactive alternative)', class: 'sc-alt', onclick: () => addSceneAltUI(s.id) }, '⇄ Alt'),
            el('button', { title: 'Duplicate scene', onclick: () => duplicateScene(s.id) }, '⧉'),
            el('button', { title: 'Delete scene', class: 'danger', onclick: () => deleteScene(s.id) }, '🗑'))),
        s.notes ? el('div', { class: 'muted', style: { margin: '-2px 0 8px 30px', fontSize: '12.5px', whiteSpace: 'pre-wrap' } }, s.notes) : null,
        grid);
      sortables.push(Sortable.create(grid, {
        group: 'pages', draggable: '.grid > .card, .grid > .pgroup', filter: '.add-card, .alt-tab', preventOnFilter: false, animation: 150, delayOnTouchOnly: true, delay: 180,
        ghostClass: 'sortable-ghost', chosenClass: 'sortable-chosen', onEnd: syncPagesFromDom
      }));
      return sec;
    };
    items.forEach((it, si) => {
      if (it.scenes.length === 1) { board.append(sceneSection(it.scenes[0], si, false)); return; }
      const act = it.scenes.find(x => x.active !== false) || it.scenes[0];
      const tabs = it.scenes.map(x => {
        const diff = S.timeline(S.setActiveScene(JSON.parse(JSON.stringify(doc)), x.id)).screen - baseScreen;
        return el('button', { class: 'slot-tab' + (x.active !== false ? ' on' : ''), dataset: { id: x.id }, title: x.title + (x.active !== false ? ' (active)' : ' · makes the runtime ' + fmtDiff(diff)), onclick: () => { if (x.active === false) setActiveSceneUI(x.id); } },
          x.altLabel || x.title, x.active === false ? el('span', { class: 'diff' }, ' ' + fmtDiff(diff)) : el('span', { class: 'diff' }, ' ●'));
      });
      const grp = el('div', { class: 'slot-group bitem', dataset: { id: act.id, ids: it.scenes.map(x => x.id).join(','), slot: it.slot }, style: { '--sc': act.color } },
        el('div', { class: 'slot-head' }, el('span', { class: 'grip', title: 'Drag to move this slot with all its alternatives' }, '⠿'), el('span', { class: 'slot-name', title: 'Alternatives for one spot in the video. Only the active one plays and counts.' }, '⇄ Slot'), tabs,
          el('button', { class: 'slot-rename', title: 'Rename the alternative labels', onclick: () => renameSlotLabels(it.slot) }, '✎')),
        it.scenes.map(x => sceneSection(x, si, true)));
      board.append(grp);
    });
    sortables.push(Sortable.create(board, { handle: '.grip', draggable: '.bitem', animation: 150, onEnd: () => syncScenesFromDom($$('#board > .bitem').flatMap(n => n.dataset.ids.split(','))) }));
    sortables.push(Sortable.create($('#sceneList'), { animation: 150, delayOnTouchOnly: true, delay: 180, onEnd: () => syncScenesFromDom($$('#sceneList li').flatMap(n => n.dataset.ids.split(','))) }));
    $('#main').scrollTop = scrollTop;
  }
  function setActiveSceneUI(id) {
    const before = S.timeline(doc).screen; mutate(d => { S.setActiveScene(d, id); });
    const after = S.timeline(doc).screen; const s = sceneOf(id);
    toast('Active: ' + (s.altLabel || s.title) + ' · runtime ' + S.fmtTime(after) + ' (' + fmtDiff(after - before) + ')', 2600);
  }
  function setActivePageUI(id) {
    const before = S.timeline(doc).screen; mutate(d => { S.setActivePage(d, id); });
    const after = S.timeline(doc).screen; const f = findPage(id);
    toast('Active shot: ' + (f.page.altLabel || f.page.title || id) + ' · runtime ' + S.fmtTime(after) + ' (' + fmtDiff(after - before) + ')', 2600);
  }
  function addSceneAltUI(id) { let nid = null; mutate(d => { nid = S.addSceneAlternative(d, id); }); peek.add(nid); renderBoard(); toast('Added an inactive alternative. Click its tab to make it active.', 3500); }
  function addPageAltUI(id) { let nid = null; mutate(d => { nid = S.addPageAlternative(d, id); }); select(nid); toast('Added an inactive alternative shot. Its tab on the card makes it active.', 3500); }
  async function renameSlotLabels(slot) {
    const sc = doc.scenes.filter(x => x.slot === slot);
    const r = await promptModal('Alternative labels', sc.map(x => ({ key: x.id, label: x.title, value: x.altLabel || x.title })), 'Save');
    if (r) mutate(d => { for (const x of d.scenes) if (x.slot === slot && r[x.id] !== undefined) x.altLabel = r[x.id].trim(); });
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
    mutate(d => { const m = new Map(d.scenes.map(s => [s.id, s])); d.scenes = ids.map(id => m.get(id)).filter(Boolean); for (const x of d.scenes) m.delete(x.id); d.scenes.push(...m.values()); });
  }
  function renderScript() {
    const box = $('#script'); box.innerHTML = '';
    box.append(el('h1', null, doc.title), doc.project ? el('p', { class: 'muted' }, doc.project) : '', doc.notes ? el('p', { class: 'notes' }, doc.notes) : '');
    let n = 0, t = 0; const ad = S.activeDoc(doc); const hiddenAlts = allPages().length - S.allPages(ad).length;
    ad.scenes.forEach((s, si) => {
      box.append(el('h2', null, (si + 1) + '. ' + s.title + (s.slot && s.altLabel ? ' [' + s.altLabel + ']' : '')), s.notes ? el('p', { class: 'notes' }, s.notes) : '');
      s.pages.forEach(p => {
        n++;
        const d = dur(p); const at = t; if (p.status !== 'cut') t += d;
        const head = ['PAGE ' + S.pad2(n), p.start ? [p.start, p.end].filter(Boolean).join('–') : '@' + S.fmtTime(at), (Math.round(d * 10) / 10) + 's', p.camera, p.role && p.role !== 'linear' ? p.role.toUpperCase() : '', S.speedOf(p) !== 1 ? S.speedOf(p) + '×' + (p.retime ? ' ' + p.retime : '') : '', p.effect, p.cuts.length ? p.cuts.length + ' cuts' : '', p.status.toUpperCase()].filter(Boolean).join(' · ');
        const chars = p.characters.map(r => charById(r.charId).name).join(', ');
        const sp = el('div', { class: 'sp' + (pageMatches(p) ? '' : ' filtered-out'), dataset: { id: p.id }, onclick: () => select(p.id) },
          el('div', { class: 'h' }, head + (p.title ? ' — ' + p.title : '')),
          lyr(p) ? el('div', { class: 'l' }, '♪ ' + lyr(p)) : null,
          p.description ? el('div', null, (chars ? chars.toUpperCase() + ' — ' : '') + p.description) : (chars ? el('div', null, chars) : null),
          p.notes ? el('div', { class: 'c' }, 'Note: ' + p.notes) : null,
          p.status === 'cut' ? el('div', { class: 'c' }, '(cut)') : null);
        if (p.status === 'cut') sp.style.opacity = '.5';
        box.append(sp);
      });
    });
    box.append(el('p', { class: 'muted' }, n + ' pages · ' + S.fmtTime(t) + (hiddenAlts ? ' · ' + hiddenAlts + ' page(s) in inactive alternatives not shown' : '')));
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
    const total = activePages().length; const all = allPages(); const ix = all.findIndex(x => x.id === p.id);
    const field = (key, label, opts = {}) => {
      const inp = opts.multiline ? el('textarea', { rows: opts.rows || 3, placeholder: opts.placeholder || '' }) : el('input', Object.assign({ placeholder: opts.placeholder || '' }, opts.list ? { list: opts.list } : {}));
      inp.value = p[key] == null ? '' : p[key]; inp.dataset.field = key;
      inp.addEventListener('input', () => {
        mutate(() => { const x = findPage(p.id).page; x[key] = opts.number ? (parseFloat(inp.value) > 0 ? parseFloat(inp.value) : null) : inp.value; }, 'f:' + p.id + ':' + key, { render: false });
        updateCard(p.id); renderHeader(); if (view === 'script') renderScript();
      });
      return el('div', { class: 'fld' + (opts.cls ? ' ' + opts.cls : '') }, el('label', null, label, opts.extra || null), inp);
    };
    const statusSel = el('select', { 'data-field': 'status' }, S.STATUSES.map(s => el('option', { value: s.id }, s.label))); statusSel.value = p.status;
    statusSel.addEventListener('change', () => mutate(() => { findPage(p.id).page.status = statusSel.value; }));
    const sceneSel = el('select', { title: 'Move to scene', 'data-field': 'scene' }, doc.scenes.map(s => el('option', { value: s.id }, s.title))); sceneSel.value = scene.id;
    sceneSel.addEventListener('change', () => movePageToScene(p.id, sceneSel.value));
    ed.classList.toggle('drawer', drawer);
    const tabs = [['page', 'Page'], ['cuts', 'Cuts' + (p.cuts.length ? ' ' + p.cuts.length : '')], ['prompts', 'Prompts'], ['cast', 'Cast' + (p.characters.length ? ' ' + p.characters.length : '')], ['takes', 'Takes' + (p.takes.length ? ' ' + p.takes.length : '')], ['log', 'Log' + (p.genLog.length ? ' ' + p.genLog.length : '')]];
    const copyBtn = (key) => el('button', { class: 'copy-btn', title: 'Copy to clipboard', onclick: (e) => { e.preventDefault(); copyText(findPage(p.id).page[key] || '', 'Prompt copied'); } }, '⧉ copy');
    const promptBlock = (key, toolKey, label, ph) => el('div', { class: 'pblock' },
      field(key, label, { multiline: true, rows: 4, placeholder: ph, extra: copyBtn(key) }),
      field(toolKey, 'Tool', { list: 'toolList', placeholder: 'midjourney, nanoBanana, imagine, seedance, wan, kling… or any', cls: 'tool' }));
    const autoLyr = !p.lyrics ? S.lyricsFor(p, doc) : '';
    const body = {
      page: () => [
        editorWarnings(p), altStrip(p, scene),
        el('div', { class: 'row' }, el('div', { class: 'fld' }, el('label', null, 'Status'), statusSel), el('div', { class: 'fld' }, el('label', null, 'Scene'), sceneSel)),
        p.status === 'cut' ? el('label', { class: 'bridged-row', title: 'The real edit bridges this page\'s song time (e.g. the neighbours were extended), so the gap check treats it as covered.' }, (() => { const cb = el('input', { type: 'checkbox', class: 'f-bridged' }); cb.checked = !!p.bridged; cb.onchange = () => mutate(() => { findPage(p.id).page.bridged = cb.checked; }); return cb; })(), ' Bridged in the edit (no gap for its song time)') : null,
        el('div', { class: 'row' }, roleSel(p), speedField(p), retimeSel(p)),
        field('effect', 'Effect', { placeholder: 'e.g. flicker, strobe' }),
        mediaSlot(p, 'image'), mediaSlot(p, 'video'),
        el('div', { class: 'cuts-sum muted' }, p.cuts.length ? '✂ ' + p.cuts.length + ' cuts · ' : 'No cut burst. ', el('button', { class: 'copy-btn go-cuts', onclick: () => { edTab = 'cuts'; renderEditor(); } }, p.cuts.length ? 'edit cuts →' : 'make one →')),
        el('div', { class: 'row' }, field('start', 'Start (song time)', { placeholder: '1:57' }), field('end', 'End', { placeholder: '2:03' }), field('duration', 'Duration (s)', { number: true, placeholder: 'auto ' + (Math.round(dur(p) * 10) / 10) }), field('genSeconds', 'Gen length (s)', { number: true, placeholder: 'e.g. 6' })),
        el('div', { class: 'row' }, field('title', 'Short title', { placeholder: 'e.g. First breath' }), field('code', 'Code / old page no.', { placeholder: 'e.g. 03' })),
        field('lyrics', 'Lyrics / dialogue', { multiline: true, rows: 2, placeholder: autoLyr ? '♪ from the song: ' + autoLyr : '',
          extra: autoLyr ? el('button', { class: 'copy-btn lyr-fill', title: 'Copy the song lyrics for this time range into the page', onclick: (e) => { e.preventDefault(); mutate(() => { findPage(p.id).page.lyrics = autoLyr; }); } }, '♪ fill from song') : null }),
        field('description', 'Description / action', { multiline: true, rows: 4 }),
        el('div', { class: 'row' }, field('camera', 'Camera', { placeholder: 'e.g. medium shot, fast push-in' }), field('mood', 'Mood', { placeholder: 'e.g. eerie calm, neon dread' })),
        charPicker(p),
        field('notes', 'Notes', { multiline: true, rows: 2 }),
        field('flag', 'Flag (needs Lucas OK…)', { placeholder: 'e.g. drink – Lucas to OK' }),
        commentsBox(p)],
      prompts: () => [
        promptBlock('imagePrompt', 'imageTool', 'Image prompt', 'Still image prompt'),
        promptBlock('videoPrompt', 'videoTool', 'Video prompt (image-to-video)', '(6 s, image-to-video) …'),
        el('div', { class: 'row' }, field('genSeconds', 'Generation length (s) — checked against page length, speed and source in/out', { number: true, placeholder: 'e.g. 6' })),
        promptBlock('negativePrompt', 'negativeTool', 'Negative prompt', 'what to avoid'),
        p.characters.length ? el('div', { class: 'muted', style: { fontSize: '12px' } }, 'Character blocks (canon + look + refs) are on the Cast tab.') : null],
      cast: () => castTab(p, scene),
      cuts: () => cutsTab(p),
      takes: () => takesTab(p),
      log: () => logTab(p)
    };
    if (!body[edTab]) edTab = 'page';
    ed.append(
      el('div', { class: 'ed-head' },
        el('button', { title: 'Previous page', disabled: ix <= 0, onclick: () => select(all[ix - 1].id) }, '‹'),
        el('h2', null, 'Page ' + num + ' / ' + total),
        el('button', { title: 'Next page', disabled: ix >= all.length - 1, onclick: () => select(all[ix + 1].id) }, '›'),
        el('button', { title: drawer ? 'Narrow editor' : 'Open the large breakout drawer (or double-click a page)', class: 'ed-drawer', onclick: () => { drawer = !drawer; renderEditor(); } }, drawer ? '⇥' : '⤢'),
        el('button', { title: 'Close', class: 'ed-close', onclick: () => select(null) }, '✕')),
      el('div', { class: 'ed-tools' },
        el('button', { class: 'ed-up', onclick: () => movePage(p.id, -1), title: 'Move earlier' }, '↑ Earlier'),
        el('button', { class: 'ed-down', onclick: () => movePage(p.id, 1), title: 'Move later' }, '↓ Later'),
        el('button', { onclick: () => addPage(scene.id, p.id), title: 'Insert a new page after this one' }, '+ After'),
        el('button', { class: 'ed-dup', onclick: () => duplicatePage(p.id) }, '⧉ Duplicate'),
        el('button', { class: 'ed-alt', title: 'Add an alternative shot of this page (inactive until you pick it)', onclick: () => addPageAltUI(p.id) }, '⇄ Alternative'),
        el('button', { onclick: () => play(p.id) }, '▶ From here'),
        el('button', { class: 'danger ed-del', onclick: () => deletePage(p.id) }, '🗑 Delete')),
      el('div', { class: 'ed-tabs', role: 'tablist' }, tabs.map(([id, label]) => el('button', { class: 'tab-' + id + (edTab === id ? ' on' : ''), onclick: () => { edTab = id; renderEditor(); } }, label))),
      el('div', { class: 'ed-body ed-' + edTab }, body[edTab]()),
      el('div', { class: 'muted', style: { fontSize: '11px', marginTop: '10px' } }, 'id: ' + p.id)
    );
    ed.scrollTop = keepScroll;
  }
  function editorWarnings(p) {
    const w = []; const dw = S.durationWarning(p, doc); if (dw) w.push('⏱ ' + dw);
    const ov = S.cutsOverrun(p, doc);
    if (ov) w.push(el('span', { class: 'overrun-msg' }, '✂ The cuts add up to ' + ov.total + ' s on a ' + (Math.round(ov.page * 1000) / 1000) + ' s page (+' + ov.over + ' s). ',
      el('button', { class: 'copy-btn trim-fit', onclick: () => mutate(() => { S.trimCutsToFit(findPage(p.id).page, doc); }) }, 'trim last cut to fit'), ' ',
      el('button', { class: 'copy-btn stretch-page', title: 'Sets the page duration to the cuts\' total (song start/end stay)', onclick: () => mutate(() => { S.stretchPageToCuts(findPage(p.id).page, doc); }) }, 'stretch page')));
    const gi = gapFor(p.id);
    if (gi.gap) w.push('⚠ Song-time gap: nothing covers ' + S.fmtTime(gi.gap.from, true) + ' → ' + S.fmtTime(gi.gap.to, true) + ' (' + (Math.round(gi.gap.seconds * 10) / 10) + ' s) before this page. Fill it, or set the role of an out-of-order page to Insert / Flash-forward / Flashback.');
    if (gi.overlap) w.push('⚠ Overlaps the previous linear page by ' + (Math.round(gi.overlap.seconds * 10) / 10) + ' s of song time.');
    return w.length ? el('div', { class: 'ed-warn' }, w.map(t => el('div', null, t))) : null;
  }
  function roleSel(p) {
    const sel = el('select', { 'data-field': 'role' }, S.ROLES.map(r => el('option', { value: r.id }, r.label))); sel.value = p.role || 'linear';
    sel.addEventListener('change', () => mutate(() => { findPage(p.id).page.role = sel.value === 'linear' ? '' : sel.value; }));
    return el('div', { class: 'fld' }, el('label', { title: 'Linear pages follow the song. Inserts and flashes may sit anywhere in song time.' }, 'Role'), sel);
  }
  function speedField(p) {
    const inp = el('input', { type: 'number', step: '0.05', placeholder: '1 = normal', 'data-field': 'speed', title: '1 = normal · 0.4 = 40% slow motion · 2 = double · negative = reverse' });
    inp.value = p.speed == null ? '' : p.speed;
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      mutate(() => { findPage(p.id).page.speed = isFinite(v) && v !== 0 && v !== 1 ? v : (v === 1 ? 1 : null); }, 'f:' + p.id + ':speed', { render: false });
      updateCard(p.id); renderHeader();
    });
    return el('div', { class: 'fld' }, el('label', null, 'Speed (×)'), inp);
  }
  function retimeSel(p) {
    const sel = el('select', { 'data-field': 'retime' }, el('option', { value: '' }, '—'), S.RETIMES.map(r => el('option', { value: r.id }, r.label))); sel.value = p.retime || '';
    sel.addEventListener('change', () => mutate(() => { findPage(p.id).page.retime = sel.value; }));
    return el('div', { class: 'fld' }, el('label', { title: 'How the editor (Resolve) should retime. Label only: the preview uses plain playback speed.' }, 'Retime'), sel);
  }
  function driftLine(m) {
    if (!m) return null;
    const bits = [m.version ? 'version ' + m.version : '', m.modifiedTime ? 'modified ' + m.modifiedTime.replace('T', ' ').slice(0, 19) : '', m.md5 ? 'md5 ' + m.md5.slice(0, 10) + '…' : ''].filter(Boolean);
    return bits.length ? el('div', { class: 'drift', title: m.md5 ? 'md5 ' + m.md5 : '' }, bits.join(' · ')) : null;
  }
  const numOrUndef = (v) => { const n = parseFloat(v); return isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : undefined; };
  /** in/out inputs for a media object; get() returns the live media object inside a mutate */
  function inOutRow(pid, get, videoEl, key) {
    const m = get(findPage(pid).page) || {};
    const mk = (k) => {
      const inp = el('input', { type: 'number', step: '0.01', min: 0, placeholder: k === 'in' ? '0' : 'end', 'data-field': 'media-' + k });
      inp.value = m[k] === undefined ? '' : m[k];
      inp.addEventListener('input', () => { mutate(() => { const x = get(findPage(pid).page); if (!x) return; const v = numOrUndef(inp.value); if (v === undefined) delete x[k]; else x[k] = v; }, 'f:' + pid + ':' + key + k, { render: false }); updateCard(pid); renderHeader(); });
      return inp;
    };
    const iIn = mk('in'), iOut = mk('out');
    const setFrom = (k, inp) => () => {
      const v = videoEl && videoEl(); if (!v) return toast('Play or scrub the video above first');
      inp.value = Math.round(v.currentTime * 100) / 100; inp.dispatchEvent(new Event('input'));
    };
    return el('div', { class: 'inout' },
      el('div', { class: 'fld' }, el('label', null, 'Source in (s)'), iIn),
      el('div', { class: 'fld' }, el('label', null, 'Source out (s)'), iOut),
      videoEl ? el('button', { class: 'set-in', title: 'Set source in from the current frame of the video above', onclick: setFrom('in', iIn) }, '⇤ in = frame') : null,
      videoEl ? el('button', { class: 'set-out', title: 'Set source out from the current frame of the video above', onclick: setFrom('out', iOut) }, 'out = frame ⇥') : null);
  }
  function cutsBox(p) {
    const list = el('div', { class: 'cuts' }); const cutW = S.cutWarnings(p, doc);
    p.cuts.forEach((c, i) => {
      const num = (k, ph, title) => {
        const inp = el('input', { type: 'number', step: '0.01', placeholder: ph, title, class: 'cut-' + k });
        const src = k === 'in' || k === 'out' || k === 'genSeconds' ? c.media : c; inp.value = src[k] == null ? '' : src[k];
        inp.addEventListener('input', () => {
          mutate(() => {
            const x = findPage(p.id).page.cuts[i]; const v = parseFloat(inp.value);
            if (k === 'in' || k === 'out') { const n = numOrUndef(inp.value); if (n === undefined) delete x.media[k]; else x.media[k] = n; }
            else if (k === 'genSeconds') { if (v > 0) x.media.genSeconds = v; else delete x.media.genSeconds; }
            else x[k] = isFinite(v) && v !== 0 && (k === 'speed' || v > 0) ? v : null;
          }, 'f:' + p.id + ':cut' + i + k, { render: false });
          updateCard(p.id); renderHeader();
        });
        return inp;
      };
      const move = (d) => mutate(() => { const a = findPage(p.id).page.cuts; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; });
      const cw = cutW.find(x => x.i === i); const kg = S.clipGenSeconds(c.media, doc, p);
      list.append(el('div', { class: 'cut' + (cw ? ' warn' : ''), dataset: { i }, title: cw ? cw.msg : '' },
        el('b', null, (i + 1) + '.'), el('span', { class: 'nm', title: mediaLabel(c.media) }, c.media.name || c.media.path || c.media.driveId || 'link'),
        'in', num('in', '0', 'Source in (s)'), 'out', num('out', 'end', 'Source out (s)'), 'dur', num('duration', 'auto', 'On-screen duration (s); empty = share the page evenly'), '×', num('speed', '1', 'Speed (negative = reverse)'), 'gen', num('genSeconds', kg && !c.media.genSeconds ? String(kg) : '–', 'Generation length of this clip (s). Empty = taken from a page using the same clip' + (kg ? ' (' + kg + ' s)' : '')),
        el('button', { class: 'cut-up', title: 'Earlier', disabled: i === 0, onclick: () => move(-1) }, '↑'),
        el('button', { class: 'cut-down', title: 'Later', disabled: i === p.cuts.length - 1, onclick: () => move(1) }, '↓'),
        el('button', { class: 'danger cut-del', title: 'Remove cut', onclick: () => mutate(() => { findPage(p.id).page.cuts.splice(i, 1); }) }, '✕')));
    });
    const addCut = (media) => mutate(() => { findPage(p.id).page.cuts.push({ media, duration: null, speed: null }); });
    const fromFile = () => {
      const inp = $('#fileMedia'); inp.accept = 'video/*,image/*'; inp.multiple = true; inp.value = '';
      inp.onchange = async () => { const fs = Array.from(inp.files); inp.multiple = false; for (const f of fs) { const m = await mediaFromFile(f, IMG_EXT.test(f.name) ? 'image' : 'video'); if (m) addCut(m); } };
      inp.click();
    };
    const fromLink = async () => {
      const r = await promptModal('Add cut', [{ key: 'drive', label: 'Google Drive link or file ID (optional)', placeholder: 'https://drive.google.com/file/d/…' }, { key: 'path', label: 'Path inside the project folder', placeholder: 'e.g. bp-sb2-clips/SB2_01_v2.mp4' }], 'Add');
      if (!r) return; const id = S.parseDriveId(r.drive.trim()); const path = normPath(r.path.trim());
      if (!id && !path) return; const nm = path ? mref(path, path.split('/').pop()) : { driveId: '', path: '', url: '', name: '' }; nm.driveId = id || ''; addCut(S.normMedia(nm));
    };
    return el('div', { class: 'fld cutsfld' }, el('label', { title: 'Fast cut / flicker burst: plays these in order inside the page length, looping if they are shorter.' }, '✂ Cuts (' + p.cuts.length + ')' + (p.cuts.length ? ' · ' + (Math.round(p.cuts.reduce((a, c) => a + (c.duration || 0), 0) * 100) / 100 || 'auto') + ' s' : '')), list,
      el('div', { class: 'btns' },
        el('button', { class: 'cut-add-file', onclick: fromFile }, '+ File…'),
        hasFolder() ? el('button', { class: 'cut-add-folder', onclick: () => pickFromFolder(p.id, 'video', (rel) => addCut(mref(rel, rel.split('/').pop()))) }, '+ From folder…') : null,
        el('button', { class: 'cut-add-link', onclick: fromLink }, '+ Drive link / path…'),
        p.video && !p.cuts.length ? el('button', { class: 'cut-add-self', title: 'Start a cut list with the page video', onclick: () => addCut(JSON.parse(JSON.stringify(p.video))) }, '+ Page video') : null));
  }
  // ---------- v2: cast, takes, generation log ----------
  let edTab = 'page', drawer = false;
  let lastCopied = '';
  async function copyText(t, msg) {
    lastCopied = t;
    try { await navigator.clipboard.writeText(t); }
    catch { const ta = el('textarea', { style: { position: 'fixed', opacity: 0 } }); ta.value = t; document.body.append(ta); ta.select(); try { document.execCommand('copy'); } catch { } ta.remove(); }
    toast(msg || 'Copied');
  }
  function mediaThumbInto(img, m, size) {
    resolveMedia(m).then(r => { if (!r) { img.remove(); return; } img.src = r.kind === 'drive' ? driveThumb(m.driveId, size || 96) : r.src; }).catch(() => img.remove());
    img.onerror = () => img.remove();
    return img;
  }
  /** card chip for a character: thumbnail of the chosen look's first ref image + name */
  function castChip(p, r) {
    const c = charById(r.charId); const f = findPage(p.id); const e = S.effectiveLook(doc, f && f.scene, p, r.charId);
    const thumb = e && e.thumbs[0];
    return el('span', { class: 'chip castchip', style: { borderColor: c.color }, title: c.name + (e && e.look ? ' · ' + e.look.label : '') + (e && Object.keys(e.overrides).length ? ' (override)' : '') },
      thumb ? mediaThumbInto(el('img', { alt: '', class: 'cthumb' }), thumb, 64) : null, c.name, e && e.look ? el('span', { class: 'lk' }, ' · ' + e.look.label) : null);
  }
  function castTab(p, scene) {
    const box = el('div', { class: 'cast' });
    const tool = el('input', { list: 'toolList', placeholder: 'tool for the prompt block', class: 'cast-tool', value: p.imageTool || p.videoTool || '' });
    if (!doc.characters.length) box.append(el('p', { class: 'muted' }, 'No characters yet. Add some in the cast manager.'));
    for (const r of p.characters) {
      const c = charById(r.charId); const e = S.effectiveLook(doc, scene, p, r.charId);
      if (!e) continue;
      const sel = el('select', { class: 'look-sel', title: 'Look for this page' }, el('option', { value: '' }, '(scene / default: ' + ((S.effectiveLook(doc, scene, Object.assign({}, p, { characters: [] }), r.charId) || {}).look || { label: 'none' }).label + ')'), e.char.looks.map(l => el('option', { value: l.id }, l.label)));
      sel.value = r.lookId || '';
      sel.addEventListener('change', () => mutate(() => { const x = findPage(p.id).page.characters.find(q => q.charId === r.charId); x.lookId = sel.value; }));
      const thumbs = el('div', { class: 'thumbs' }, e.thumbs.slice(0, 6).map(m => mediaThumbInto(el('img', { alt: '', title: m.path || m.name || m.driveId }), m, 160)));
      const conf = S.canonConflicts(e.char.canon, S.LOOK_FIELDS.map(k => e.merged[k]).join('. '));
      const lk = S.LOOK_FIELDS.filter(k => e.merged[k]).map(k => el('span', { class: 'kv' + (e.overrides[k] !== undefined ? ' ov' : '') }, k + ': ' + e.merged[k]));
      const card = el('div', { class: 'castcard', dataset: { char: r.charId }, title: 'Double-click to edit the look', ondblclick: (ev) => { if (!ev.target.closest('select,button,input')) lookEditor(p.id, r.charId); } },
        el('div', { class: 'ch' }, el('b', { style: { color: c.color } }, c.name), ' ', sel,
          el('button', { class: 'look-edit', onclick: () => lookEditor(p.id, r.charId), title: 'Edit look (or double-click the card)' }, '✎ Look'),
          el('button', { class: 'copy-btn cast-copy', title: 'Copy the character block (canon + look + overrides + refs) for the tool', onclick: () => copyText(S.promptBlock(doc, scene, p, r.charId, tool.value.trim()), 'Character block copied') }, '⧉ prompt block')),
        e.char.canon ? el('div', { class: 'canon' }, '🔒 ' + e.char.canon) : null,
        el('div', { class: 'muted src' }, e.look ? 'look "' + e.look.label + '" from ' + e.source + (Object.keys(e.overrides).length ? ' + overrides' : '') : 'no look yet', e.refSet ? ' · refs: ' + e.refSet.label : ''),
        lk.length ? el('div', { class: 'kvs' }, lk) : null,
        conf.length ? el('div', { class: 'ed-warn canon-warn' }, '⚠ ' + conf.join(' · ')) : null,
        thumbs);
      box.append(card);
    }
    // scene-level default looks
    const sceneRows = scene.pages.some(q => q.characters.length) || scene.characters.length ? doc.characters.filter(c => c.looks.length).map(c => {
      const sr = scene.characters.find(q => q.charId === c.id);
      const sel = el('select', { class: 'scene-look', dataset: { char: c.id } }, el('option', { value: '' }, '(character default)'), c.looks.map(l => el('option', { value: l.id }, l.label)));
      sel.value = sr ? sr.lookId : '';
      sel.addEventListener('change', () => mutate(d => { const s = d.scenes.find(x => x.id === scene.id); const x = s.characters.find(q => q.charId === c.id); if (x) { x.lookId = sel.value; if (!x.lookId && !Object.keys(x.overrides).length) s.characters = s.characters.filter(q => q !== x); } else if (sel.value) s.characters.push({ charId: c.id, lookId: sel.value, overrides: {} }); }));
      return el('div', { class: 'row' }, el('span', { style: { minWidth: '90px' } }, c.name), sel);
    }) : [];
    box.append(el('div', { class: 'fld' }, el('label', null, 'Prompt block tool'), tool));
    if (sceneRows.length) box.append(el('div', { class: 'fld' }, el('label', { title: 'Page look beats scene look beats the character default.' }, 'Scene "' + scene.title + '" looks'), sceneRows));
    box.append(charPicker(p), el('button', { class: 'cast-manage', onclick: () => castManager() }, '👥 Cast manager…'));
    return box;
  }
  /** Look editor for one character on one page: save as a new look, or override just here. */
  function lookEditor(pageId, charId) {
    const f = findPage(pageId); const p = f.page; const e = S.effectiveLook(doc, f.scene, p, charId); if (!e) return;
    const ch = e.char; const inputs = {};
    const rs = el('select', { class: 'le-refset' }, el('option', { value: '' }, '(no ref set)'), ch.refSets.map(r => el('option', { value: r.id }, r.label))); rs.value = e.refSet ? e.refSet.id : '';
    const warn = el('div', { class: 'ed-warn le-warn', hidden: true });
    const check = () => { const c = S.canonConflicts(ch.canon, S.LOOK_FIELDS.map(k => inputs[k].value).join('. ')); warn.hidden = !c.length; warn.textContent = '⚠ Contradicts canon: ' + c.join(' · '); };
    const fields = S.LOOK_FIELDS.map(k => { inputs[k] = el(k === 'notes' ? 'textarea' : 'input', { class: 'le-' + k, rows: 2 }); inputs[k].value = e.merged[k] || ''; inputs[k].addEventListener('input', check); return el('div', { class: 'fld' }, el('label', null, k), inputs[k]); });
    const label = el('input', { class: 'le-label', placeholder: 'new look name, e.g. Rain-soaked' });
    const collect = () => { const o = {}; for (const k of S.LOOK_FIELDS) o[k] = inputs[k].value.trim(); return o; };
    const box = el('div', { class: 'look-editor' }, el('h2', null, '✎ ' + ch.name + ' — look on page ' + pageNumber(pageId)),
      ch.canon ? el('div', { class: 'canon' }, el('b', null, '🔒 Canon (locked): '), ch.canon) : el('div', { class: 'muted' }, 'No canon notes yet (cast manager).'),
      el('div', { class: 'fld' }, el('label', null, 'Reference set'), rs),
      el('div', { class: 'grid2' }, fields), warn,
      el('div', { class: 'fld' }, el('label', null, 'Name for “Save as new look”'), label),
      el('div', { class: 'modal-actions' },
        el('button', { onclick: closeModal }, 'Cancel'),
        el('button', { class: 'le-override', title: 'Keep the look, store only the differences on this page', onclick: () => {
          const v = collect(); const base = e.look || {}; const ov = {};
          for (const k of S.LOOK_FIELDS) if (v[k] !== (base[k] || '')) ov[k] = v[k];
          if (rs.value && rs.value !== (base.refSetId || '')) ov.refSetId = rs.value;
          mutate(() => { const x = findPage(pageId).page.characters.find(q => q.charId === charId); x.overrides = ov; if (!x.lookId && e.lookId && e.source === 'page') x.lookId = e.lookId; });
          closeModal(); toast(Object.keys(ov).length ? 'Override saved on this page' : 'No differences: override cleared');
        } }, 'Override just here'),
        el('button', { class: 'primary le-new', onclick: () => {
          const v = collect(); const lab = label.value.trim() || 'Look ' + (ch.looks.length + 1);
          let id = S.slug(lab) || 'look'; while (ch.looks.find(l => l.id === id)) id += '-2';
          mutate(d => { const c = d.characters.find(x => x.id === charId); c.looks.push(Object.assign({ id, label: lab, refSetId: rs.value }, v)); const x = findPage(pageId).page.characters.find(q => q.charId === charId); x.lookId = id; x.overrides = {}; });
          closeModal(); toast('Saved look "' + lab + '"');
        } }, 'Save as new look')));
    modal(box); check();
  }
  function takeMedia(t) { const m = {}; for (const k of ['driveId', 'path', 'url', 'name', 'in', 'out', 'md5', 'modifiedTime', 'version']) if (t[k] !== undefined && t[k] !== '') m[k] = t[k]; return S.normMedia(m); }
  function takesTab(p) {
    const box = el('div', { class: 'takes' });
    const isVid = (t) => VID_EXT.test(t.path || t.name || t.url || '');
    const viewer = (t) => {
      const w = el('div', { class: 'tview' });
      resolveMedia(t).then(r => {
        if (!r) { w.append(el('div', { class: 'muted' }, 'not found')); return; }
        if (r.playable && isVid(t)) w.append(el('video', { src: r.src, controls: true, playsinline: true, preload: 'metadata', muted: true }));
        else w.append(mediaThumbInto(el('img', { alt: '' }), t, 640));
      }).catch(() => {});
      return w;
    };
    p.takes.forEach((t, i) => {
      const inp = (k, ph, w) => { const x = el('input', { value: t[k] || '', placeholder: ph, class: 'take-' + k, style: { width: w }, list: k === 'tool' ? 'toolList' : null }); x.addEventListener('input', () => mutate(() => { findPage(p.id).page.takes[i][k] = x.value; }, 'f:' + p.id + ':take' + i + k, { render: false })); return x; };
      box.append(el('div', { class: 'take' + (t.pick ? ' picked' : ''), dataset: { i } },
        viewer(t),
        el('div', { class: 'tmeta' },
          el('div', { class: 'nm', title: mediaLabel(t) }, (t.pick ? '★ ' : '') + (t.name || t.path || t.driveId || 'take ' + (i + 1))),
          el('div', { class: 'row' }, inp('version', 'v1', '60px'), inp('tool', 'tool', '110px'), inp('note', 'note', '100%')),
          el('div', { class: 'btns' },
            el('button', { class: 'take-pick' + (t.pick ? ' primary' : ''), title: 'Use this take as the page media', onclick: () => pickTake(p.id, i) }, t.pick ? '★ Picked' : '☆ Pick'),
            el('button', { class: 'danger take-del', onclick: () => mutate(() => { findPage(p.id).page.takes.splice(i, 1); }) }, '✕')))));
    });
    const addTake = (m) => mutate(() => { const pg = findPage(p.id).page; pg.takes.push(Object.assign(m, { tool: '', note: '', pick: false })); if (pg.status === 'idea' || pg.status === 'prompted') pg.status = 'rendered'; });
    const fromFile = () => {
      const inp = $('#fileMedia'); inp.accept = 'video/*,image/*'; inp.multiple = true; inp.value = '';
      inp.onchange = async () => { const fs = Array.from(inp.files); inp.multiple = false; for (const f of fs) { const m = await mediaFromFile(f, IMG_EXT.test(f.name) ? 'image' : 'video'); if (m) addTake(m); } };
      inp.click();
    };
    const fromLink = async () => {
      const r = await promptModal('Add take', [{ key: 'drive', label: 'Google Drive link or file ID (optional)' }, { key: 'path', label: 'Path inside the project folder', placeholder: 'e.g. bp-sb2-clips/SB2_03_v3.mp4' }], 'Add');
      if (!r) return; const id = S.parseDriveId(r.drive.trim()); const path = normPath(r.path.trim()); if (!id && !path) return;
      const m = path ? mref(path, path.split('/').pop()) : { driveId: '', path: '', url: '', name: '' }; m.driveId = id || ''; addTake(S.normMedia(m));
    };
    // compare
    if (p.takes.length >= 2) {
      const a = el('select', { class: 'cmp-a' }), b = el('select', { class: 'cmp-b' });
      p.takes.forEach((t, i) => { const lab = (i + 1) + '. ' + (t.version || '') + ' ' + (t.tool || '') + ' ' + (t.name || ''); a.append(el('option', { value: i }, lab)); b.append(el('option', { value: i }, lab)); });
      a.value = 0; b.value = 1;
      const mode = el('select', { class: 'cmp-mode' }, el('option', { value: 'side' }, 'side by side'), el('option', { value: 'toggle' }, 'toggle A/B'));
      const stage = el('div', { class: 'cmp-stage' }); let showB = false;
      const draw = () => {
        stage.innerHTML = ''; stage.className = 'cmp-stage ' + mode.value;
        if (mode.value === 'side') stage.append(el('div', null, el('b', null, 'A'), viewer(p.takes[a.value])), el('div', null, el('b', null, 'B'), viewer(p.takes[b.value])));
        else stage.append(el('div', null, el('b', { class: 'cmp-which' }, showB ? 'B' : 'A'), viewer(p.takes[showB ? b.value : a.value])), el('button', { class: 'cmp-flip', onclick: () => { showB = !showB; draw(); } }, '⇄ Flip A/B'));
      };
      [a, b, mode].forEach(x => x.addEventListener('change', draw));
      box.prepend(el('div', { class: 'fld compare' }, el('label', null, 'Compare takes'), el('div', { class: 'row' }, a, b, mode), stage));
      draw();
    }
    box.append(el('div', { class: 'btns' },
      el('button', { class: 'take-add-file', onclick: fromFile }, '+ File…'),
      hasFolder() ? el('button', { class: 'take-add-folder', onclick: () => pickFromFolder(p.id, 'video', (rel) => addTake(mref(rel, rel.split('/').pop()))) }, '+ From folder…') : null,
      el('button', { class: 'take-add-link', onclick: fromLink }, '+ Drive link / path…'),
      (p.video || p.image) && !p.takes.length ? el('button', { class: 'take-add-current', onclick: () => mutate(() => { const pg = findPage(p.id).page; pg.takes.push(Object.assign(JSON.parse(JSON.stringify(pg.video || pg.image)), { tool: pg.video ? pg.videoTool : pg.imageTool, note: '', pick: true })); }) }, '+ Current media as take 1') : null));
    if (!p.takes.length) box.prepend(el('p', { class: 'muted' }, 'Keep every render here (v1, v2, other tools). The picked take becomes the page image or video.'));
    return box;
  }
  function pickTake(pageId, i) {
    mutate(() => {
      const pg = findPage(pageId).page; pg.takes.forEach((t, k) => { t.pick = k === i; });
      const t = pg.takes[i]; const m = takeMedia(t); const slot = VID_EXT.test(t.path || t.name || t.url || '') ? 'video' : 'image';
      pg[slot] = m; const rank = (x) => S.STATUS_IDS.indexOf(x); if (pg.status !== 'cut' && rank(pg.status) < rank('picked')) pg.status = 'picked';
    });
    toast('Take ' + (i + 1) + ' is now the page media');
  }
  function logTab(p) {
    const box = el('div', { class: 'genlog' });
    if (!p.genLog.length) box.append(el('p', { class: 'muted' }, 'Generation log: which tool and model made what, the cost, and who approved it.'));
    p.genLog.forEach((g, i) => box.append(el('div', { class: 'gl' },
      el('div', null, el('b', null, S.toolLabel(g.tool) || '?'), g.model ? ' · ' + g.model : '', g.resolution ? ' · ' + g.resolution : '', g.seconds !== null ? ' · ' + g.seconds + ' s' : '', g.credits !== null ? ' · ' + g.credits + ' credits' : '',
        el('button', { class: 'danger gl-del', style: { float: 'right', padding: '0 6px' }, onclick: () => mutate(() => { findPage(p.id).page.genLog.splice(i, 1); }) }, '✕')),
      g.approvedBy || g.approvedAt ? el('div', { class: 'muted' }, '✔ approved' + (g.approvedBy ? ' by ' + g.approvedBy : '') + (g.approvedAt ? ' · ' + S.fmtStamp(g.approvedAt) : '')) : null,
      g.quote ? el('div', { class: 'q' }, '“' + g.quote + '”') : null)));
    box.append(el('button', { class: 'gl-add', onclick: async () => {
      const last = p.genLog[p.genLog.length - 1] || {};
      const r = await promptModal('Add generation log entry', [
        { key: 'tool', label: 'Tool', value: last.tool || p.videoTool || p.imageTool || '', list: 'toolList' }, { key: 'model', label: 'Model', value: last.model || '', placeholder: 'e.g. Kling 2.1 Master' },
        { key: 'resolution', label: 'Resolution', value: last.resolution || '', placeholder: '1080p' }, { key: 'seconds', label: 'Seconds', value: String(S.promptSeconds(p.videoPrompt) || '') },
        { key: 'credits', label: 'Credits', placeholder: 'e.g. 35' }, { key: 'approvedBy', label: 'Approved by', value: prefs.name || 'Lucas' },
        { key: 'approvedAt', label: 'Approved at', value: S.isoLocal(new Date()) }, { key: 'quote', label: 'Quote / approval words', placeholder: '“yes, this one”' }], 'Add');
      if (!r) return;
      mutate(() => { findPage(p.id).page.genLog.push(S.normGen(r)); });
    } }, '+ Add entry'));
    return box;
  }
  /** Cast manager: characters, canon, ref sets, looks, "used in". Works on a copy; Save applies it (one undo step). */
  function castManager(focusId) {
    const work = JSON.parse(JSON.stringify(doc.characters)); let cur = focusId || (work[0] && work[0].id) || ''; let canonOpen = false;
    const box = el('div', { class: 'castmgr' });
    const tmpDoc = () => Object.assign({}, doc, { characters: work });
    const used = (cid, what) => { const u = S.usedIn(tmpDoc(), cid, what); return el('div', { class: 'muted used' }, 'Used in: ' + (u.length ? u.map(x => x.label).join(', ') : 'nothing yet')); };
    const txt = (o, k, ph, cls, multi) => { const x = el(multi ? 'textarea' : 'input', { placeholder: ph || '', class: cls || '', rows: 2 }); x.value = o[k] || ''; x.addEventListener('input', () => { o[k] = x.value; }); return x; };
    const draw = () => {
      box.innerHTML = '';
      const c = work.find(x => x.id === cur);
      const list = el('div', { class: 'cm-list' }, work.map(x => el('button', { class: 'cm-char' + (x.id === cur ? ' on' : ''), style: { borderColor: x.color }, onclick: () => { cur = x.id; canonOpen = false; draw(); } }, x.name)),
        el('button', { class: 'cm-addchar', onclick: () => { const id = 'char' + (work.length + 1); work.push(S.normCharacter({ id, name: 'New character' }, work.length)); cur = id; draw(); } }, '+ character'));
      const detail = el('div', { class: 'cm-detail' });
      if (c) {
        const canon = el('textarea', { rows: 3, class: 'cm-canon', readonly: !canonOpen }); canon.value = c.canon; canon.addEventListener('input', () => { c.canon = canon.value; });
        detail.append(
          el('div', { class: 'row' }, el('input', { type: 'color', value: c.color, style: { width: '36px', padding: 0 }, oninput: (e) => { c.color = e.target.value; } }), txt(c, 'name', 'Name', 'cm-name'),
            el('button', { class: 'danger', onclick: () => { if (confirm('Delete ' + c.name + '? Pages keep the id until you remove it.')) { work.splice(work.indexOf(c), 1); cur = work[0] ? work[0].id : ''; draw(); } } }, '🗑')),
          el('div', { class: 'fld' }, el('label', null, (canonOpen ? '🔓' : '🔒') + ' Canon (locked notes) ', el('button', { class: 'cm-unlock copy-btn', onclick: () => { canonOpen = !canonOpen; draw(); } }, canonOpen ? 'lock' : 'unlock to edit')), canon),
          el('h3', null, 'Reference sets'));
        c.refSets.forEach((r, ri) => {
          const imgs = el('div', { class: 'thumbs' }, r.images.map((m, mi) => el('span', { class: 'ri' }, mediaThumbInto(el('img', { alt: '', title: m.path || m.driveId }), m, 160), el('button', { class: 'danger', onclick: () => { r.images.splice(mi, 1); draw(); } }, '✕'))));
          const pub = el('input', { type: 'checkbox' }); pub.checked = r.publicOnly; pub.onchange = () => { r.publicOnly = pub.checked; };
          const tools = el('input', { value: r.allowedTools.join(', '), placeholder: 'allowed tools (empty = any), e.g. midjourney, kling', class: 'cm-tools' }); tools.oninput = () => { r.allowedTools = tools.value.split(',').map(x => S.toolId(x) || x.trim()).filter(Boolean); };
          const addImg = async () => { const q = await promptModal('Add reference image', [{ key: 'drive', label: 'Google Drive link or file ID (optional)' }, { key: 'path', label: 'Path inside the project folder', placeholder: 'e.g. refs/saisha/front.jpg' }], 'Add'); if (q) { const id = S.parseDriveId(q.drive.trim()); const pth = normPath(q.path.trim()); if (id || pth) r.images.push(S.normMedia({ driveId: id || '', path: pth })); } modal(box, { wide: true }); draw(); };
          detail.append(el('div', { class: 'refset', dataset: { id: r.id } },
            el('div', { class: 'row' }, txt(r, 'label', 'Ref set name', 'cm-rslabel'), el('label', { class: 'chk' }, pub, 'public-safe only'), el('button', { class: 'danger', onclick: () => { c.refSets.splice(ri, 1); draw(); } }, '✕')),
            tools, imgs,
            el('div', { class: 'btns' }, el('button', { class: 'cm-addimg', onclick: addImg }, '+ image link / path'),
              hasFolder() ? el('button', { onclick: () => pickFromFolder(null, 'image', (rel) => { r.images.push(mref(rel, rel.split('/').pop())); modal(box, { wide: true }); draw(); }) }, '+ from folder') : null),
            used(c.id, { refSetId: r.id })));
        });
        detail.append(el('button', { class: 'cm-addrs', onclick: () => { let id = 'refs' + (c.refSets.length + 1); while (c.refSets.find(x => x.id === id)) id += 'b'; c.refSets.push({ id, label: 'Refs ' + (c.refSets.length + 1), images: [], allowedTools: [], publicOnly: false, notes: '' }); draw(); } }, '+ reference set'), el('h3', null, 'Looks'));
        const def = el('select', { class: 'cm-default' }, el('option', { value: '' }, '(first look)'), c.looks.map(l => el('option', { value: l.id }, l.label))); def.value = c.defaultLookId; def.onchange = () => { c.defaultLookId = def.value; };
        if (c.looks.length) detail.append(el('div', { class: 'row' }, el('span', null, 'Default look'), def));
        c.looks.forEach((l, li) => {
          const rs = el('select', null, el('option', { value: '' }, '(no ref set)'), c.refSets.map(r => el('option', { value: r.id }, r.label))); rs.value = l.refSetId; rs.onchange = () => { l.refSetId = rs.value; };
          const warn = el('div', { class: 'ed-warn', hidden: true });
          const chk = () => { const w = S.canonConflicts(c.canon, S.LOOK_FIELDS.map(k => l[k]).join('. ')); warn.hidden = !w.length; warn.textContent = '⚠ Contradicts canon: ' + w.join(' · '); };
          const fl = S.LOOK_FIELDS.map(k => { const x = txt(l, k, k, 'cm-l-' + k, k === 'notes'); x.addEventListener('input', chk); return el('div', { class: 'fld' }, el('label', null, k), x); });
          detail.append(el('div', { class: 'look', dataset: { id: l.id } }, el('div', { class: 'row' }, txt(l, 'label', 'Look name', 'cm-llabel'), rs, el('button', { class: 'danger', onclick: () => { c.looks.splice(li, 1); draw(); } }, '✕')), el('div', { class: 'grid2' }, fl), warn, used(c.id, { lookId: l.id })));
          chk();
        });
        detail.append(el('button', { class: 'cm-addlook', onclick: () => { let id = 'look' + (c.looks.length + 1); while (c.looks.find(x => x.id === id)) id += 'b'; c.looks.push({ id, label: 'Look ' + (c.looks.length + 1), age: '', hair: '', outfit: '', makeup: '', props: '', refSetId: c.refSets[0] ? c.refSets[0].id : '', notes: '' }); draw(); } }, '+ look'));
      } else detail.append(el('p', { class: 'muted' }, 'Add a character to start.'));
      box.append(el('h2', null, '👥 Cast'), el('div', { class: 'cm-wrap' }, list, detail),
        el('div', { class: 'modal-actions' }, el('button', { onclick: closeModal }, 'Cancel'), el('button', { class: 'primary cm-save', onclick: () => {
          mutate(d => { d.characters = work.filter(x => x.name.trim()).map((x, i) => { const n = S.normCharacter(x, i); if (!x.id || /^char\d+$/.test(x.id)) { let id = S.slug(x.name) || x.id; if (d.characters.find(o => o.id === id) && id !== x.id) id = x.id; n.id = id; } return n; }); });
          closeModal(); toast('Cast saved');
        } }, 'Save cast')));
    };
    draw(); modal(box, { wide: true });
  }
  function exportEdit(kind) {
    const base = S.slug(doc.title);
    if (kind === 'csv') downloadBlob(S.toCSV(doc), 'text/csv', base + '-edit.csv');
    else if (kind === 'edl') downloadBlob(S.toCMX3600(doc), 'text/plain', base + '.edl');
    else downloadBlob(S.toEDLText(doc), 'text/plain', base + '-edit-list.txt');
  }

  // ---------- v3: alternatives strip, cut timeline, edit-list import, variants ----------
  function altStrip(p, scene) {
    const grp = scene.pages.filter(q => q.id === (p.altOf || p.id) || q.altOf === (p.altOf || p.id));
    const out = [];
    if (scene.slot) out.push(el('div', { class: 'muted alt-scene' }, '⇄ Scene "' + scene.title + '" is ' + (scene.active === false ? 'an inactive' : 'the active') + ' alternative' + (scene.altLabel ? ' (' + scene.altLabel + ')' : '') + ' of its slot.',
      scene.active === false ? el('button', { class: 'copy-btn', onclick: () => setActiveSceneUI(scene.id) }, 'make active') : null));
    if (grp.length > 1) {
      const lab = el('input', { class: 'alt-label', value: p.altLabel || '', placeholder: 'label, e.g. B close-up', style: { width: '150px' } });
      lab.addEventListener('input', () => mutate(() => { findPage(p.id).page.altLabel = lab.value; }, 'f:' + p.id + ':altLabel', { render: false }));
      lab.addEventListener('change', () => renderBoard());
      out.push(el('div', { class: 'alt-strip' }, el('span', null, '⇄ Alternative shots: '), grp.map(q => el('button', { class: 'alt-pick' + (q.id === p.id ? ' cur' : '') + (q.active !== false ? ' on' : ''), title: q.active !== false ? 'active' : 'inactive', onclick: () => select(q.id) }, (q.altLabel || '?') + (q.active !== false ? ' ●' : ''))),
        p.active === false ? el('button', { class: 'primary alt-activate', onclick: () => setActivePageUI(p.id) }, 'Make this one active') : el('span', { class: 'muted' }, ' (this one plays)'), ' ', lab));
    }
    return out.length ? el('div', { class: 'alts' }, out) : null;
  }
  function cutsTab(p) {
    const box = el('div', { class: 'cutstab' });
    const d = dur(p); const per = p.cuts.map(c => c.duration || d / p.cuts.length); const tot = per.reduce((a, b) => a + b, 0) || 1;
    if (p.cuts.length) {
      const ctl = el('div', { class: 'ctl', title: 'Drag blocks to reorder; drag a block\u2019s right edge to change its duration' });
      p.cuts.forEach((c, i) => {
        const blk = el('div', { class: 'cblk' + (c.duration ? '' : ' auto'), dataset: { i }, style: { flexBasis: (per[i] / tot * 100) + '%' }, title: (c.media.name || c.media.path || '') + ' · ' + (Math.round(per[i] * 1000) / 1000) + ' s' + (c.speed ? ' · ' + c.speed + '×' : '') },
          el('span', { class: 'cn' }, (i + 1) + ''), el('span', { class: 'cl' }, (Math.round(per[i] * 100) / 100) + 's' + (c.speed ? ' ' + (c.speed < 0 ? '◀' : '') + Math.abs(c.speed) + '×' : '')),
          el('span', { class: 'cedge', title: 'Drag to change the duration' }));
        const edge = blk.querySelector('.cedge');
        edge.addEventListener('pointerdown', (e) => {
          e.preventDefault(); e.stopPropagation(); edge.setPointerCapture(e.pointerId);
          const pxs = ctl.getBoundingClientRect().width / tot; const x0 = e.clientX; const d0 = per[i]; let nd = d0;
          const mv = (ev) => { nd = Math.max(0.04, Math.round((d0 + (ev.clientX - x0) / pxs) * 100) / 100); blk.style.flexBasis = (nd / tot * 100) + '%'; blk.querySelector('.cl').textContent = nd + 's'; };
          const up = () => { edge.removeEventListener('pointermove', mv); edge.removeEventListener('pointerup', up); mutate(() => { findPage(p.id).page.cuts[i].duration = nd; }); };
          edge.addEventListener('pointermove', mv); edge.addEventListener('pointerup', up);
        });
        ctl.append(blk);
      });
      sortables.push(Sortable.create(ctl, { animation: 120, direction: 'horizontal', filter: '.cedge', preventOnFilter: false, onEnd: () => {
        const ord = $$('.cblk', ctl).map(b => +b.dataset.i); if (ord.every((x, k) => x === k)) return;
        mutate(() => { const pg = findPage(p.id).page; pg.cuts = ord.map(k => pg.cuts[k]); });
      } }));
      const loops = d / tot;
      box.append(el('div', { class: 'fld' }, el('label', null, 'Timeline · cuts ' + (Math.round(tot * 100) / 100) + ' s / page ' + (Math.round(d * 100) / 100) + ' s' + (Math.abs(loops - 1) > 0.02 ? (loops > 1 ? ' · loops ×' + (Math.round(loops * 10) / 10) : ' · last cuts are cut off') : '')), ctl));
    }
    box.prepend(editorWarnings(p) || '');
    box.append(cutsBox(p), el('div', { class: 'btns' }, el('button', { class: 'cut-import', onclick: () => importEditDialog({ mode: 'cuts', pageId: p.id }) }, '⬇ Import cuts from CSV / EDL…')));
    return box;
  }
  function folderFiles() { return Array.from(local.files.values()).filter(e => VID_EXT.test(e.name) || IMG_EXT.test(e.name)).map(e => ({ path: relFromBase(e.path), name: e.name })); }
  /** Import a Resolve edit (CSV or CMX3600 EDL): preview, then apply onto pages by song time, or into one page's cuts. */
  function importEditDialog(opts = {}) {
    const ta = el('textarea', { rows: 7, class: 'ie-text', placeholder: 'Paste an EDL (CMX3600) or a CSV here, or choose a file…' });
    const file = el('input', { type: 'file', accept: '.edl,.csv,.txt,.tsv', class: 'ie-file' });
    file.onchange = async () => { if (file.files[0]) { ta.value = await file.files[0].text(); preview(); } };
    const fps = el('input', { type: 'number', step: '0.001', value: doc.fps || 24, class: 'ie-fps', style: { width: '80px' } });
    const mode = el('select', { class: 'ie-mode' }, el('option', { value: 'pages' }, 'Map onto pages by song time'), el('option', { value: 'cuts' }, 'Into the selected page\u2019s cuts'));
    mode.value = opts.mode || 'pages';
    const off = el('input', { class: 'ie-offset', value: '0:00', style: { width: '80px' }, title: 'Song time at the start of the record timeline (01:00:00:00 or 00:00:00:00)' });
    const snapF = el('input', { type: 'number', min: '0', step: '1', value: '4', class: 'ie-snap', style: { width: '60px' }, title: 'Event edges within this many frames of a page boundary snap to it' });
    const onlyB = el('input', { type: 'checkbox', class: 'ie-only' }); const trimO = el('input', { type: 'checkbox', class: 'ie-trim' });
    const out = el('div', { class: 'ie-out' }); let plan = null;
    const preview = () => {
      out.innerHTML = '';
      const evs = S.parseEditList(ta.value, parseFloat(fps.value) || 24);
      if (!evs.length) { out.append(el('p', { class: 'muted' }, ta.value.trim() ? 'No events found. Expecting a CMX3600 EDL or a CSV with clip / source in / out / record in columns.' : '')); plan = null; return; }
      const pid = opts.pageId || selected;
      if (mode.value === 'cuts' && !pid) { out.append(el('p', { class: 'ed-warn' }, 'Select a page first.')); plan = null; return; }
      plan = S.planEditImport(doc, evs, { mode: mode.value, pageId: pid, offset: S.parseTime(off.value) || 0, files: folderFiles(), fps: parseFloat(fps.value) || 24, snapFrames: parseFloat(snapF.value) >= 0 ? parseFloat(snapF.value) : 4, onlyBoard: onlyB.checked });
      const labels = S.pageLabels(doc); const assigned = plan.rows.filter(r => r.pageId).length;
      const spd = (r) => { const i = r.speedInfo; const t = (r.speed < 0 ? '◀ ' : '') + Math.round(Math.abs(r.speed) * 1000) / 10 + '%';
        const tip = i ? 'from ' + ({ comment: '* SPEED comment', ratio: 'source ÷ record duration', m2: 'M2 (' + i.m2Kind + ')', default: 'default' })[i.from] + ' · comment ' + (i.values.comment ?? '–') + ' · src/rec ' + (i.values.ratio ?? '–') + ' · M2 ' + (i.m2Raw ?? '–') + (i.m2Kind ? ' read as ' + i.m2Kind + ' = ' + i.values.m2 : '') + (i.conflict ? ' · DISAGREE: ' + i.conflicts.join(', ') : '') : '';
        return el('td', { class: 'ie-speed' + (i && i.conflict ? ' disagree' : ''), title: tip }, t + (i && i.conflict ? ' ⚠' : '')); };
      const ex = plan.excluded; const grp = {}; for (const r of ex) { const k = (r.ev.clip.split(/[\\/]/).pop().match(/^[A-Za-z]+_/) || ['other'])[0]; grp[k] = (grp[k] || 0) + 1; }
      out.append(el('p', null, plan.rows.length + ' events · ' + assigned + ' assigned · ' + plan.rows.filter(r => r.found).length + ' matched to files in the folder · ' + plan.rows.filter(r => r.onBoard).length + ' on the board' + (local.kind ? '' : ' (no folder open: clip names are kept as paths)')),
        ex.length ? el('details', { class: 'ie-excluded' }, el('summary', null, ex.length + ' excluded (not on the board): ' + Object.entries(grp).map(([k, n]) => k + ' ×' + n).join(', ')), el('div', { class: 'muted' }, ex.map(r => '#' + r.ev.n + ' ' + r.ev.clip).join(' · '))) : null,
        Object.keys(plan.overruns).length ? el('p', { class: 'ed-warn ie-overruns' }, '✂ Overrun: ' + Object.entries(plan.overruns).map(([id, o]) => 'page ' + labels.get(id) + ' cuts ' + o.total + ' s on ' + (Math.round(o.page * 1000) / 1000) + ' s (+' + o.over + ' s)').join(' · ') + '. Tick "trim last cut to fit", or fix it later in the drawer.') : null,
        el('table', { class: 'ie-table' }, el('tr', null, ['#', 'clip', 'file', 'src in–out', 'speed', 'song', '→ page'].map(h => el('th', null, h))),
          plan.rows.filter(r => !r.excluded).map(r => el('tr', { class: (r.pageId ? '' : 'unassigned') + (plan.overruns[r.pageId] ? ' over' : ''), dataset: { n: r.ev.n } }, el('td', null, String(r.ev.n)), el('td', null, r.ev.clip), el('td', null, r.found ? '✓ ' + r.media.path : r.onBoard ? '☁ on board: ' + (r.media.path || r.media.driveId) : '✗ not found'),
            el('td', null, (r.media.in ?? '') + '–' + (r.media.out ?? '')), spd(r), el('td', { title: r.snapped ? 'snapped ' + Math.round(r.snapped * plan.fps) + ' frame(s) to the page boundary' : '' }, (r.songIn !== null ? S.fmtTime(r.songIn, true) : '') + (r.snapped ? ' ⇥' + (r.snapped > 0 ? '+' : '') + Math.round(r.snapped * plan.fps) + 'f' : '')),
            el('td', null, r.pageId ? labels.get(r.pageId) + (plan.pages[r.pageId].length > 1 ? ' (cut ' + (plan.pages[r.pageId].indexOf(r) + 1) + ')' : '') : '—')))),
        el('p', { class: 'muted' }, mode.value === 'cuts' ? 'Apply replaces the page\u2019s cuts with these events.' : 'A page that gets one event: its video and source in/out are set. A page that gets several: they become its cuts.'));
    };
    [ta, fps, mode, off, snapF, onlyB].forEach(x => x.addEventListener(x === ta ? 'input' : 'change', preview));
    const box = el('div', { class: 'import-edit' }, el('h2', null, '⬇ Import cut list (CSV / EDL)'), ta, el('div', { class: 'row' }, file),
      el('div', { class: 'row' }, el('label', null, 'Mode ', mode), el('label', null, 'fps ', fps), el('label', null, 'record start = song ', off), el('label', null, 'snap ', snapF, ' frames')),
      el('div', { class: 'row' }, el('label', { title: 'Match by file name or Drive ID against media already on the board; skip the rest (e.g. CO_, BP_, STILL_ clips)' }, onlyB, ' only clips that match existing board media'), el('label', null, trimO, ' trim last cut to fit on overrun')), out,
      el('div', { class: 'modal-actions' }, el('button', { onclick: closeModal }, 'Cancel'), el('button', { class: 'ie-preview', onclick: preview }, 'Preview'),
        el('button', { class: 'primary ie-apply', onclick: () => { if (!plan || !Object.keys(plan.pages).length) return toast('Nothing to apply'); const m = mode.value; const tr = trimO.checked; mutate(d => { S.applyEditPlan(d, plan, m, { trimOverruns: tr }); }); closeModal(); toast('Applied ' + plan.rows.filter(r => r.pageId).length + ' events to ' + Object.keys(plan.pages).length + ' page(s). Undo with Ctrl/Cmd+Z.', 4000); } }, 'Apply')));
    modal(box, { wide: true });
  }
  function renderVariantBar() {
    const sel = $('#variantSel'); const has = doc && (doc.variants.length || allPages().length !== activePages().length || doc.scenes.some(x => x.slot));
    $('#variantWrap').hidden = !has; if (!has) return;
    sel.innerHTML = '';
    const cur = doc.variants.find(v => v.id === doc.activeVariant); const match = cur && S.variantMatches(doc, cur);
    sel.append(el('option', { value: '' }, cur && !match ? '✎ ' + cur.name + ' (changed)' : '— current choices —'));
    for (const v of doc.variants) sel.append(el('option', { value: v.id }, v.name));
    sel.value = match ? cur.id : '';
  }
  function applyVariantUI(id) {
    const v = doc.variants.find(x => x.id === id); if (!v) return;
    const before = S.timeline(doc).screen; mutate(d => { S.applyVariant(d, v); d.activeVariant = v.id; });
    toast(v.name + ' · runtime ' + S.fmtTime(S.timeline(doc).screen) + ' (' + fmtDiff(S.timeline(doc).screen - before) + ')', 2600);
  }
  function exportVariant(v, kind) {
    const dd = S.withVariant(doc, v); const base = S.slug(doc.title) + '-' + S.slug(v.name);
    if (kind === 'csv') downloadBlob(S.toCSV(dd), 'text/csv', base + '-edit.csv'); else downloadBlob(S.toCMX3600(dd), 'text/plain', base + '.edl');
  }
  function exportAllVariants() {
    if (!doc.variants.length) return toast('No variants yet. Save the current choices as a variant first.');
    downloadBlob(S.toCSVAllVariants(doc), 'text/csv', S.slug(doc.title) + '-all-variants.csv');
    doc.variants.forEach((v, i) => setTimeout(() => exportVariant(v, 'edl'), 400 * (i + 1)));
  }
  function variantManager() {
    const box = el('div', { class: 'varmgr' });
    const draw = () => {
      box.innerHTML = '';
      const c = S.currentChoices(doc); const n = Object.keys(c.slots).length + Object.keys(c.pages).length;
      const name = el('input', { class: 'vm-name', placeholder: 'e.g. Director\u2019s cut' });
      box.append(el('h2', null, '⇄ Variants'), el('p', { class: 'muted' }, 'A variant remembers which alternative is active in every scene slot and page group (' + n + ' choice' + (n === 1 ? '' : 's') + ' on this board). Inactive alternatives are never deleted.'));
      for (const v of doc.variants) {
        const match = S.variantMatches(doc, v); const dd = S.withVariant(doc, v);
        const rn = el('input', { value: v.name, class: 'vm-rename' }); rn.addEventListener('change', () => { mutate(d => { d.variants.find(x => x.id === v.id).name = rn.value.trim() || v.name; }); draw(); });
        box.append(el('div', { class: 'vrow' + (match ? ' on' : ''), dataset: { id: v.id } }, rn, el('span', { class: 'muted' }, S.fmtTime(S.timeline(dd).screen) + (match ? ' · active' : '')),
          el('button', { class: 'vm-apply', disabled: match, onclick: () => { applyVariantUI(v.id); draw(); } }, 'Switch'),
          el('button', { class: 'vm-update', title: 'Store the current choices in this variant', onclick: () => { mutate(d => { const x = d.variants.find(y => y.id === v.id); const cc = S.currentChoices(d); x.slots = cc.slots; x.pages = cc.pages; d.activeVariant = v.id; }); draw(); } }, 'Update'),
          el('button', { class: 'vm-csv', onclick: () => exportVariant(v, 'csv') }, 'CSV'), el('button', { class: 'vm-edl', onclick: () => exportVariant(v, 'edl') }, 'EDL'),
          el('button', { class: 'danger vm-del', onclick: () => { mutate(d => { d.variants = d.variants.filter(x => x.id !== v.id); if (d.activeVariant === v.id) d.activeVariant = ''; }); draw(); } }, '✕')));
      }
      box.append(el('div', { class: 'row' }, name, el('button', { class: 'primary vm-save', onclick: () => {
        const nm = name.value.trim() || 'Variant ' + (doc.variants.length + 1); let id = 'v_' + (S.slug(nm) || 'variant'); while (doc.variants.find(x => x.id === id)) id += '2';
        mutate(d => { const cc = S.currentChoices(d); d.variants.push({ id, name: nm, slots: cc.slots, pages: cc.pages }); d.activeVariant = id; }); draw();
      } }, 'Save current choices as variant')),
        el('div', { class: 'modal-actions' }, el('button', { class: 'vm-all', onclick: exportAllVariants }, 'Export all variants (CSV + one EDL each)'), el('button', { class: 'primary', onclick: closeModal }, 'Close')));
    };
    draw(); modal(box, { wide: true });
  }
  function charPicker(p) {
    const box = el('div', { class: 'charpick' });
    doc.characters.forEach(c => {
      const cb = el('input', { type: 'checkbox' }); cb.checked = p.characters.some(r => r.charId === c.id);
      cb.addEventListener('change', () => { mutate(() => { const x = findPage(p.id).page; x.characters = cb.checked ? (x.characters.some(r => r.charId === c.id) ? x.characters : x.characters.concat([{ charId: c.id, lookId: '', overrides: {} }])) : x.characters.filter(r => r.charId !== c.id); }); });
      box.append(el('label', { style: { borderColor: c.color } }, cb, c.name));
    });
    box.append(el('button', { style: { fontSize: '12px', padding: '2px 8px' }, onclick: addCharacterPrompt }, '+ character'));
    return el('div', { class: 'fld' }, el('label', null, 'Characters'), box);
  }
  async function addCharacterPrompt() {
    const r = await promptModal('Add character', [{ key: 'name', label: 'Name', placeholder: 'e.g. Saisha' }]);
    if (!r || !r.name.trim()) return;
    mutate(d => { const id = S.slug(r.name); if (!d.characters.find(c => c.id === id)) d.characters.push(S.normCharacter({ id, name: r.name.trim(), color: S.SCENE_COLORS[d.characters.length % S.SCENE_COLORS.length] }, d.characters.length)); });
  }
  function commentsBox(p) {
    const list = el('div', { class: 'comments' });
    let replyTo = '';
    const ta = el('textarea', { rows: 2, placeholder: 'Comment for Mirrage / Lucas…', class: 'cm-new' });
    const replyNote = el('div', { class: 'muted cm-replying', style: { fontSize: '11.5px' }, hidden: true });
    for (const { c, depth } of S.commentThreads(p.comments)) {
      const done = el('input', { type: 'checkbox', title: 'Resolved' }); done.checked = c.done;
      done.addEventListener('change', () => mutate(() => { findPage(p.id).page.comments.find(x => x.id === c.id).done = done.checked; }));
      const rb = el('button', { class: 'rbtn cm-reply', title: 'Reply to this comment', onclick: () => { replyTo = c.id; replyNote.hidden = false; replyNote.textContent = '↳ replying to ' + (c.by || '?') + ' · '; replyNote.append(el('a', { href: '#', onclick: (e) => { e.preventDefault(); replyTo = ''; replyNote.hidden = true; } }, 'cancel')); ta.focus(); } }, '↩ Reply');
      list.append(el('div', { class: 'cm' + (c.done ? ' done' : '') + (depth ? ' reply' : ''), dataset: { id: c.id }, style: depth ? { marginLeft: Math.min(depth, 4) * 18 + 'px' } : null }, done, ' ', el('b', null, c.by || '?'), el('span', { class: 'when' }, S.fmtStamp(c.at)), rb,
        el('div', { style: { whiteSpace: 'pre-wrap' } }, c.text)));
    }
    const add = el('button', { class: 'cm-add', onclick: () => { if (!ta.value.trim()) return; const c = { id: S.uid('c'), by: prefs.name || 'Lucas', at: S.isoLocal(new Date()), text: ta.value.trim(), done: false }; if (replyTo) c.replyTo = replyTo; mutate(() => { findPage(p.id).page.comments.push(c); }); } }, 'Add comment');
    return el('div', { class: 'fld' }, el('label', null, 'Comments (' + p.comments.filter(c => !c.done).length + ' open)'), list, replyNote, ta, el('div', { style: { marginTop: '4px' } }, add));
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
        img.onerror = () => img.replaceWith(note(onlineOnly(m) ? '☁ Online only (Drive). The thumbnail needs Google sign-in in this browser; use ↗ Drive to open it.' : type === 'video' ? 'Video on Drive. Open the folder locally to play it here, or use ↗ Drive.' : 'Drive image not visible. Sign in to Google in this browser, or open the folder locally.'));
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
    const slot = el('div', { class: 'slot slot-' + type }, el('div', { class: 'slot-title' }, type === 'image' ? '🖼 Image' : '🎞 Video / animated'), prev, el('div', { class: 'src' }, mediaLabel(m)), driftLine(m),
      type === 'video' && m ? inOutRow(p.id, (pg) => pg.video, () => prev.querySelector('video'), 'v') : null, btns);
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
    const f = findPage(id); const cp = JSON.parse(JSON.stringify(f.page)); cp.id = S.uid('p'); cp.comments = []; cp.altOf = ''; cp.altLabel = ''; cp.active = true;
    mutate(d => { const s = d.scenes.find(x => x.id === f.scene.id); const it = S.pageItems(s).find(x => x.pages.some(q => q.id === id)); s.pages.splice(s.pages.indexOf(it.pages[it.pages.length - 1]) + 1, 0, cp); });
    select(cp.id); toast('Page duplicated');
  }
  function deletePage(id) {
    const n = pageNumber(id);
    mutate(d => { S.removePage(d, id); });
    if (selected === id) select(null);
    toast('Page ' + n + ' deleted · Undo with Ctrl/Cmd+Z');
  }
  function movePage(id, delta) {
    const f = findPage(id);
    mutate(d => { // moves the whole alternative group of the page
      const s = d.scenes.find(x => x.id === f.scene.id); const items = S.pageItems(s); const i = items.findIndex(it => it.pages.some(q => q.id === id));
      if (delta < 0 && i > 0) { [items[i - 1], items[i]] = [items[i], items[i - 1]]; s.pages = items.flatMap(it => it.pages); }
      else if (delta > 0 && i < items.length - 1) { [items[i + 1], items[i]] = [items[i], items[i + 1]]; s.pages = items.flatMap(it => it.pages); }
      else { const si = d.scenes.indexOf(s); const tgt = d.scenes[si + delta]; if (!tgt) return; const grp = items[i].pages; s.pages = s.pages.filter(q => !grp.includes(q)); if (delta < 0) tgt.pages.push(...grp); else tgt.pages.unshift(...grp); }
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
    mutate(d => { S.moveSceneItem(d, id, delta); });
  }
  function duplicateScene(id) {
    mutate(d => { const i = d.scenes.findIndex(s => s.id === id); const cp = JSON.parse(JSON.stringify(d.scenes[i])); cp.id = S.uid('s'); cp.title += ' (copy)'; cp.slot = ''; cp.altLabel = ''; cp.active = true; const mp = new Map(); cp.pages.forEach(p => { const n = S.uid('p'); mp.set(p.id, n); p.id = n; p.comments = []; }); cp.pages.forEach(p => { if (p.altOf) p.altOf = mp.get(p.altOf) || ''; }); const items = S.sceneItems(d); const it = items.find(x => x.scenes.some(y => y.id === id)); const last = it.scenes[it.scenes.length - 1]; d.scenes.splice(d.scenes.indexOf(last) + 1, 0, cp); });
  }
  async function deleteScene(id) {
    const s = doc.scenes.find(x => x.id === id);
    if (s.pages.length) {
      const r = await ask('Delete scene?', 'Delete <b>' + esc(s.title) + '</b> and its ' + s.pages.length + ' page(s)? You can undo this.', [{ label: 'Cancel', value: false }, { label: 'Delete', value: true, cls: 'danger' }]);
      if (!r) return;
    }
    mutate(d => { S.removeScene(d, id); if (!d.scenes.length) d.scenes.push(S.normScene({ title: 'Scene 1' }, 0)); });
    if (selected && !findPage(selected)) select(null);
  }
  async function editSceneNotes(id) {
    const s = doc.scenes.find(x => x.id === id);
    const r = await promptModal('Notes for ' + s.title, [{ key: 'notes', label: 'Scene notes (mood, location, purpose…)', multiline: true, rows: 6, value: s.notes }], 'Save');
    if (r) mutate(d => { d.scenes.find(x => x.id === id).notes = r.notes; });
  }

  // ---------- media replacement ----------
  const mref = (path, name) => { const r = { driveId: '', path, url: '', name }; const v = S.versionLabel(name); if (v) r.version = v; return r; };
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
        bumpStatus(pg, t);
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
          if (f && f.size === file.size) return mref(relFromBase(e.path), name);
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
        return mref('media/' + fname, fname);
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
    return mref(name, name);
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
      { key: 'path', label: 'Path inside the project folder', value: m.path || '', placeholder: 'e.g. bp-sb2-clips/SB2_03_v2.mp4', help: 'Relative to the folder that holds the storyboard file. Used when the folder is opened on your computer.' },
      { key: 'version', label: 'Version label (optional)', value: m.version || '', placeholder: 'e.g. v2 (filled from _v2 in the name)' }
    ], 'Set');
    if (!r) return;
    const raw = r.drive.trim(); const id = S.parseDriveId(raw); const isUrl = !id && /^https?:/.test(raw);
    if (raw && !id && !isUrl) return toast('That does not look like a Drive link or ID');
    const path = normPath(r.path.trim()); const same = path === (m.path || '') && (id || '') === (m.driveId || '');
    const keep = same ? { in: m.in, out: m.out, md5: m.md5, modifiedTime: m.modifiedTime, name: m.name } : {};
    const nm = S.normMedia(Object.assign(keep, { driveId: id || '', path, url: isUrl ? raw : '', version: r.version.trim() || S.versionLabel(path) || '' }));
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
          mutate(() => { const pg = findPage(pageId).page; pg[type] = mref(rel, e.name); bumpStatus(pg, type); });
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
    Object.assign(local, { kind: null, root: null, name: '', files: new Map(), lower: new Map(), base: '', jsonPath: '', jsonHandle: null, jsonMtime: 0, jsonRev: undefined, jsonText: undefined, jsonName: '', single: false });
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
    const txt = await f.text(); const d = safeJson(txt);
    if (!d) { await ask('Could not read ' + esc(e.path), 'The file is not valid JSON. If Mirrage just edited it, ask Mirrage to check the file. Nothing was changed.', [{ label: 'OK', value: 1 }]); return false; }
    local.jsonPath = e.path; local.jsonName = e.name; local.jsonHandle = e.handle || null; local.jsonMtime = f.lastModified; local.jsonRev = revOf(d); local.jsonText = txt;
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
        const f = await h.getFile(); const txt = await f.text(); const d = safeJson(txt); if (!d) return toast('Not valid JSON');
        resetLocal(); local.jsonHandle = h; local.jsonName = f.name; local.jsonMtime = f.lastModified; local.jsonRev = revOf(d); local.jsonText = txt; local.single = true;
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
  const revOf = (d) => (d && Number.isInteger(d.revision) && d.revision > 0 ? d.revision : 0);
  /** Every save bumps revision past both our copy and whatever is on disk; updated is local time with offset. */
  function stamp(diskRev) { doc.revision = Math.max(revOf(doc), diskRev || 0, local.jsonRev || 0) + 1; doc.updated = S.isoLocal(new Date()); doc.updatedBy = (prefs.name || 'Lucas') + ' (app)'; }
  let saving = false;
  async function save({ auto, force } = {}) {
    if (!doc) return;
    const handle = local.jsonHandle;
    if (handle && (local.kind === 'fsa' || local.single)) {
      if (saving) return; saving = true;
      try {
        // Re-read before writing: a changed revision (or changed bytes) means someone else saved in between.
        const cur = await handle.getFile(); const curTxt = await cur.text(); const disk = safeJson(curTxt); const diskRev = revOf(disk);
        const revChanged = disk && local.jsonRev !== undefined && diskRev !== local.jsonRev;
        const bytesChanged = local.jsonMtime && cur.lastModified !== local.jsonMtime && local.jsonText !== undefined && curTxt !== local.jsonText;
        if (!force && (revChanged || bytesChanged)) {
          saving = false;
          const who = disk && disk.updatedBy ? ' by <b>' + esc(disk.updatedBy) + '</b>' : '';
          const r = await ask('The file changed on disk', 'Someone (for example Mirrage, through Drive) changed <b>' + esc(local.jsonName) + '</b> after you opened it' + who + '.' + (revChanged ? '<br>Revision on disk: <b>' + diskRev + '</b> · yours was based on <b>' + local.jsonRev + '</b>.' : ''), [
            { label: 'Load their version', value: 'reload' }, { label: 'Save mine as a copy', value: 'copy' }, { label: 'Overwrite with mine', value: 'overwrite', cls: 'danger' }]);
          if (r === 'reload') return reloadFromDisk(true);
          if (r === 'copy') return saveCopy();
          return save({ force: true });
        }
        stamp(diskRev);
        const out = S.serialize(doc);
        const w = await handle.createWritable(); await w.write(out); await w.close();
        local.jsonMtime = (await handle.getFile()).lastModified; local.jsonRev = doc.revision; local.jsonText = out; dirty = false; updateSaveState();
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
      const out = S.serialize(doc);
      const w = await fh.createWritable(); await w.write(out); await w.close();
      local.jsonHandle = fh; local.jsonName = name; local.jsonPath = joinPath(local.base, name); local.jsonMtime = (await fh.getFile()).lastModified; local.jsonRev = doc.revision; local.jsonText = out;
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
    const f = await local.jsonHandle.getFile(); const txt = await f.text(); const d = safeJson(txt); if (d) { local.jsonMtime = f.lastModified; local.jsonRev = revOf(d); local.jsonText = txt; setDoc(d); if (sel && findPage(sel)) select(sel); toast('Reloaded'); }
  }
  // Watch for outside changes (Mirrage editing through Drive for desktop)
  async function checkExternal() {
    if (!doc || !local.jsonHandle || saving) return;
    try {
      const f = await local.jsonHandle.getFile();
      if (local.jsonMtime && f.lastModified !== local.jsonMtime) {
        const txt = await f.text();
        if (txt === local.jsonText) { local.jsonMtime = f.lastModified; return; } // touched, not changed
        if (!dirty) {
          const d = safeJson(txt); if (!d) return;
          const sel = selected; undoStack.push(JSON.stringify(doc)); local.jsonMtime = f.lastModified; local.jsonRev = revOf(d); local.jsonText = txt;
          doc = S.normalizeDoc(d); selected = sel && findPage(sel) ? sel : null; render();
          toast('Updated from disk' + (d.updatedBy ? ' (by ' + d.updatedBy + ')' : ''));
        } else { const d = safeJson(txt); $('#saveState').textContent = '⚠ Changed on disk' + (d && revOf(d) !== local.jsonRev ? ' (rev ' + revOf(d) + ')' : ''); }
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
      const pages = activePages(); const changes = []; const used = new Set();
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
          for (const c of changes) { const p = findPage(c.id).page; p[c.t] = mref(c.rel, c.name); bumpStatus(p, c.t); }
          const last = doc.scenes[doc.scenes.length - 1];
          for (const b of extra) last.pages.push(S.normPage({ image: mref(relFromBase(b.e.path), b.e.name), status: 'image', code: S.pad2(b.num) }));
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
    let withAlts = false;
    if (allPages().length !== activePages().length) { const r = await ask('Print', 'This board has inactive alternatives.', [{ label: 'Active only', value: 'a' }, { label: 'Include alternatives', value: 'all' }, { label: 'Cancel', value: null }]); if (!r) return; withAlts = r === 'all'; }
    const labels = S.pageLabels(doc);
    const pr = $('#print'); pr.innerHTML = '';
    pr.append(el('div', { class: 'pr-head' }, el('span', null, doc.title + (doc.project ? ' · ' + doc.project : '')), el('span', null, $('#runtime').textContent + ' · ' + new Date().toLocaleDateString())));
    let n = 0; const waits = [];
    for (const s of (withAlts ? doc : S.activeDoc(doc)).scenes) {
      pr.append(el('div', { class: 'pr-scene' }, s.title + (s.active === false ? ' — alternative ' + (s.altLabel || '') + ' (inactive)' : '')));
      const g = el('div', { class: 'pr-grid' });
      for (const p of s.pages) {
        n = labels.get(p.id) + (p.active === false && s.active !== false ? ' (alt ' + (p.altLabel || '') + ')' : ''); const im = el('div', { class: 'im' });
        const r = await resolveMedia(p.image).catch(() => null) || (p.video && p.video.driveId ? { src: driveThumb(p.video.driveId) } : null);
        if (r) { const img = el('img', { src: r.src }); waits.push(new Promise(ok => { img.onload = ok; img.onerror = () => { img.remove(); ok(); }; })); im.append(img); } else im.append(el('span', null, p.title || ''));
        g.append(el('div', { class: 'pr-card' }, im, el('div', { class: 'tx' },
          el('div', { class: 'h' }, n + (p.start ? ' · ' + [p.start, p.end].filter(Boolean).join('–') : '') + ' · ' + (Math.round(dur(p) * 10) / 10) + 's' + (p.camera ? ' · ' + p.camera : '')),
          lyr(p) ? el('div', { class: 'l' }, lyr(p)) : null, p.description ? el('div', null, p.description) : null)));
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
    const lyricsTa = el('textarea', { rows: 6, class: 'set-lyrics', placeholder: '0:37 First line of the song\n0:41 Next line…' });
    lyricsTa.value = doc.songLyrics.map(l => S.fmtTime(l.t, true) + ' ' + l.text).join('\n');
    const fps = el('input', { type: 'number', step: '0.001', value: doc.fps || '', placeholder: '24', class: 'set-fps' });
    const box = el('div', null, el('h2', null, '⚙ Project settings'),
      el('div', { class: 'row' }, el('div', { class: 'fld' }, el('label', null, 'Title'), t), el('div', { class: 'fld' }, el('label', null, 'Project / album'), pj)),
      el('div', { class: 'row' }, el('div', { class: 'fld' }, el('label', null, 'Aspect ratio'), asp), el('div', { class: 'fld' }, el('label', null, 'Default page duration (s)'), dd)),
      el('div', { class: 'fld' }, el('label', null, 'Drive folder (for reference)'), fid),
      el('div', { class: 'row' }, el('div', { class: 'fld', style: { flex: 3 } }, el('label', null, 'Song audio (path in the project folder), plays in ▶ Play'), audioPath,
        hasFolder() ? el('button', { style: { marginTop: '4px', fontSize: '12px' }, onclick: () => { pickFromFolder(null, 'audio', (rel) => { audioPath.value = rel; modal(box); }); } }, 'Pick from folder…') : null),
        el('div', { class: 'fld' }, el('label', null, 'Song time at page 1 (s)'), audioOff)),
      el('div', { class: 'fld' }, el('label', null, 'Characters'), el('button', { class: 'set-cast', onclick: () => { closeModal(); castManager(); } }, '👥 Open the cast manager (' + doc.characters.length + ')')),
      el('div', { class: 'fld' }, el('label', null, 'Song lyrics with times (one line each: m:ss text) — fills page lyrics that are empty'), lyricsTa),
      el('div', { class: 'fld' }, el('label', null, 'Frame rate for EDL export'), fps),
      el('div', { class: 'fld' }, el('label', null, 'Storyboard notes'), notes),
      el('div', { class: 'row' }, el('div', { class: 'fld' }, el('label', null, 'Your name (comments and "updatedBy")'), nm), el('div', { class: 'fld' }, el('label', null, 'Autosave to the file'), el('label', { class: 'chk' }, au, 'save automatically while editing'))),
      el('div', { class: 'modal-actions' }, el('button', { onclick: closeModal }, 'Cancel'), el('button', { class: 'primary set-save', onclick: () => {
        prefs.name = nm.value.trim() || 'Lucas'; prefs.autosave = au.checked; savePrefs();
        mutate(d => {
          d.title = t.value.trim() || 'Untitled storyboard'; d.project = pj.value.trim(); d.aspect = asp.value; d.defaultDuration = parseFloat(dd.value) > 0 ? parseFloat(dd.value) : 3;
          d.driveFolderId = S.parseDriveId(fid.value) || fid.value.trim(); d.notes = notes.value;
          const ap = normPath(audioPath.value.trim());
          d.audio = ap ? Object.assign({}, d.audio && d.audio.path === ap ? d.audio : { driveId: '' }, { path: ap, url: '', name: ap.split('/').pop() }) : null; d.audioOffset = parseFloat(audioOff.value) || 0;
          d.songLyrics = lyricsTa.value.split('\n').map(l => { const m = l.trim().match(/^\[?(\d+:\d{2}(?:\.\d+)?|\d+(?:\.\d+)?)\]?\s+(.+)$/); return m ? { t: S.parseTime(m[1]), text: m[2].trim() } : null; }).filter(l => l && l.t !== null).sort((x, y) => x.t - y.t);
          d.fps = parseFloat(fps.value) > 0 ? parseFloat(fps.value) : null;
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
<li><b>Double-click a page</b> for the breakout drawer: Page · Prompts (image/video/negative + tool + copy) · Cast (looks, canon, prompt block) · Takes (compare, pick) · Log.</li>
<li><b>Speed</b> 0.4 = slow motion, negative = reverse; <b>source in/out</b> trims the clip; <b>cuts</b> make flicker bursts. ▶ Play previews them.</li>
<li><b>Role</b> (insert / flash-forward / flashback) is shown on cards; ⚠ in the header lists song-time gaps between linear pages; ⏱ means the video prompt length differs from the page.</li>
<li><b>☰ Cast manager</b>: characters, locked canon, reference sets and looks. <b>☰ Export</b> CSV / EDL for DaVinci Resolve.</li>
<li>Every save raises <code>revision</code>; if the file changed since you opened it, you are asked before anything is overwritten.</li>
<li><b>Online without the folder:</b> images show as Drive thumbnails if you're signed in to Google in this browser. Videos show a still and an ↗ Drive link.</li>
</ul>
<p>Shortcuts: <code>Ctrl/Cmd+Z</code> undo · <code>Ctrl/Cmd+Shift+Z</code> redo · <code>Ctrl/Cmd+S</code> save · <code>P</code> play · <code>N</code> new page after the selected one · <code>←/→</code> previous/next page · paste an image or Drive link to put it on the selected page.</p>` }),
      el('div', { class: 'modal-actions' }, el('button', { class: 'primary', onclick: closeModal }, 'OK'))));
  }

  // ---------- player (animatic) ----------
  // Each page becomes a list of segments: its cuts (looped to fill the page) or one segment with the page video/image.
  const pl = { seq: [], i: 0, t0: 0, elapsed: 0, playing: false, raf: 0, total: 0, starts: [], token: 0, segs: [], seg: -1, lastSeek: 0 };
  async function play(fromId) {
    if (!doc) return;
    pl.seq = activePages().filter(p => p.status !== 'cut');
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
  async function buildSegments(p) {
    const d = dur(p); const pageSpeed = S.speedOf(p);
    const raw = p.cuts && p.cuts.length
      ? p.cuts.map(c => ({ media: c.media, dur: c.duration || d / p.cuts.length, speed: c.speed || pageSpeed, isCut: true }))
      : [{ media: p.video || p.image, dur: d, speed: pageSpeed, isCut: false }];
    const segs = [];
    for (const sg of raw) {
      let r = await resolveMedia(sg.media).catch(() => null);
      let kind = 'blank';
      if (r && r.playable && VID_EXT.test(sg.media.path || sg.media.name || sg.media.url || '')) kind = 'video';
      else if (r && r.playable && sg.media === p.video) kind = 'video';
      else if (r && r.playable) kind = 'image';
      if (!sg.isCut && kind !== 'video') { // page without playable clip: fall back to image, then Drive poster
        const ir = await resolveMedia(p.image).catch(() => null);
        if (ir) { r = ir; kind = 'image'; } else if (r && r.kind === 'drive') kind = 'image';
      } else if (r && r.kind === 'drive') kind = 'image';
      segs.push(Object.assign({}, sg, { r, kind }));
    }
    return segs;
  }
  async function showStep(i, offset) {
    pl.i = i; pl.elapsed = offset || 0; pl.seg = -1;
    const p = pl.seq[i];
    const sp = S.speedOf(p);
    const fx = [p.role && p.role !== 'linear' ? S.ROLES.find(r => r.id === p.role).label : '', sp !== 1 ? (sp < 0 ? '◀◀ reverse ' + Math.abs(sp) + '× (simulated)' : Math.round(sp * 100) + '% speed') : '', p.retime ? S.RETIMES.find(r => r.id === p.retime).label + ' (not simulated)' : '', p.effect ? 'effect: ' + p.effect : '', p.cuts.length ? p.cuts.length + ' cuts' : ''].filter(Boolean).join(' · ');
    $('#plInfo').textContent = 'Page ' + pageNumber(p.id) + ' / ' + activePages().length + (p.title ? ' · ' + p.title : '') + (p.start ? ' · ' + p.start : '');
    $('#plFx').textContent = fx; $('#plFx').hidden = !fx;
    $('#plCaption').textContent = $('#plCaptions').checked ? lyr(p) : '';
    const stage = $('#player .stage');
    stage.classList.toggle('fx-flicker', /flicker/i.test(p.effect)); stage.classList.toggle('fx-strobe', /strobe/i.test(p.effect));
    const token = pl.token = Math.random();
    const segs = await buildSegments(p);
    if (token !== pl.token) return;
    pl.segs = segs;
    renderSegment(true);
    syncAudio(true);
  }
  /** Which segment is on screen at the current page time, and how far into it. */
  function segAt(t) {
    const total = pl.segs.reduce((a, s) => a + s.dur, 0) || 1;
    let x = pl.segs.length > 1 ? t % total : t; let k = 0;
    while (k < pl.segs.length - 1 && x >= pl.segs[k].dur) { x -= pl.segs[k].dur; k++; }
    return { k, x };
  }
  function videoTimeFor(sg, x, v) {
    const m = sg.media || {}; const full = isFinite(v.duration) ? v.duration : Infinity;
    const a = m.in !== undefined ? m.in : 0; const b = m.out !== undefined ? Math.min(m.out, full) : full;
    if (sg.speed < 0) return Math.max(a, (isFinite(b) ? b : a + sg.dur * Math.abs(sg.speed)) - x * Math.abs(sg.speed));
    return Math.min(isFinite(b) ? b : Infinity, a + x * sg.speed);
  }
  function renderSegment(force) {
    if (!pl.segs.length) return;
    const p = pl.seq[pl.i]; const { k, x } = segAt(pl.elapsed); const sg = pl.segs[k];
    const img = $('#plImg'), vid = $('#plVid'), blank = $('#plBlank');
    if (force || k !== pl.seg) {
      pl.seg = k;
      img.hidden = true; vid.hidden = true; blank.textContent = ''; vid.pause();
      if (sg.kind === 'video') {
        if (vid.getAttribute('src') !== sg.r.src) vid.src = sg.r.src;
        vid.muted = songOn() || !pl.playing; vid.hidden = false;
        const rate = Math.min(16, Math.max(0.0625, Math.abs(sg.speed)));
        vid.playbackRate = rate; vid.defaultPlaybackRate = rate;
        const seek = () => { try { vid.currentTime = videoTimeFor(sg, x, vid); } catch { } if (pl.playing && sg.speed > 0) vid.play().catch(() => { vid.muted = true; vid.play().catch(() => {}); }); };
        if (vid.readyState >= 1) seek(); else vid.addEventListener('loadedmetadata', seek, { once: true });
      } else if (sg.kind === 'image') {
        img.classList.remove('kb'); void img.offsetWidth; img.style.setProperty('--kbdur', sg.dur + 's');
        img.onerror = () => { img.hidden = true; blank.textContent = p.description || p.lyrics || ''; };
        img.src = sg.r.kind === 'drive' ? driveThumb(sg.media.driveId || (p.image && p.image.driveId) || (p.video && p.video.driveId), 1920) : sg.r.src;
        img.hidden = false; if (!sg.isCut) img.classList.add('kb'); img.style.animationPlayState = pl.playing ? 'running' : 'paused';
      } else blank.textContent = (p.title ? p.title + ' — ' : '') + (p.description || '(no image yet)');
      return;
    }
    if (sg.kind === 'video' && vid.readyState >= 1) {
      const want = videoTimeFor(sg, x, vid);
      if (sg.speed < 0) { // reverse: browsers cannot play backwards, so step the frame by seeking
        if (!vid.paused) vid.pause();
        if (!vid.seeking && performance.now() - pl.lastSeek > 40) { pl.lastSeek = performance.now(); try { vid.currentTime = want; } catch { } }
      } else {
        const m = sg.media || {};
        if (m.out !== undefined && vid.currentTime >= m.out - 0.02) { if (!vid.paused) vid.pause(); } // hold the out frame
        else if (Math.abs(vid.currentTime - want) > 0.3 && !vid.seeking) { try { vid.currentTime = want; } catch { } }
        else if (vid.paused && pl.playing && !vid.ended) vid.play().catch(() => {});
      }
    }
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
    } else { renderSegment(false); if (!$('#plSync').checked) syncAudio(false); }
    updateBar(); pl.raf = requestAnimationFrame(tick);
  }
  function updateBar() {
    const t = pl.starts[pl.i] + Math.min(pl.elapsed, dur(pl.seq[pl.i]));
    $('#plFill').style.width = (t / pl.total * 100) + '%';
    $('#plTime').textContent = S.fmtTime(t) + ' / ' + S.fmtTime(pl.total);
  }
  function resume() {
    pl.playing = true; pl.t0 = performance.now() - pl.elapsed * 1000; $('#plToggle').textContent = '⏸';
    const v = $('#plVid'); const sg = pl.segs[pl.seg];
    if (!v.hidden && sg && sg.speed > 0) { v.muted = songOn(); v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); }
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
  $('#plCaptions').onchange = () => { $('#plCaption').textContent = $('#plCaptions').checked ? lyr(pl.seq[pl.i]) : ''; };
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
    downloadJson: () => doc && downloadJson(), exportMd: () => doc && exportMd(), cast: () => doc && castManager(), exportCsv: () => doc && exportEdit('csv'), exportEdl: () => doc && exportEdit('edl'), exportEdlText: () => doc && exportEdit('txt'), importEdit: () => doc && importEditDialog({ mode: 'pages' }), variants: () => doc && variantManager(), exportAllVariants: () => doc && exportAllVariants(), print: () => doc && printBoard(), settings: () => doc && settingsDialog(), help: helpDialog
  };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]'); if (a) { $('#menu').hidden = true; if (actions[a.dataset.act]) actions[a.dataset.act](); return; }
    if (!e.target.closest('.menu-wrap')) $('#menu').hidden = true;
  });
  $('#btnMenu').onclick = () => { $('#menu').hidden = !$('#menu').hidden; };
  $('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
  $('#btnSave').onclick = () => save(); $('#btnPlay').onclick = () => play(selected);
  $('#btnAddScene').onclick = addScene;
  $('#variantSel').onchange = () => { const v = $('#variantSel').value; if (v) applyVariantUI(v); };
  $('#btnVariants').onclick = () => doc && variantManager();
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
  window.__sb = { importEditDialog, variantManager, applyVariantUI, setActiveSceneUI, setActivePageUI, get doc() { return doc; }, get local() { return local; }, get dirty() { return dirty; }, get selected() { return selected; }, get undoDepth() { return undoStack.length; }, setDoc, select, save, undo, redo, play, attachFiles, loadFolderHandle, movePage, addPage, checkExternal, onDirInput, get lastCopied() { return lastCopied; }, get pl() { return pl; }, castManager, pickTake, exportEdit, get drawer() { return drawer; } };
  init();
})();
