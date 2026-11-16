# Storyboard file format v3.2 (for Mirrage)

Storyboard Studio keeps a storyboard in **one plain JSON file** inside the Drive project folder of a video. Lucas edits it in the app; you (Mirrage) read and edit the same file with the Drive connector. There is no database and no hidden state: **the file is the storyboard.**

- File name: `storyboard.json`, or `<Name>.storyboard.json` when a folder holds several versions (e.g. `Bleeding Page SB2.storyboard.json`). The app only recognises names ending in `storyboard.json`.
- Location: the video's own folder. Media paths are relative to **the folder that holds the storyboard file**.
- Encoding: UTF-8 JSON, 2-space indent. Upload with MIME type `application/json` and **do not convert** it to a Google Doc.

> **What's new in v3.2** (no new fields, still `"version": 3`):
> - **Import assignment:** the majority is computed on the raw times; snapping only aligns edges and breaks ties.
> - **Overruns:** single events are checked too.
> - **Snap deltas:** both start and end are shown.
> - **Events inside cut/bridged pages:** a nearest-page suggestion.
> - **Folder matching:** now in `lib.js` (`walkDir`, `folderMediaIndex`, `matchClip`) and tested headless.
>
> **What's new in v3.1** (still `"version": 3`; both new fields are optional):
> - page `bridged: true`: a page with status `cut` whose song time the real edit bridged. The gap check treats its time as covered.
> - media `genSeconds` (mostly on cut media): the generation length of that clip, used by the per-cut source check.
> - **Cut overruns:** flagged when the cuts add up to more than the page, with *trim last cut to fit* and *stretch page*.
> - **Per-cut source checks:** each cut's in + duration × |speed| is checked against its out point and the clip's generation length.
> - **Import fixes:** Resolve's percent `M2` and `* SPEED:` comments are read correctly, events are assigned to the page with the most overlap and snapped to page edges, and there is an "only clips on the board" filter.
>
> **What's new in v3.** Every v3 field is optional. v1 and v2 files stay valid and load unchanged, and nothing was renamed in v3.
>
> - page `genSeconds`: the real length of the generated clip. The ⏱ check now uses it and no longer guesses from the prompt text.
> - **alternatives:** scene `slot` / `altLabel` / `active` and page `altOf` / `altLabel` / `active`
> - top-level `variants` and `activeVariant`: named sets of active alternatives, e.g. "Director's cut"
> - media with only a `driveId` (no `path`) is valid and shown as **online only**
> - documented: pages with status `cut` leave a song-time gap
> - the app can import a Resolve cut list (CSV or CMX3600 EDL) onto pages or into a page's cuts
>
> **Migrating v2 → v3:** there is nothing to do. The app writes `"version": 3` on its next save. If you keep writing a v2-shaped file, that is fine too; just don't drop the v3 fields that are already there (see *Rules*, 9).
>
> **What's new in v2.** Every v2 field is optional, and v1 files stay valid: the app reads them unchanged.
>
> **Round 1:**
> - `revision`
> - page `speed` / `retime` / `effect` / `role` / `cuts`
> - media `in` / `out`, plus the drift fields `md5`, `modifiedTime` and `version`
> - comment `replyTo`
>
> **Round 2:**
> - one merged `status` list
> - page `videoPrompt`, `negativePrompt` and the `…Tool` fields
> - page `lyrics`, `mood`, `takes` and `genLog`
> - a character system (`canon`, `refSets`, `looks`) with looks on pages and scenes
> - top-level `songLyrics` and `fps`
>
> Two fields were renamed. The app still **reads** the v1 names `lyric` and `clipPrompt` but **writes** `lyrics` and `videoPrompt`. If a page has both, the v2 name wins.

## Structure

```
storyboard
├─ header (format, version, revision, title, audio, characters, songLyrics …)
└─ scenes[]            ← ordered; the order IS the running order
   └─ pages[]          ← ordered; one page = one storyboard frame / shot
```

