# Storyboard file format (for Mirrage)

Storyboard Studio keeps a storyboard in **one plain JSON file** inside the Drive project folder of a video. Lucas edits it in the app; you (Mirrage) read and edit the same file with the Drive connector. There is no database and no hidden state: **the file is the storyboard.**

- File name: `storyboard.json`, or `<Name>.storyboard.json` when a folder holds several versions (e.g. `Bleeding Page SB2.storyboard.json`, `Zeppelin Day storyline D.storyboard.json`). The app only recognises names ending in `storyboard.json`.
- Location: the video's own folder (for example `Lucas Casca – Season 1/Zeppelin Day/`). Media paths are relative to **the folder that holds the storyboard file**.
- Encoding: UTF-8 JSON, 2-space indent. Upload with MIME type `application/json` and **do not convert** to a Google Doc.

## Structure

```
storyboard
├─ header fields (title, project, aspect, audio, characters …)
└─ scenes[]            ← ordered; the order IS the running order
   └─ pages[]          ← ordered; one page = one storyboard frame / shot
```

Page numbers are **not stored**. "Page 7" simply means the 7th page counting through all scenes in order. When Lucas drags pages around, numbers change. To keep a stable reference use the page `id` (never changes) or the optional `code` field (your own label, e.g. the old page number `"03"`).

## Header fields

| field | type | meaning |
|---|---|---|
| `format` | `"storyboard-studio"` | always this value |
| `version` | `1` | schema version |
| `title` | string | e.g. `"Bleeding Page – Storyboard 2 (Real World)"` |
| `project` | string | album / series, e.g. `"Rich by Friday"` |
| `updated` | ISO date-time | set when saved, e.g. `"2026-11-16T18:00:00Z"` |
| `updatedBy` | string | who saved last: `"Mirrage"`, `"Lucas (app)"` |
| `aspect` | `"16:9"`, `"9:16"`, `"4:3"`, `"1:1"`, `"2.39:1"`, `"4:5"` | frame shape |
| `defaultDuration` | number (s) | used for pages without timing (default 3) |
| `driveFolderId` | string | Drive ID of the project folder (reference only) |
| `audio` | media object | the song; Play mode plays it under the animatic |
| `audioOffset` | number (s) | song time where page 1 starts (default 0) |
| `characters` | array | `{ "id": "steeve", "name": "Steeve", "color": "#6aa8ff" }` |
| `notes` | string | general notes |
| `scenes` | array | see below |

## Scene

| field | type | meaning |
|---|---|---|
| `id` | string | unique, never reuse (e.g. `"s_breakthrough"`) |
| `title` | string | e.g. `"Real world – breakthrough"` |
| `color` | `#rrggbb` | scene colour in the board |
| `notes` | string | mood, location, purpose |
| `collapsed` | boolean | UI only, you can ignore it |
| `pages` | array | the pages, in order |

## Page

| field | type | meaning |
|---|---|---|
| `id` | string | unique, never reuse (e.g. `"p_bp2_03"`). Make one up for new pages. |
| `code` | string | optional label, e.g. the old page number `"03"` or `"SB2-03"`. Auto-link matches media numbers to it. |
| `title` | string | short title, e.g. `"First breath"` |
| `start`, `end` | `"m:ss"` | song timecode, e.g. `"1:57"` and `"2:03"` (decimals allowed: `"0:37.5"`) |
| `duration` | number (s) | screen time. If missing: `end − start`, else `defaultDuration`. |
| `status` | `"idea"` · `"image"` · `"animated"` · `"final"` · `"cut"` | progress. `cut` pages are skipped in Play and in the runtime. |
| `lyric` | string | lyric or dialogue for this page |
| `description` | string | what we see / the action |
| `camera` | string | shot size and movement |
| `characters` | array of ids | e.g. `["steeve"]`, ids from the header `characters` |
| `imagePrompt` | string | your IMAGE PROMPT |
| `clipPrompt` | string | your CLIP PROMPT, e.g. `"(6 s, image-to-video) Fast push …"` |
| `notes` | string | e.g. `"CUT POINT: reuse v2 band clip"` |
| `flag` | string | something Lucas must OK, e.g. `"drink – Lucas to OK"` (shown in red) |
| `image` | media object or omitted | the storyboard frame |
| `video` | media object or omitted | the animated result / clip |
| `comments` | array | `{ "id": "c_1", "by": "Mirrage", "at": "2026-11-16T18:00:00Z", "text": "…", "done": false }` |

Empty fields may be left out entirely. The app drops empty values when it saves.

