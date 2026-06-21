#!/bin/bash
# Push the current branch to the GitHub remote (SSH).
# Called automatically by the post-commit hook; safe to run manually too.

REMOTE="github"
BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "main")

# Ensure SSH key is available; set up silently if not.
if [ ! -f "$HOME/.ssh/github_deploy" ]; then
  if [ -n "$GITHUB_SSH_KEY" ]; then
    bash "$(dirname "$0")/github-ssh-setup.sh" >/dev/null 2>&1 || true
  fi
fi

if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  echo "[github-push] Remote '$REMOTE' not found — skipping push." >&2
  exit 0
fi

echo "[github-push] Pushing branch '$BRANCH' to $REMOTE..."
if git push "$REMOTE" "$BRANCH" --quiet 2>&1; then
  echo "[github-push] Push succeeded."
else
  echo "[github-push] Push failed — check SSH key and GitHub deploy key config." >&2
  exit 1
fi
