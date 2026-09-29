#!/usr/bin/env bash
# Checks whether the AI wiki (.claude/ai-wiki/) is stale relative to the
# `develop` branch's current tip. Only ever compares against `develop` —
# working on a feature branch never marks the vault stale.
#
# Exit 0 always (this is a report, not a gate). Prints nothing (or a short
# "in sync" line) when there's nothing to do, so it's safe to run on every
# session start without being noisy.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { exit 0; }
cd "$REPO_ROOT"

STATE_FILE="$REPO_ROOT/.claude/ai-wiki/00-meta/.sync-state.json"
PATH_INDEX="$REPO_ROOT/.claude/ai-wiki/00-meta/path-index.md"

[ -d "$REPO_ROOT/.claude/ai-wiki" ] || exit 0
git show-ref --verify --quiet refs/heads/develop || exit 0

CURRENT_DEVELOP_COMMIT="$(git rev-parse develop)"

if [ ! -f "$STATE_FILE" ]; then
  echo "AI wiki has no sync state yet (.claude/ai-wiki/00-meta/.sync-state.json missing) — nothing to compare against develop."
  exit 0
fi

STORED_COMMIT="$(grep -o '"commit": *"[a-f0-9]*"' "$STATE_FILE" | grep -oE '[a-f0-9]{7,40}')"

if [ -z "$STORED_COMMIT" ]; then
  echo "AI wiki sync state file is malformed (no commit field found) — treat the vault as unverified until .sync-state.json is fixed."
  exit 0
fi

if [ "$STORED_COMMIT" = "$CURRENT_DEVELOP_COMMIT" ]; then
  echo "AI wiki is in sync with develop ($CURRENT_DEVELOP_COMMIT)."
  exit 0
fi

if ! git merge-base --is-ancestor "$STORED_COMMIT" "$CURRENT_DEVELOP_COMMIT" 2>/dev/null; then
  echo "AI WIKI SYNC STATE STALE/INVALID: stored commit $STORED_COMMIT is not an ancestor of develop's current tip $CURRENT_DEVELOP_COMMIT (develop was likely force-pushed or rebased). A targeted diff isn't reliable here — a full vault review is warranted instead of an incremental one."
  exit 0
fi

CHANGED_FILES="$(git diff --name-only "$STORED_COMMIT" "$CURRENT_DEVELOP_COMMIT" -- . ':!.claude')"
COMMIT_COUNT="$(git rev-list --count "$STORED_COMMIT..$CURRENT_DEVELOP_COMMIT")"

echo "AI WIKI STALE: develop moved $COMMIT_COUNT commit(s) ($STORED_COMMIT -> $CURRENT_DEVELOP_COMMIT) since the vault was last synced."
echo ""

if [ -z "$CHANGED_FILES" ]; then
  echo "No tracked files changed outside .claude/ — safe to just bump .sync-state.json (see .claude/ai-wiki/mark-synced.sh)."
  exit 0
fi

echo "Changed files:"
echo "$CHANGED_FILES" | sed 's/^/  /'
echo ""

if [ ! -f "$PATH_INDEX" ]; then
  echo "path-index.md not found — cannot map changed files to vault pages automatically. Review changed files above manually."
  exit 0
fi

echo "Vault pages likely affected (prefix-matched against path-index.md):"
AFFECTED_PAGES_FILE="$(mktemp)"
UNCOVERED_FILE="$(mktemp)"
trap 'rm -f "$AFFECTED_PAGES_FILE" "$UNCOVERED_FILE"' EXIT

INDEX_ROWS="$(grep -E '^\| `' "$PATH_INDEX")"

while IFS= read -r f; do
  [ -z "$f" ] && continue
  FILE_MATCHED=0
  while IFS= read -r row; do
    p="$(echo "$row" | sed -E 's/^\| `([^`]+)`.*/\1/')"
    [ -z "$p" ] && continue
    case "$f" in
      "$p"|"$p"/*)
        link="$(echo "$row" | sed -E 's/^\| `[^`]+` \| *(.*[^ ]) *\|$/\1/')"
        echo "  $f -> $link"
        echo "$link" >> "$AFFECTED_PAGES_FILE"
        FILE_MATCHED=1
        ;;
    esac
  done <<< "$INDEX_ROWS"
  [ "$FILE_MATCHED" -eq 0 ] && echo "$f" >> "$UNCOVERED_FILE"
done <<< "$CHANGED_FILES"

if [ -s "$AFFECTED_PAGES_FILE" ]; then
  echo ""
  echo "Unique pages to update:"
  sort -u "$AFFECTED_PAGES_FILE" | sed 's/^/  /'
else
  echo "  (none)"
fi

if [ -s "$UNCOVERED_FILE" ]; then
  echo ""
  echo "Changed files covered by NO vault page (candidate new gaps — specs/locales are usually fine to ignore; anything under app/, lib/, or enterprise/ deserves a look):"
  sed 's/^/  /' "$UNCOVERED_FILE"
fi

echo ""
echo "After updating the affected pages, run: .claude/ai-wiki/mark-synced.sh"
