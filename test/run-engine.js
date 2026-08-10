/* jsc-runner voor de engine-tests. Draaien vanuit de repo-root: test.sh doet dat. */
var module = { exports: {} };
if (typeof console === 'undefined') var console = { log: print };
var process = { exit: function (c) { if (c) throw new Error('exit ' + c); } };
function require(p) { return module.exports; }
load('src/engine.js');
load('test/test-engine.js');
