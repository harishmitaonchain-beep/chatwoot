#!/usr/bin/env bash
# Bumps .claude/ai-wiki/00-meta/.sync-state.json to develop's current tip.
# Run this after actually updating whatever vault pages check-sync.sh flagged
# as affected — it does not regenerate anything itself.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

git show-ref --verify --quiet refs/heads/develop || { echo "no local develop branch — nothing to mark synced" >&2; exit 1; }

COMMIT="$(git rev-parse develop)"
DATE="$(date -u +%Y-%m-%d)"
STATE_FILE="$REPO_ROOT/.claude/ai-wiki/00-meta/.sync-state.json"

cat > "$STATE_FILE" <<EOF
{
  "branch": "develop",
  "commit": "$COMMIT",
  "synced_at": "$DATE"
}
EOF

echo "AI wiki marked in sync with develop @ $COMMIT ($DATE)."
