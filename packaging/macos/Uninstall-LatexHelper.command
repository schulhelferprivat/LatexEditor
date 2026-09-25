#!/bin/bash
set -euo pipefail
printf 'LatexHelper Bridge und ihren Autostart entfernen? Dokumente bleiben erhalten. [j/N] '
read -r answer
if [[ "$answer" != "j" && "$answer" != "J" ]]; then exit 0; fi
launchctl bootout "gui/$(id -u)/de.latexhelper.bridge" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/de.latexhelper.bridge.plist"
rm -rf "$HOME/Applications/LatexHelper Bridge.app"
printf 'Bridge entfernt. Die PWA kann separat in Edge oder Chrome deinstalliert werden.\n'
