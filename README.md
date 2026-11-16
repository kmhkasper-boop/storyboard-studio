# Storyboard Studio

A free storyboard tool for you and Mirrage. The storyboard is one plain file (`storyboard.json`) in a video's Drive folder. You edit it here, and Mirrage edits the same file through Drive.

**Online:** https://kmhkasper-boop.github.io/storyboard-studio/ (in Chrome you can install it as an app with the install icon in the address bar)
**Offline:** double-click `Storyboard Studio.html` from the starter kit. It works without internet.

## Quick start

1. Open the app in **Chrome** on your Mac.
2. Click **Open project folder** and pick a video folder. The best way is through **Google Drive for desktop** (Finder → Google Drive → My Drive → Lucas Casca – Season 1 → …). Then every change saves straight to Drive and Mirrage sees it, and Mirrage's changes appear on your board by themselves.
   - No Drive for desktop? Download the folder from drive.google.com (right-click → Download), unzip it, and open that folder. When you're done, upload `storyboard.json` back to the Drive folder (Drive asks whether to replace it; choose **Replace**, which keeps the same file).
3. If the folder has no storyboard yet, the app offers to start one: empty, or one page per image it finds.

Try it first with **Try the sample**, or open the `sample-project` folder from the starter kit.

## What you can do

- **Reorder pages:** drag them, also into another scene. **Reorder scenes:** drag ⠿ or the list on the left. You can also use the ↑ ↓ buttons. A slot (alternatives) or a page stack always moves as a whole.
- **Replace an image or clip:** drop a file on a page. Or click the page and use **File…**, **From folder…** (files already in the project folder), or **Drive link / path…** (paste a Drive share link). You can also paste an image or a Drive link while a page is selected.
  - When the folder is open, a dropped file is copied into a `media/` subfolder, and the page points to it.
- **▶ Play:** an animatic with pages in order and their durations. Clips play inline when the folder is open, with lyrics as captions. If you set the song in ⚙ Project settings, it plays underneath. With **page timecodes** turned on, each page jumps to its own song time.
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
- **Undo / redo:** ⌘Z and ⇧⌘Z. Save is ⌘S, and autosave is on when a folder is open.

## Good to know

- **Safari and iPhone** can't write into folders, so they open them read-only. Save then downloads `storyboard.json`; put it back in the folder. Use Chrome or Edge for live editing.
- **Online without the folder:** images show as Drive thumbnails if you're signed in to Google in that browser. Drive videos can't play inside the app; you get a still, an **↗ Drive** button and a "Drive player" try-button. Open the folder locally to play clips.
- **If you and Mirrage both change the file at the same moment,** the app asks: load Mirrage's version, save yours as a copy, or overwrite.
- Your work also autosaves in the browser. If something goes wrong, the start screen offers **Restore browser copy**.
- Hidden macOS `._` files from Drive are ignored.

The file format, including the v3 rules for Mirrage, is in **SCHEMA.md**.

Made by Plug-in Baby. Uses SortableJS (MIT). Everything else is plain HTML, CSS and JavaScript with no build step and no tracking.
