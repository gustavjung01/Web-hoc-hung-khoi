#!/usr/bin/env bash
set -e

COMMIT_MSG="$(git log -1 --pretty=%B || true)"

if echo "$COMMIT_MSG" | grep -Eiq "\[vercel deploy\]|\[deploy vercel\]"; then
  echo "Vercel deploy requested by commit message."
  exit 1
fi

echo "Skip Vercel deploy by default."
exit 0
