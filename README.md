# Storyboard Studio

A free storyboard tool for you and Mirrage. The storyboard is one plain file (`storyboard.json`) in a video's Drive folder. You edit it here, and Mirrage edits the same file through Drive.

**Online:** https://kmhkasper-boop.github.io/storyboard-studio/ (in Chrome you can install it as an app with the install icon in the address bar)
**Offline:** double-click `Storyboard Studio.html` from the starter kit. It works without internet.

## Quick start

1. Open the app in **Chrome** on your Mac.
2. Click **Open project folder** and pick a video folder. The best way is through **Google Drive for desktop** (Finder → Google Drive → My Drive → Lucas Casca – Season 1 → …). Then every change saves straight to Drive and Mirrage sees it, and Mirrage's changes appear on your board by themselves.
   - No Drive for desktop? Download the folder from drive.google.com (right-click → Download), unzip it, and open that folder. When you're done, upload `storyboard.json` back to the Drive folder (Drive asks whether to replace it; choose **Replace**, which keeps the same file).
3. If the folder has no storyboard yet, the app offers to start one: empty, or one page per image it finds.

The kit also has **make-previews.command** (optional, see Video previews).

Try it first with **Try the sample**, or open the `sample-project` folder from the starter kit.

## What you can do

- **Reorder pages:** drag them, also into another scene. **Reorder scenes:** drag ⠿ or the list on the left. You can also use the ↑ ↓ buttons. A slot (alternatives) or a page stack always moves as a whole.
- **Replace an image or clip:** drop a file on a page. Or click the page and use **File…**, **From folder…** (files already in the project folder), or **Drive link / path…** (paste a Drive share link). You can also paste an image or a Drive link while a page is selected.
  - When the folder is open, a dropped file is copied into a `media/` subfolder, and the page points to it.
- **▶ Play:** an animatic with pages in order and their durations. Clips play inline when the folder is open, with lyrics as captions. If you set the song in ⚙ Project settings, it plays underneath. With **page timecodes** turned on, each page jumps to its own song time.
- **Big preview (v3.3, media-first since v3.4), Space:** click a page (it gets a ring), or click a scene or slot header, then press **Space**. A large preview opens with the image or the picked clip filling the window. Clips play muted with speed, in/out and cuts, like Play. Below it, a slim caption strip shows page number, code, duration, song time, role, status, then lyrics and description on one line; **more ▾** shows the full text.
  - **Always the picture (v3.4):** the preview uses the same image the board card shows, only larger. It tries the file in your folder, then the Drive thumbnail at a large size (two Drive URL forms), then the card's own thumbnail. A clip that only exists on Drive shows a big Drive frame plus **▶ Play in Drive**. Only a page with no media at all shows a placeholder.
  - **Close:** Space again, **Esc**, ✕, or a click next to it.
  - **Move around:** **←/→** go to the previous/next page across scenes (only active alternatives, following the current variant), and **↑/↓** jump between scenes. The board selection follows along.
  - **Drawer:** **Enter** or **Open in drawer** opens the page in the big drawer.
  - **Mouse and touch:** the 👁 button on a card opens the preview; swipe left or right inside it.
  - **Space and other keys:** Space never fires while you're typing in a field. **P** still starts Play (also ▶ Play), and inside Play, Space still pauses and resumes. Double-click still opens the drawer. If Space ever gets in the way, the 👁 button does the same.
- **Video previews (v4.1):** clips move inside the app wherever the browser can reach them.
  - **Project folder open (Chrome, Edge; Safari read-only too):** the big preview plays the page's clip (muted, with speed, in/out and cuts) and loops it with the page. A thin bar at the bottom shows where the clip is. On the board, **hover a card** to play its clip on the card. The toolbar menu **🎞 clips** switches between *hover*, *loop* (every visible card plays) and *off*.
  - **Online with Drive links only:** in the big preview press **▶ Play here** (or **V**) to play the clip with Google's own Drive player inside the preview. After you use it once, it opens by itself for the next Drive clip (V or **🖼 Picture** switches back). It works when the browser is signed in to Google with access to the file (Chrome), or when the file is shared **Anyone with the link → Viewer** (needed for Safari and iPhone). Space, Esc and the arrows keep working even after you click inside the player. Google's player can't follow speed, in/out or cuts; it plays the whole clip.
  - **Optional, smoother cards:** double-click **make-previews.command** (in the kit) and pick the project folder. It makes small copies of every clip in a `_previews` folder next to the clips (640 px, a few hundred KB each). The board then uses those for the moving cards, and the preview uses them when Chrome can't play the original (for example ProRes `.mov`). It needs ffmpeg once: `brew install ffmpeg`. The first time, macOS may block the script because it was downloaded: right-click it → **Open** → **Open**. Run it again after new clips arrive; it skips clips that are already done.
