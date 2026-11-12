/* jsc-runner voor de tweeapparaten-tests. test.sh maakt eerst .tmp-ui.js
   (tail.html zonder de afsluitende script-tag) en draait dit vanuit de
   repo-root. De app-broncode gaat als tekst naar de harnas, die hem per
   apparaat in een eigen scope evalueert. */
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
var __APP_SRC = readFile('.tmp-ui.js');
load('test/harnas.js');
load('test/orakel-twee.js');
load('test/twee-apparaten.js');
