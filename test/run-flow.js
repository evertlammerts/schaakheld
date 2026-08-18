/* jsc-runner voor de UI-flowtests. test.sh maakt eerst .tmp-ui.js (tail.html zonder
   de afsluitende script-tag) en draait dit script vanuit de repo-root. */
load('test/dom-shim.js');
load('src/engine.js');
load('src/words.js');
load('src/qr.js');
load('.tmp-ui.js');
load('test/flow-test.js');
