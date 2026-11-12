#!/bin/sh
# Lokale ontwikkelservers: de app uit MAP op POORT, en de Go-server op
# POORT+1000 met precies die app als origin. De server staat maar een
# CORS-origin toe, dus elke app-poort krijgt een eigen server en datamap.
#
#   tools/dev.sh start [MAP] [POORT]   standaard: deze repo op 8711
#   tools/dev.sh stop [POORT]          zonder poort: alles stoppen
#   tools/dev.sh reset [POORT]         serverdata wissen en server herstarten
#   tools/dev.sh status
#
# Alles draait op 127.0.0.1 (een veilige context, dus de service worker
# werkt). Status, logs en serverdata staan in .dev/<poort>/.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DEV="$ROOT/.dev"
cmd=${1:-status}

state_dir() { echo "$DEV/$1"; }
alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }
listening() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
# Na een herstart van de machine kan het pid uit een oud pid-bestand van een
# vreemd proces zijn. Van ons is het alleen als het ook op onze poort
# luistert; alleen dan wordt het als draaiend gezien of gestopt.
ours() { alive "$1" && lsof -nP -a -p "$(cat "$1")" -iTCP:"$2" -sTCP:LISTEN >/dev/null 2>&1; }

wait_port() {
  i=0
  while ! ours "$3" "$1"; do
    i=$((i + 1))
    alive "$3" || { echo "proces voor poort $1 is gestopt, zie $2" >&2; return 1; }
    [ $i -gt 50 ] && { echo "poort $1 kwam niet op, zie $2" >&2; return 1; }
    sleep 0.1
  done
}

wait_free() {
  i=0
  while listening "$1"; do
    i=$((i + 1))
    [ $i -gt 50 ] && { echo "poort $1 blijft bezet" >&2; exit 1; }
    sleep 0.1
  done
}

kill_pid() {
  pid=$(cat "$1")
  kill "$pid" 2>/dev/null || true
  i=0
  while kill -0 "$pid" 2>/dev/null; do
    i=$((i + 1))
    [ $i -gt 30 ] && { kill -9 "$pid" 2>/dev/null || true; }
    sleep 0.1
  done
  rm -f "$1"
}

stop_pid() {
  ours "$1" "$2" || { rm -f "$1"; return 0; }
  kill_pid "$1"
  wait_free "$2"
}

start_server() {
  port=$1 dir=$2 st=$(state_dir "$1") sport=$(($1 + 1000))
  ours "$st/server.pid" "$sport" && return 0
  (cd "$dir/server" && go build -o "$st/schaakheld-server" .)
  mkdir -p "$st/data"
  nohup "$st/schaakheld-server" -addr "127.0.0.1:$sport" \
    -origin "http://127.0.0.1:$port" -data "$st/data" \
    > "$st/server.log" 2>&1 &
  echo $! > "$st/server.pid"
  wait_port "$sport" "$st/server.log" "$st/server.pid" || { kill_pid "$st/server.pid"; exit 1; }
  started_server=1
}