### Media object (images, videos, the song)

```json
{ "path": "bp-sb2-clips/SB2_03_v2.mp4", "driveId": "1znJy01MkSNgwuUiUnPnBu4WTX9zqsCuT", "name": "SB2_03_v2.mp4" }
```

| field | meaning |
|---|---|
| `path` | path **relative to the folder holding the storyboard file**, with `/` separators. Used when Lucas opens the folder on his Mac: the file then shows and plays inline. Use `../` to go up a folder. |
| `driveId` | the Drive file ID. Used online for thumbnails and the "↗ Drive" link. |
| `name` | file name (display only) |
| `url` | optional plain web URL. The app also puts small embedded images here (`data:` URLs) when Lucas drops a picture without a folder open. You may replace those with a proper `path` + `driveId`. |

**Always fill in both `path` and `driveId` when you know them.** `path` makes things work offline and lets videos play; `driveId` makes thumbnails work online.

The app will also accept a plain string for a media field (a Drive link, a Drive ID or a relative path), but please write the object form.

## Rules for editing safely

1. **Read the file fresh right before you change it.** Lucas may have saved a moment ago. Change only what you need and write the whole file back.
2. Keep every existing `id`. Give new scenes and pages a new unique id (`"p_" + something unique`). If you copy a page, change its id; the app repairs duplicates, but they confuse references.
3. **Reorder** by moving page objects inside `pages` arrays (or between scenes). **Reorder scenes** by moving scene objects in `scenes`.
4. **Replace an image or clip** by changing `path` and `driveId` in its media object. Leave the old file in Drive; Lucas decides what to delete.
5. Set `updated` (now, ISO) and `updatedBy: "Mirrage"` when you save. The app shows "Updated from disk (by Mirrage)".
6. Talk to Lucas inside the board with `comments` (`by: "Mirrage"`); he ticks them `done` when handled. Put "needs Lucas OK" items in `flag`.
7. Keep it valid JSON (double quotes, no trailing commas, no comments). If the app cannot parse the file it refuses to open it and changes nothing.
8. If you prefer writing in your usual doc format: the app has **☰ → Import Mirrage text**, which turns `## PAGE 01 · 0:37-0:39` blocks with `**Lyric:**`, `**Description:**`, `**IMAGE PROMPT:**`, `**CLIP PROMPT (6 s, …):**` into pages. `## SCENE …` headings start a new scene. **☰ → Export Markdown** writes the same format back out.

## Minimal example

```json
{
  "format": "storyboard-studio",
  "version": 1,
  "title": "Zeppelin Day – Storyline D",
  "project": "Lucas Casca – Season 1",
  "updated": "2026-11-16T18:00:00Z",
  "updatedBy": "Mirrage",
  "aspect": "16:9",
  "defaultDuration": 4,
  "audio": { "path": "audio/Zeppelin Day.mp3", "driveId": "" },
  "characters": [ { "id": "saisha", "name": "Saisha", "color": "#ff6b9a" } ],
  "scenes": [
    {
      "id": "s_arrival",
      "title": "Arrival",
      "pages": [
        {
          "id": "p_zd_01",
          "code": "01",
          "start": "0:00",
          "end": "0:06",
          "status": "image",
          "lyric": "(intro)",
          "description": "The zeppelin breaks through the clouds above the festival.",
          "camera": "extreme wide, slow push-in",
          "characters": ["saisha"],
          "imagePrompt": "…",
          "clipPrompt": "(6 s, image-to-video) …",
          "image": { "path": "Stills fixed/zd_01.jpg", "driveId": "1AbC…" },
          "video": { "path": "Imagine clips/zd_01_v2.mp4", "driveId": "1XyZ…" },
          "comments": [ { "id": "c_1", "by": "Mirrage", "at": "2026-11-16T18:00:00Z", "text": "Lucas: day or dusk?", "done": false } ]
        }
      ]
    }
  ]
}
```

## How Lucas uses the file (so you know what he sees)

- **Chrome on his Mac, folder opened through Google Drive for desktop:** live editing. His changes save into the file within about 2 seconds, and your changes show up in his board within about 5 seconds. If you both change it at once, he gets a choice: load your version, save his as a copy (`… (Lucas yyyy-mm-dd-hh-mm).storyboard.json`), or overwrite. If you find such a copy, ask Lucas which one to keep.
- **Downloaded folder:** he edits a local copy and uploads `storyboard.json` back to Drive later. Your edits made in between can be overwritten, so check `updated` before relying on your last change.
- **Safari or iPhone:** read-only. Save downloads the file.
