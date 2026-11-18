#!/usr/bin/env bash
# Renders images/screenshot.png: real VS Code with this extension loaded,
# showing the sample schema, document and patch side by side.
# Runs on a virtual X display, so it needs code, xvfb-run, xdotool and
# ImageMagick's import. The profile is a throwaway, so your settings and
# extensions do not leak into the image.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
samples="$root/scripts/screenshot"
out="$root/images/screenshot.png"
width=1600 height=640

if [[ "${1-}" != --inner ]]; then
  for cmd in code xvfb-run xdotool import; do
    command -v "$cmd" >/dev/null || { echo "$cmd not found" >&2; exit 1; }
  done
  [[ -f "$root/dist/extension.js" ]] || { echo "dist/ missing, run: task build" >&2; exit 1; }
  exec xvfb-run -a -s "-screen 0 ${width}x${height}x24" "$0" --inner
fi

profile=$(mktemp -d)
trap 'kill "$pid" 2>/dev/null || true; rm -rf "$profile"' EXIT
mkdir -p "$profile/User"
# Without nvf-lsp on PATH the server stays off; VS Code would show an error toast.
lsp=false
command -v nvf-lsp >/dev/null && lsp=true
cat > "$profile/User/settings.json" <<EOF
{
  "workbench.colorTheme": "Default Dark Modern",
  "workbench.startupEditor": "none",
  "workbench.tips.enabled": false,
  "workbench.enableExperiments": false,
  "workbench.activityBar.location": "hidden",
  "workbench.layoutControl.enabled": false,
  "window.commandCenter": false,
  "window.titleBarStyle": "native",
  "window.menuBarVisibility": "toggle",
  "workbench.secondarySideBar.defaultVisibility": "hidden",
  "chat.disableAIFeatures": true,
  "git.enabled": false,
  "window.restoreWindows": "none",
  "editor.fontSize": 15,
  "editor.minimap.enabled": false,
  "editor.renderWhitespace": "none",
  "editor.stickyScroll.enabled": false,
  "breadcrumbs.enabled": false,
  "chat.commandCenter.enabled": false,
  "security.workspace.trust.enabled": false,
  "telemetry.telemetryLevel": "off",
  "update.mode": "none",
  "extensions.ignoreRecommendations": true,
  "novafile.server.enable": $lsp
}
EOF

code --user-data-dir "$profile" --extensions-dir "$profile/ext" \
  --extensionDevelopmentPath "$root" --disable-gpu --disable-workspace-trust \
  --skip-welcome --skip-release-notes --new-window --wait \
  "$samples/production.nova" "$samples/infrastructure.novs" "$samples/scale-api.nova-patch" \
  >/dev/null 2>&1 &
pid=$!

win=$(xdotool search --sync --onlyvisible --class code | tail -1)
xdotool windowmove "$win" 0 0 windowsize "$win" "$width" "$height"
sleep 6 # let the workbench and grammars settle

# Fan the three tabs out into three editor groups. The first file opened is
# active; the moves below leave the 2nd, 1st and 3rd file left to right.
# moveEditorToNextGroup is ctrl+alt+right, focusFirstEditorGroup is ctrl+1.
# The click puts keyboard focus in the editor so no keystroke gets lost.
xdotool mousemove --window "$win" $((width / 2)) $((height / 2)) click 1
sleep 1
for keys in ctrl+alt+Right ctrl+1 ctrl+alt+Right ctrl+alt+Right ctrl+1 Escape; do
  xdotool key --clearmodifiers "$keys"
  sleep 0.7
done
sleep 2

mkdir -p "$(dirname "$out")"
import -window root "$out"
echo "wrote $out"
