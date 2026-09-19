#!/usr/bin/env bash
# Fire Desk: put the night 2 branch on GitHub.
# Run this from inside a clone of the Fire Desk repo.
# Usage: bash push-branch.sh /full/path/to/fire-desk-night-2.bundle

set -e

BUNDLE="$1"

if [ -z "$BUNDLE" ]; then
  echo "Usage: bash push-branch.sh /full/path/to/fire-desk-night-2.bundle"
  exit 1
fi

if [ ! -f "$BUNDLE" ]; then
  echo "Bundle not found at: $BUNDLE"
  exit 1
fi

if [ ! -d .git ]; then
  echo "This is not a git repo. Run the script from inside your Fire Desk clone."
  exit 1
fi

echo "Step 1 of 4: verifying the bundle"
git bundle verify "$BUNDLE"

echo "Step 2 of 4: making sure main is up to date"
git checkout main
git pull

echo "Step 3 of 4: importing the branch from the bundle"
git fetch "$BUNDLE" feat/mvp-night-2:feat/mvp-night-2

echo "Step 4 of 4: pushing the branch to GitHub"
git push -u origin feat/mvp-night-2

echo
echo "Done. The branch feat/mvp-night-2 is now on GitHub."
echo "Next: open the pull request feat/mvp-night-2 into main and merge it."
echo "The merge removes files/, git/, README-UPLOAD.txt, DELETE-THESE-FILES.txt"
echo "and the two stale migrations by itself. Do not delete anything by hand."
