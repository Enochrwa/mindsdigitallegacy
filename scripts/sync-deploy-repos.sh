#!/usr/bin/env bash
# Keeps the two deployment repositories identical to this monorepo's backend/ and frontend/ folders.
#
#   backend/   ->  github.com/Enochrwa/MDLBackend   (Render deploys it)
#   frontend/  ->  github.com/Enochrwa/MDLFrontend  (Vercel deploys it)
#
# The monorepo is the single source of truth. The deployment repos are exact copies of the TRACKED files at the
# current commit (git archive), so no stray, untracked or secret file can ever be copied.
#
# Usage:
#   scripts/sync-deploy-repos.sh --check                 # exit 1 if either repo differs (changes nothing)
#   scripts/sync-deploy-repos.sh --push [--branch NAME]  # commit and push the difference (default branch: main)
#
# Needs a token that can write to both repositories in DEPLOY_SYNC_TOKEN (or GITHUB_TOKEN for read-only --check).
set -euo pipefail

OWNER="${DEPLOY_OWNER:-Enochrwa}"
MODE=""; BRANCH="main"
while [ $# -gt 0 ]; do
  case "$1" in
    --check) MODE="check" ;;
    --push) MODE="push" ;;
    --branch) BRANCH="${2:?--branch needs a name}"; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
[ -n "$MODE" ] || { echo "usage: $0 --check | --push [--branch NAME]" >&2; exit 2; }

ROOT="$(git rev-parse --show-toplevel)"
SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
SUBJECT="$(git -C "$ROOT" log -1 --format=%s)"
TOKEN="${DEPLOY_SYNC_TOKEN:-${GITHUB_TOKEN:-}}"
AUTH=""
[ -n "$TOKEN" ] && AUTH="x-access-token:${TOKEN}@"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Folder in this repo -> repository name
PAIRS="backend:MDLBackend frontend:MDLFrontend"
STATUS=0

for pair in $PAIRS; do
  dir="${pair%%:*}"; repo="${pair##*:}"
  dest="$WORK/$repo"
  echo "== $dir -> $OWNER/$repo ($BRANCH)"
  git clone -q "https://${AUTH}github.com/${OWNER}/${repo}.git" "$dest"
  git -C "$dest" config user.name "${GIT_AUTHOR_NAME:-mdl-sync}"
  git -C "$dest" config user.email "${GIT_AUTHOR_EMAIL:-mdl-sync@users.noreply.github.com}"

  if git -C "$dest" ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
    git -C "$dest" checkout -q "$BRANCH"
  else
    git -C "$dest" checkout -q -b "$BRANCH"   # a new branch starts from the default branch
  fi

  # Replace everything except .git with the exact tracked tree of the folder at HEAD.
  find "$dest" -mindepth 1 -maxdepth 1 -not -name .git -exec rm -rf {} +
  git -C "$ROOT" archive --format=tar "HEAD:$dir" | tar -x -C "$dest"
  git -C "$dest" add -A

  if git -C "$dest" diff --cached --quiet; then
    echo "   in sync"
    continue
  fi
  echo "   differs:"; git -C "$dest" diff --cached --stat | sed 's/^/   /' | tail -12

  if [ "$MODE" = "check" ]; then
    STATUS=1
  else
    git -C "$dest" commit -q -m "sync from monorepo ${SHA}: ${SUBJECT}"
    git -C "$dest" push -q origin "$BRANCH"
    echo "   pushed ${BRANCH}"
  fi
done

if [ "$MODE" = "check" ] && [ "$STATUS" -ne 0 ]; then
  echo "NOT in sync. Run: scripts/sync-deploy-repos.sh --push" >&2
fi
exit "$STATUS"
