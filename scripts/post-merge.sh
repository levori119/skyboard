#!/bin/bash
set -e

npm install --legacy-peer-deps

# Ensure the GitHub deploy SSH key is available after a merge/container rebuild.
if [ -n "$GITHUB_SSH_KEY" ]; then
  bash "$(dirname "$0")/github-ssh-setup.sh" || true
fi