Page numbers are **not stored**. "Page 7" means the 7th **active** page counting through all scenes in order (v3: inactive alternatives are skipped and shown as `7·alt`). To keep a stable reference, use the page `id` (it never changes) or the optional `code` field.

## Header fields

| field | type | meaning |
|---|---|---|
| `format` | `"storyboard-studio"` | always this value |
| `version` | `3` | schema version (v1 and v2 files load fine; the app writes 3) |
| `revision` | integer | **save counter.** Every save adds 1 (see *Rules: revision*). Missing = 0. |
| `title`, `project` | string | names |
| `updated` | ISO date-time | when it was saved. Both `"2026-11-16T18:47:54Z"` and `"2026-11-16T19:47:54+01:00"` are valid; the app writes local time with an offset. |
| `updatedBy` | string | `"Mirrage"`, `"Lucas (app)"` |
| `aspect` | `"16:9"`, `"9:16"`, … | frame shape |
| `defaultDuration` | number (s) | duration for pages without timing (default 3) |
| `driveFolderId` | string | Drive ID of the project folder (reference only) |
| `audio` | media object | the song, which Play mode plays under the animatic |
| `audioOffset` | number (s) | song time where page 1 starts (default 0) |
| `fps` | number | frame rate for the EDL export (default 24) |
| `characters` | array | the cast. See *Characters* below. v1 form `{id, name, color}` still works. |
| `songLyrics` | array | `[{ "t": 37, "text": "First line" }, …]`. `t` is song seconds (a `"0:37"` string is accepted too). Pages with empty `lyrics` show the lines that fall between their `start` and `end`. |
| `notes` | string | general notes |
| `variants` | array | **v3** named sets of active alternatives: `[{ "id", "name", "slots": { slotId: sceneId }, "pages": { rootPageId: pageId } }]`. See *Alternatives and variants*. |
| `activeVariant` | string | **v3** id of the variant last applied (an unknown id is cleared) |
| `scenes` | array | see below |

## Scene

| field | type | meaning |
|---|---|---|
| `id` | string | unique, never reuse |
| `title`, `notes` | string | |
| `color` | `#rrggbb` | scene colour |
| `collapsed` | boolean | UI only |
| `characters` | array | **v2** default looks for this scene: same shape as page `characters` (below) |
| `slot` | string | **v3** scenes with the same `slot` are **alternatives** for one spot in the video. Missing = a normal scene. |
| `altLabel` | string | **v3** tab label, e.g. `"A rooftop"` / `"B studio"` |
| `active` | boolean | **v3** exactly one scene per slot is active. Missing = `true`; the app writes it only when it is `false`. |
| `pages` | array | the pages, in order |

## Page

