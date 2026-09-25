#!/bin/bash
set -euo pipefail
source_dir="$(cd "$(dirname "$0")" && pwd)"
install_dir="$HOME/Applications/LatexHelper Bridge.app"
agent_dir="$HOME/Library/LaunchAgents"
agent="$agent_dir/de.latexhelper.bridge.plist"
mkdir -p "$HOME/Applications" "$agent_dir"
launchctl bootout "gui/$(id -u)/de.latexhelper.bridge" 2>/dev/null || true
/usr/bin/ditto "$source_dir/LatexHelper Bridge.app" "$install_dir"
bridge_path="$install_dir/Contents/MacOS/latexhelper-bridge"
escaped_path="$(printf '%s' "$bridge_path" | sed 's/\&/\&amp;/g;s/</\&lt;/g;s/>/\&gt;/g;s/"/\&quot;/g')"
cat > "$agent" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>de.latexhelper.bridge</string><key>ProgramArguments</key><array><string>$escaped_path</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>ThrottleInterval</key><integer>30</integer></dict></plist>
PLIST
chmod 600 "$agent"
launchctl bootstrap "gui/$(id -u)" "$agent"
for attempt in {1..20}; do
  if curl -fsS http://localhost:38471/ >/dev/null; then break; fi
  sleep 0.25
done
open '__LATEXHELPER_APP_URL__'
printf '\nLatexHelper Bridge ist installiert. LatexHelper in Edge oder Chrome als App installieren.\n'