- **Edit tab with the song (v4.3):** the Edit tab now has a monitor and the song under the timeline, so you can watch the edit to the music.
  - **Song:** the app uses the board's song (⚙ Project settings, a file in the project folder). Or click **🎵 Load song…** and choose a file, or drop an audio file (WAV, MP3, M4A, AIFF) on the green **Song** lane. A chosen file is kept in this browser for this board, so it's still there next time, but it isn't written into the board. The waveform shows under the lanes. The song's 0:00 is the song time 0:00 used by the pages.
  - **Play:** **▶** (or **P** in the Edit tab) plays the active variant. The **song is the clock**, and the picture follows it: each page's clip at the right spot (in/out, speed, cuts that loop, reverse stepped), the still when a page has no clip, and black in song gaps. Inserts and flash-forwards play over the linear pages, like the Resolve export. The red playhead moves along and the view scrolls with it.
  - **Jump and scrub:** click the ruler, the song lane or empty lane space to jump, and drag to scrub. Clicking a block selects it and jumps there. ⏮ goes back to the start. Hidden lanes are left out of the picture.
  - **Sound:** by default only the song plays (**🔇 Clips muted · song only**). Click it to hear the clips' own sound. Then **M** (mute) and **S** (solo) on each lane, and on the selected block (next to the transport), decide which clips you hear. A muted block shows 🔇. **🎵 Song on / muted** turns the song itself off (it still keeps time). These settings are saved in this browser per board, not in the board file.
  - **Online without the folder:** clips that are only on Drive can't play in the monitor (Google doesn't let other sites stream Drive files). The monitor shows the still and says so. A song that's only on Drive can't load either. Open the project folder, or load the song file.
- **Clips not playing? (v4.3)** The app needs the **folder**, not just the storyboard file. If you opened the board with **📄 Open storyboard file**, a yellow bar now says the clips can't play, with **📂 Open its folder**: the folder picker opens right in that file's folder, so just click Open. Also new:
  - The version is shown next to 🎬 (e.g. v4.3).
  - When a newer version is online, a bar offers **Reload now**. Old offline copies (`Storyboard Studio.html` from an older kit) say a newer version exists.
  - If a clip can't be decoded by the browser (e.g. ProRes or 10-bit HEVC in Chrome), the app says so for that clip and points at **make-previews.command**.
- **DaVinci Resolve timelines (v4.2):** ☰ → **🎞 DaVinci Resolve timelines (.zip)…** exports the board as separate Resolve timelines, with **video clips only** (stills and image-only pages are left out):
  - **01 Edit (variant):** the active variant on the song timeline, with in/out, speed, cuts and gaps. Linear pages sit on V1; flash-forwards, flashbacks and inserts sit on V2 above them, so they play over the base. Timeline markers show song gaps (red) and storyline switches. The song is on A1 if it's set in ⚙ Project settings.
  - **Story – \<storyline\>:** one per storyline, in story order. After a "Not in the edit" marker come that storyline's pages the edit doesn't use (pool, cut, inactive alternative).
  - **Board:** every page in board order, with a marker at each scene. **Character – \<name\>:** one per character who has clips. **Extras:** inactive alternatives and other variants' pages, takes not picked, cut pages and the pool, each section marked.
  - **Notes:** every clip has a marker (in its storyline colour) with page, title, storyline, song time, lyrics, description, characters, prompts and notes.
  - **In the dialog:** paste the **project folder** path on your Mac once (in Finder, right-click the folder you opened in the app, hold **⌥ Option**, **Copy "…" as Pathname**). The app remembers it for this board. Clips then point straight at your files. Or tick **Relink mode** to write placeholder paths and relink in Resolve. You also choose the frame rate (default: the board's, 24 for Mirrage's clips) and which timelines to export. With the folder open, the app reads each clip's real length.
  - **Import in Resolve 21:** unzip, then **File › Import › Timeline…** (⇧⌘I). Open the `OTIO` folder, select all the `.otio` files and click Open. Click **OK** once per timeline, with "Automatically import source clips into media pool" on. If clips show offline (red), select them in the Media Pool, then **Relink Media** (or right-click › **Relink Selected Clips**), and pick the project folder. Resolve finds the files by name. `HOW TO IMPORT.txt` in the zip says the same.
  - **Fallback:** the same timelines as **FCPXML 1.10** in `FCPXML (fallback)`, imported one file at a time. Resolve keeps clips, timing and speed from FCPXML but **drops markers**, so OTIO comes first. `clips.csv` lists every clip with its path, Drive ID and length.
  - **Limits:** clips that are only on Drive (no path) point at `Drive only/<name>`, so download them and relink. Clip colours can't be set reliably through import, so storyline colours are shown on the markers. Reverse speed comes through as a negative speed; check it in Resolve.
