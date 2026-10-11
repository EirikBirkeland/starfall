#!/bin/sh
# Publishes a release: runs the checks, copies the playable game into releases/v<version>/,
# lists it in releases/releases.json (read by the menu page), commits, and tags.
#
# Usage: tools/release.sh <version> "<one line summary>"
#        tools/release.sh 0.1.0 "Split into modules, headless simulation"

set -e
cd "$(dirname "$0")/.."

version="$1"
summary="$2"
tag="v$version"

# Top-level things the browser loads. Add new folders here when the game starts using them.
playable_items="index.html src assets"

if [ -z "$version" ] || [ -z "$summary" ]; then
  echo 'usage: tools/release.sh <version> "<one line summary>"'
  exit 1
fi

if ! echo "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "The version must look like 0.1.0, got: $version"
  exit 1
fi

if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  echo "$tag already exists. Pick the next version."
  exit 1
fi

if ! grep -q "$version" CHANGELOG.md 2>/dev/null; then
  echo "Add an entry for $version to CHANGELOG.md first."
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "The work tree has uncommitted changes. Commit them first."
  exit 1
fi

echo "Checking syntax..."
for folder in src tools test; do
  [ -d "$folder" ] || continue
  for file in $(find "$folder" \( -name '*.js' -o -name '*.mjs' \) -not -name '.*'); do
    node --check "$file"
  done
done

if [ -d test ]; then
  echo "Running tests..."
  node --test
fi

if [ -f tools/simulate.js ]; then
  echo "Running the headless simulation..."
  node tools/simulate.js >/dev/null
fi

if [ -f tools/shake-meter.js ]; then
  # The owner's health rule, measured on two runs before the release goes out: the window is
  # shaken extraordinarily and not otherwise (test/shake-policy.test.mjs holds the policy,
  # this says what a real run did with it).
  echo "Measuring how much the window moves..."
  node tools/shake-meter.js --runs 2 --seconds 180 --need-still 95
fi

destination="releases/$tag"
mkdir -p "$destination"
for item in $playable_items; do
  [ -e "$item" ] && cp -r "$item" "$destination/"
done

node --input-type=commonjs -e '
const fs = require("fs");
const [version, summary] = process.argv.slice(1);
const manifestPath = "releases/releases.json";
const releases = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : [];
const date = new Date().toISOString().slice(0, 10);
// released is the exact moment, for the version menu; date stays for anything that reads the day.
releases.unshift({ version, date, released: new Date().toISOString(), summary });
fs.writeFileSync(manifestPath, JSON.stringify(releases, null, 2) + "\n");
' "$version" "$summary"

# How much this release changed, for the menu that lists them: the lines since the previous tag, and
# how far the session log had got. This runs between the entry being written and the release being
# committed, which is the only moment when "since the last release" is HEAD and "how far the log has
# got" is the size of the file. --stamp fills the entry it just wrote and touches no other.
if [ -f tools/release-stats.js ]; then
  echo "Counting what this release changed..."
  # A number for the menu must never be the reason a release did not happen, so a failure here is
  # reported and stepped over: the entry keeps its version, date and summary and simply has no
  # numbers, and `node tools/release-stats.js --check` will say which entries are still blank.
  node tools/release-stats.js --stamp "$version" \
    || echo "warning: could not count this release; releases.json has no numbers for $version"
fi

git add -A
git commit -q -m "Release $tag: $summary"
git tag -a "$tag" -m "$summary"

echo "Released $tag. It is now in the menu."
