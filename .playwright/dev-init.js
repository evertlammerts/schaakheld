// Laat de app onder tools/dev.sh praten met de lokale Go-server op
// app-poort + 1000, nooit met de productieserver.
(() => {
  try {
    if (location.hostname === '127.0.0.1') {
      const server = 'http://127.0.0.1:' + (Number(location.port) + 1000);
      if (localStorage.getItem('schaakheld-server') !== server) {
        localStorage.setItem('schaakheld-server', server);
      }
    }
  } catch (e) {}
})();