- **No more flicker (v4.1):** the big preview used to rebuild its picture each time a page looped (every few seconds), so it went dark and came back. It now keeps the picture and only restarts the clip. Pictures that fail to load (like a Drive thumbnail when you're signed out) are skipped for two minutes instead of retried on every loop. Board cards keep their loaded pictures when the board refreshes (for example when Mirrage's change arrives).
- **Storylines (v4):** a video can weave several storylines (e.g. Comic and Real world). Add them with **✎ Storylines** (Story tab, or in a page's drawer) and pick one per page in the drawer. Cards show the storyline colour and its story position, and the toolbar can filter by storyline.
  - **Story tab:** one tab per storyline, showing only its pages in **story order**. Drag to reorder the story; this never changes the edit. Below the pages, **Not in the edit yet** lists the storyline's pages the edit doesn't use (pool, cut, inactive alternative), with a button to bring pool pages back.
  - **Edit tab:** all storylines woven on the song timeline, one coloured lane each. Every page is a block from its song start to its end; blocks without song time are dashed and follow the previous block.
    - Hatched red areas are **song gaps** where no storyline has a shot. Dotted lines mark where the edit switches storyline.
    - Click a block to select it, press **Space** to preview it, and double-click to open the drawer.
    - The lane chips hide or show a storyline with one click, and the variant picker switches the variant the lanes follow. Reordering still happens on the board.
  - **Pool:** tick *Pool (not in the edit)* in the drawer to keep a page on the board but out of the runtime, Play, exports and the edit view.
  - A board without storylines works exactly as before, as one implicit story.
- **Script view:** the whole storyboard reads as text, scene by scene.
- **Status per page:** idea → prompted → rendered → picked → in edit → final, or cut (skipped in Play). Old files load with `image` read as *rendered* and `animated` as *picked*. You can filter the board by status or character.
- **Breakout drawer (v2):** double-click a page, or press ⤢ in the editor, to open a large panel with these tabs:
  - **Page:** timing (with **Gen length**), role, speed, media, lyrics, camera, mood and comments, plus a cuts summary and the alternatives strip.
  - **Cuts (v3):** a mini timeline with one block per cut, sized by its duration and showing its speed. Drag a block to reorder; drag its right edge to change the duration. Below it: the cut list (media, in/out, duration, speed) and **Import cuts from CSV / EDL…**.
  - **Prompts:** image, video and negative prompts, each with a tool and a copy button.
  - **Cast:** the looks used on this page, the locked canon, and copy prompt block.
  - **Takes:** every render, with an A/B compare and Pick.
  - **Log:** the generation log (tool, model, credits, who approved it).
- **Speed and timing (v2):**
  - **Speed:** set speed (0.4 = slow motion, negative = reverse), retime (a label for Resolve) and an effect (flicker and strobe are previewed).
  - **Source in/out:** set the in and out points for a clip, using the **in = frame / out = frame** buttons on the editor video.
  - **Cuts:** a list of cuts for flicker bursts, edited on the Cuts tab.
  - **Play:** Play mode previews all of this.
- **Song time checks (v2):** the role badge shows on cards (insert, flash-forward, flashback). The header shows the total screen time, the song span and any **song-time gaps** between linear pages. **⏱ (v3)** warns only when the **Gen length** (`genSeconds`, the real length of the generated clip) is too short for the page, taking speed and source in/out into account. A 6 s generation trimmed to 2 s is fine. Nothing is guessed from the prompt text any more. Pages with status **cut** don't count, so their song time shows as a gap until something else covers it.
- **Cast (v2, ☰ → Cast manager):** characters with locked canon, reference sets (allowed tools, public-safe only) and looks. Cards show each character's look thumbnail. In the drawer, double-click a character to open the look editor, then use **Save as new look** or **Override just here**. You're warned when an override contradicts canon (eye or hair colour, tattoo side, barefoot). Each look and reference set has a "Used in" list.
- **Song lyrics (v2, ⚙ settings):** paste timed lines (`0:37 First line`). Pages without lyrics fill in automatically by their song time.
- **For Resolve (v2, ☰):** export the edit list as CSV, a CMX3600 EDL or plain text (page, code, role, song in/out, clip, source in/out, speed, duration).
- **Alternatives (v3):** **⇄ Alt** on a scene, or **⇄ Alternative** in the page editor, makes an inactive copy you can develop side by side.
  - On the board, a scene slot shows as one group with tabs (`A Desert sunrise / B Rooftop −0:02`), and a page shows as a stack with A/B tabs.
  - Click a tab to make that one active. The runtime updates at once and a toast shows the difference.
  - Inactive ones are dimmed (scenes fold; "show" unfolds them), keep their comments and takes, and are never deleted.
  - Play, runtime, gaps, exports and script view use only the active ones. Print asks whether to include the alternatives.
- **Variants (v3):** the toolbar picker switches between named sets of choices (e.g. *Album cut* / *Director's cut*). ⇄ Variants… saves the current choices as a variant, updates, renames or deletes one, and exports the CSV/EDL of one variant or of all of them.
- **Import a Resolve edit (v3, ☰ → Import cut list):** paste or choose a CSV or CMX3600 EDL. Clips are matched by file name to the media in your folder (all subfolders), and events land on pages by record time against the song time, or into the selected page's cuts. You see a preview first; ⌘Z undoes it.
  - **v3.1 speed:** Resolve's `M2 050.0` now imports as 50 % slow motion, not 2×. The `* SPEED:` comment wins, then source ÷ record duration; M2 is only a hint. Reverse is kept. The preview shows each speed and highlights values that disagree (⚠).
  - **Page assignment (v3.2):** each event goes to the page holding most of it, judged on the real times. Snapping to page edges within **4 frames** (adjustable) only aligns edges and breaks ties, and short events never collapse. The preview shows both snap deltas.
  - **Inside cut pages (v3.2):** events that fall inside a cut or bridged page get a ticked suggestion for the nearest page. Untick it to leave the event unassigned.
  - **Single-event overruns (v3.2):** an event longer than its page is flagged and kept as one cut, so you can trim or stretch it.
  - **v3.1 options:** **only clips that match existing board media** (excluded clips such as CO_/BP_/STILL_ are counted and listed) and **trim last cut to fit**.
  - A sample edit is in `sample-project/edits/`.
- **Cut overruns and source checks (v3.1):** when the cuts add up to more than the page, the card shows **✂ +0.208s over**, and the drawer offers **trim last cut to fit** or **stretch page**. Each cut is also checked against its clip's out point and generation length (a **gen** field per cut, or the Gen length of a page using the same clip).
- **Bridged cut pages (v3.1):** for a page with status *cut*, tick **Bridged in the edit** when the real edit covers its song time. The gap goes away, and no screen time is added.
- **Online-only media (v3):** a page that only has a Drive ID shows the Drive thumbnail with **☁ online** and the ↗ Drive button. That's fine, not an error.
- **Revision safety (v2):** every save raises `revision` by 1. Before writing, the app re-reads the file; if someone else saved in between, you choose what happens.
- **Comments and flags:** leave notes for Mirrage on a page; replies show threaded (↩ Reply). A flag (e.g. "drink – Lucas to OK") shows in red.
- **Auto-link** (☰ menu): matches numbered files such as `shot 03.jpg` or `SB2_03_v2.mp4` to pages; the highest _v number wins, and its version label (v2) is stored.
- **Import Mirrage text** (☰): paste one of Mirrage's storyboard docs to turn it into pages. **Export Markdown** does the reverse.
- **Print / PDF** (☰): 6 pages per A4 sheet.
- **Keyboard:**
  - Space: big preview
  - P: Play
  - N: new page after the selected one
  - ←/→: previous/next page
  - Esc: deselect / close
  - ⌘Z / ⇧⌘Z: undo / redo
  - ⌘S: save (autosave is on when a folder is open)

  The full list is under ☰ → Help.

## Good to know

- **Safari and iPhone** can't write into folders, so they open them read-only. Save then downloads `storyboard.json`; put it back in the folder. Use Chrome or Edge for live editing.
- **Online without the folder:** images show as Drive thumbnails if you're signed in to Google in that browser. Drive clips play in the big preview with **▶ Play here** (Google's Drive player, see Video previews). Cards stay still online; open the folder locally for moving cards. Drive doesn't let other sites stream its files straight into a video player, so speed, in/out and cuts only play from a local folder.
- **If you and Mirrage both change the file at the same moment,** the app asks: load Mirrage's version, save yours as a copy, or overwrite.
- Your work also autosaves in the browser. If something goes wrong, the start screen offers **Restore browser copy**.
- Hidden macOS `._` files from Drive are ignored.

The file format, including the v3 rules for Mirrage, is in **SCHEMA.md**.

Made by Plug-in Baby. Uses SortableJS (MIT). Everything else is plain HTML, CSS and JavaScript with no build step and no tracking.