| field | type | meaning |
|---|---|---|
| `id` | string | unique, never reuse. Make one up for new pages. |
| `code` | string | your label, e.g. the old page number `"03"`. Auto-link matches media numbers to it. |
| `title` | string | short title |
| `start`, `end` | `"m:ss"` | **song** time, e.g. `"1:57"` and `"2:03"` (decimals are fine: `"0:37.5"`) |
| `duration` | number (s) | screen time. If it is missing: `end − start`, else the sum of the `cuts` durations, else the video's (`out − in`) ÷ \|speed\|, else `defaultDuration`. |
| `status` | see *Status* | progress. `cut` pages are skipped in Play, the runtime **and the song-time checks**, so their song time shows as a gap unless another page covers it (see *Song time checks*). |
| `role` | `"linear"` · `"insert"` · `"flashForward"` · `"flashBack"` | **v2.** Missing = linear. Linear pages follow the song; the others may sit anywhere in song time. Shown as a badge on the card. |
| `speed` | number | **v2.** 1 = normal, `0.4` = 40 % slow motion, `2` = double, **negative = reverse** (`-1`). Missing or 0 = 1. |
| `retime` | `"frame"` · `"blend"` · `"opticalFlow"` · `"speedWarp"` | **v2.** How to retime in Resolve. It is a label: the preview only changes the playback speed. |
| `effect` | string | **v2.** Free text, e.g. `"flicker"` or `"strobe"`. Play mode previews flicker/strobe. |
| `lyrics` | string | lyric or dialogue (v1: `lyric`). When it is empty, the app shows the matching `songLyrics` lines in italics. |
| `description` | string | what we see |
| `camera`, `mood` | string | shot and movement; **v2** `mood` |
| `characters` | array | `"saisha"` or **v2** `{ "charId": "saisha", "lookId": "night-tram", "overrides": { "props": "paper ticket" } }` |
| `imagePrompt` + `imageTool` | string | still-image prompt and the tool it is for |
| `videoPrompt` + `videoTool` | string | **v2** image-to-video prompt (v1: `clipPrompt`). **v3:** the text is no longer parsed for a length; use `genSeconds`. |
| `genSeconds` | number (s) | **v3** the length of the generated clip (e.g. `6`). ⏱ warns only when it is too short for the page (see *Song time checks*). |
| `bridged` | boolean | **v3.1** only for `status: "cut"`: the real edit bridged this page's song time (e.g. the neighbours were extended), so the gap check treats `start`–`end` as covered. It still adds no screen time. Written only when `true`. |
| `altOf` | string | **v3** id of the page this one is an **alternative shot** of (always the root page, in the same scene). |
| `altLabel` | string | **v3** tab label, e.g. `"A"`, `"B close-up"` |
| `active` | boolean | **v3** exactly one page of a root + its alternatives is active. Missing = `true`; written only when `false`. |
| `negativePrompt` + `negativeTool` | string | **v2** |
| `notes`, `flag` | string | notes, plus something Lucas must OK (shown in red) |
| `image`, `video` | media object | the frame and the clip. When a take is picked, it is written here. |
| `cuts` | array | **v2** fast-cut / flicker burst (below) |
| `takes` | array | **v2** all renders (below) |
| `genLog` | array | **v2** generation log (below) |
| `comments` | array | `{ "id", "by", "at", "text", "done", "replyTo" }`. **v2** `replyTo` = the id of the comment being answered (shown threaded). |

**Tools.** Known ids are `midjourney`, `nanoBanana`, `imagine` (Grok Imagine), `seedance`, `wan` and `kling`. Any other text is allowed too.

### Status (v2: one list)

`idea` → `prompted` → `rendered` → `picked` → `inEdit` → `final`, plus `cut`.

| v1 value | becomes |
|---|---|
| `idea` | `idea` |
| `image` (image done) | `rendered` |
| `animated` (clip attached) | `picked` |
| `final`, `cut` | unchanged |

The app also accepts `in-edit`/`inedit` → `inEdit` and `done` → `final`. Unknown values become `idea`. Attaching an image moves a page up to `rendered`, attaching a clip or picking a take moves it up to `picked`, and pages never move down by themselves.

### Media object (images, videos, the song, cuts, takes, refs)

```json
{ "path": "bp-sb2-clips/SB2_03_v2.mp4", "driveId": "1znJy…", "name": "SB2_03_v2.mp4",
  "in": 0.5, "out": 3.5, "version": "v2", "md5": "5d41…", "modifiedTime": "2026-11-16T15:31:07Z" }
```

| field | meaning |
|---|---|
| `path` | relative to the storyboard file's folder, with `/` separators (`../` goes up) |
| `driveId` | Drive file ID (online thumbnails and the ↗ Drive link) |
| `name`, `url` | display name; optional web URL (or a `data:` URL for a small dropped image) |
| `in`, `out` | **v2** seconds **inside the clip** (the source range). They are separate from the page's song `start`/`end`. Play mode plays only this range. `out` must be greater than `in`. |
| `genSeconds` | **v3.1** generation length of this clip in seconds (optional). Mainly for cut media; for the page's own clip use the page's `genSeconds`. |
| `version` | **v2** label like `"v2"`. Auto-link and the pickers fill it from a `_v2` suffix. |
| `md5`, `modifiedTime` | **v2** drift check: copy them from the Drive file metadata. The editor shows them, so you can both see whether the linked file changed. |

