#!/usr/bin/env bash
# Step 5 of the creative-change workflow: commit the result on top of the latest main and push, retrying if another
# change landed first (reset, clean, re-apply, re-guard). If applying or the guard refuses, the request is turned into a
# "failed" log entry and that is pushed instead, so every request ends in the log. Needs GH_TOKEN and REPO
# (PUSH_URL overrides the remote, for tests).
set -uo pipefail
R=.request/out/result.json
URL="${PUSH_URL:-https://x-access-token:${GH_TOKEN}@github.com/${REPO}.git}"
git config user.name "sundae-change-bot"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
fallback=0
# in Actions a "done" change must have passed the build check (it writes .request/out/checked); a cancelled or timed-out
# build check would otherwise publish an unverified change
if [ "${CHANGE_REQUIRE_CHECK:-}" = 1 ] && [ "$(node -p "require('./$R').status")" = done ] && [ ! -f .request/out/checked ]; then
  node engine/change/fail.mjs "The build check didn't finish, so the change was not published. It can be sent again." || exit 1
fi
# up to 15 tries: "Change all" starts many runs that finish close together and push onto the same main
for i in $(seq 1 15); do
  git fetch -q origin main && git reset -q --hard origin/main && git clean -fdq || { sleep 3; continue; }
  if ! { node engine/change/apply.mjs && node engine/change/guard.mjs; }; then
    if [ "$fallback" = 1 ]; then echo "could not record even a failure log"; exit 1; fi
    fallback=1
    node engine/change/fail.mjs "The change couldn't be published safely, so nothing was changed. It can be sent again." || exit 1
    continue
  fi
  ID=$(node -p "require('./$R').request.id"); ASSET=$(node -p "require('./$R').request.asset")
  ST=$(node -p "require('./src/content/requests/${ID}.json').status") # as applied (apply.mjs may turn a change into a failure)
  git add -A
  git commit -q -m "Creative change ${ID}: ${ASSET} (${ST})" || { echo "nothing to commit"; exit 0; }
  if git push -q "$URL" HEAD:main; then echo "pushed ${ID} (${ST})"; exit 0; fi
  sleep $(( (i < 6 ? i : 6) * 4 + RANDOM % 7 ))
done
echo "could not push after 15 tries"; exit 1
