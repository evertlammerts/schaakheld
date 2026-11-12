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

wait_port() {
  i=0
  while ! listening "$1"; do
    i=$((i + 1))
    alive "$3" || { echo "proces voor poort $1 is gestopt, zie $2" >&2; exit 1; }
    [ $i -gt 50 ] && { echo "poort $1 kwam niet op, zie $2" >&2; exit 1; }
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

stop_pid() {
  alive "$1" || { rm -f "$1"; return 0; }
  pid=$(cat "$1")
  kill "$pid"
  i=0
  while kill -0 "$pid" 2>/dev/null; do
    i=$((i + 1))
    [ $i -gt 30 ] && kill -9 "$pid" 2>/dev/null
    sleep 0.1
  done
  rm -f "$1"
}

start_server() {
  port=$1 dir=$2 st=$(state_dir "$1") sport=$(($1 + 1000))
  alive "$st/server.pid" && return 0
  listening "$sport" && { echo "poort $sport is al bezet door iets anders" >&2; exit 1; }
  (cd "$dir/server" && go build -o "$st/schaakheld-server" .)
  mkdir -p "$st/data"
  nohup "$st/schaakheld-server" -addr "127.0.0.1:$sport" \
    -origin "http://127.0.0.1:$port" -data "$st/data" \
    > "$st/server.log" 2>&1 &
  echo $! > "$st/server.pid"
  wait_port "$sport" "$st/server.log" "$st/server.pid"
}

start_app() {
  port=$1 dir=$2 st=$(state_dir "$1")
  alive "$st/app.pid" && return 0
  listening "$port" && { echo "poort $port is al bezet door iets anders" >&2; exit 1; }
  py=$(uv python find)
  # no-cache zodat een herladen na ./build.sh altijd de nieuwe build ziet.
  # Elke geserveerde index.html krijgt vooraan de lokale server als
  # schaakheld-server, zodat ook een browser zonder Playwright-initscript
  # (de iOS-simulator) nooit de productieserver aanspreekt.
  nohup "$py" -c '
import os, sys, functools, http.server
port, root = int(sys.argv[1]), sys.argv[2]
pin = ("<script>try{localStorage.setItem(\"schaakheld-server\","
       "\"http://127.0.0.1:%d\")}catch(e){}</script>" % (port + 1000)).encode()
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".webmanifest": "application/manifest+json"}
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()
    def do_GET(self):
        if self.path.split("?")[0] not in ("/", "/index.html"):
            return super().do_GET()
        body = open(os.path.join(root, "index.html"), "rb").read()
        i = body.find(b"<head>")
        if i < 0:
            self.send_error(500, "index.html zonder <head>")
            return
        body = body[:i + 6] + pin + body[i + 6:]
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
  wait_port "$port" "$st/app.log" "$st/app.pid"
}

stop_port() {
  st=$(state_dir "$1")
  stop_pid "$st/app.pid"
  stop_pid "$st/server.pid"
  wait_free "$1"
  wait_free $(($1 + 1000))
}

ports() { [ -d "$DEV" ] && ls "$DEV" 2>/dev/null | grep -E '^[0-9]+$' || true; }

case "$cmd" in
  start)
    dir=$(cd "${2:-$ROOT}" && pwd)
    port=${3:-8711}
    [ -f "$dir/index.html" ] || { echo "geen index.html in $dir, eerst ./build.sh" >&2; exit 1; }
    st=$(state_dir "$port")
    mkdir -p "$st"
    if [ -f "$st/dir" ] && [ "$(cat "$st/dir")" != "$dir" ] && { alive "$st/app.pid" || alive "$st/server.pid"; }; then
      echo "poort $port serveert al $(cat "$st/dir"); eerst tools/dev.sh stop $port" >&2
      exit 1
    fi
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
    stop_pid "$st/server.pid"
    wait_free $((port + 1000))
    rm -rf "$st/data"
    start_server "$port" "$(cat "$st/dir")"
    echo "serverdata van $port gewist"
    ;;
  status)
    for p in $(ports); do
      st=$(state_dir "$p")
      a=uit; s=uit
      alive "$st/app.pid" && a=aan
      alive "$st/server.pid" && s=aan
      echo "$p: app $a, server $s ($(cat "$st/dir" 2>/dev/null))"
    done
    ;;
  *)
    sed -n '2,11p' "$0" >&2
    exit 2
    ;;
esac