Always fill in both `path` and `driveId` when you know them.

**v3: online only.** A media object with a `driveId` but no `path` (and no `url`) is valid. The app shows it as **☁ online only**: the Drive thumbnail plus the ↗ Drive button, never as an error or a missing file. It can't play inside the app or be part of a local folder; add `path` once the file is in the project folder.

### Cuts (fast-cut / flicker bursts)

```json
"cuts": [
  { "media": { "path": "clips/SB2_01_v2.mp4", "in": 0, "out": 0.25 }, "duration": 0.08 },
  { "media": { "path": "Stills fixed/bp_17.jpg" }, "duration": 0.08 },
  { "media": { "path": "clips/SB2_03_v2.mp4", "in": 1, "out": 2 }, "duration": 0.5, "speed": -1 }
]
```

- **Play order.** Play mode plays the cuts in order within the page length and loops them if they are shorter than the page.
- **Missing values.** A cut without `duration` gets an equal share of the page. A cut without `speed` uses the page `speed`.
- **Overrun (v3.1).** When every cut has a `duration`, the page has its own length (`duration` or `start`/`end`) and the durations add up to more than that page (e.g. 4.208 s of cuts on a 4 s page), the card shows `✂ +0.208s over`. The drawer offers **trim last cut to fit** (shortens the last cut, removing cuts that would drop under 0.04 s) and **stretch page** (sets `duration` to the total; `start`/`end` stay). Exports and Play cut at the page length either way.
- **Source check (v3.1).** For each video cut: `in + duration × |speed|` must not pass `media.out`. With a known generation length it must not pass that either, and `out` must not be past it. The generation length is `media.genSeconds`, else the `genSeconds` of a page whose `video` is the same clip (same `driveId` or file name). Stills are skipped. The card shows `⏱ cut source` and the drawer marks the cut.

### Takes and the generation log

```json
"takes": [
  { "path": "clips/SB2_03_v1.mp4", "driveId": "…", "version": "v1", "tool": "wan", "note": "too dark" },
  { "path": "clips/SB2_03_v2.mp4", "driveId": "…", "version": "v2", "tool": "kling", "note": "", "pick": true }
],
"genLog": [
  { "tool": "kling", "model": "2.1 Master", "resolution": "1080p", "seconds": 6, "credits": 35,
    "approvedBy": "Lucas", "approvedAt": "2026-11-16T15:30:00+01:00", "quote": "v2 is the one" }
]
```

A take is a media object plus `tool`, `note` and `pick`. **The picked take is the page's main media**: when Lucas picks one, the app copies it into `video` (for a video file) or `image`. If you pick a take, please do the same. The drawer can compare two takes side by side or as an A/B toggle.

## Characters

```json
"characters": [{
  "id": "steeve", "name": "Steeve", "color": "#6aa8ff",
  "canon": "Ring-and-roots temple tattoo and neck glyph on his OWN RIGHT side only; left side bare.",
  "refSets": [{ "id": "steeve-main", "label": "Steeve stage refs", "images": [{ "path": "refs/steeve-front.jpg", "driveId": "…" }],
                "allowedTools": ["midjourney"], "publicOnly": true }],
  "looks": [{ "id": "stage", "label": "Stage", "age": "", "hair": "", "outfit": "black shirt, rolled sleeves", "makeup": "",
              "props": "bass guitar", "refSetId": "steeve-main", "notes": "" }],
  "defaultLookId": "stage"
}]
```

