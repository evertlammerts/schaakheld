/* jsc-runner voor de UI-flowtests. test.sh maakt eerst .tmp-ui.js (tail.html zonder
   de afsluitende script-tag) en draait dit script vanuit de repo-root. */
/* de vaste opmaak: het deel van head.html tussen </style> en <script> */
var __VASTE_OPMAAK = (function () {
  var h = readFile('src/head.html');
  return h.slice(h.indexOf('</style>') + 8, h.lastIndexOf('<script>'));
})();
load('test/dom-shim.js');
load('src/engine.js');
load('src/koning.js');
load('src/words.js');
load('src/qr.js');
load('src/jsqr.js');
load('.tmp-ui.js');
var __APP_SRC = readFile('.tmp-ui.js');
load('test/harnas.js');
load('test/orakel-flow.js');
load('test/orakel-flow-6.js');
load('test/orakel-versies.js');
load('test/flow-test.js');
