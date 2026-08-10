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

# PWA-bestanden: manifest parseert, sw.js registreert zijn listeners zonder
# fouten (onder een mini-shim), en de iconen zijn echte PNG's.
python3 -c "import json; json.load(open('manifest.webmanifest'))" || { echo "FAIL manifest"; exit 1; }
[ -f sw.js ] || { echo "FAIL sw.js ontbreekt (draai ./build.sh)"; exit 1; }
grep -q '__VERSION__' sw.js && { echo "FAIL sw.js versie niet ingevuld"; exit 1; }
cat > .tmp-sw-shim.js <<'SHIM'
var self = { addEventListener: function () {}, skipWaiting: function () {},
  clients: { claim: function () {} }, location: { origin: '' } };
var caches = { open: function () { return Promise.resolve(); },
  keys: function () { return Promise.resolve([]); },
  match: function () { return Promise.resolve(); }, delete: function () {} };
SHIM
cat .tmp-sw-shim.js sw.js > .tmp-sw.js
"$JSC" .tmp-sw.js || { echo "FAIL sw.js"; exit 1; }
rm -f .tmp-sw-shim.js .tmp-sw.js
for icon in icon-180.png icon-192.png icon-512.png icon-512-mask.png; do
  python3 -c "
import sys, struct, zlib
d = open('$icon', 'rb').read()
assert d[:8] == b'\x89PNG\r\n\x1a\n', 'geen PNG'
w, h = struct.unpack('>II', d[16:24])
assert w == h and w in (180, 192, 512), 'gekke maat: %dx%d' % (w, h)
" || { echo "FAIL $icon"; exit 1; }
done
echo "PWA-checks ok"
