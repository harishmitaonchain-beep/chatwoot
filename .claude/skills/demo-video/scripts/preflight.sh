#!/bin/zsh
# Check everything a take needs before recording or rendering. Usage: preflight.sh [--no-app]
# Fails loudly instead of falling back (e.g. never writes video files to the internal disk).
VIDEO_ROOT="${VIDEO_ROOT:-/Volumes/Extreme SSD/chatwoot-videos}"
PY="$HOME/.venvs/chatwoot-video/bin/python"
fail=0
ok()  { print "ok    $1"; }
bad() { print "FAIL  $1"; fail=1; }

[[ -d "/Volumes/Extreme SSD" ]] && ok "SSD mounted ($(df -h "/Volumes/Extreme SSD" | awk 'NR==2{print $4}') free)" || bad "SSD not mounted: plug in the Extreme SSD (video files never go to the internal disk)"
mkdir -p "$VIDEO_ROOT" 2>/dev/null && [[ -w "$VIDEO_ROOT" ]] && ok "video root $VIDEO_ROOT" || bad "cannot write $VIDEO_ROOT"
command -v ffmpeg >/dev/null && ok "ffmpeg" || bad "ffmpeg missing: brew install ffmpeg"
[[ -x "$PY" ]] && "$PY" -c 'import PIL' 2>/dev/null && ok "python + Pillow ($PY)" || bad "python env missing: /opt/homebrew/bin/python3.12 -m venv ~/.venvs/chatwoot-video && ~/.venvs/chatwoot-video/bin/pip install Pillow"
[[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]] && ok "Google Chrome" || bad "Google Chrome not installed"
node -e 'process.exit(typeof WebSocket === "function" ? 0 : 1)' && ok "node $(node -v)" || bad "node 22+ needed (global WebSocket)"
if [[ -n "$ELEVENLABS_API_KEY" ]] || grep -q '^ELEVENLABS_API_KEY=.' "$HOME/.config/chatwoot-video/env" 2>/dev/null; then ok "ElevenLabs key present"; else bad "ElevenLabs key missing: put ELEVENLABS_API_KEY=... in ~/.config/chatwoot-video/env"; fi
if [[ "$1" != "--no-app" ]]; then
  [[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3000/app/login)" == "200" ]] && ok "Chatwoot on :3000" || bad "Chatwoot not running: overmind start -f Procfile.dev -D (repo root)"
  [[ -n "$CW_EMAIL" && -n "$CW_PASSWORD" ]] && ok "CW_EMAIL/CW_PASSWORD set" || print "note  CW_EMAIL/CW_PASSWORD not set (needed unless the recorder's Chrome profile is already logged in)"
fi
exit $fail
