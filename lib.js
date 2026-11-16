/* Storyboard Studio – pure helpers (shared by the app and the Node tests). */
(function (root) {
  'use strict';
  const FORMAT = 'storyboard-studio';
  const VERSION = 1;
  const STATUSES = [
    { id: 'idea', label: 'Idea / text only' },
    { id: 'image', label: 'Image done' },
    { id: 'animated', label: 'Animated' },
    { id: 'final', label: 'Final' },
    { id: 'cut', label: 'Cut (skipped in play)' }
  ];
  const STATUS_IDS = STATUSES.map(s => s.id);
  const PAGE_FIELDS = ['title', 'code', 'start', 'end', 'camera', 'lyric', 'description', 'imagePrompt', 'clipPrompt', 'notes', 'flag'];
  const SCENE_COLORS = ['#ffb84d', '#6aa8ff', '#b67cff', '#4fd18b', '#ff6b9a', '#4fd1d1', '#d1c44f', '#ff7b4d'];

  function uid(prefix) {
    return prefix + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  }

  /** "1:57" -> 117, "0:37.5" -> 37.5, "1:02:03" -> 3723, "42" -> 42, "" -> null */
  function parseTime(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const s = String(v).trim().replace(',', '.');
    if (!s) return null;
    if (!/^\d+(?::\d{1,2}(?:\.\d+)?){0,2}(?:\.\d+)?$/.test(s)) return null;
    return s.split(':').reduce((acc, part) => acc * 60 + parseFloat(part), 0);
  }
  /** 117 -> "1:57", 37.5 -> "0:37.5" */
  function fmtTime(sec, keepFraction) {
    if (sec === null || sec === undefined || !isFinite(sec)) return '';
    const neg = sec < 0; sec = Math.abs(sec);
    let m = Math.floor(sec / 60), s = sec - m * 60;
    let h = Math.floor(m / 60); m = m % 60;
    let ss = keepFraction ? (Math.round(s * 10) / 10).toString() : Math.round(s).toString();
    if (!keepFraction && ss === '60') { ss = '0'; m += 1; }
    if (parseFloat(ss) < 10) ss = '0' + ss;
    return (neg ? '-' : '') + (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + ss;
  }

  function pageDuration(p, doc) {
    const d = parseFloat(p.duration);
    if (d > 0) return d;
    const a = parseTime(p.start), b = parseTime(p.end);
    if (a !== null && b !== null && b > a) return b - a;
    const def = doc && parseFloat(doc.defaultDuration);
    return def > 0 ? def : 3;
  }

  function normMedia(m) {
    if (!m) return null;
    if (typeof m === 'string') {
      const id = parseDriveId(m);
      if (id) return { driveId: id, path: '', url: '', name: '' };
      if (/^(https?:|data:|blob:)/.test(m)) return { driveId: '', path: '', url: m, name: '' };
      return { driveId: '', path: m, url: '', name: m.split('/').pop() };
    }
    const out = {
      driveId: m.driveId ? (parseDriveId(String(m.driveId)) || String(m.driveId)) : '',
      path: m.path ? String(m.path) : '',
      url: m.url ? String(m.url) : '',
      name: m.name ? String(m.name) : ''
    };
    if (!out.name && out.path) out.name = out.path.split('/').pop();
    if (!out.driveId && !out.path && !out.url) return null;
    return out;
  }

  function normPage(p) {
    p = p && typeof p === 'object' ? p : {};
    const out = { id: p.id ? String(p.id) : uid('p') };
    for (const f of PAGE_FIELDS) out[f] = p[f] === undefined || p[f] === null ? '' : String(p[f]);
    // tolerate a few aliases Mirrage might use
    if (!out.lyric && p.lyrics) out.lyric = String(p.lyrics);
    if (!out.lyric && p.dialogue) out.lyric = String(p.dialogue);
    if (!out.description && p.action) out.description = String(p.action);
    if (!out.start && p.timecode && String(p.timecode).includes('-')) {
      const [a, b] = String(p.timecode).split(/\s*[-–]\s*/); out.start = a || ''; out.end = b || '';
    }
    const d = parseFloat(p.duration);
    out.duration = d > 0 ? d : null;
    out.status = STATUS_IDS.includes(p.status) ? p.status : 'idea';
    out.characters = Array.isArray(p.characters) ? p.characters.map(String) : [];
    out.image = normMedia(p.image);
    out.video = normMedia(p.video);
    out.comments = Array.isArray(p.comments) ? p.comments.filter(c => c && c.text).map(c => ({
      id: c.id ? String(c.id) : uid('c'), by: String(c.by || ''), at: String(c.at || ''), text: String(c.text), done: !!c.done
    })) : [];
    return out;
  }

  function normScene(s, i) {
    s = s && typeof s === 'object' ? s : {};
    const pages = Array.isArray(s.pages) ? s.pages : Array.isArray(s.shots) ? s.shots : [];
    return {
      id: s.id ? String(s.id) : uid('s'),
      title: s.title ? String(s.title) : 'Scene ' + (i + 1),
      color: /^#[0-9a-f]{6}$/i.test(s.color || '') ? s.color : SCENE_COLORS[i % SCENE_COLORS.length],
      notes: s.notes ? String(s.notes) : '',
      collapsed: !!s.collapsed,
      pages: pages.map(normPage)
    };
  }

  function normalizeDoc(d) {
    d = d && typeof d === 'object' ? d : {};
    let scenes = Array.isArray(d.scenes) ? d.scenes : null;
    if (!scenes) {
      const pages = Array.isArray(d.pages) ? d.pages : Array.isArray(d.shots) ? d.shots : [];
      scenes = [{ title: 'Scene 1', pages }];
    }
    const out = {
      format: FORMAT,
      version: VERSION,
      title: d.title ? String(d.title) : 'Untitled storyboard',
      project: d.project ? String(d.project) : '',
      aspect: /^\d+(\.\d+)?:\d+(\.\d+)?$/.test(d.aspect || '') ? d.aspect : '16:9',
      defaultDuration: parseFloat(d.defaultDuration) > 0 ? parseFloat(d.defaultDuration) : 3,
      driveFolderId: d.driveFolderId ? String(d.driveFolderId) : '',
      audio: normMedia(d.audio),
      audioOffset: parseFloat(d.audioOffset) || 0,
      characters: Array.isArray(d.characters) ? d.characters.filter(c => c && (c.id || c.name)).map((c, i) => ({
        id: String(c.id || slug(c.name)), name: String(c.name || c.id), color: /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : SCENE_COLORS[(i + 3) % SCENE_COLORS.length]
      })) : [],
      notes: d.notes ? String(d.notes) : '',
      updated: d.updated ? String(d.updated) : '',
      updatedBy: d.updatedBy ? String(d.updatedBy) : '',
      scenes: scenes.map(normScene)
    };
    // unique ids (Mirrage may copy-paste a page and forget to change its id)
    const seen = new Set();
    for (const s of out.scenes) {
      if (seen.has(s.id)) s.id = uid('s'); seen.add(s.id);
      for (const p of s.pages) { if (seen.has(p.id)) p.id = uid('p'); seen.add(p.id); }
    }
    // unknown character ids referenced by pages become characters
    const known = new Set(out.characters.map(c => c.id));
    for (const s of out.scenes) for (const p of s.pages) for (const c of p.characters) {
      if (!known.has(c)) { known.add(c); out.characters.push({ id: c, name: c, color: SCENE_COLORS[out.characters.length % SCENE_COLORS.length] }); }
    }
    return out;
  }

  /** Strip empty values so the saved JSON stays small and readable. */
  function serialize(doc) {
    const clean = (o) => {
      if (Array.isArray(o)) return o.map(clean);
      if (o && typeof o === 'object') {
        const r = {};
        for (const [k, v] of Object.entries(o)) {
          if (v === '' || v === null || v === undefined || v === false) continue;
          if (Array.isArray(v) && !v.length && k !== 'pages' && k !== 'scenes') continue;
          r[k] = clean(v);
        }
        return r;
      }
      return o;
    };
    const d = clean(doc);
    // keep the header fields first for humans/Mirrage
    const order = ['format', 'version', 'title', 'project', 'updated', 'updatedBy', 'aspect', 'defaultDuration', 'driveFolderId', 'audio', 'audioOffset', 'characters', 'notes', 'scenes'];
    const out = {};
    for (const k of order) if (k in d) out[k] = d[k];
    for (const k of Object.keys(d)) if (!(k in out)) out[k] = d[k];
    return JSON.stringify(out, null, 2) + '\n';
  }

  function parseDriveId(s) {
    if (!s) return null;
    s = String(s).trim();
    let m = s.match(/\/(?:file\/d|d|folders)\/([A-Za-z0-9_-]{15,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{15,})/);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{25,}$/.test(s)) return s;
    return null;
  }

  function slug(s) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
  }

  /** "Bleeding Page storyboard - shot 33.jpg" -> {num:33, ver:0}; "SB2_03_v2.mp4" -> {num:3, ver:2} */
  function matchNumber(filename) {
    let base = String(filename).split('/').pop().replace(/\.[a-z0-9]+$/i, '');
    let ver = 0;
    const vm = base.match(/[ _.-]?v(\d+)$/i) || base.match(/[ _.-]\(?(\d+)\)$/);
    if (vm && /v/i.test(vm[0])) { ver = parseInt(vm[1], 10); base = base.slice(0, vm.index); }
    base = base.replace(/[ _-]*(final|fixed|new|edit|alt|fix|copy)$/i, '');
    const m = base.match(/(\d+)(?!.*\d)/);
    if (!m) return null;
    return { num: parseInt(m[1], 10), ver };
  }

  function unescapeMd(s) { return s.replace(/\\([\\`*_{}\[\]()#+\-.!>~|])/g, '$1'); }

  /** Parse Mirrage's Google-Doc storyboard format (exported as Markdown or copied text). */
  function parseMirrageText(text) {
    text = unescapeMd(String(text).replace(/\r/g, ''));
    const lines = text.split('\n');
    const scenes = [];
    let scene = null, page = null, field = null;
    const ensureScene = () => { if (!scene) { scene = { title: 'Imported', pages: [] }; scenes.push(scene); } };
    const FIELD_MAP = [
      [/^lyrics?$/i, 'lyric'], [/^(description|action|beat)$/i, 'description'], [/^image prompt$/i, 'imagePrompt'],
      [/^clip prompt/i, 'clipPrompt'], [/^(camera|shot)$/i, 'camera'], [/^notes?$/i, 'notes'], [/^flag$/i, 'flag'],
      [/^(title)$/i, 'title'], [/^(characters?|cast)$/i, '_chars'], [/^duration$/i, '_dur']
    ];
    for (let raw of lines) {
      const line = raw.trim();
      let m;
      if ((m = line.match(/^#{1,4}\s*(?:\*\*)?\s*scene\b[\s:·.\-–—]*(?:\d+\s*[·:.\-–—]\s*)?(.*?)(?:\*\*)?$/i))) {
        scene = { title: m[1].trim() || 'Scene ' + (scenes.length + 1), pages: [] }; scenes.push(scene); page = null; field = null; continue;
      }
      if ((m = line.match(/^(?:#{1,4}\s*)?(?:\*\*)?\s*(?:page|shot|panel)\s+([0-9]+[a-z]?)\b\s*(?:\*\*)?\s*(?:[·:\-–—|]\s*)?(.*)$/i))) {
        ensureScene();
        page = { code: m[1], start: '', end: '', status: 'idea' };
        let rest = m[2].replace(/\*\*/g, '').trim();
        const tm = rest.match(/(\d+:\d{2}(?:\.\d+)?)\s*[-–]\s*(\d+:\d{2}(?:\.\d+)?)/);
        if (tm) { page.start = tm[1]; page.end = tm[2]; rest = rest.replace(tm[0], '').replace(/^[\s·:\-–—|]+|[\s·:\-–—|]+$/g, ''); }
        if (rest) page.title = rest;
        if (/cut point/i.test(raw)) page.notes = 'CUT POINT';
        scene.pages.push(page); field = null; continue;
      }
      if (/^-{3,}$/.test(line)) { field = null; continue; }
      if (!page) continue;
      if ((m = line.match(/^\*\*([^*]+?):?\*\*:?\s*(.*)$/)) || (m = line.match(/^([A-Za-z][A-Za-z ]{1,24}?)\s*(\([^)]*\))?:\s+(.*)$/))) {
        let label, value, paren = '';
        if (m.length === 3) { label = m[1].trim(); value = m[2]; } else { label = m[1].trim(); paren = m[2] || ''; value = m[3]; }
        const pm = label.match(/^(.*?)\s*\(([^)]*)\)$/); if (pm) { label = pm[1]; paren = pm[2]; }
        const hit = FIELD_MAP.find(([re]) => re.test(label.trim()));
        if (hit) {
          field = hit[1];
          if (field === '_chars') { page.characters = value.split(/[,;]/).map(s => slug(s.trim())).filter(Boolean); field = null; continue; }
          if (field === '_dur') { const d = parseFloat(value); if (d > 0) page.duration = d; field = null; continue; }
          if (field === 'clipPrompt' && paren) value = '(' + paren + ') ' + value;
          page[field] = (page[field] ? page[field] + '\n' : '') + value.trim();
          continue;
        }
      }
      if (field && line) page[field] += (page[field] ? '\n' : '') + line;
    }
    for (const s of scenes) for (const p of s.pages) for (const k of Object.keys(p)) if (typeof p[k] === 'string') p[k] = p[k].replace(/\*\*/g, '').trim();
    return scenes.filter(s => s.pages.length).map(normScene);
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function toMarkdown(doc) {
    const out = [];
    out.push('# ' + doc.title, '');
    const meta = [doc.project, doc.updated ? 'updated ' + doc.updated.slice(0, 10) : '', doc.updatedBy ? 'by ' + doc.updatedBy : ''].filter(Boolean).join(' · ');
    if (meta) out.push('*' + meta + '*', '');
    if (doc.notes) out.push(doc.notes, '');
    let n = 0, total = 0;
    doc.scenes.forEach((s, si) => {
      out.push('---', '', '## SCENE ' + (si + 1) + ' · ' + s.title, '');
      if (s.notes) out.push('*' + s.notes + '*', '');
      for (const p of s.pages) {
        n++;
        const dur = pageDuration(p, doc); if (p.status !== 'cut') total += dur;
        const tc = p.start || p.end ? ' · ' + [p.start, p.end].filter(Boolean).join('-') : '';
        out.push('### PAGE ' + pad2(n) + tc + (p.title ? ' · ' + p.title : ''), '');
        const meta2 = ['Status: ' + p.status, 'Duration: ' + (Math.round(dur * 10) / 10) + ' s'];
        if (p.code && p.code !== pad2(n)) meta2.push('Code: ' + p.code);
        if (p.characters.length) meta2.push('Characters: ' + p.characters.map(id => (doc.characters.find(c => c.id === id) || { name: id }).name).join(', '));
        out.push('*' + meta2.join(' · ') + '*', '');
        if (p.lyric) out.push('**Lyric:** ' + p.lyric, '');
        if (p.description) out.push('**Description:** ' + p.description, '');
        if (p.camera) out.push('**Camera:** ' + p.camera, '');
        if (p.imagePrompt) out.push('**IMAGE PROMPT:** ' + p.imagePrompt, '');
        if (p.clipPrompt) out.push('**CLIP PROMPT:** ' + p.clipPrompt, '');
        if (p.notes) out.push('**Notes:** ' + p.notes, '');
        if (p.flag) out.push('**Flag:** ' + p.flag, '');
        const media = [];
        if (p.image) media.push('image: ' + (p.image.path || '') + (p.image.driveId ? ' (Drive ' + p.image.driveId + ')' : ''));
        if (p.video) media.push('video: ' + (p.video.path || '') + (p.video.driveId ? ' (Drive ' + p.video.driveId + ')' : ''));
        if (media.length) out.push('*' + media.join(' · ') + '*', '');
      }
    });
    out.push('---', '', '*' + n + ' pages · runtime ' + fmtTime(total) + '*', '');
    return out.join('\n');
  }

  function allPages(doc) { const r = []; for (const s of doc.scenes) for (const p of s.pages) r.push(p); return r; }

  const api = { FORMAT, VERSION, STATUSES, STATUS_IDS, PAGE_FIELDS, SCENE_COLORS, uid, parseTime, fmtTime, pageDuration, normMedia, normPage, normScene, normalizeDoc, serialize, parseDriveId, slug, matchNumber, parseMirrageText, toMarkdown, allPages, pad2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SB = api;
})(typeof self !== 'undefined' ? self : this);
