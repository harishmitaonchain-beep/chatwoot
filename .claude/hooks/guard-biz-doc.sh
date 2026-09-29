#!/usr/bin/env bash
# PreToolUse guard: blocks any `git commit` while staged changes contain
# `# biz-doc:` annotation lines, and any `git push` whose outgoing commits
# contain them. Enforces the standing instruction: annotations are never
# committed, never pushed. Stdin: hook JSON with .tool_input.command.
set -uo pipefail
REPO="/Users/sharma/Downloads/workspace/chatwoot"
CMD=$(jq -r '.tool_input.command // ""' 2>/dev/null)

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

if printf '%s' "$CMD" | grep -qE '(^|[;&|[:space:]])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+commit'; then
  if git -C "$REPO" diff --cached | grep -q '# biz-doc:'; then
    deny "BLOCKED: staged changes contain '# biz-doc:' annotation lines, which must never be committed. Strip first: grep -rl '# biz-doc:' app lib enterprise | xargs sed -i '' '/# biz-doc:/d' — then stage, commit, and reapply with node .claude/ai-wiki/tools/annotate-biz-docs.mjs $REPO"
  fi
fi

if printf '%s' "$CMD" | grep -qE '(^|[;&|[:space:]])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+push'; then
  if git -C "$REPO" diff '@{u}..HEAD' 2>/dev/null | grep -q '# biz-doc:'; then
    deny "BLOCKED: outgoing commits contain '# biz-doc:' annotation lines, which must never be pushed. Remove them from history before pushing."
  fi
fi

exit 0
