#!/usr/bin/env bash
# Run before every commit. Fails if you touched anything outside your lane.
# Allowed: new files under docs/ds/, new src/engine/*.js you created, new src/*.test.js you created.
set -e
BASE=ux/configure-and-countdown
BAD=$(git diff --name-status "$BASE" | awk '
  $1=="A" && ($2 ~ /^docs\/ds\// || $2 ~ /^src\/engine\/(bucketColors|incomeLabels)\.js$/ || $2 ~ /^src\/(bucketColors|incomeLabels|tzDates)\.test\.js$/) {next}
  {print}')
if [ -n "$BAD" ]; then echo "OUT OF LANE:"; echo "$BAD"; exit 1; fi
echo "scope OK"
