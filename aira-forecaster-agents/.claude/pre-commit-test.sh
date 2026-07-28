#!/bin/bash
# Runs before any git commit
# Blocks commit if any tests fail

echo "🔍 Running pre-commit test validation..."
npm test -- --reporter=verbose --run 2>&1

if [ $? -ne 0 ]; then
  echo ""
  echo "❌ TESTS FAILED. Commit blocked."
  echo "   Run '[TEST]' for a full diagnostic report."
  exit 1
fi

echo "✅ All tests passed. Commit allowed."