- **`canon`**: locked notes. The app shows them with a 🔒 and warns when a look or override contradicts them. The check is a simple keyword test: eye colour, hair colour, tattoo or scar side (left/right) and barefoot versus shoes. Clauses with "no", "bare" or "without" are ignored.
- **`refSets`**: reference images. `allowedTools` (empty = any) and `publicOnly` (public-safe refs only) are used by **copy prompt block**, which leaves out refs that aren't cleared for the chosen tool.
- **`looks`**: `age`, `hair`, `outfit`, `makeup`, `props`, `notes` and `refSetId`.
- **Which look a page uses:** the **page** `lookId` beats the **scene** `lookId`, which beats the character's `defaultLookId` (or the first look). `overrides` merge the scene's first, then the page's on top. An override may also set `refSetId`.
- **Writing character refs:** write a plain id when there is no look or override (`"steeve"`), and the object form otherwise. The app writes it the same way.


## Alternatives and variants (v3)

**Scene alternatives.** Scenes that share a `slot` are alternatives for the same spot in the video. Give each an `altLabel` and set `"active": false` on all but one. On the board a slot is one group with tabs (`A rooftop / B studio`); clicking a tab makes that scene the active one and shows the runtime difference.

```json
{ "id": "s_end",   "title": "Ending – sunrise", "slot": "slot_end", "altLabel": "A Desert sunrise", "pages": [ … ] },
{ "id": "s_end_b", "title": "Ending – rooftop", "slot": "slot_end", "altLabel": "B Rooftop", "active": false, "pages": [ … ] }
```

**Page alternatives.** A page with `altOf` is an alternative shot of the root page. Keep it **right after the root** (and its other alternatives) in the same scene.

```json
{ "id": "p_09",  "altLabel": "A", "title": "Post-credits", … },
{ "id": "p_09b", "altOf": "p_09", "altLabel": "B", "active": false, "title": "Post-credits (hat stays)", … }
```

**Only active alternatives count.** That covers Play, runtime, gap checks, page numbers, the CSV/EDL/text exports, Markdown export, script view and Auto-link. Print asks whether to include the alternatives. A page inside an inactive scene is inactive too.

**Inactive alternatives** keep their ids, comments and takes. They appear dimmed and are **never deleted** by switching.