start_app() {
  port=$1 dir=$2 st=$(state_dir "$1")
  ours "$st/app.pid" "$port" && return 0
  # no-cache zodat een herladen na ./build.sh altijd de nieuwe build ziet.
  # Elk html-document krijgt vooraan de lokale server als schaakheld-server,
  # zodat ook een browser zonder Playwright-initscript (de iOS-simulator) de
  # lokale server gebruikt. De Content-Security-Policy is het vangnet: de
  # browser zelf weigert elke verbinding (fetch, WebSocket) buiten 127.0.0.1,
  # ook als die instelling ontbreekt of de app hem niet meer leest.
  nohup "$py" -c '
import os, re, sys, functools, http.server
port, root = int(sys.argv[1]), sys.argv[2]
pin = ("<script>try{localStorage.setItem(\"schaakheld-server\","
       "\"http://127.0.0.1:%d\")}catch(e){}</script>" % (port + 1000)).encode()
csp = ("default-src \x27self\x27 \x27unsafe-inline\x27 data: blob: mediastream:; "
       "connect-src http://127.0.0.1:* ws://127.0.0.1:*; form-action \x27self\x27")
head = re.compile(rb"<head[^>]*>", re.I)
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".webmanifest": "application/manifest+json"}
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Security-Policy", csp)
        super().end_headers()
    def do_GET(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path) and self.path.split("?")[0].split("#")[0].endswith("/"):
            path = os.path.join(path, "index.html")
        if not (path.lower().endswith((".html", ".htm")) and os.path.isfile(path)):
            return super().do_GET()
        body = open(path, "rb").read()
        m = head.search(body)
        if not m:
            self.send_error(500, "html zonder <head>")
            return
        body = body[:m.end()] + pin + body[m.end():]
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
http.server.ThreadingHTTPServer(("127.0.0.1", port),
    functools.partial(H, directory=root)).serve_forever()
' "$port" "$dir" > "$st/app.log" 2>&1 &
  echo $! > "$st/app.pid"
  echo "$dir" > "$st/dir"
  wait_port "$port" "$st/app.log" "$st/app.pid" || {
    kill_pid "$st/app.pid"
    [ -n "$started_server" ] && kill_pid "$st/server.pid"
    exit 1
  }
}

stop_port() {
  st=$(state_dir "$1")
  stop_pid "$st/app.pid" "$1"
  stop_pid "$st/server.pid" $(($1 + 1000))
}

ports() { [ -d "$DEV" ] && ls "$DEV" 2>/dev/null | grep -E '^[0-9]+$' || true; }

case "$cmd" in
  start)
    dir=$(cd "${2:-$ROOT}" && pwd)
    port=${3:-8711}
    sport=$((port + 1000))
    [ -f "$dir/index.html" ] || { echo "geen index.html in $dir, eerst ./build.sh" >&2; exit 1; }
    st=$(state_dir "$port")
    mkdir -p "$st"
    if [ -f "$st/dir" ] && [ "$(cat "$st/dir")" != "$dir" ] && { ours "$st/app.pid" "$port" || ours "$st/server.pid" "$sport"; }; then
      echo "poort $port serveert al $(cat "$st/dir"); eerst tools/dev.sh stop $port" >&2
      exit 1
    fi
    ours "$st/server.pid" "$sport" || ! listening "$sport" || { echo "poort $sport is al bezet door iets anders" >&2; exit 1; }
    ours "$st/app.pid" "$port" || ! listening "$port" || { echo "poort $port is al bezet door iets anders" >&2; exit 1; }
    py=$(uv python find)
    started_server=
    start_server "$port" "$dir"
    start_app "$port" "$dir"
    echo "app:    http://127.0.0.1:$port/  ($dir)"
    echo "server: http://127.0.0.1:$((port + 1000))/  (data: $(state_dir "$port")/data)"
    ;;
  stop)
    if [ -n "$2" ]; then stop_port "$2"; else for p in $(ports); do stop_port "$p"; done; fi
    ;;
  reset)
    port=${2:-8711} st=$(state_dir "${2:-8711}")
    [ -f "$st/dir" ] || { echo "poort $port draait niet via dev.sh" >&2; exit 1; }
    stop_pid "$st/server.pid" $((port + 1000))
    wait_free $((port + 1000))
    rm -rf "$st/data"
    start_server "$port" "$(cat "$st/dir")"
    echo "serverdata van $port gewist"
    ;;
  status)
    for p in $(ports); do
      st=$(state_dir "$p")
      a=uit; s=uit
      ours "$st/app.pid" "$p" && a=aan
      ours "$st/server.pid" $((p + 1000)) && s=aan
      echo "$p: app $a, server $s ($(cat "$st/dir" 2>/dev/null))"
    done
    ;;
  *)
    sed -n '2,11p' "$0" >&2
    exit 2
    ;;
esac
