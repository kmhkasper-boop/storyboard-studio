/* Storyboard Studio – pure helpers (shared by the app and the Node tests). */
(function (root) {
  'use strict';
  const FORMAT = 'storyboard-studio';
  const VERSION = 4;
  // v2: one status ladder (Mirrage's pipeline + the v1 values). v1 'image' -> 'rendered', 'animated' -> 'picked'.
  const STATUSES = [
    { id: 'idea', label: 'Idea / text only' },
    { id: 'prompted', label: 'Prompted' },
    { id: 'rendered', label: 'Rendered (image/clip made)' },
    { id: 'picked', label: 'Take picked' },
    { id: 'inEdit', label: 'In edit (Resolve)' },
    { id: 'final', label: 'Final' },
    { id: 'cut', label: 'Cut (skipped in play)' }
  ];
  const STATUS_IDS = STATUSES.map(s => s.id);
  const STATUS_ALIASES = { image: 'rendered', animated: 'picked', video: 'picked', inedit: 'inEdit', 'in-edit': 'inEdit', 'in edit': 'inEdit', edit: 'inEdit', done: 'final', text: 'idea' };
  function normStatus(v) {
    if (STATUS_IDS.includes(v)) return v; const k = String(v || '').trim().toLowerCase();
    return STATUS_ALIASES[k] || STATUS_IDS.find(i => i.toLowerCase() === k) || 'idea';
  }
  const TOOLS = [
    { id: 'midjourney', label: 'Midjourney', kind: 'image' }, { id: 'nanoBanana', label: 'Nano Banana', kind: 'image' },
    { id: 'imagine', label: 'Grok Imagine', kind: 'both' }, { id: 'seedance', label: 'Seedance', kind: 'video' },
    { id: 'wan', label: 'Wan', kind: 'video' }, { id: 'kling', label: 'Kling', kind: 'video' }
  ];
  const toolLabel = (t) => { const x = TOOLS.find(o => o.id === t); return x ? x.label : (t || ''); };
  const LOOK_FIELDS = ['age', 'hair', 'outfit', 'makeup', 'props', 'notes'];
  const ROLES = [
    { id: 'linear', label: 'Linear (follows the song)' },
    { id: 'insert', label: 'Insert (cutaway)' },
    { id: 'flashForward', label: 'Flash-forward' },
    { id: 'flashBack', label: 'Flashback' }
  ];
  const ROLE_IDS = ROLES.map(r => r.id);
  const RETIMES = [
    { id: 'frame', label: 'Frame sampling' },
    { id: 'blend', label: 'Frame blend' },
    { id: 'opticalFlow', label: 'Optical flow' },
    { id: 'speedWarp', label: 'Speed Warp' }
  ];
  const RETIME_IDS = RETIMES.map(r => r.id);
  const PAGE_FIELDS = ['title', 'code', 'start', 'end', 'camera', 'mood', 'lyrics', 'description', 'imagePrompt', 'imageTool', 'videoPrompt', 'videoTool', 'negativePrompt', 'negativeTool', 'notes', 'flag', 'effect'];
  const STORY_COLORS = ['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c', '#da77f2', '#ffa94d', '#38d9a9', '#f783ac'];
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

  const num = (v) => { const n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : null; };
  /** Playback speed of a page or cut: 1 = normal, 0.4 = slow motion, negative = reverse. */
  function speedOf(x) { const v = x ? num(x.speed) : null; return v && v !== 0 ? v : 1; }
  /** Length of a media source range in seconds (out - in), or null. */
  function rangeLen(m) { if (!m) return null; const a = num(m.in), b = num(m.out); return a !== null && b !== null && b > a ? b - a : null; }

  /** Screen time of a page in seconds.
   *  duration > end-start > sum of cut durations > video in/out range / |speed| > defaultDuration (> 3). */
  function pageDuration(p, doc) {
    const d = num(p.duration);
    if (d > 0) return d;
    const a = parseTime(p.start), b = parseTime(p.end);
    if (a !== null && b !== null && b > a) return b - a;
    if (Array.isArray(p.cuts) && p.cuts.length && p.cuts.every(c => num(c.duration) > 0)) return p.cuts.reduce((t, c) => t + num(c.duration), 0);
    const r = rangeLen(p.video); if (r) return r / Math.abs(speedOf(p));
    const def = doc && num(doc.defaultDuration);
    return def > 0 ? def : 3;
  }

  /** Seconds stated in a clip prompt: "(6 s, image-to-video)", "6 seconds", "6-second". null if none. */
  function promptSeconds(text) {
    if (!text) return null;
    const t = String(text);
    const m = t.match(/^\s*\(?\s*(\d+(?:[.,]\d+)?)\s*(?:s|sec|secs|seconds?)\b/i) || t.match(/\(\s*(\d+(?:[.,]\d+)?)\s*(?:s|sec|secs|seconds?)\b/i) || t.match(/(\d+(?:[.,]\d+)?)[\s-]*(?:s|sec|secs|seconds?)\b/i);
    return m ? parseFloat(m[1].replace(',', '.')) : null;
  }
  /** Warning text when the clip prompt's length disagrees with the page's screen time (tolerance 0.5 s). */
  /** v3: warn only when the generation (genSeconds) is too short for what the page uses:
   *  source needed = page length × |speed| starting at video.in, and video.out must lie inside the generation.
   *  No genSeconds -> no warning (the prompt text is not guessed any more). A longer generation trimmed down is normal. */
  function durationWarning(p, doc) {
    if (p.cuts && p.cuts.length) { const w = cutWarnings(p, doc); return w.length ? w.map(x => x.msg).join(' ') : ''; } // v3.1: each cut is checked against its own clip
    const g = num(p.genSeconds); if (!(g > 0)) return '';
    const r2 = (x) => Math.round(x * 100) / 100; const tol = 0.04;
    const d = pageDuration(p, doc); const sp = Math.abs(speedOf(p)); const v = p.video || {};
    const a = v.in !== undefined ? v.in : 0;
    if (v.out !== undefined && v.out > g + tol) return 'Source out ' + r2(v.out) + ' s is past the end of the ' + r2(g) + ' s generation.';
    const avail = (v.out !== undefined ? Math.min(v.out, g) : g) - a; const need = d * sp;
    if (avail + tol < need) return 'Generation too short: the page needs ' + r2(need) + ' s of source (' + r2(d) + ' s' + (sp !== 1 ? ' × speed ' + r2(sp) : '') + (a ? ' from in ' + r2(a) + ' s' : '') + ') but only ' + r2(Math.max(0, avail)) + ' s of the ' + r2(g) + ' s generation is available.';
    return '';
  }

  /** v3.1: cut durations that add up to more than the page. Returns {total, page, over} or null. Cuts without a duration share the page, so they never overrun. */
  function cutsOverrun(p, doc, tol) {
    if (!p.cuts || !p.cuts.length || p.cuts.some(c => !(c.duration > 0))) return null;
    const total = p.cuts.reduce((a, c) => a + c.duration, 0);
    const hasLen = num(p.duration) > 0 || (parseTime(p.start) !== null && parseTime(p.end) !== null && parseTime(p.end) > parseTime(p.start));
    if (!hasLen) return null; // page length comes from the cuts themselves
    const page = pageDuration(p, doc); const over = Math.round((total - page) * 1000) / 1000;
    return over > (tol === undefined ? 0.02 : tol) ? { total: Math.round(total * 1000) / 1000, page, over } : null;
  }
  /** Trim the last cut(s) so the cuts fit the page exactly (cuts shorter than 0.04 s are removed). */
  function trimCutsToFit(p, doc) {
    const o = cutsOverrun(p, doc, 0.0005); if (!o) return p; let over = o.over;
    while (over > 0.0005 && p.cuts.length) { const c = p.cuts[p.cuts.length - 1]; if (c.duration - over >= 0.04) { c.duration = Math.round((c.duration - over) * 1000) / 1000; over = 0; } else { over = Math.round((over - c.duration) * 1000) / 1000; p.cuts.pop(); } }
    return p;
  }
  /** Stretch the page to the cuts' total (sets an explicit duration; song start/end stay). */
  function stretchPageToCuts(p, doc) { const o = cutsOverrun(p, doc, 0.0005); if (o) p.duration = o.total; return p; }
  const sameClip = (a, b) => !!(a && b && ((a.driveId && a.driveId === b.driveId) || (a.path && b.path && a.path.split('/').pop().toLowerCase() === b.path.split('/').pop().toLowerCase())));
  /** Known generation length of a clip: media.genSeconds, else genSeconds of a page whose video is the same clip (by driveId or file name). */
  function clipGenSeconds(m, doc, page) {
    if (!m) return null; if (m.genSeconds > 0) return m.genSeconds;
    if (page && page.genSeconds > 0 && sameClip(page.video, m)) return page.genSeconds;
    for (const s of (doc && doc.scenes) || []) for (const q of s.pages) { if (q.genSeconds > 0 && sameClip(q.video, m)) return q.genSeconds; for (const c of q.cuts || []) if (c.media && c.media.genSeconds > 0 && sameClip(c.media, m)) return c.media.genSeconds; }
    return null;
  }
  const STILL_RE = /\.(jpe?g|png|webp|gif|avif|bmp|tiff?|heic)$/i;
  /** v3.1: per-cut source check: in + duration × |speed| must fit before the clip's out point / generation end. Returns [{i, msg}]. */
  function cutWarnings(p, doc) {
    const out = []; if (!p.cuts || !p.cuts.length) return out;
    const d = pageDuration(p, doc); const r2 = (x) => Math.round(x * 100) / 100; const tol = 0.04;
    p.cuts.forEach((c, i) => {
      const m = c.media || {}; if (STILL_RE.test(m.path || m.name || '')) return;
      const g = clipGenSeconds(m, doc, p); const a = m.in !== undefined ? m.in : 0;
      const dur = c.duration > 0 ? c.duration : d / p.cuts.length; const sp = Math.abs(c.speed || speedOf(p)); const end = a + dur * sp;
      if (g && m.out !== undefined && m.out > g + tol) out.push({ i, msg: 'Cut ' + (i + 1) + ': source out ' + r2(m.out) + ' s is past the end of the ' + r2(g) + ' s generation.' });
      else if (m.out !== undefined && end > m.out + tol) out.push({ i, msg: 'Cut ' + (i + 1) + ': needs source ' + r2(a) + '–' + r2(end) + ' s (' + r2(dur) + ' s' + (sp !== 1 ? ' × ' + r2(sp) : '') + ') but its out point is ' + r2(m.out) + ' s.' });
      else if (g && end > g + tol) out.push({ i, msg: 'Cut ' + (i + 1) + ': needs source ' + r2(a) + '–' + r2(end) + ' s but the clip is a ' + r2(g) + ' s generation.' });
    });
    return out;
  }

  /** Song-time analysis: total screen time, song span and gaps/overlaps between consecutive linear pages. */
  function timeline(doc) {
    doc = activeDoc(doc);
    let screen = 0, songStart = null, songEnd = null; const gaps = [], overlaps = [];
    let prev = null, between = 0;
    for (const s of doc.scenes) for (const p of s.pages) {
      if (p.pool) continue; // v4: pool pages are not in the edit
      if (p.status === 'cut' && !p.bridged) continue;
      if (p.status === 'cut') { // v3.1 bridged: no screen time, but its song time counts as covered in the gap check
        const a = parseTime(p.start), b = parseTime(p.end);
        if ((p.role || 'linear') === 'linear' && a !== null && b !== null) {
          if (prev) { const pe = parseTime(prev.end); if (pe !== null && a - pe - between > 0.05) gaps.push({ pageId: p.id, prevId: prev.id, from: pe, to: a, seconds: a - pe - between, filled: between }); }
          prev = p; between = 0;
        }
        continue;
      }
      screen += pageDuration(p, doc);
      const a = parseTime(p.start), b = parseTime(p.end);
      if (a !== null) songStart = songStart === null ? a : Math.min(songStart, a);
      if (b !== null) songEnd = songEnd === null ? b : Math.max(songEnd, b);
      const role = p.role || 'linear';
      if (role !== 'linear' || a === null) { if (prev) between += pageDuration(p, doc); continue; } // inserts/flashes between two linear pages fill screen time
      if (prev) {
        const pe = parseTime(prev.end);
        if (pe !== null && a - pe - between > 0.05) gaps.push({ pageId: p.id, prevId: prev.id, from: pe, to: a, seconds: a - pe - between, filled: between });
        else if (pe !== null && pe - a > 0.05) overlaps.push({ pageId: p.id, prevId: prev.id, from: a, to: pe, seconds: pe - a });
      }
      if (parseTime(p.end) !== null) { prev = p; between = 0; }
    }
    return { screen, songStart, songEnd, songSpan: songStart !== null && songEnd !== null ? songEnd - songStart : null, gaps, overlaps };
  }

  /** Accepts ISO 8601 with Z or a +hh:mm / -hh:mm offset. Returns epoch ms or null. */
  function parseUpdated(s) {
    if (!s || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(String(s))) return null;
    const t = Date.parse(String(s).replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    return isFinite(t) ? t : null;
  }
  /** Local time with offset, e.g. 2026-11-16T20:33:00+01:00 */
  function isoLocal(date) {
    const d = date || new Date(); const off = -d.getTimezoneOffset(); const sg = off >= 0 ? '+' : '-'; const a = Math.abs(off);
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + sg + p(Math.floor(a / 60)) + ':' + p(a % 60);
  }
  /** Comments in thread order: each top-level comment followed by its replies (replyTo), depth-first. Orphans count as top level. */
  function commentThreads(list) {
    list = list || []; const ids = new Set(list.map(c => c.id)); const kids = new Map(); const out = []; const seen = new Set();
    for (const c of list) { const k = c.replyTo && ids.has(c.replyTo) && c.replyTo !== c.id ? c.replyTo : ''; if (!kids.has(k)) kids.set(k, []); kids.get(k).push(c); }
    const walk = (k, depth) => { for (const c of kids.get(k) || []) { if (seen.has(c.id)) continue; seen.add(c.id); out.push({ c, depth }); walk(c.id, depth + 1); } };
    walk('', 0);
    for (const c of list) if (!seen.has(c.id)) { seen.add(c.id); out.push({ c, depth: 0 }); } // reply cycles
    return out;
  }
  /** Display a stored timestamp (Z or offset) in the viewer's local time: "2026-11-16 19:47" */
  function fmtStamp(s) {
    const t = parseUpdated(s); if (t === null) return String(s || '').slice(0, 16).replace('T', ' ');
    return isoLocal(new Date(t)).slice(0, 16).replace('T', ' ');
  }
  /** "SB2_03_v2.mp4" -> "v2", "shot 03.jpg" -> "" */
  function versionLabel(name) { const m = matchNumber(name || ''); return m && m.ver ? 'v' + m.ver : ''; }

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
    // v2: source range (seconds inside the clip) and drift fields
    const a = num(m.in), b = num(m.out);
    if (a !== null && a >= 0) out.in = a;
    if (b !== null && b > 0 && (out.in === undefined || b > out.in)) out.out = b;
    if (m.md5) out.md5 = String(m.md5);
    if (m.modifiedTime) out.modifiedTime = String(m.modifiedTime);
    if (m.version) out.version = String(m.version);
    const gs = num(m.genSeconds); if (gs > 0) out.genSeconds = gs; // v3.1: length of this generated clip (optional, mostly on cut media)
    return out;
  }

  function normCut(c) {
    if (!c || typeof c !== 'object') return null;
    const media = normMedia(c.media || (c.path || c.driveId ? c : null));
    if (!media) return null;
    const d = num(c.duration), sp = num(c.speed);
    return { media, duration: d > 0 ? d : null, speed: sp && sp !== 0 ? sp : null };
  }

  /** characters on a page or scene: "saisha" or {charId, lookId, overrides:{age,hair,…}} -> always the object form in memory */
  function normCastRefs(a) {
    if (!Array.isArray(a)) return [];
    const out = []; const seen = new Set();
    for (const c of a) {
      const r = typeof c === 'string' ? { charId: c } : c && typeof c === 'object' ? c : null;
      const id = r && String(r.charId || r.id || r.character || '');
      if (!id || seen.has(id)) continue; seen.add(id);
      const ov = {}; if (r.overrides && typeof r.overrides === 'object') for (const [k, v] of Object.entries(r.overrides)) if (v !== '' && v !== null && v !== undefined) ov[k] = String(v);
      out.push({ charId: id, lookId: r.lookId ? String(r.lookId) : '', overrides: ov });
    }
    return out;
  }
  function castRefOut(r) { return !r.lookId && !Object.keys(r.overrides || {}).length ? r.charId : Object.assign({ charId: r.charId }, r.lookId ? { lookId: r.lookId } : {}, Object.keys(r.overrides || {}).length ? { overrides: r.overrides } : {}); }
  function normTake(t) {
    if (!t || typeof t !== 'object') return null;
    const m = normMedia(t.media || t); if (!m) return null;
    if (!m.version) { const v = versionLabel(m.name || m.path); if (v) m.version = v; }
    return Object.assign(m, { tool: t.tool ? String(t.tool) : '', note: t.note ? String(t.note) : '', pick: !!t.pick });
  }
  function normGen(g) {
    const o = {}; for (const k of ['tool', 'model', 'resolution', 'approvedBy', 'approvedAt', 'quote', 'at', 'note']) o[k] = g[k] === undefined || g[k] === null ? '' : String(g[k]);
    for (const k of ['seconds', 'credits']) { const n = num(g[k]); o[k] = n === null ? null : n; }
    return o;
  }
  function normLook(l, i) {
    const o = { id: l.id ? String(l.id) : 'look' + (i + 1), label: l.label ? String(l.label) : (l.name ? String(l.name) : 'Look ' + (i + 1)) };
    for (const k of LOOK_FIELDS) o[k] = l[k] === undefined || l[k] === null ? '' : String(l[k]);
    o.refSetId = l.refSetId ? String(l.refSetId) : '';
    return o;
  }
  function normRefSet(r, i) {
    return {
      id: r.id ? String(r.id) : 'refs' + (i + 1), label: r.label ? String(r.label) : 'Refs ' + (i + 1),
      images: Array.isArray(r.images) ? r.images.map(normMedia).filter(Boolean) : [],
      allowedTools: Array.isArray(r.allowedTools) ? r.allowedTools.map(String).filter(Boolean) : [],
      publicOnly: !!r.publicOnly, notes: r.notes ? String(r.notes) : ''
    };
  }
  function normCharacter(c, i) {
    const o = {
      id: String(c.id || slug(c.name)), name: String(c.name || c.id), color: /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : SCENE_COLORS[(i + 3) % SCENE_COLORS.length],
      canon: c.canon ? String(c.canon) : '',
      refSets: Array.isArray(c.refSets) ? c.refSets.filter(x => x && typeof x === 'object').map(normRefSet) : [],
      looks: Array.isArray(c.looks) ? c.looks.filter(x => x && typeof x === 'object').map(normLook) : [],
      defaultLookId: c.defaultLookId ? String(c.defaultLookId) : ''
    };
    if (o.defaultLookId && !o.looks.find(l => l.id === o.defaultLookId)) o.defaultLookId = '';
    return o;
  }

  function normPage(p) {
    p = p && typeof p === 'object' ? p : {};
    const out = { id: p.id ? String(p.id) : uid('p') };
    for (const f of PAGE_FIELDS) out[f] = p[f] === undefined || p[f] === null ? '' : String(p[f]);
    // tolerate a few aliases Mirrage might use
    if (!out.lyrics && p.lyric) out.lyrics = String(p.lyric); // v1 name
    if (!out.lyrics && p.dialogue) out.lyrics = String(p.dialogue);
    if (!out.videoPrompt && p.clipPrompt) out.videoPrompt = String(p.clipPrompt); // v1 name
    if (!out.description && p.action) out.description = String(p.action);
    if (!out.start && p.timecode && String(p.timecode).includes('-')) {
      const [a, b] = String(p.timecode).split(/\s*[-–]\s*/); out.start = a || ''; out.end = b || '';
    }
    const d = parseFloat(p.duration);
    out.duration = d > 0 ? d : null;
    out.status = normStatus(p.status);
    const sp = num(p.speed); out.speed = sp && sp !== 0 ? sp : null;
    out.retime = RETIME_IDS.includes(p.retime) ? p.retime : '';
    out.role = ROLE_IDS.includes(p.role) ? p.role : '';
    out.cuts = Array.isArray(p.cuts) ? p.cuts.map(normCut).filter(Boolean) : [];
    const gs = num(p.genSeconds); out.genSeconds = gs > 0 ? gs : null;
    out.bridged = p.bridged === true; // v3.1: a status-cut page whose song time the real edit bridged (gap check treats it as covered)
    out.storyline = p.storyline ? String(p.storyline) : ''; // v4
    const so = num(p.storyOrder); out.storyOrder = so !== null && so > 0 ? so : null; // v4: position inside its storyline (story order)
    out.pool = p.pool === true; // v4: in the pool, not meant for the edit (yet)
    out.altOf = p.altOf ? String(p.altOf) : ''; out.altLabel = p.altLabel ? String(p.altLabel) : ''; out.active = p.active !== false;
    out.characters = normCastRefs(p.characters);
    out.takes = Array.isArray(p.takes) ? p.takes.map(normTake).filter(Boolean) : [];
    out.genLog = Array.isArray(p.genLog) ? p.genLog.filter(g => g && typeof g === 'object').map(normGen) : [];
    out.image = normMedia(p.image);
    out.video = normMedia(p.video);
    out.comments = Array.isArray(p.comments) ? p.comments.filter(c => c && c.text).map(c => ({
      id: c.id ? String(c.id) : uid('c'), by: String(c.by || ''), at: String(c.at || ''), text: String(c.text), done: !!c.done, replyTo: c.replyTo ? String(c.replyTo) : ''
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
      slot: s.slot ? String(s.slot) : '', altLabel: s.altLabel ? String(s.altLabel) : '', active: s.active !== false,
      characters: normCastRefs(s.characters),
      pages: pages.map(normPage)
    };
  }

  /** v4 storyline: {id, name, color, notes}. "colour" is accepted as an alias of "color". */
  function normStoryline(x, i) {
    x = x && typeof x === 'object' ? x : {};
    const c = x.color || x.colour || '';
    const id = x.id ? String(x.id) : 'sl_' + (slug(x.name || '') || uid('').slice(1));
    return { id, name: x.name ? String(x.name) : id, color: /^#[0-9a-f]{6}$/i.test(c) ? c : STORY_COLORS[i % STORY_COLORS.length], notes: x.notes ? String(x.notes) : '' };
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
      characters: Array.isArray(d.characters) ? d.characters.filter(c => c && (c.id || c.name)).map(normCharacter) : [],
      songLyrics: Array.isArray(d.songLyrics) ? d.songLyrics.map(l => l && typeof l === 'object' ? { t: typeof l.t === 'string' ? parseTime(l.t) : num(l.t), text: String(l.text || '') } : null).filter(l => l && l.t !== null && l.t >= 0 && l.text).sort((a, b) => a.t - b.t) : [],
      fps: num(d.fps) > 0 ? num(d.fps) : null,
      variants: Array.isArray(d.variants) ? d.variants.filter(v => v && typeof v === 'object').map((v, i) => ({ id: v.id ? String(v.id) : 'v' + (i + 1), name: v.name ? String(v.name) : 'Variant ' + (i + 1), slots: strMap(v.slots), pages: strMap(v.pages) })) : [],
      activeVariant: d.activeVariant ? String(d.activeVariant) : '',
      storylines: Array.isArray(d.storylines) ? d.storylines.filter(x => x && typeof x === 'object' && (x.id || x.name)).map(normStoryline) : [],
      notes: d.notes ? String(d.notes) : '',
      updated: d.updated ? String(d.updated) : '',
      updatedBy: d.updatedBy ? String(d.updatedBy) : '',
      revision: Number.isInteger(+d.revision) && +d.revision > 0 ? +d.revision : 0,
      scenes: scenes.map(normScene)
    };
    // unique ids (Mirrage may copy-paste a page and forget to change its id)
    const seen = new Set();
    for (const s of out.scenes) {
      if (seen.has(s.id)) s.id = uid('s'); seen.add(s.id);
      for (const p of s.pages) { if (seen.has(p.id)) p.id = uid('p'); seen.add(p.id); }
    }
    { const sl = new Set(); out.storylines = out.storylines.filter(x => !sl.has(x.id) && sl.add(x.id)); } // v4: unique storyline ids
    for (const s of out.scenes) for (const p of s.pages) if (p.storyline && !out.storylines.some(x => x.id === p.storyline)) out.storylines.push(normStoryline({ id: p.storyline, name: p.storyline }, out.storylines.length));
    regroup(out);
    if (out.activeVariant && !out.variants.find(v => v.id === out.activeVariant)) out.activeVariant = '';
    // unknown character ids referenced by pages become characters
    const known = new Set(out.characters.map(c => c.id));
    for (const s of out.scenes) for (const r of s.characters.concat(...s.pages.map(p => p.characters))) {
      if (!known.has(r.charId)) { known.add(r.charId); out.characters.push(normCharacter({ id: r.charId, name: r.charId, color: SCENE_COLORS[out.characters.length % SCENE_COLORS.length] }, out.characters.length)); }
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
          if (k === 'active') { if (v === false) r[k] = false; continue; } // v3: only inactive alternatives carry "active": false
          if (v === '' || v === null || v === undefined || v === false) continue;
          if (Array.isArray(v) && !v.length && k !== 'pages' && k !== 'scenes') continue;
          r[k] = clean(v);
        }
        return r;
      }
      return o;
    };
    const pre = JSON.parse(JSON.stringify(doc));
    for (const s of pre.scenes || []) { s.characters = (s.characters || []).map(castRefOut); for (const p of s.pages || []) p.characters = (p.characters || []).map(castRefOut); }
    const d = clean(pre);
    // keep the header fields first for humans/Mirrage
    const order = ['format', 'version', 'revision', 'title', 'project', 'updated', 'updatedBy', 'aspect', 'defaultDuration', 'driveFolderId', 'audio', 'audioOffset', 'fps', 'activeVariant', 'variants', 'storylines', 'characters', 'songLyrics', 'notes', 'scenes'];
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
      [/^lyrics?$/i, 'lyrics'], [/^(description|action|beat)$/i, 'description'], [/^image prompt$/i, 'imagePrompt'],
      [/^(clip|video) prompt/i, 'videoPrompt'], [/^negative( prompt)?$/i, 'negativePrompt'], [/^mood$/i, 'mood'],
      [/^image tool$/i, 'imageTool'], [/^(video|clip) tool$/i, 'videoTool'], [/^negative tool$/i, 'negativeTool'], [/^takes$/i, '_takes'], [/^gen(eration)?[\s-]*(seconds|length|secs?)$/i, '_gen'],
      [/^(camera|shot)$/i, 'camera'], [/^notes?$/i, 'notes'], [/^flag$/i, 'flag'],
      [/^(title)$/i, 'title'], [/^(characters?|cast)$/i, '_chars'], [/^duration$/i, '_dur'],
      [/^role$/i, '_role'], [/^speed$/i, '_speed'], [/^retime$/i, '_retime'], [/^effects?$/i, 'effect'],
      [/^storyline$/i, '_storyline'], [/^image$/i, '_image'], [/^video$/i, '_video'], [/^cuts$/i, '_cuts']
    ];
    const storylines = []; // v4: names seen in "**Storylines:**" or "Storyline:" lines
    const slName = (v) => { const raw = String(v).replace(/\s*\(#[0-9a-f]{6}\)\s*$/i, '').trim(); const c = (String(v).match(/#[0-9a-f]{6}/i) || [''])[0]; if (!raw) return ''; let x = storylines.find(q => q.name.toLowerCase() === raw.toLowerCase()); if (!x) { x = { id: 'sl_' + slug(raw), name: raw, color: c }; storylines.push(x); } else if (c && !x.color) x.color = c; return x.id; };
    for (let raw of lines) {
      const line = raw.trim();
      let m;
      if ((m = line.match(/^\*\*Storylines:\*\*\s*(.*)$/i))) { m[1].split(/,\s*(?![^()]*\))/).forEach(slName); continue; }
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
      if (field === '_takes' && /^[-*]\s+/.test(line)) { const t = parseMediaLine(line.replace(/^[-*]\s+/, '')); if (t.media) (page.takes = page.takes || []).push(Object.assign(t.media, { tool: t.tool || '', note: t.note || '', pick: !!t.pick })); continue; }
      if (field === '_cuts' && /^[-*]\s+/.test(line)) { const c = parseMediaLine(line.replace(/^[-*]\s+/, '')); if (c.media) (page.cuts = page.cuts || []).push(c); continue; }
      if ((m = line.match(/^\*(Status:.*)\*$/))) { // our own export meta line
        for (const part of m[1].split(' · ')) {
          const kv = part.match(/^([A-Za-z ]+):\s*(.*)$/); if (!kv) continue; const k = kv[1].toLowerCase(), v = kv[2].trim();
          if (k === 'status') page.status = v; else if (k === 'code') page.code = v;
          else if (k === 'characters') page.characters = parseCastList(v);
          else if (k === 'duration' && /explicit/.test(v)) page.duration = parseFloat(v);
          else if (k === 'storyline') page.storyline = slName(v);
          else if (k === 'story order') { const so = parseFloat(v); if (so > 0) page.storyOrder = so; }
          else if (k === 'pool') page.pool = /^(yes|true|1)$/i.test(v);
        }
        continue;
      }
      if (/^\*[^*].*\*$/.test(line)) { field = null; continue; } // other italic notes (auto lyrics, generation log heading)
      if ((m = line.match(/^\*\*([^*]+?):?\*\*:?\s*(.*)$/)) || (m = line.match(/^([A-Za-z][A-Za-z ]{1,24}?)\s*(\([^)]*\))?:\s+(.*)$/))) {
        let label, value, paren = '';
        if (m.length === 3) { label = m[1].trim(); value = m[2]; } else { label = m[1].trim(); paren = m[2] || ''; value = m[3]; }
        const pm = label.match(/^(.*?)\s*\(([^)]*)\)$/); if (pm) { label = pm[1]; paren = pm[2]; }
        const hit = FIELD_MAP.find(([re]) => re.test(label.trim()));
        if (hit) {
          field = hit[1];
          if (field === '_chars') { page.characters = parseCastList(value); field = null; continue; }
          if (field === '_storyline') { page.storyline = slName(value); field = null; continue; }
          if (field === '_takes') { page.takes = page.takes || []; continue; }
          if (field === '_gen') { const g = parseFloat(value); if (g > 0) page.genSeconds = g; field = null; continue; }
          if ((field === 'imagePrompt' || field === 'videoPrompt' || field === 'negativePrompt') && paren && toolId(paren)) { page[field.replace('Prompt', 'Tool')] = toolId(paren); paren = ''; }
          if (field === '_dur') { const d = parseFloat(value); if (d > 0) page.duration = d; field = null; continue; }
          if (field === '_role') { page.role = parseRole(value); field = null; continue; }
          if (field === '_speed') { const pct = value.match(/(-?\d+(?:\.\d+)?)\s*%/); const v = pct ? parseFloat(pct[1]) / 100 : parseFloat(value); if (v) page.speed = v; field = null; continue; }
          if (field === '_retime') { page.retime = parseRetime(value); field = null; continue; }
          if (field === '_image' || field === '_video') { const r = parseMediaLine(value); if (r.media) page[field.slice(1)] = r.media; field = null; continue; }
          if (field === '_cuts') { page.cuts = page.cuts || []; continue; }
          if (field === 'videoPrompt' && paren) value = '(' + paren + ') ' + value;
          page[field] = (page[field] ? page[field] + '\n' : '') + value.trim();
          continue;
        }
      }
      if (field && line) page[field] += (page[field] ? '\n' : '') + line;
    }
    for (const s of scenes) for (const p of s.pages) {
      for (const k of Object.keys(p)) if (typeof p[k] === 'string') p[k] = p[k].replace(/\*\*/g, '').trim();
      if (!p.role) { const hay = (p.title || '') + ' ' + (p.lyrics || ''); if (/flash[\s-]?forward/i.test(hay)) p.role = 'flashForward'; else if (/flash[\s-]?back/i.test(hay)) p.role = 'flashBack'; }
    }
    const res = scenes.filter(s => s.pages.length).map(normScene);
    res.storylines = storylines.map((x, i) => normStoryline(x, i)); // v4: merge these into doc.storylines when importing
    return res;
  }

  /** "Saisha [linen], Steeve" -> [{charId:'saisha', lookId:'linen'}, 'steeve'] */
  function parseCastList(v) {
    return String(v).split(/[,;]/).map(x => x.trim()).filter(Boolean).map(x => { const m = x.match(/^(.*?)\s*\[([^\]]+)\]$/); return m ? { charId: slug(m[1]), lookId: m[2].trim() } : slug(x); });
  }
  /** known tool id from an id or label ("Kling", "nano banana") or '' */
  function toolId(v) { const t = String(v).toLowerCase().replace(/[^a-z]/g, ''); const x = TOOLS.find(o => o.id.toLowerCase() === t || o.label.toLowerCase().replace(/[^a-z]/g, '') === t); return x ? x.id : ''; }
  function parseRole(v) {
    const t = String(v).toLowerCase().replace(/[^a-z]/g, '');
    return t.startsWith('flashforward') ? 'flashForward' : t.startsWith('flashback') ? 'flashBack' : t.startsWith('insert') || t.startsWith('cutaway') ? 'insert' : t.startsWith('linear') ? 'linear' : '';
  }
  function parseRetime(v) {
    const t = String(v).toLowerCase().replace(/[^a-z]/g, '');
    return t.includes('optical') ? 'opticalFlow' : t.includes('warp') ? 'speedWarp' : t.includes('blend') ? 'blend' : t.includes('frame') || t.includes('nearest') ? 'frame' : '';
  }
  /** Media line used in Markdown: "path · in 0.5 · out 2.5 · v2 · Drive <id>" (+ " · 0.08 s · speed 2" for cuts). */
  function mediaLine(m, extra) {
    const bits = [m.path || m.name || '–'];
    if (m.in !== undefined) bits.push('in ' + m.in); if (m.out !== undefined) bits.push('out ' + m.out);
    if (m.version) bits.push(m.version); if (m.driveId) bits.push('Drive ' + m.driveId);
    return bits.concat(extra || []).join(' · ');
  }
  function parseMediaLine(line) {
    const parts = String(line).replace(/\*/g, '').split(/\s+·\s+/).map(x => x.trim()).filter(Boolean);
    const media = { path: '', driveId: '' }; let duration = null, speed = null; const extra = {};
    parts.forEach((x, i) => {
      let m;
      if ((m = x.match(/^in\s+(\d+(?:\.\d+)?)$/i))) media.in = parseFloat(m[1]);
      else if ((m = x.match(/^out\s+(\d+(?:\.\d+)?)$/i))) media.out = parseFloat(m[1]);
      else if ((m = x.match(/^drive\s+(\S+)$/i))) media.driveId = m[1].replace(/[()]/g, '');
      else if ((m = x.match(/^(v\d+)$/i))) media.version = m[1];
      else if ((m = x.match(/^speed\s+(-?\d+(?:\.\d+)?)$/i))) speed = parseFloat(m[1]);
      else if ((m = x.match(/^tool\s+(.+)$/i))) extra.tool = toolId(m[1]) || m[1];
      else if (/^(picked|★)$/i.test(x)) extra.pick = true;
      else if ((m = x.match(/^note:\s*(.*)$/i))) extra.note = m[1];
      else if ((m = x.match(/^(\d+(?:\.\d+)?)\s*s$/i))) duration = parseFloat(m[1]);
      else if (i === 0 && x !== '–') media.path = x;
    });
    return Object.assign({ media: normMedia(media), duration, speed }, extra);
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function toMarkdown(doc) {
    const hidden = allPages(doc).length - allPages(activeDoc(doc)).length; doc = activeDoc(doc);
    const out = [];
    out.push('# ' + doc.title, '');
    const meta = [doc.project, doc.updated ? 'updated ' + doc.updated.slice(0, 10) : '', doc.updatedBy ? 'by ' + doc.updatedBy : ''].filter(Boolean).join(' · ');
    if (meta) out.push('*' + meta + '*', '');
    if (doc.notes) out.push(doc.notes, '');
    if ((doc.storylines || []).length) out.push('**Storylines:** ' + doc.storylines.map(x => x.name + ' (' + x.color + ')').join(', '), '');
    let n = 0, total = 0;
    doc.scenes.forEach((s, si) => {
      out.push('---', '', '## SCENE ' + (si + 1) + ' · ' + s.title, '');
      if (s.notes) out.push('*' + s.notes + '*', '');
      for (const p of s.pages) {
        n++;
        const dur = pageDuration(p, doc); if (p.status !== 'cut' && !p.pool) total += dur;
        const tc = p.start || p.end ? ' · ' + [p.start, p.end].filter(Boolean).join('-') : '';
        out.push('### PAGE ' + pad2(n) + tc + (p.title ? ' · ' + p.title : ''), '');
        const meta2 = ['Status: ' + p.status, 'Duration: ' + (Math.round(dur * 100) / 100) + ' s' + (p.duration ? ' (explicit)' : '')];
        if (p.code && p.code !== pad2(n)) meta2.push('Code: ' + p.code);
        if ((doc.storylines || []).length && storylineOf(doc, p)) meta2.push('Storyline: ' + storylineById(doc, p.storyline).name);
        if (p.storyOrder) meta2.push('Story order: ' + p.storyOrder);
        if (p.pool) meta2.push('Pool: yes');
        if (p.characters.length) meta2.push('Characters: ' + p.characters.map(r => (doc.characters.find(c => c.id === r.charId) || { name: r.charId }).name + (r.lookId ? ' [' + r.lookId + ']' : '')).join(', '));
        out.push('*' + meta2.join(' · ') + '*', '');
        if (p.lyrics) out.push('**Lyrics:** ' + p.lyrics, '');
        else { const auto = lyricsFor(p, doc); if (auto) out.push('*Lyrics (from song): ' + auto + '*', ''); }
        if (p.mood) out.push('**Mood:** ' + p.mood, '');
        if (p.description) out.push('**Description:** ' + p.description, '');
        if (p.camera) out.push('**Camera:** ' + p.camera, '');
        const tp = (t) => t && toolId(t) ? ' (' + toolLabel(t) + ')' : '';
        if (p.imagePrompt) out.push('**IMAGE PROMPT' + tp(p.imageTool) + ':** ' + p.imagePrompt, '');
        if (p.imageTool && !toolId(p.imageTool)) out.push('**Image tool:** ' + p.imageTool, '');
        if (p.videoPrompt) out.push('**VIDEO PROMPT' + tp(p.videoTool) + ':** ' + p.videoPrompt, '');
        if (p.videoTool && !toolId(p.videoTool)) out.push('**Video tool:** ' + p.videoTool, '');
        if (p.genSeconds) out.push('**Gen seconds:** ' + p.genSeconds, '');
        if (p.negativePrompt) out.push('**NEGATIVE PROMPT' + tp(p.negativeTool) + ':** ' + p.negativePrompt, '');
        if (p.negativeTool && !toolId(p.negativeTool)) out.push('**Negative tool:** ' + p.negativeTool, '');
        if (p.notes) out.push('**Notes:** ' + p.notes, '');
        if (p.flag) out.push('**Flag:** ' + p.flag, '');
        if (p.role) out.push('**Role:** ' + p.role, '');
        if (p.speed && p.speed !== 1) out.push('**Speed:** ' + p.speed, '');
        if (p.retime) out.push('**Retime:** ' + p.retime, '');
        if (p.effect) out.push('**Effect:** ' + p.effect, '');
        if (p.image && !(p.image.url || '').startsWith('data:')) out.push('**Image:** ' + mediaLine(p.image), '');
        if (p.video) out.push('**Video:** ' + mediaLine(p.video), '');
        if (p.takes && p.takes.length) { out.push('**Takes:**'); for (const t of p.takes) out.push('- ' + mediaLine(t, [t.tool ? 'tool ' + t.tool : null, t.pick ? 'picked' : null, t.note ? 'note: ' + t.note : null].filter(Boolean))); out.push(''); }
        if (p.genLog && p.genLog.length) { out.push('*Generation log:*'); for (const g of p.genLog) out.push('- ' + [toolLabel(g.tool), g.model, g.resolution, g.seconds !== null ? g.seconds + ' s' : '', g.credits !== null ? g.credits + ' credits' : '', g.approvedBy ? 'approved by ' + g.approvedBy + (g.approvedAt ? ' ' + g.approvedAt : '') : '', g.quote ? '“' + g.quote + '”' : ''].filter(Boolean).join(' · ')); out.push(''); }
        if (p.cuts && p.cuts.length) { out.push('**Cuts:**'); for (const c of p.cuts) out.push('- ' + mediaLine(c.media, [c.duration ? c.duration + ' s' : null, c.speed ? 'speed ' + c.speed : null].filter(Boolean))); out.push(''); }
      }
    });
    const tl = timeline(doc);
    if (hidden) out.push('*' + hidden + ' page(s) in inactive alternatives are not exported (they stay in the JSON).*', '');
    out.push('---', '', '*' + n + ' pages · screen time ' + fmtTime(total) + (tl.songSpan !== null ? ' · song ' + fmtTime(tl.songStart) + '–' + fmtTime(tl.songEnd) : '') + (tl.gaps.length ? ' · ' + tl.gaps.length + ' song-time gap(s)' : '') + '*', '');
    return out.join('\n');
  }

  // ---------- v2 round 2: lyrics, cast, exports ----------
  /** Page lyrics: the page's own text, else the songLyrics lines that fall inside its start–end (or the line playing at its start). */
  function lyricsFor(p, doc) {
    if (p.lyrics) return p.lyrics;
    const L = doc && doc.songLyrics; if (!L || !L.length) return '';
    const a = parseTime(p.start); if (a === null) return '';
    let b = parseTime(p.end); if (b === null || b <= a) b = a + pageDuration(p, doc);
    const inside = L.filter(l => l.t >= a - 0.05 && l.t < b - 0.05);
    if (inside.length) return inside.map(l => l.text).join(' / ');
    const before = L.filter(l => l.t <= a); return before.length ? before[before.length - 1].text : '';
  }
  const charOf = (doc, id) => (doc.characters || []).find(c => c.id === id) || null;
  /** Resolve one character on a page: page look beats scene look beats the character default; overrides merge scene then page. */
  function effectiveLook(doc, scene, page, charId) {
    const ch = charOf(doc, charId); if (!ch) return null;
    const pr = page && (page.characters || []).find(r => r.charId === charId);
    const sr = scene && (scene.characters || []).find(r => r.charId === charId);
    let lookId = '', source = 'none';
    if (pr && pr.lookId && ch.looks.find(l => l.id === pr.lookId)) { lookId = pr.lookId; source = 'page'; }
    else if (sr && sr.lookId && ch.looks.find(l => l.id === sr.lookId)) { lookId = sr.lookId; source = 'scene'; }
    else if (ch.defaultLookId) { lookId = ch.defaultLookId; source = 'default'; }
    else if (ch.looks.length) { lookId = ch.looks[0].id; source = 'default'; }
    const look = ch.looks.find(l => l.id === lookId) || null;
    const overrides = Object.assign({}, sr ? sr.overrides : {}, pr ? pr.overrides : {});
    const merged = {}; for (const k of LOOK_FIELDS) merged[k] = overrides[k] !== undefined ? overrides[k] : look ? look[k] : '';
    const refSetId = overrides.refSetId || (look && look.refSetId) || '';
    const refSet = ch.refSets.find(r => r.id === refSetId) || (!look && ch.refSets[0]) || null;
    return { char: ch, look, lookId, source, overrides, merged, refSet, thumbs: refSet ? refSet.images : [] };
  }
  /** Facts the canon check understands. Each rule: clause keyword + values; a clause with "no/bare/never/without" is skipped. */
  const CANON_RULES = [
    { key: 'eye colour', kw: /\beyes?\b/i, vals: ['hazel', 'blue', 'green', 'brown', 'grey', 'gray', 'amber', 'black', 'violet', 'red'] },
    { key: 'hair colour', kw: /\bhair\b|\bfringe\b|\bbangs\b/i, vals: ['caramel', 'blonde', 'blond', 'black', 'brown', 'brunette', 'red', 'auburn', 'ginger', 'white', 'silver', 'grey', 'gray', 'pink', 'blue', 'green', 'purple'] },
    { key: 'tattoo side', kw: /tattoo|glyph|\bink\b/i, vals: ['left', 'right'] },
    { key: 'scar side', kw: /\bscar\b/i, vals: ['left', 'right'] },
    { key: 'footwear', kw: /barefoot|shoes?|boots?|sneakers?|heels|sandals?|trainers/i, vals: ['barefoot', 'shoes', 'shoe', 'boots', 'boot', 'sneakers', 'heels', 'sandals', 'trainers'], norm: (v) => v === 'barefoot' ? 'barefoot' : 'shod' }
  ];
  function canonFacts(text) {
    const facts = {};
    for (const clause of String(text || '').toLowerCase().split(/[.;\n]|,(?![^(]*\))/)) {
      if (/\b(no|not|bare|never|without|none)\b/.test(clause) && !/barefoot/.test(clause)) continue;
      for (const r of CANON_RULES) {
        if (!r.kw.test(clause)) continue;
        for (const v of r.vals) if (new RegExp('\\b' + v + '\\b').test(clause)) { (facts[r.key] = facts[r.key] || new Set()).add(r.norm ? r.norm(v) : v.replace('gray', 'grey').replace('blond', 'blonde').replace('blondee', 'blonde')); }
      }
    }
    return facts;
  }
  /** Warnings when override/look text states a different eye colour, hair colour, tattoo side… than the canon. */
  function canonConflicts(canon, text) {
    const a = canonFacts(canon), b = canonFacts(text), out = [];
    for (const k of Object.keys(b)) {
      if (!a[k]) continue;
      const bad = [...b[k]].filter(v => !a[k].has(v));
      if (bad.length) out.push(k + ': canon says ' + [...a[k]].join('/') + ', this says ' + bad.join('/'));
    }
    return out;
  }
  /** Character text for a generation tool: canon + look + overrides, then the reference images (respecting allowedTools/publicOnly). */
  function promptBlock(doc, scene, page, charId, tool) {
    const e = effectiveLook(doc, scene, page, charId); if (!e) return '';
    const lines = [e.char.name.toUpperCase() + (e.look ? ' — look: ' + e.look.label : '')];
    if (e.char.canon) lines.push('Canon (locked): ' + e.char.canon.replace(/\s*\n\s*/g, '; '));
    const lk = LOOK_FIELDS.filter(k => e.merged[k]).map(k => k + ': ' + e.merged[k] + (e.overrides[k] !== undefined ? ' (override)' : ''));
    if (lk.length) lines.push('Look: ' + lk.join('; '));
    if (e.refSet) {
      const ok = !e.refSet.allowedTools.length || !tool || e.refSet.allowedTools.includes(tool);
      lines.push('References (' + e.refSet.label + (e.refSet.publicOnly ? ', public-safe only' : '') + ')' + (ok ? ':' : ': NOT cleared for ' + toolLabel(tool) + ' (allowed: ' + e.refSet.allowedTools.map(toolLabel).join(', ') + ')'));
      if (ok) for (const m of e.refSet.images) lines.push('- ' + (m.path || m.name || '') + (m.driveId ? ' · https://drive.google.com/file/d/' + m.driveId + '/view' : '') + (m.url && !m.url.startsWith('data:') ? ' · ' + m.url : ''));
    }
    const conf = canonConflicts(e.char.canon, LOOK_FIELDS.map(k => e.merged[k]).join('. '));
    if (conf.length) lines.push('⚠ Canon conflict: ' + conf.join('; '));
    if (tool) lines.unshift('[' + toolLabel(tool) + ']');
    return lines.join('\n');
  }
  /** Where a look or refSet is used: [{kind:'page'|'scene'|'look'|'default', id, label}] */
  function usedIn(doc, charId, what) {
    const ch = charOf(doc, charId); if (!ch) return [];
    const out = []; const labels = pageLabels(doc);
    const lookIds = what.lookId ? [what.lookId] : ch.looks.filter(l => l.refSetId === what.refSetId).map(l => l.id);
    if (what.refSetId) for (const l of ch.looks) if (l.refSetId === what.refSetId) out.push({ kind: 'look', id: l.id, label: 'look ' + l.label });
    if (what.lookId && ch.defaultLookId === what.lookId) out.push({ kind: 'default', id: ch.id, label: 'default look' });
    for (const s of doc.scenes) {
      if ((s.characters || []).some(r => r.charId === charId && (lookIds.includes(r.lookId) || (what.refSetId && r.overrides && r.overrides.refSetId === what.refSetId)))) out.push({ kind: 'scene', id: s.id, label: 'scene ' + s.title });
      for (const p of s.pages) {
        if (!(p.characters || []).some(r => r.charId === charId)) continue;
        const e = effectiveLook(doc, s, p, charId);
        if ((what.lookId && e.lookId === what.lookId) || (what.refSetId && e.refSet && e.refSet.id === what.refSetId)) out.push({ kind: 'page', id: p.id, label: 'page ' + labels.get(p.id) + (e.source !== 'page' ? ' (via ' + e.source + ')' : '') });
      }
    }
    return out;
  }

  /** One row per page (and per cut) for Resolve: song in/out, clip, source in/out, speed, duration, record in/out. */
  function editRows(doc) {
    doc = activeDoc(doc);
    const rows = []; let n = 0, rec = 0;
    for (const s of doc.scenes) for (const p of s.pages) {
      n++; if (p.status === 'cut' || p.pool) continue;
      const d = pageDuration(p, doc); const sp = speedOf(p);
      const base = { page: pad2(n), id: p.id, code: p.code, role: p.role || 'linear', title: p.title, scene: s.title, songIn: p.start, songOut: p.end, effect: p.effect, retime: p.retime };
      const srcOf = (m, dd, sv) => { const a = m && m.in !== undefined ? m.in : 0; const len = dd * Math.abs(sv); const b = m && m.out !== undefined ? Math.min(m.out, a + len) : a + len; return sv < 0 && m && m.out !== undefined ? { a: Math.max(a, m.out - len), b: m.out } : { a, b }; };
      if (p.cuts.length) {
        const per = p.cuts.map(c => c.duration || d / p.cuts.length); let t = 0, k = 0, guard = 0;
        while (t < d - 1e-6 && guard++ < 500) { // cuts loop to fill the page, like play mode
          const i = k % p.cuts.length; const c = p.cuts[i]; const dd = Math.min(per[i], d - t); const sv = c.speed || sp; const r = srcOf(c.media, dd, sv);
          rows.push(Object.assign({}, base, { page: base.page + '.' + (k + 1), clip: c.media.path || c.media.name || '', driveId: c.media.driveId || '', version: c.media.version || '', srcIn: r.a, srcOut: r.b, speed: sv, duration: dd, recIn: rec + t, recOut: rec + t + dd }));
          t += dd; k++;
        }
      } else {
        const m = p.video || p.image; const isVid = !!p.video; const r = isVid ? srcOf(m, d, sp) : { a: 0, b: d };
        rows.push(Object.assign({}, base, { clip: m ? m.path || m.name || '' : '', driveId: m ? m.driveId || '' : '', version: m ? m.version || '' : '', srcIn: r.a, srcOut: r.b, speed: isVid ? sp : 1, duration: d, recIn: rec, recOut: rec + d, still: !isVid && !!m }));
      }
      rec += d;
    }
    return rows;
  }
  const r3 = (x) => Math.round(x * 1000) / 1000;
  function toCSV(doc) {
    const cols = ['page', 'code', 'role', 'title', 'scene', 'songIn', 'songOut', 'clip', 'driveId', 'version', 'srcIn', 'srcOut', 'speed', 'retime', 'effect', 'duration', 'recIn', 'recOut'];
    const q = (v) => { v = v === undefined || v === null ? '' : typeof v === 'number' ? String(r3(v)) : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return [cols.join(',')].concat(editRows(doc).map(r => cols.map(c => q(r[c])).join(','))).join('\n') + '\n';
  }
  function toEDLText(doc) {
    const rows = editRows(doc); const out = ['# ' + doc.title + ' — edit list for DaVinci Resolve (Storyboard Studio)', '# page | code | role | song in–out | clip | source in–out | speed | duration | record in–out', ''];
    for (const r of rows) out.push([r.page, r.code || '-', r.role, (r.songIn || '?') + '–' + (r.songOut || '?'), r.clip || '(no media)', fmtTime(r.srcIn, true) + '–' + fmtTime(r.srcOut, true), (r.speed < 0 ? 'REVERSE ' : '') + Math.round(Math.abs(r.speed) * 100) + '%' + (r.retime ? ' ' + r.retime : ''), r3(r.duration) + 's', fmtTime(r.recIn, true) + '–' + fmtTime(r.recOut, true)].join(' | ') + (r.effect ? ' | fx ' + r.effect : ''));
    out.push('', '# ' + rows.length + ' events · total ' + fmtTime(rows.length ? rows[rows.length - 1].recOut : 0, true));
    return out.join('\n') + '\n';
  }
  function tc(sec, fps) {
    const f = Math.round(sec * fps); const fr = Math.round(fps);
    const h = Math.floor(f / (fr * 3600)), m = Math.floor(f / (fr * 60)) % 60, s2 = Math.floor(f / fr) % 60, ff = f % fr;
    return [h, m, s2, ff].map(pad2).join(':');
  }
  /** CMX3600 EDL (video track, cuts only, M2 speed lines, clip names as comments; record starts at 01:00:00:00). */
  function toCMX3600(doc, fps) {
    fps = fps || doc.fps || 24; const rows = editRows(doc);
    const out = ['TITLE: ' + String(doc.title || 'Storyboard').toUpperCase().replace(/[^A-Z0-9 _-]/g, '').slice(0, 60), 'FCM: NON-DROP FRAME', ''];
    rows.forEach((r, i) => {
      const ev = String(i + 1).padStart(3, '0'); const reel = r.clip ? 'AX' : 'BL';
      const src = r.speed < 0 ? [r.srcOut, r.srcIn] : [r.srcIn, r.srcOut];
      out.push(ev + '  ' + reel.padEnd(8) + ' V     C        ' + tc(src[0], fps) + ' ' + tc(r.clip ? src[0] + r.duration * Math.abs(r.speed) : r.duration, fps) + ' ' + tc(3600 + r.recIn, fps) + ' ' + tc(3600 + r.recOut, fps));
      if (r.speed !== 1 && r.clip) out.push('M2   ' + reel.padEnd(8) + ' ' + (r.speed < 0 ? '-' : '') + String((Math.abs(r.speed) * fps).toFixed(1)).padStart(5, '0') + '             ' + tc(src[0], fps));
      if (r.clip) out.push('* FROM CLIP NAME: ' + r.clip.split('/').pop());
      if (r.speed !== 1 && r.clip) out.push('* SPEED: ' + Math.round(r.speed * 1000) / 10 + '%');
      out.push('* COMMENT: PAGE ' + r.page + (r.code ? ' CODE ' + r.code : '') + ' ' + r.role.toUpperCase() + (r.songIn ? ' SONG ' + r.songIn + '-' + (r.songOut || '') : '') + (r.effect ? ' FX ' + r.effect : '') + (r.retime ? ' RETIME ' + r.retime : ''));
      out.push('');
    });
    return out.join('\n');
  }

  // ---------- v3: alternatives (scene slots, page alternatives) and variants ----------
  function strMap(o) { const r = {}; if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (k && v) r[String(k)] = String(v); return r; }
  const isActive = (x) => x.active !== false;
  /** Keep alternatives together and exactly one active per slot / page group. Safe to run after any edit. */
  function regroup(doc) {
    // scenes: all members of a slot sit together at the position of the first member
    const bySlot = new Map(); for (const sc of doc.scenes) if (sc.slot) { if (!bySlot.has(sc.slot)) bySlot.set(sc.slot, []); bySlot.get(sc.slot).push(sc); }
    const seen = new Set(); const scenes = [];
    for (const sc of doc.scenes) {
      if (!sc.slot) { sc.active = true; scenes.push(sc); continue; }
      if (seen.has(sc.slot)) continue; seen.add(sc.slot);
      const g = bySlot.get(sc.slot);
      if (g.length === 1) { g[0].active = true; scenes.push(g[0]); continue; }
      let on = false; for (const m of g) { if (isActive(m) && !on) { m.active = true; on = true; } else m.active = false; }
      if (!on) g[0].active = true;
      scenes.push(...g);
    }
    doc.scenes = scenes;
    // pages: alternatives follow their root page (altOf chains resolve to the root; dangling altOf is cleared)
    const where = new Map(); for (const sc of doc.scenes) for (const p of sc.pages) where.set(p.id, p);
    const rootOf = (p) => { let x = p, guard = 0; while (x.altOf && where.has(x.altOf) && x.altOf !== x.id && guard++ < 50) x = where.get(x.altOf); return x; };
    for (const p of where.values()) { if (p.altOf && (!where.has(p.altOf) || p.altOf === p.id)) p.altOf = ''; if (p.altOf) { const r = rootOf(p); p.altOf = r.id === p.id ? '' : r.id; } }
    const alts = new Map(); for (const p of where.values()) if (p.altOf) { if (!alts.has(p.altOf)) alts.set(p.altOf, []); alts.get(p.altOf).push(p); }
    for (const sc of doc.scenes) {
      const out = [];
      for (const p of sc.pages) {
        if (p.altOf) continue;
        const g = [p].concat(alts.get(p.id) || []);
        if (g.length === 1) p.active = true;
        else { let on = false; for (const m of g) { if (isActive(m) && !on) { m.active = true; on = true; } else m.active = false; } if (!on) g[0].active = true; }
        out.push(...g);
      }
      sc.pages = out;
    }
    return doc;
  }
  /** Only what plays: active scene alternatives and active page alternatives. */
  function activeDoc(doc) {
    if (!doc.scenes.some(s => s.active === false || s.pages.some(p => p.active === false))) return doc;
    return Object.assign({}, doc, { scenes: doc.scenes.filter(isActive).map(s => Object.assign({}, s, { pages: s.pages.filter(isActive) })) });
  }
  function activePages(doc) { return allPages(activeDoc(doc)); }
  /** Page labels: active pages are numbered 1…N; an inactive page alternative shows its group number + "·alt"; pages of inactive scene alternatives show "alt". */
  function pageLabels(doc) {
    const m = new Map(); let n = 0;
    for (const s of doc.scenes) {
      for (const p of s.pages) {
        if (!isActive(s)) { m.set(p.id, 'alt'); continue; }
        if (isActive(p)) { n++; m.set(p.id, String(n)); }
      }
      for (const p of s.pages) if (isActive(s) && !isActive(p)) { const root = p.altOf || p.id; const act = s.pages.find(q => isActive(q) && (q.id === root || q.altOf === root)); m.set(p.id, (act ? m.get(act.id) : '?') + '·alt'); }
    }
    return m;
  }
  /** Top-level board items: [{slot, scenes}] in order (a scene without slot is its own item). */
  function sceneItems(doc) {
    const items = [];
    for (const s of doc.scenes) { const last = items[items.length - 1]; if (s.slot && last && last.slot === s.slot) last.scenes.push(s); else items.push({ slot: s.slot || '', scenes: [s] }); }
    return items;
  }
  /** Page groups in one scene: [{root, pages}] */
  function pageItems(scene) {
    const items = [];
    for (const p of scene.pages) { const last = items[items.length - 1]; if (p.altOf && last && last.root.id === p.altOf) last.pages.push(p); else items.push({ root: p, pages: [p] }); }
    return items;
  }
  function setActiveScene(doc, sceneId) { const s = doc.scenes.find(x => x.id === sceneId); if (!s || !s.slot) return doc; for (const x of doc.scenes) if (x.slot === s.slot) x.active = x.id === sceneId; return regroup(doc); }
  function setActivePage(doc, pageId) {
    let p = null; for (const s of doc.scenes) for (const q of s.pages) if (q.id === pageId) p = q; if (!p) return doc;
    const root = p.altOf || p.id; for (const s of doc.scenes) for (const q of s.pages) if (q.id === root || q.altOf === root) q.active = q.id === pageId;
    return regroup(doc);
  }
  const nextLetter = (used) => { for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!used.includes(c)) return c; return String(used.length + 1); };
  const letterOf = (l) => (String(l || '').trim().match(/^[A-Z](?=\b|\s|$)/) || [''])[0];
  /** Duplicate a scene as an inactive alternative in the same slot (new ids; content, takes and logs kept, comments not). Returns the new scene id. */
  function addSceneAlternative(doc, sceneId) {
    const s = doc.scenes.find(x => x.id === sceneId); if (!s) return null;
    if (!s.slot) { s.slot = 'slot_' + s.id.replace(/^s_/, ''); if (!s.altLabel) s.altLabel = 'A ' + s.title; }
    const members = doc.scenes.filter(x => x.slot === s.slot);
    const L = nextLetter(members.map(m => letterOf(m.altLabel)));
    const c = JSON.parse(JSON.stringify(s)); c.id = uid('s'); c.active = false; c.altLabel = L + ' ' + s.title + ' (alt)'; c.title = s.title + ' (alt ' + L + ')';
    const idMap = new Map(); for (const p of c.pages) { const nid = uid('p'); idMap.set(p.id, nid); p.id = nid; p.comments = []; }
    for (const p of c.pages) if (p.altOf) p.altOf = idMap.get(p.altOf) || '';
    doc.scenes.splice(doc.scenes.indexOf(members[members.length - 1]) + 1, 0, c);
    regroup(doc); return c.id;
  }
  /** Duplicate a page as an inactive alternative shot of the same group. Returns the new page id. */
  function addPageAlternative(doc, pageId) {
    let sc = null, p = null; for (const s of doc.scenes) for (const q of s.pages) if (q.id === pageId) { sc = s; p = q; } if (!p) return null;
    const rootId = p.altOf || p.id; const root = sc.pages.find(q => q.id === rootId) || p;
    const group = sc.pages.filter(q => q.id === rootId || q.altOf === rootId);
    if (!root.altLabel) root.altLabel = 'A';
    const L = nextLetter(group.map(q => letterOf(q.altLabel)));
    const c = JSON.parse(JSON.stringify(p)); c.id = uid('p'); c.altOf = rootId; c.altLabel = L; c.active = false; c.comments = [];
    sc.pages.splice(sc.pages.indexOf(group[group.length - 1]) + 1, 0, c);
    regroup(doc); return c.id;
  }
  /** Delete a page without orphaning its alternatives: the first alternative becomes the new root (and active if needed). */
  function removePage(doc, pageId) {
    for (const s of doc.scenes) {
      const i = s.pages.findIndex(q => q.id === pageId); if (i < 0) continue;
      const p = s.pages[i]; const alts = s.pages.filter(q => q.altOf === p.id);
      if (alts.length) { const nr = alts[0]; nr.altOf = ''; for (const a of alts.slice(1)) a.altOf = nr.id; if (isActive(p)) nr.active = true; }
      else if (p.altOf && isActive(p)) { const r = s.pages.find(q => q.id === p.altOf); if (r) r.active = true; }
      s.pages.splice(i, 1);
    }
    return regroup(doc);
  }
  function removeScene(doc, sceneId) {
    const s = doc.scenes.find(x => x.id === sceneId); if (!s) return doc;
    doc.scenes = doc.scenes.filter(x => x !== s);
    if (s.slot && isActive(s)) { const o = doc.scenes.find(x => x.slot === s.slot); if (o) o.active = true; }
    return regroup(doc);
  }
  /** Move a scene's whole board item (its slot with all alternatives) up or down. */
  function moveSceneItem(doc, sceneId, delta) {
    const items = sceneItems(doc); const i = items.findIndex(it => it.scenes.some(s => s.id === sceneId)); const j = i + delta;
    if (i < 0 || j < 0 || j >= items.length) return doc;
    [items[i], items[j]] = [items[j], items[i]]; doc.scenes = items.flatMap(it => it.scenes); return doc;
  }
  /** Current choices in variant form: {slots:{slot:sceneId}, pages:{rootId:pageId}} (only for real groups). */
  function currentChoices(doc) {
    const slots = {}, pages = {};
    for (const it of sceneItems(doc)) if (it.slot && it.scenes.length > 1) slots[it.slot] = (it.scenes.find(isActive) || it.scenes[0]).id;
    for (const s of doc.scenes) for (const it of pageItems(s)) if (it.pages.length > 1) pages[it.root.id] = (it.pages.find(isActive) || it.root).id;
    return { slots, pages };
  }
  function applyVariant(doc, v) {
    if (!v) return doc;
    for (const [slot, sid] of Object.entries(v.slots || {})) if (doc.scenes.some(s => s.slot === slot && s.id === sid)) for (const s of doc.scenes) if (s.slot === slot) s.active = s.id === sid;
    const all = []; for (const s of doc.scenes) all.push(...s.pages);
    for (const [root, pid] of Object.entries(v.pages || {})) if (all.some(p => p.id === pid && (p.id === root || p.altOf === root))) for (const p of all) if (p.id === root || p.altOf === root) p.active = p.id === pid;
    return regroup(doc);
  }
  function withVariant(doc, v) { return applyVariant(JSON.parse(JSON.stringify(doc)), v); }
  function variantMatches(doc, v) {
    if (!v) return false; const c = currentChoices(doc);
    return Object.entries(v.slots || {}).every(([k, x]) => !(k in c.slots) || c.slots[k] === x) && Object.entries(v.pages || {}).every(([k, x]) => !(k in c.pages) || c.pages[k] === x);
  }
  /** One CSV for every variant (first column = variant name). */
  function toCSVAllVariants(doc) {
    const out = [];
    for (const v of doc.variants) { const lines = toCSV(withVariant(doc, v)).trim().split('\n'); if (!out.length) out.push('variant,' + lines[0]); for (const l of lines.slice(1)) out.push(csvCell(v.name) + ',' + l); }
    return out.join('\n') + '\n';
  }
  function csvCell(v) { v = v === undefined || v === null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

  // ---------- v3: importing a Resolve edit (CSV or CMX3600 EDL) ----------
  /** "01:00:03:12" (fps), "1:57", "1:57.5", "117.5" -> seconds */
  function parseTimeAny(v, fps) {
    if (v === undefined || v === null) return null; const s = String(v).trim(); if (!s) return null;
    const m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})[:;.](\d{1,3})$/);
    if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / (fps || 24);
    if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    return parseTime(s);
  }
  /** CMX3600 -> [{n, clip, reel, srcIn, srcOut, recIn, recOut, speed}] (video events; M2 lines set speed; "* FROM CLIP NAME" sets clip) */
  /** v3.1 speed resolution for one edit event. Priority: "* SPEED: xx%" comment, else source/record duration ratio, with M2 as a hint.
   *  M2 is ambiguous: CMX writes a frame rate (012.0 at 24 fps = 50 %), Resolve writes a percentage (050.0 = 50 %). The ratio decides which. */
  function resolveSpeed(e, fps) {
    const src = e.srcOut - e.srcIn, rec = e.recOut - e.recIn; const near = (a, b) => Math.abs(a - b) <= Math.max(0.03, Math.abs(b) * 0.05);
    const ratio = rec > 0.001 && Math.abs(src) > 0.001 ? Math.abs(src) / rec : null;
    const m2 = e.m2 !== undefined ? e.m2 : null; const neg = (m2 !== null && m2 < 0) || (e.comment !== null && e.comment !== undefined && e.comment < 0) || e.revSrc;
    const asPct = m2 !== null ? Math.abs(m2) / 100 : null, asFps = m2 !== null ? Math.abs(m2) / fps : null;
    let m2Kind = '', m2Speed = null;
    if (m2 !== null) {
      const ref = e.comment !== null && e.comment !== undefined ? Math.abs(e.comment) : ratio !== null && !near(ratio, 1) ? ratio : null;
      if (ref !== null) { m2Kind = Math.abs(asPct - ref) <= Math.abs(asFps - ref) ? 'percent' : 'fps'; }
      else m2Kind = near(asFps, 1) && !near(asPct, 1) ? 'fps' : 'percent'; // no cross-check: Resolve style unless M2 equals the timeline fps
      m2Speed = m2Kind === 'percent' ? asPct : asFps;
    }
    let mag, from;
    if (e.comment !== null && e.comment !== undefined) { mag = Math.abs(e.comment); from = 'comment'; }
    else if (ratio !== null && !(near(ratio, 1) && m2Speed !== null && !near(m2Speed, 1))) { mag = ratio; from = 'ratio'; }
    else if (m2Speed !== null) { mag = m2Speed; from = 'm2'; } // ratio 1 with an M2: the source out was not speed-adjusted
    else { mag = ratio !== null ? ratio : 1; from = ratio !== null ? 'ratio' : 'default'; }
    // snap tiny rounding (frame-quantised ratios) to the M2/comment value when they agree
    if (from === 'ratio' && m2Speed !== null && near(mag, m2Speed)) mag = m2Speed;
    mag = Math.round(mag * 1000) / 1000 || 1;
    const vals = { comment: e.comment !== undefined ? e.comment : null, ratio: ratio !== null ? Math.round(ratio * 1000) / 1000 : null, m2: m2Speed !== null ? Math.round(m2Speed * 1000) / 1000 : null };
    const conflicts = Object.entries(vals).filter(([k, v]) => v !== null && !near(Math.abs(v), mag)).map(([k]) => k);
    return { speed: neg ? -mag : mag, from, m2Kind, m2Raw: m2, values: vals, conflict: conflicts.length > 0, conflicts };
  }
  function parseCMX3600(text, fps) {
    fps = fps || 24; const ev = []; let cur = null;
    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.trim(); let m;
      if ((m = line.match(/^(\d{1,6})\s+(\S+)\s+(\S+)\s+(C|D|W\d*|K\S*)\s+(?:(\d+)\s+)?(\d\d:\d\d:\d\d[:;.]\d\d)\s+(\d\d:\d\d:\d\d[:;.]\d\d)\s+(\d\d:\d\d:\d\d[:;.]\d\d)\s+(\d\d:\d\d:\d\d[:;.]\d\d)/))) {
        if (!/^V|^B|^AA\/V/i.test(m[3])) { cur = null; continue; } // video track only
        cur = { n: +m[1], reel: m[2], clip: '', srcIn: parseTimeAny(m[6], fps), srcOut: parseTimeAny(m[7], fps), recIn: parseTimeAny(m[8], fps), recOut: parseTimeAny(m[9], fps), speed: 1 };
        if (m[2] === 'BL' || m[2] === 'BLACK') cur.black = true;
        ev.push(cur); continue;
      }
      if (!cur) continue;
      if ((m = line.match(/^M2\s+\S+\s+(-?\d+(?:\.\d+)?)/))) { cur.m2 = parseFloat(m[1]); continue; }
      if ((m = line.match(/^\*\s*SPEED\s*:?\s*(-?\d+(?:\.\d+)?)\s*%/i))) { cur.comment = parseFloat(m[1]) / 100; continue; }
      if ((m = line.match(/^\*\s*(?:FROM|SOURCE) (?:CLIP NAME|FILE):\s*(.+)$/i))) { if (!cur.clip || /CLIP NAME/i.test(line)) cur.clip = m[1].trim(); continue; }
    }
    return ev.filter(e => !e.black).map(e => {
      if (!e.clip) e.clip = e.reel; e.revSrc = e.srcIn > e.srcOut;
      const lo = Math.min(e.srcIn, e.srcOut), hi = Math.max(e.srcIn, e.srcOut); e.srcIn = lo; e.srcOut = hi;
      const r = resolveSpeed(e, fps); e.speed = r.speed; e.speedInfo = r;
      // source range actually used = in + record duration × |speed| (fixes EDLs whose source out was not speed-adjusted)
      if ((r.from === 'm2' || (r.from === 'comment' && r.conflicts.includes('ratio'))) && e.recOut > e.recIn) e.srcOut = Math.round((e.srcIn + (e.recOut - e.recIn) * Math.abs(r.speed)) * 1000) / 1000;
      return e;
    });
  }
  function parseCSVRows(text) {
    const rows = []; let row = [], cell = '', q = false; const t = String(text).replace(/^\uFEFF/, '');
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
      if (c === '"') q = true; else if (c === ',' || c === ';' || c === '\t') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim()));
  }
  /** Our CSV export or a Resolve/editor CSV (Name / Source In / Source Out / Record In / Record Out / Speed …) -> events */
  function parseEditCSV(text, fps) {
    const rows = parseCSVRows(text); if (rows.length < 2) return [];
    const h = rows[0].map(x => x.trim().toLowerCase().replace(/[^a-z]/g, ''));
    const col = (...names) => h.findIndex(x => names.includes(x));
    const ci = { clip: col('clip', 'clipname', 'name', 'filename', 'file', 'sourcefile', 'reelname', 'reel'), si: col('srcin', 'sourcein', 'sourcestart'), so: col('srcout', 'sourceout', 'sourceend'),
      ri: col('recin', 'recordin', 'recordstart', 'timelinein'), ro: col('recout', 'recordout', 'recordend', 'timelineout'), sp: col('speed', 'speedpercent', 'speedchange'), du: col('duration'), song: col('songin'), songOut: col('songout'), page: col('page'), drive: col('driveid') };
    const spPct = ci.sp >= 0 && /%|percent/i.test(rows[0][ci.sp]); // "Speed %" / "Speed Percent" columns hold 100 = normal
    return rows.slice(1).map((r, k) => {
      const g = (i) => (i >= 0 ? r[i] : undefined);
      let sp = g(ci.sp); let speed = 1; if (sp !== undefined && String(sp).trim()) { const pct = String(sp).match(/(-?\d+(?:\.\d+)?)\s*%/); speed = pct || spPct ? parseFloat(pct ? pct[1] : sp) / 100 || 1 : parseFloat(sp) || 1; }
      const e = { n: k + 1, driveId: ci.drive >= 0 ? String(g(ci.drive) || '').trim() : '', clip: String(g(ci.clip) || '').trim(), srcIn: parseTimeAny(g(ci.si), fps), srcOut: parseTimeAny(g(ci.so), fps), recIn: parseTimeAny(g(ci.ri), fps), recOut: parseTimeAny(g(ci.ro), fps), speed, duration: parseTimeAny(g(ci.du), fps) };
      if (ci.song >= 0 && String(g(ci.song) || '').trim()) e.songIn = parseTimeAny(g(ci.song), fps);
      if (e.recOut === null && e.recIn !== null && e.duration) e.recOut = e.recIn + e.duration;
      if (e.srcIn !== null && e.srcOut !== null && e.srcOut < e.srcIn) [e.srcIn, e.srcOut] = [e.srcOut, e.srcIn];
      return e;
    }).filter(e => e.clip);
  }
  /** Pick the parser by content. */
  function parseEditList(text, fps) { return /^\s*(TITLE:|FCM:|\d{3,6}\s+\S+\s+V)/m.test(text) && /\d\d:\d\d:\d\d[:;]\d\d/.test(text) ? parseCMX3600(text, fps) : parseEditCSV(text, fps); }
  /** Match an edit-list clip name to a folder file by name (case-insensitive, extension optional). files: [{path, name}] */
  /** Match an edit clip name to a file by name (case-insensitive; extension may differ). Several hits: prefer files inside the storyboard folder
   *  (no "../"), then the shallowest path, then exact extension. */
  function matchClip(clip, files) {
    const base = String(clip || '').split(/[\\/]/).pop().trim().toLowerCase(); if (!base) return null;
    const noExt = (x) => x.replace(/\.[a-z0-9]{2,4}$/i, '');
    const rank = (f) => ((f.path || '').startsWith('../') ? 1000 : 0) + (f.path || f.name).split('/').length;
    const pick = (list) => list.length ? list.slice().sort((a, b) => rank(a) - rank(b))[0] : null;
    return pick(files.filter(f => f.name.toLowerCase() === base)) || pick(files.filter(f => noExt(f.name.toLowerCase()) === noExt(base)));
  }
  const MEDIA_RE = /\.(jpe?g|png|webp|gif|avif|bmp|mp4|m4v|mov|webm)$/i;
  /** v3.2: recursive folder walk over a File System Access-style directory handle (anything with async entries() of [name, handle{kind}]).
   *  Skips dot files (incl. macOS ._ files), node_modules and .app bundles. Returns [{path, name, handle}] with "/" paths. */
  async function walkDir(dir, opts, prefix, depth, out) {
    opts = opts || {}; prefix = prefix || ''; depth = depth || 0; out = out || [];
    if (depth > (opts.maxDepth || 8)) return out; const keep = opts.filter || MEDIA_RE;
    for await (const [name0, h] of dir.entries()) {
      const name = String(name0).normalize('NFC');
      if (name.startsWith('.') || name === 'node_modules' || name.endsWith('.app')) continue;
      const path = (prefix ? prefix + '/' : '') + name;
      if (h.kind === 'directory') await walkDir(h, opts, path, depth + 1, out);
      else if (keep.test(name)) out.push({ path, name, handle: h });
    }
    return out;
  }
  /** v3.2: paths from the opened root -> media list relative to the storyboard's folder (base), for matchClip. */
  function folderMediaIndex(paths, base) {
    base = base || ''; const rel = (full) => !base ? full : full.startsWith(base + '/') ? full.slice(base.length + 1) : '../'.repeat(base.split('/').length) + full;
    return paths.map(p => typeof p === 'string' ? p : p.path).filter(p => MEDIA_RE.test(p)).map(p => ({ path: rel(p), name: p.split('/').pop() }));
  }
  /** Plan where each event goes. mode 'pages': by song time (record time − recordStart + offset, or the CSV's songIn) onto active linear pages;
   *  mode 'cuts': all events become the cuts of opts.pageId. Returns {rows:[{ev, media, found, songIn, pageId}], pages:{id:[row…]}} */
  /** All media referenced on the board (pages, cuts, takes; active and inactive). */
  function boardMedia(doc) {
    const out = []; const add = (m) => { if (m && (m.path || m.driveId)) out.push(m); };
    for (const s of doc.scenes) for (const p of s.pages) { add(p.image); add(p.video); for (const c of p.cuts || []) add(c.media); for (const t of p.takes || []) add(t); }
    return out;
  }
  function matchBoard(ev, media) {
    if (ev.driveId) { const m = media.find(x => x.driveId === ev.driveId); if (m) return m; }
    const f = matchClip(ev.clip, media.filter(x => x.path).map(x => ({ path: x.path, name: x.path.split('/').pop(), m: x })));
    return f ? f.m : null;
  }
  /** Plan where each event goes.
   *  mode 'pages': song time = record time − recordStart + offset (or the CSV's songIn). Each event goes to the active, non-cut page that holds most of its
   *  duration; event edges within opts.snapFrames (default 4) frames of a page boundary snap to it first.
   *  mode 'cuts': all events become the cuts of opts.pageId.  opts.onlyBoard: keep only clips that match existing board media (file name or driveId).
   *  Returns {rows, pages:{id:[row…]}, excluded:[row…], overruns:{id:{total,page,over}}, recordStart, offset, fps, snap} */
  function planEditImport(doc, events, opts) {
    opts = opts || {}; const files = opts.files || []; const ad = activeDoc(doc); const fps = opts.fps || doc.fps || 24;
    const snap = (opts.snapFrames === undefined || opts.snapFrames === null ? 4 : opts.snapFrames) / fps;
    const firstRec = events.reduce((a, e) => (e.recIn !== null && e.recIn !== undefined ? Math.min(a, e.recIn) : a), Infinity);
    const recordStart = opts.recordStart !== undefined && opts.recordStart !== null ? opts.recordStart : (firstRec >= 3600 ? 3600 : 0);
    const offset = opts.offset || 0; const bm = boardMedia(doc);
    const targets = []; for (const s of ad.scenes) for (const p of s.pages) { if (p.status === 'cut' || p.pool) continue; const a = parseTime(p.start); if (a === null) continue; let b = parseTime(p.end); if (b === null || b <= a) b = a + pageDuration(p, doc); targets.push({ p, a, b }); }
    const edges = [...new Set(targets.flatMap(t => [t.a, t.b]))];
    const nearestEdge = (x) => { let best = null, bd = snap + 1e-6; for (const e of edges) { const d = Math.abs(e - x); if (d <= bd) { bd = d; best = e; } } return best; };
    // cut / bridged pages with song time: events inside them get a neighbour suggestion
    const holes = []; for (const s of ad.scenes) for (const p of s.pages) { if (p.status !== 'cut') continue; const a = parseTime(p.start), b = parseTime(p.end); if (a !== null && b !== null && b > a) holes.push({ p, a, b }); }
    const reject = new Set((opts.reject || []).map(Number)); const suggest = opts.suggest !== false;
    const ovl = (a, b, t) => Math.min(b, t.b) - Math.max(a, t.a);
    const rows = []; const pages = {}; const excluded = [];
    for (const ev of events) {
      const f = matchClip(ev.clip, files); const onBoard = matchBoard(ev, bm);
      const base = f ? { path: f.path, name: f.name } : onBoard ? { path: onBoard.path, driveId: onBoard.driveId, name: onBoard.name } : { path: ev.clip, driveId: ev.driveId || '', name: ev.clip.split(/[\\/]/).pop() };
      if (f && onBoard && onBoard.driveId && sameClip(onBoard, { path: f.path })) base.driveId = onBoard.driveId;
      const media = normMedia(base) || normMedia({ path: ev.clip || 'clip' });
      if (ev.srcIn !== null && ev.srcIn !== undefined) media.in = Math.round(ev.srcIn * 1000) / 1000;
      if (ev.srcOut !== null && ev.srcOut !== undefined && ev.srcOut > (media.in || 0)) media.out = Math.round(ev.srcOut * 1000) / 1000;
      if (onBoard && onBoard.genSeconds) media.genSeconds = onBoard.genSeconds;
      const v = versionLabel(media.name); if (v) media.version = v;
      const hasRec = ev.recIn !== null && ev.recIn !== undefined;
      const songIn = ev.songIn !== undefined && ev.songIn !== null ? ev.songIn : hasRec ? ev.recIn - recordStart + offset : null;
      const duration = hasRec && ev.recOut !== null && ev.recOut !== undefined ? Math.round((ev.recOut - ev.recIn) * 1000) / 1000 : (ev.duration || null);
      const songOut = songIn !== null && duration ? songIn + duration : null;
      const row = { ev, media, found: !!f, onBoard: !!onBoard, songIn, songOut, pageId: null, duration, speed: ev.speed || 1, speedInfo: ev.speedInfo || null, snapped: { start: 0, end: 0 }, suggestion: null, suggested: false };
      if (opts.onlyBoard && !onBoard) { excluded.push(row); rows.push(Object.assign(row, { excluded: true })); continue; }
      if (opts.mode === 'cuts') row.pageId = opts.pageId || null;
      else if (songIn !== null) {
        // v3.2 snapping: only for alignment and tie-breaks. Events shorter than 2 × snap get at most one edge snapped (the closer one), so they never collapse.
        const a = songIn, b = songOut !== null && songOut > songIn ? songOut : null;
        let ea = nearestEdge(a), eb = b !== null ? nearestEdge(b) : null;
        if (b !== null && ea !== null && eb !== null && (b - a < 2 * snap || eb <= ea)) { if (Math.abs(ea - a) <= Math.abs(eb - b)) eb = null; else ea = null; }
        const a0 = ea !== null ? ea : a, b0 = b === null ? null : eb !== null ? eb : b;
        row.snapped = { start: Math.round((a0 - a) * 1000) / 1000, end: b === null ? 0 : Math.round((b0 - b) * 1000) / 1000 };
        let best = null;
        // v3.3: a "hole event" (most of its duration inside a cut/bridged page) is never majority-assigned; it becomes a nearest-page suggestion
        const holeEv = b !== null && holes.some(h => ovl(a, b, h) > (b - a) / 2 + 1e-6);
        if (b !== null && !holeEv) {
          // majority on the raw, unsnapped times; ties (within half a frame) are broken by the snapped overlap, then the earlier page
          const sc = targets.map(t => ({ t, raw: ovl(a, b, t), sn: ovl(a0, b0, t) })).filter(x => x.raw > 1e-6);
          const top = sc.reduce((m, x) => Math.max(m, x.raw), 0); const tied = sc.filter(x => x.raw >= top - 0.5 / fps);
          if (tied.length) best = tied.reduce((m, x) => (x.sn > m.sn + 1e-6 ? x : m), tied[0]).t;
        }
        if (!best && !holeEv) best = targets.find(t => a + 0.001 >= t.a && a + 0.001 < t.b) || null;
        row.pageId = best ? best.p.id : null;
        if (!row.pageId && targets.length) { // v3.2: inside a cut/bridged page (or outside every page): suggest the nearest neighbour by time
          const e2 = b !== null ? b : a; const mid = (a + e2) / 2;
          const hole = holes.slice().sort((h1, h2) => (b !== null ? ovl(a, e2, h2) - ovl(a, e2, h1) : 0)).find(h => (b !== null ? ovl(a, e2, h) > 1e-6 : a >= h.a && a < h.b)) || holes.find(h => mid >= h.a && mid <= h.b);
          const dist = (t) => (e2 <= t.a ? t.a - e2 : a >= t.b ? a - t.b : 0);
          const nb = targets.reduce((m, t) => (!m || dist(t) < dist(m) - 1e-6 ? t : m), null);
          if (nb) {
            row.suggestion = { pageId: nb.p.id, distance: Math.round(dist(nb) * 1000) / 1000, inside: hole ? hole.p.id : '', bridged: !!(hole && hole.p.bridged) };
            if (hole && suggest && !reject.has(ev.n)) { row.pageId = nb.p.id; row.suggested = true; }
          }
        }
      }
      rows.push(row); if (row.pageId) (pages[row.pageId] = pages[row.pageId] || []).push(row);
    }
    const overruns = {};
    for (const [pid, rs] of Object.entries(pages)) {
      const p = allPages(doc).find(q => q.id === pid); const o = p && cutsOverrun(Object.assign({}, p, { cuts: rs.map(r => ({ duration: r.duration })) }), doc);
      if (o) overruns[pid] = o;
    }
    return { rows, pages, excluded, overruns, recordStart, offset, fps, snap };
  }
  /** Apply a plan. 'pages' mode: one event -> page video with source in/out (+speed); several -> page cuts. 'cuts' mode: events replace the page's cuts. */
  function applyEditPlan(doc, plan, mode, opts) {
    opts = opts || {};
    for (const [pid, rows] of Object.entries(plan.pages)) {
      let p = null; for (const s of doc.scenes) for (const q of s.pages) if (q.id === pid) p = q; if (!p) continue;
      const single = mode !== 'cuts' && rows.length === 1 && plan.overruns && plan.overruns[pid];
      if (single && opts.trimOverruns) { // v3.2: one event longer than the page, trimmed: video out = in + page × |speed|
        const r = rows[0]; const m = Object.assign({}, r.media); const need = pageDuration(p, doc) * Math.abs(r.speed || 1);
        m.out = Math.round(((m.in || 0) + need) * 1000) / 1000; p.video = m; p.cuts = []; p.speed = r.speed !== 1 ? r.speed : (p.speed && p.speed !== 1 ? null : p.speed);
      } else if (single) { // v3.2: keep the real duration as one cut so the overrun shows and can be trimmed / stretched later
        const r = rows[0]; p.cuts = [{ media: r.media, duration: r.duration, speed: r.speed !== 1 ? r.speed : null }];
      } else if (mode !== 'cuts' && rows.length === 1) { const r = rows[0]; p.video = Object.assign({}, p.video && p.video.path === r.media.path ? p.video : {}, r.media); p.cuts = []; p.speed = r.speed !== 1 ? r.speed : (p.speed && p.speed !== 1 ? null : p.speed); }
      else { p.cuts = rows.map(r => ({ media: r.media, duration: r.duration && r.duration > 0 ? r.duration : null, speed: r.speed !== 1 ? r.speed : null })); if (opts.trimOverruns) trimCutsToFit(p, doc); }
    }
    return doc;
  }


  // ---------- v4: storylines, story order, edit view ----------
  /** Storylines to show. No storylines in the file → one implicit storyline (id ''). Pages without a known storyline go to an implicit "Unassigned" one. */
  function storylineList(doc) {
    const list = (doc.storylines || []).slice();
    if (!list.length) return [{ id: '', name: 'Story', color: '#8a8aa0', notes: '', implicit: true }];
    if (allPages(doc).some(p => !list.some(x => x.id === p.storyline))) list.push({ id: '', name: 'Unassigned', color: '#6c6c80', notes: '', implicit: true });
    return list;
  }
  function storylineOf(doc, p) { return p && (doc.storylines || []).some(x => x.id === p.storyline) ? p.storyline : ''; }
  function storylineById(doc, id) { return storylineList(doc).find(x => x.id === (id || '')) || storylineList(doc)[0]; }
  /** A storyline's pages in story order: storyOrder first (pages without one follow), then board order. Same page objects as the board. */
  function storyPages(doc, slId) {
    const all = allPages(doc); const idx = new Map(all.map((p, i) => [p.id, i])); const key = (p) => (p.storyOrder === null || p.storyOrder === undefined ? Infinity : p.storyOrder);
    return all.filter(p => storylineOf(doc, p) === (slId || '')).sort((a, b) => (key(a) - key(b)) || (idx.get(a.id) - idx.get(b.id)));
  }
  /** Rewrite storyOrder 1..n for a storyline from an id list (ids not listed keep their relative order after the listed ones). */
  function setStoryOrder(doc, slId, ids) {
    const pages = storyPages(doc, slId); const by = new Map(pages.map(p => [p.id, p]));
    const ordered = ids.filter(id => by.has(id)).map(id => by.get(id)); for (const p of pages) if (!ordered.includes(p)) ordered.push(p);
    ordered.forEach((p, i) => { p.storyOrder = i + 1; }); return doc;
  }
  /** Move a page into a storyline (at the end of its story order). */
  function setPageStoryline(doc, pageId, slId) {
    const p = allPages(doc).find(q => q.id === pageId); if (!p) return doc;
    if ((p.storyline || '') === (slId || '') && storylineOf(doc, p) === (slId || '')) return doc;
    const max = storyPages(doc, slId).reduce((a, q) => Math.max(a, q.storyOrder || 0), 0);
    p.storyline = slId || ''; p.storyOrder = max + 1; return doc;
  }
  function addStoryline(doc, name, color) {
    doc.storylines = doc.storylines || [];
    const base = 'sl_' + (slug(name) || 'story'); let id = base, k = 2; while (doc.storylines.some(x => x.id === id)) id = base + '_' + k++;
    const sl = normStoryline({ id, name: name || 'Storyline', color }, doc.storylines.length); doc.storylines.push(sl); return sl.id;
  }
  /** Delete a storyline; its pages become unassigned (pages are never deleted). */
  function removeStoryline(doc, id) { doc.storylines = (doc.storylines || []).filter(x => x.id !== id); for (const p of allPages(doc)) if (p.storyline === id) p.storyline = ''; return doc; }
  /** "Used in the edit" (v4): active scene alternative, active page alternative (= the current variant), status not cut, and not in the pool. */
  function usageOf(doc, pageId) {
    for (const s of doc.scenes) for (const p of s.pages) if (p.id === pageId) {
      if (p.pool) return { used: false, reason: 'pool' };
      if (s.active === false) return { used: false, reason: 'inactive scene alternative' };
      if (p.active === false) return { used: false, reason: 'inactive alternative' };
      if (p.status === 'cut') return { used: false, reason: 'cut' };
      return { used: true, reason: '' };
    }
    return { used: false, reason: 'missing' };
  }
  function unusedPages(doc, slId) { return storyPages(doc, slId).map(p => Object.assign({ page: p }, usageOf(doc, p.id))).filter(x => !x.used); }
  /** The woven edit on the song timeline: one block per used page (song start/end; pages without times follow the previous block by duration),
   *  song gaps where no storyline has a shot, and the points where the edit switches storyline. */
  function editTimeline(doc) {
    const ad = activeDoc(doc); const blocks = []; const cover = []; let cursor = null; let order = 0;
    for (const s of ad.scenes) for (const p of s.pages) {
      const a0 = parseTime(p.start), b0 = parseTime(p.end);
      if (p.status === 'cut' || p.pool) { if (p.status === 'cut' && p.bridged && a0 !== null && b0 !== null && b0 > a0) cover.push([a0, b0]); continue; }
      const d = pageDuration(p, doc); const timed = a0 !== null;
      const a = timed ? a0 : (cursor === null ? 0 : cursor); const b = b0 !== null && b0 > a ? b0 : a + d;
      blocks.push({ id: p.id, page: p, sceneId: s.id, storyline: storylineOf(doc, p), start: a, end: b, timed, order: order++ });
      cover.push([a, b]); cursor = b;
    }
    const start = blocks.length ? Math.min(...blocks.map(x => x.start)) : 0, end = blocks.length ? Math.max(...blocks.map(x => x.end)) : 0;
    cover.sort((x, y) => x[0] - y[0]); const gaps = []; let reach = start;
    for (const [a, b] of cover) { if (a - reach > 0.05) gaps.push({ from: reach, to: a, seconds: Math.round((a - reach) * 1000) / 1000 }); reach = Math.max(reach, b); }
    const byTime = blocks.slice().sort((x, y) => x.start - y.start || x.order - y.order); const switches = [];
    for (let i = 1; i < byTime.length; i++) if (byTime[i].storyline !== byTime[i - 1].storyline) switches.push({ at: byTime[i].start, from: byTime[i - 1].storyline, to: byTime[i].storyline, pageId: byTime[i].id });
    const lanes = storylineList(doc).map(x => Object.assign({}, x, { count: blocks.filter(b => b.storyline === x.id).length, seconds: Math.round(blocks.filter(b => b.storyline === x.id).reduce((t, b) => t + (b.end - b.start), 0) * 1000) / 1000 }));
    return { blocks, gaps, switches, lanes, start, end };
  }
  function allPages(doc) { const r = []; for (const s of doc.scenes) for (const p of s.pages) r.push(p); return r; }

  const api = { STORY_COLORS, normStoryline, storylineList, storylineOf, storylineById, storyPages, setStoryOrder, setPageStoryline, addStoryline, removeStoryline, usageOf, unusedPages, editTimeline, walkDir, folderMediaIndex, MEDIA_RE, resolveSpeed, cutsOverrun, trimCutsToFit, stretchPageToCuts, clipGenSeconds, cutWarnings, boardMedia, matchBoard, regroup, activeDoc, activePages, pageLabels, sceneItems, pageItems, setActiveScene, setActivePage, addSceneAlternative, addPageAlternative, removePage, removeScene, moveSceneItem, currentChoices, applyVariant, withVariant, variantMatches, toCSVAllVariants, parseTimeAny, parseCMX3600, parseEditCSV, parseEditList, matchClip, planEditImport, applyEditPlan, lyricsFor, effectiveLook, canonFacts, canonConflicts, promptBlock, usedIn, editRows, toCSV, toEDLText, toCMX3600, tc, TOOLS, toolLabel, toolId, LOOK_FIELDS, normStatus, normCastRefs, castRefOut, normTake, normGen, normCharacter, parseCastList, commentThreads, fmtStamp, ROLES, ROLE_IDS, RETIMES, RETIME_IDS, speedOf, rangeLen, promptSeconds, durationWarning, timeline, parseUpdated, isoLocal, versionLabel, normCut, mediaLine, parseMediaLine, parseRole, parseRetime, FORMAT, VERSION, STATUSES, STATUS_IDS, PAGE_FIELDS, SCENE_COLORS, uid, parseTime, fmtTime, pageDuration, normMedia, normPage, normScene, normalizeDoc, serialize, parseDriveId, slug, matchNumber, parseMirrageText, toMarkdown, allPages, pad2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SB = api;
})(typeof self !== 'undefined' ? self : this);