**Normalising on load.** When the file loads (and after every edit), the app:
- moves the scenes of one slot next to each other, at the first one's position;
- makes sure there is exactly one active scene per slot (the first one if none or several are active), and that scenes without a slot are active;
- resolves `altOf` chains to the root, clears an `altOf` that points nowhere, moves each alternative right after its root (into the root's scene if needed), and keeps exactly one active per group.

**Variants** are named sets of choices:

```json
"activeVariant": "v_album",
"variants": [
  { "id": "v_album",    "name": "Album cut",      "slots": { "slot_end": "s_end" },   "pages": { "p_09": "p_09" } },
  { "id": "v_director", "name": "Director's cut", "slots": { "slot_end": "s_end_b" }, "pages": { "p_09": "p_09b" } }
]
```

- **Where the choices go.** `slots` maps a slot id to the scene that should be active. `pages` maps a **root** page id to the page that should be active (the root itself or one of its alternatives).
- **Applying a variant** sets those `active` flags, and only those. Slots and groups it doesn't mention stay as they are, and unknown ids are ignored.
- **The `active` flags are the truth.** `activeVariant` only records which variant was applied last. When the flags no longer match it, the app shows "(changed)".
- **In the app:** the toolbar picker switches variants. ⇄ Variants… can save the current choices as a new variant, update, rename, delete, and export the CSV/EDL of one variant, or **all variants** at once (one CSV with a `variant` column plus one EDL per variant).

**Creating alternatives.** In the app, **⇄ Alt** on a scene and **⇄ Alternative** on a page duplicate it as an inactive alternative: new ids, comments cleared, label `B…`. When you do this by hand, do the same: copy, give every scene and page a new id, set `slot`/`altOf`, set `"active": false`, and add an `altLabel`.

**Drag and drop.** Moving a slot moves all its alternatives, and moving a page moves its whole alternative stack.

## Importing a Resolve edit (v3)

☰ → **Import cut list (CSV / EDL)…**, or **Cuts tab → Import cuts…**, takes a CMX3600 EDL or a CSV and **shows a preview before anything changes**. One undo reverts it.

- **EDL:** video events only (audio and `BL` black events are skipped). `* FROM CLIP NAME:` gives the clip.
- **Speed (v3.1), in this order:**
  1. a `* SPEED: 50%` comment (negative = reverse);
  2. otherwise **source duration ÷ record duration**;
  3. `M2` only as a hint.

  `M2` is ambiguous. Resolve writes a **percentage** (`M2 AX 050.0` = 50 %, `040.0` = 40 %), while classic CMX writes a **frame rate** (`012.0` at 24 fps = 50 %). The app picks whichever reading matches the comment or the ratio. Without either it assumes Resolve's percentage, unless the value equals the timeline fps.
  - When the ratio is exactly 1 but `M2` says otherwise, the source out was not speed-adjusted: `M2` is used and the source out becomes in + record duration × speed. The same happens when a comment wins over a disagreeing ratio.
  - Reverse (negative `M2`, a negative comment, or source in after source out) is kept as a negative `speed`.
  - The preview shows every speed as a percentage and highlights it with ⚠ when the comment, ratio and M2 disagree; hover to see each value.
  - Our own EDL export writes `* SPEED:` too, so it round-trips.
- **CSV:** our own export, or a Resolve-style list with *Name/Clip, Source In, Source Out, Record In, Record Out, Speed (%), Duration*. Timecodes (`hh:mm:ss:ff`), `m:ss` and seconds all work.
- **Clip matching:** by **file name** against the media in the open folder (case-insensitive; the extension may differ, e.g. `.mov` → `.mp4`). Unmatched clips keep the clip name as their `path`.
- **Only clips on the board (v3.1, option):** keeps only events whose clip matches media already on the board, in any page, cut or take, by file name or Drive ID. The excluded events (e.g. `CO_`, `BP_`, `STILL_` clips) are counted by prefix and listed. Folder matching searches all subfolders of the opened folder (dot and `._` files skipped). When the same name exists more than once, files inside the storyboard's folder win, then the shallowest path.
- **Mode "pages by song time":** record time minus the record start (01:00:00:00 when the edit starts there, else 0), plus the song offset you enter, gives the song time. **Assignment (v3.2):**
  - **Majority.** Each event goes to the active, non-`cut` page that holds **most of its unsnapped duration**. Example: a 5-frame tail 2:51:21–2:52:02 with 3 frames on page 16 lands on page 16.
  - **Snapping.** Edges within the **snap** tolerance of a page boundary (default 4 frames, adjustable) are aligned to it. This is used only to break ties (within half a frame), e.g. an event 3 frames before and 3 after a boundary goes to the page it snaps into; after that, the earlier page wins. An event shorter than 2 × snap gets at most one edge snapped (the nearer one), so no event ever collapses to zero length.
  - **Preview marks.** The preview shows both snap deltas (`⇥in +3f out −2f`; the plan keeps them as `snapped: {start, end}` in seconds).
  - **Overruns.** The preview flags every page whose events add up to more than the page, **including a page with a single event**. On apply, an overrunning single event is stored as **one cut** with its real duration, so the card shows the overrun and the drawer can trim or stretch it. With *trim last cut to fit* ticked, it becomes the page video with `out = in + page length × |speed|`.
  - **Inside cut pages.** An event that falls inside the song time of a `cut` (or bridged) page has no page of its own. The preview **suggests the nearest page by time** (ticked by default). Untick it per row, or switch suggestions off, to leave the event unassigned. A page that gets one event: `video` with `in`/`out` and `speed` are set. A page that gets several: they become its `cuts`.
- **Mode "into the selected page's cuts":** all events replace that page's `cuts`, with per-cut `duration` and `speed`.

## Rules for editing safely

1. **Revision: re-read, compare, then write.** Right before you write:
   1. Download the file again.
   2. Compare its `revision` with the one you started from.
   3. **Same:** apply your change, set `revision` to that number **+ 1**, set `updated` (ISO, with `Z` or `+01:00`) and set `updatedBy: "Mirrage"`. Then write the whole file back.
   4. **Changed:** someone saved in between. **Merge** (re-apply only your own changes onto the fresh copy, then do step 3 with the new number) or **abort** and tell Lucas.

   Never write a lower or equal revision over a higher one. The app does the same thing: before each save it re-reads the file and, if the revision (or the content) changed, offers *Load their version / Save mine as a copy / Overwrite with mine*. Overwriting writes max(disk, own) + 1.
2. Keep every existing `id`. New scenes and pages need new unique ids.
3. **Reorder** by moving page objects within or between `pages` arrays, and scenes within `scenes`.
4. **Replace an image or clip** by changing `path`/`driveId` (and `version`, `md5`, `modifiedTime`). Don't delete files from Drive; Lucas decides.
5. Talk to Lucas with `comments` (`by: "Mirrage"`). To answer a comment, add a new one with `replyTo` set to its id. Put "needs Lucas OK" items in `flag`.
6. Keep the file valid JSON. If the app can't parse it, it refuses to open it and changes nothing.
7. Leave out fields you don't use. Unknown extra fields on a page are dropped when Lucas saves, so put free-form things in `notes`.
8. **Markdown.** ☰ → *Import Mirrage text* and *Export Markdown* also carry the v2 page fields:
   - lines: `**Role:**`, `**Speed:**` (number or `40%`), `**Retime:**`, `**Effect:**`, `**Mood:**`
   - prompts: `**IMAGE PROMPT (Midjourney):**`, `**VIDEO PROMPT (Kling):**`, `**NEGATIVE PROMPT:**`
   - media lines: `**Image:**` / `**Video:**` written as `path · in 0.5 · out 3.5 · v2 · Drive <id>`
   - lists: `**Cuts:**` and `**Takes:**` as `- …` lines (takes: `· tool kling · picked · note: …`)
   - characters with looks: `Characters: Saisha [night-tram]`

   The generation log, `songLyrics` and the cast definitions are exported for reading only; they come back through the JSON, not the Markdown. **v3:** `**Gen seconds:** 6` round-trips. Markdown export contains only active alternatives (with a note saying how many pages it left out), so edit alternatives in the JSON.
9. **v3 alternatives:** never delete an inactive alternative unless Lucas asks. To switch, flip `active` (one per slot or group). Keep slot members next to each other and alternatives right after their root page. Keep `variants` entries pointing at existing ids. When you can't keep the v3 fields, leave the file alone and add a comment instead.

## Song time checks (what the ⚠ means)

- **Gap:** between two consecutive *linear* pages (that have `start`/`end`), song time that no page covers, e.g. `2:07 → 2:12`. Insert or flash pages placed between them count towards filling it. Flash-forwards and flashbacks elsewhere are never gaps. The header shows the gap count, the **total screen time** and the **song span**.
- **Status `cut`:** these pages are ignored in the runtime and in the gap checks, so the song time they had shows as a **gap** unless another page covers it. That is deliberate: cutting a page opens a hole you need to fill (or close by moving the neighbours' times). **v3.1:** when the real edit bridged it, set `"bridged": true` on the cut page; its own `start`–`end` then counts as covered (no screen time is added). Only its own time is covered, so any gap beyond it still shows.
- **Inactive alternatives** are ignored too; only the active scene of a slot and the active page of a group count.
- **✂ Cut overrun / ⏱ cut source (v3.1):** see *Cuts*.
- **⏱ Generation too short (v3):** only when `genSeconds` is set and the page has no `cuts`. The clip needs `page duration × |speed|` seconds of source starting at `video.in` (default 0) and ending at `video.out` or the end of the generation. It warns when that is longer than what the generation has, or when `video.out` is past `genSeconds`. A generation **longer** than the page is normal (a 6 s clip trimmed to 2 s) and never warns. Without `genSeconds` there is no ⏱ warning; v1/v2 guessed from "(6 s, …)" in the prompt, which caused false warnings.

## Exports for DaVinci Resolve

☰ → **Export edit list CSV**, **Export EDL (CMX3600)** and **Export edit list (text)**.

- **Active alternatives only.** The current choices are used; ⇄ Variants… exports per variant or all variants.
- **What's in it:** one row/event per page, or per cut for cut bursts, with: page, code, role, song in/out, clip path, source in/out, speed, duration and record in/out.
- **EDL details:** the EDL uses reel `AX` with `* FROM CLIP NAME:` comments so Resolve can relink by file name. Speed changes become `M2` lines (negative = reverse). Record time starts at 01:00:00:00 at `fps` (default 24).

## Minimal v3 example

```json
{
  "format": "storyboard-studio",
  "version": 3,
  "revision": 12,
  "title": "Zeppelin Day – Storyline D",
  "updated": "2026-11-16T19:47:54+01:00",
  "updatedBy": "Mirrage",
  "aspect": "16:9",
  "songLyrics": [ { "t": 0, "text": "(intro)" }, { "t": 6, "text": "Up where the engines hum" } ],
  "characters": [ { "id": "saisha", "name": "Saisha", "canon": "Light hazel eyes. Caramel hair, short light fringe. Barefoot. Linen.",
                    "looks": [ { "id": "linen-day", "label": "Linen day", "outfit": "off-white linen dress" } ] } ],
  "scenes": [ { "id": "s_arrival", "title": "Arrival", "pages": [ {
    "id": "p_zd_01", "code": "01", "start": "0:00", "end": "0:06", "status": "picked", "role": "linear",
    "speed": 0.5, "retime": "opticalFlow", "mood": "awe",
    "characters": [ { "charId": "saisha", "lookId": "linen-day" } ],
    "imagePrompt": "…", "imageTool": "midjourney", "videoPrompt": "(6 s, image-to-video) …", "videoTool": "kling", "genSeconds": 6,
    "video": { "path": "Imagine clips/zd_01_v2.mp4", "driveId": "1XyZ…", "in": 0.5, "out": 3.5, "version": "v2" },
    "takes": [ { "path": "Imagine clips/zd_01_v2.mp4", "driveId": "1XyZ…", "version": "v2", "tool": "kling", "pick": true } ],
    "comments": [ { "id": "c_1", "by": "Mirrage", "at": "2026-11-16T18:00:00Z", "text": "Day or dusk?" },
                  { "id": "c_2", "by": "Lucas", "at": "2026-11-16T19:02:00+01:00", "text": "Dusk.", "replyTo": "c_1" } ]
  } ] },
  { "id": "s_end",   "title": "Ending – sunrise", "slot": "slot_end", "altLabel": "A Sunrise", "pages": [ { "id": "p_zd_09", "start": "0:06", "end": "0:10" } ] },
  { "id": "s_end_b", "title": "Ending – studio",  "slot": "slot_end", "altLabel": "B Studio", "active": false,
    "pages": [ { "id": "p_zd_09s", "start": "0:06", "end": "0:09", "image": { "driveId": "1OnlineOnlyId…" } } ] } ],
  "activeVariant": "v_album",
  "variants": [ { "id": "v_album", "name": "Album cut", "slots": { "slot_end": "s_end" }, "pages": {} },
                { "id": "v_dir", "name": "Director's cut", "slots": { "slot_end": "s_end_b" }, "pages": {} } ]
}
```

(The app writes `activeVariant`/`variants` near the top of the file; the order of keys doesn't matter.)

## How Lucas uses the file

- **Chrome on his Mac, with the folder opened through Google Drive for desktop:** live editing. His saves reach the file within about 2 s, and your changes appear on his board within about 5 s. When both of you change it, the revision check offers him: load yours, save his as a copy (`… (Lucas yyyy-mm-dd-hh-mm).storyboard.json`), or overwrite.
- **Downloaded folder:** he edits a local copy and uploads it later. The revision tells you whether his copy is older than yours.
- **Safari or iPhone:** read-only. Save downloads the file.
