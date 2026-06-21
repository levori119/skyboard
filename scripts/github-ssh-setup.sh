#!/bin/bash
# Reconstructs the GitHub deploy SSH key from the GITHUB_SSH_KEY secret.
# Run this on startup or after a container rebuild to restore SSH access.

set -e

SSH_DIR="$HOME/.ssh"
KEY_FILE="$SSH_DIR/github_deploy"
CONFIG_FILE="$SSH_DIR/config"

mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

if [ -f "$KEY_FILE" ]; then
  echo "[github-ssh-setup] Key already exists at $KEY_FILE — skipping write."
else
  if [ -z "$GITHUB_SSH_KEY" ]; then
    echo "[github-ssh-setup] WARNING: GITHUB_SSH_KEY secret is not set." >&2
    echo "[github-ssh-setup] Add the private key as the GITHUB_SSH_KEY secret in Replit." >&2
    exit 1
  fi
  printf '%s\n' "$GITHUB_SSH_KEY" > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
  echo "[github-ssh-setup] Deploy key written to $KEY_FILE"
fi

cat > "$CONFIG_FILE" << 'SSHCONF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
SSHCONF
chmod 600 "$CONFIG_FILE"

echo "[github-ssh-setup] SSH config written — ready to push to GitHub."
