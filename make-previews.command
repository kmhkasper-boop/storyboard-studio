#!/bin/bash
# Storyboard Studio v4.1 — make small preview clips for the board.
# For every clip in the project folder it writes  <clip folder>/_previews/<name>.preview.mp4
# (640 px wide, H.264, no sound, a few hundred KB). Storyboard Studio uses them for the moving cards
# and as a fallback in the big preview (e.g. for ProRes .mov files Chrome can't play). Your clips are not changed.
# Use: double-click (it asks for the folder), or:  ./make-previews.command "/path/to/project folder"
# Needs ffmpeg:  brew install ffmpeg   (https://brew.sh)
set -u
DIR="${1:-}"
if [ -z "$DIR" ]; then
  if command -v osascript >/dev/null 2>&1; then
    DIR=$(osascript -e 'POSIX path of (choose folder with prompt "Pick the storyboard project folder (the one with the .storyboard.json)")' 2>/dev/null) || { echo "Cancelled."; exit 1; }
  else DIR="$(cd "$(dirname "$0")" && pwd)"; fi
fi
DIR="${DIR%/}"
[ -d "$DIR" ] || { echo "Not a folder: $DIR"; exit 1; }
FF=""
for c in ffmpeg /opt/homebrew/bin/ffmpeg /usr/local/bin/ffmpeg "$HOME/bin/ffmpeg"; do command -v "$c" >/dev/null 2>&1 && { FF="$c"; break; }; done
if [ -z "$FF" ]; then
  echo "ffmpeg is not installed."
  echo "Install it once with Homebrew:  brew install ffmpeg   (get Homebrew at https://brew.sh)"
  echo "Then run this again."
  read -r -p "Press Return to close." _ 2>/dev/null || true; exit 1
fi
WIDTH="${PREVIEW_WIDTH:-640}"
made=0; skipped=0; failed=0
echo "Making preview clips in: $DIR"
while IFS= read -r -d '' IN; do
  IN="$DIR/${IN#./}"; d=$(dirname "$IN"); b=$(basename "$IN"); stem="${b%.*}"
  OUT="$d/_previews/$stem.preview.mp4"
  if [ -f "$OUT" ] && [ "$OUT" -nt "$IN" ]; then skipped=$((skipped+1)); continue; fi
  mkdir -p "$d/_previews"
  printf '  %s … ' "${IN#$DIR/}"
  if "$FF" -nostdin -v error -y -i "$IN" -vf "scale='min($WIDTH,iw)':-2" -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p -an -movflags +faststart "$OUT.tmp.mp4" && mv "$OUT.tmp.mp4" "$OUT"; then
    echo "ok"; made=$((made+1))
  else echo "FAILED"; rm -f "$OUT.tmp.mp4"; failed=$((failed+1)); fi
done < <(cd "$DIR" && find . -type f \( -iname '*.mp4' -o -iname '*.m4v' -o -iname '*.mov' -o -iname '*.webm' \) -not -path '*/_previews/*' -not -name '._*' -not -path '*/.*' -print0)
echo "Done: $made made, $skipped already up to date, $failed failed."
echo "Reload Storyboard Studio (or reopen the folder) to use them."
[ -t 0 ] && [ -z "${1:-}" ] && { read -r -p "Press Return to close." _ || true; }
exit 0
