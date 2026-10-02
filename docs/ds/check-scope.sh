#!/usr/bin/env bash
# Run before every commit. Fails if you touched anything outside your lane.
# Allowed: new files under docs/ds/, new src/engine/*.js you created, new src/*.test.js you created.
set -e
BASE=ux/configure-and-countdown
BAD=$(git diff --name-status "$BASE" | awk '
  $1=="A" && ($2 ~ /^docs\/ds\// || $2 ~ /^src\/engine\/(bucketColors|incomeLabels)\.js$/ || $2 ~ /^src\/(bucketColors|incomeLabels|tzDates|realEstateSection|budgetEditor|spouseDobField|bucketLegend|helpFormat)\.test\.js$/ || $2 ~ /^src\/planInputs\// || $2 ~ /^src\/(SpouseDobField|BucketLegend)\.jsx$/) {next}
  $1=="M" && ($2 ~ /^src\/(CountdownCard\.jsx|engine\/retirementTarget\.js|countdownCard\.test\.js|retirementTarget\.test\.js|budgetEditor\.test\.js|about\.js)$/ || $2 ~ /^src\/planInputs\/BudgetEditor\.jsx$/ || $2 ~ /^src\/help\// || $2 ~ /^docs\/ds\//) {next}
  {print}')
if [ -n "$BAD" ]; then echo "OUT OF LANE:"; echo "$BAD"; exit 1; fi
echo "scope OK"
