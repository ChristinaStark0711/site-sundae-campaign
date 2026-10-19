#!/usr/bin/env bash
# Step 5 of the creative-change workflow: commit the result on top of the latest main and push, retrying if another
# change landed first (reset, re-apply, re-guard). Needs GH_TOKEN and REPO.
set -euo pipefail
R=.request/out/result.json
ID=$(node -p "require('./$R').request.id")
ST=$(node -p "require('./$R').status")
ASSET=$(node -p "require('./$R').request.asset")
git config user.name "sundae-change-bot"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
for i in 1 2 3 4 5; do
  git fetch -q origin main
  git reset -q --hard origin/main
  node engine/change/apply.mjs
  node engine/change/guard.mjs
  git add -A
  git commit -q -m "Creative change ${ID}: ${ASSET} (${ST})"
  if git push -q "https://x-access-token:${GH_TOKEN}@github.com/${REPO}.git" HEAD:main; then echo "pushed ${ID} (${ST})"; exit 0; fi
  sleep $((i * 4))
done
echo "could not push after 5 tries"; exit 1
