#!/usr/bin/env bash
# Project statusline: model | dir | branch | wiki sync state (the harness heartbeat).
# Must stay fast — runs on every assistant message. No network, no full check-sync.
set -uo pipefail
REPO="/Users/sharma/Downloads/workspace/chatwoot"
input=$(cat)

MODEL=$(printf '%s' "$input" | jq -r '.model.display_name // "Claude"' 2>/dev/null)
DIR=$(printf '%s' "$input" | jq -r '.workspace.current_dir // ""' 2>/dev/null)
BRANCH=$(git -C "$REPO" rev-parse --abbrev-ref HEAD 2>/dev/null)

WIKI="wiki ?"
STATE_FILE="$REPO/.claude/ai-wiki/00-meta/.sync-state.json"
if [ -f "$STATE_FILE" ]; then
  STORED=$(grep -oE '"commit": *"[a-f0-9]+"' "$STATE_FILE" | grep -oE '[a-f0-9]{7,40}')
  DEV=$(git -C "$REPO" rev-parse develop 2>/dev/null)
  if [ -n "$STORED" ] && [ -n "$DEV" ]; then
    if [ "$STORED" = "$DEV" ]; then
      WIKI="wiki ✓"
    else
      N=$(git -C "$REPO" rev-list --count "$STORED..$DEV" 2>/dev/null || echo "?")
      WIKI="wiki ⚠ stale($N)"
    fi
  fi
fi

printf '%s | %s | %s | 🧠 %s\n' "$MODEL" "${DIR##*/}" "${BRANCH:-?}" "$WIKI"
