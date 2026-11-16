# Storyboard file format v2 (for Mirrage)

Storyboard Studio keeps a storyboard in **one plain JSON file** inside the Drive project folder of a video. Lucas edits it in the app; you (Mirrage) read and edit the same file with the Drive connector. There is no database and no hidden state: **the file is the storyboard.**

- File name: `storyboard.json`, or `<Name>.storyboard.json` when a folder holds several versions (e.g. `Bleeding Page SB2.storyboard.json`). The app only recognises names ending in `storyboard.json`.
- Location: the video's own folder. Media paths are relative to **the folder that holds the storyboard file**.
- Encoding: UTF-8 JSON, 2-space indent. Upload with MIME type `application/json` and **do not convert** it to a Google Doc.

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

Page numbers are **not stored**. "Page 7" means the 7th page counting through all scenes in order. To keep a stable reference, use the page `id` (it never changes) or the optional `code` field.

## Header fields

| field | type | meaning |
|---|---|---|
| `format` | `"storyboard-studio"` | always this value |
| `version` | `2` | schema version (v1 files load fine; the app writes 2) |
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
| `scenes` | array | see below |

## Scene

| field | type | meaning |
|---|---|---|
| `id` | string | unique, never reuse |
| `title`, `notes` | string | |
| `color` | `#rrggbb` | scene colour |
| `collapsed` | boolean | UI only |
| `characters` | array | **v2** default looks for this scene: same shape as page `characters` (below) |
| `pages` | array | the pages, in order |

## Page

| field | type | meaning |
|---|---|---|
| `id` | string | unique, never reuse. Make one up for new pages. |
| `code` | string | your label, e.g. the old page number `"03"`. Auto-link matches media numbers to it. |
| `title` | string | short title |
| `start`, `end` | `"m:ss"` | **song** time, e.g. `"1:57"` and `"2:03"` (decimals are fine: `"0:37.5"`) |
| `duration` | number (s) | screen time. If it is missing: `end − start`, else the sum of the `cuts` durations, else the video's (`out − in`) ÷ \|speed\|, else `defaultDuration`. |
| `status` | see *Status* | progress. `cut` pages are skipped in Play and in totals. |
| `role` | `"linear"` · `"insert"` · `"flashForward"` · `"flashBack"` | **v2.** Missing = linear. Linear pages follow the song; the others may sit anywhere in song time. Shown as a badge on the card. |
| `speed` | number | **v2.** 1 = normal, `0.4` = 40 % slow motion, `2` = double, **negative = reverse** (`-1`). Missing or 0 = 1. |
| `retime` | `"frame"` · `"blend"` · `"opticalFlow"` · `"speedWarp"` | **v2.** How to retime in Resolve. It is a label: the preview only changes the playback speed. |
| `effect` | string | **v2.** Free text, e.g. `"flicker"` or `"strobe"`. Play mode previews flicker/strobe. |
| `lyrics` | string | lyric or dialogue (v1: `lyric`). When it is empty, the app shows the matching `songLyrics` lines in italics. |
| `description` | string | what we see |
| `camera`, `mood` | string | shot and movement; **v2** `mood` |
| `characters` | array | `"saisha"` or **v2** `{ "charId": "saisha", "lookId": "night-tram", "overrides": { "props": "paper ticket" } }` |
| `imagePrompt` + `imageTool` | string | still-image prompt and the tool it is for |
| `videoPrompt` + `videoTool` | string | **v2** image-to-video prompt (v1: `clipPrompt`). A leading `(6 s, …)` is compared with the page length, and a mismatch shows ⏱. |
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
| `version` | **v2** label like `"v2"`. Auto-link and the pickers fill it from a `_v2` suffix. |
| `md5`, `modifiedTime` | **v2** drift check: copy them from the Drive file metadata. The editor shows them, so you can both see whether the linked file changed. |

Always fill in both `path` and `driveId` when you know them.

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

   The generation log, `songLyrics` and the cast definitions are exported for reading only; they come back through the JSON, not the Markdown.

## Song time checks (what the ⚠ means)

- **Gap:** between two consecutive *linear* pages (that have `start`/`end`), song time that no page covers, e.g. `2:07 → 2:12`. Insert or flash pages placed between them count towards filling it. Flash-forwards and flashbacks elsewhere are never gaps. The header shows the gap count, the **total screen time** and the **song span**.
- **⏱ Prompt length:** the `videoPrompt` says e.g. `(6 s, …)` but the page lasts 2 s. Lengthen the page, retime it, or fix the prompt.

## Exports for DaVinci Resolve

☰ → **Export edit list CSV**, **Export EDL (CMX3600)** and **Export edit list (text)**.

- **What's in it:** one row/event per page, or per cut for cut bursts, with: page, code, role, song in/out, clip path, source in/out, speed, duration and record in/out.
- **EDL details:** the EDL uses reel `AX` with `* FROM CLIP NAME:` comments so Resolve can relink by file name. Speed changes become `M2` lines (negative = reverse). Record time starts at 01:00:00:00 at `fps` (default 24).

## Minimal v2 example

```json
{
  "format": "storyboard-studio",
  "version": 2,
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
    "imagePrompt": "…", "imageTool": "midjourney", "videoPrompt": "(6 s, image-to-video) …", "videoTool": "kling",
    "video": { "path": "Imagine clips/zd_01_v2.mp4", "driveId": "1XyZ…", "in": 0.5, "out": 3.5, "version": "v2" },
    "takes": [ { "path": "Imagine clips/zd_01_v2.mp4", "driveId": "1XyZ…", "version": "v2", "tool": "kling", "pick": true } ],
    "comments": [ { "id": "c_1", "by": "Mirrage", "at": "2026-11-16T18:00:00Z", "text": "Day or dusk?" },
                  { "id": "c_2", "by": "Lucas", "at": "2026-11-16T19:02:00+01:00", "text": "Dusk.", "replyTo": "c_1" } ]
  } ] } ]
}
```

## How Lucas uses the file

- **Chrome on his Mac, with the folder opened through Google Drive for desktop:** live editing. His saves reach the file within about 2 s, and your changes appear on his board within about 5 s. When both of you change it, the revision check offers him: load yours, save his as a copy (`… (Lucas yyyy-mm-dd-hh-mm).storyboard.json`), or overwrite.
- **Downloaded folder:** he edits a local copy and uploads it later. The revision tells you whether his copy is older than yours.
- **Safari or iPhone:** read-only. Save downloads the file.
