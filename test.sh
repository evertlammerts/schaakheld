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

# Woordlijst voor koppel- en speelcodes: precies 1024 unieke, gesorteerde
# woorden van 4-8 kleine letters zonder de telefoonvalkuilen (c, x, y, q,
# ei/ij, au/ou), en zonder twee woorden die hetzelfde klinken (zelfde
# klanksleutel als in tools/make-wordlist.py). Regenereren:
# uv run tools/make-wordlist.py
python3 -c "
import re
words = open('src/words-nl.txt').read().splitlines()
assert len(words) == 1024, 'geen 1024 maar %d woorden' % len(words)
assert len(set(words)) == 1024, 'dubbele woorden'
assert words == sorted(words), 'niet gesorteerd'
def sleutel(w):
    k = w.replace('ch', 'g').replace('v', 'f').replace('w', 'f').replace('z', 's')
    if k.endswith('dt'): k = k[:-2] + 't'
    elif k.endswith('d'): k = k[:-1] + 't'
    elif k.endswith('b'): k = k[:-1] + 'p'
    if k.endswith('e') and len(k) > 4 and k[-2] not in 'aeiou':
        k = k[:-1]
        if len(k) > 1 and k[-1] == k[-2]: k = k[:-1]
    if k.endswith('m'): k = k[:-1] + 'n'
    return k
gezien = {}
for w in words:
    assert re.fullmatch(r'[a-z]{4,8}', w), 'ongeldig woord: %r' % w
    assert not any(v in w for v in ('c', 'x', 'y', 'q', 'ei', 'ij', 'au', 'ou')), 'valkuil in: %r' % w
    k = sleutel(w)
    assert k not in gezien, 'klinkt gelijk: %r en %r' % (gezien[k], w)
    gezien[k] = w
import json
js = open('src/words.js').read()
assert json.loads(js[js.index('['):js.rindex(']')+1]) == words, 'words.js loopt niet gelijk met words-nl.txt'
" || { echo "FAIL words-nl.txt"; exit 1; }
echo "woordlijst ok"

# Go-server-suite: draait alleen met een go-toolchain (op de laptop
# ontbreekt die; de devbox draait hem via nix shell nixpkgs#go).
if command -v go >/dev/null 2>&1; then
  (cd server && go vet ./... && go test ./...) || { echo "FAIL server"; exit 1; }
  echo "server-tests ok"
else
  echo "WAARSCHUWING: go ontbreekt, server-tests overgeslagen (devbox: nix shell nixpkgs#go -c go test ./server/...)"
fi
