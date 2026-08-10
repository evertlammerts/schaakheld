#!/bin/sh
# Draait beide testsuites headless:
#  1. engine-tests (perft, mat/pat, SEE, drill-generatoren)
#  2. UI-flowtests (drills, uitleg, partij, blunder-alarm, voorspellen) op een DOM-shim
# Gebruikt jsc (zit standaard in macOS). Met node werkt de engine-suite ook:
#   node test/test-engine.js
set -e
cd "$(dirname "$0")"
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
if [ ! -x "$JSC" ]; then
  echo "jsc niet gevonden op $JSC" >&2
  echo "alternatief: node test/test-engine.js (alleen de engine-suite)" >&2
  exit 1
fi
"$JSC" test/run-engine.js
sed '$ s@</script>@@' src/tail.html > .tmp-ui.js
"$JSC" test/run-flow.js
rm -f .tmp-ui.js
