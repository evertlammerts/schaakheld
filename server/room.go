package main

// Kamers en samenspelen (endpoint 4 en 5 uit het memo). Een kamer is
// (id, twee stoeltokens); bezit van een stoeltoken is het stoeltje.
// Kamers leven alleen in het geheugen: een potje is een sessie, geen
// administratie. Er is niets dat kamers of spelers opsomt.
//
// Twee routes naar een kamer:
//   - QR (bij elkaar in de kamer): de host maakt een kamer aan en krijgt
//     beide tokens; het gasttoken gaat in de QR, dus via het scherm, nooit
//     via een server.
//   - Wederzijdse woordcodes (op afstand): beide kinderen genereren twee
//     woorden en typen die van de ander. De server ziet alleen hashes en
//     koppelt pas bij wederzijds aanwijzen: A zegt (ik=a, ander=b) en B
//     zegt (ik=b, ander=a). Wie een code raadt maar niet aangewezen wordt
//     matcht nooit (pinning); een kaping vergt beide codes binnen het
//     venster, tegen dezelfde rem als elk onge-authenticeerd schrijfpad.
//
// De relay is dom: berichten gaan ongelezen naar het andere stoeltje.
// Het zetprotocol (zet, kleurtoewijzing, hersync via FEN, revanche) leeft
// in de client en is transport-onafhankelijk, zoals het memo wil.

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
)

// newToken: 128 bits random, in hetzelfde tekenrepertoire als idRe.
func newToken() string {
	b := make([]byte, 16)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// Een kamer waar beide stoeltjes ooit verbonden waren, heeft een potje en
// overleeft het avondeten en de nacht. Een kamer zonder tweede stoel (een
// onbeantwoorde uitnodiging, een ongebruikte speelcode) houdt het korte
// leven, anders vullen die de maxRooms.
const (
	pairTTL     = 5 * time.Minute
	roomIdle    = 15 * time.Minute
	roomMaxAge  = 3 * time.Hour // harde bovengrens, ook voor een openbaar gehouden socket
	gameIdle    = 12 * time.Hour
	gameMaxAge  = 48 * time.Hour
	maxRooms    = 64
	maxPending  = 256
	maxWsConns  = 160 // globale gelijktijdige websocket-verbindingen
	maxWsBytes  = 4 << 10
	joinTimeout = 10 * time.Second
	writeWait   = 10 * time.Second
	pingEvery   = 30 * time.Second
	pingWait    = 10 * time.Second
)

type seat struct {
	token string
	live  atomic.Bool // heeft dit stoeltje een levende verbinding? (lockvrij leesbaar)

	mu   sync.Mutex // serialiseert schrijvers (relay en peer-signalen)
	conn *websocket.Conn
}

// write stuurt een bericht naar de bezetter van dit stoeltje, met een eigen
// deadline. Een peer die niet meer leest (dood, kwaadaardig) blokkeert zo
// niet de schrijver: de write verloopt en de verbinding gaat dicht, wat de
// leeslus van die peer wakker maakt om op te ruimen.
func (st *seat) write(data []byte) {
	st.mu.Lock()
	c := st.conn
	st.mu.Unlock()
	writeConn(c, data)
}

func writeConn(c *websocket.Conn, data []byte) {
	if c == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), writeWait)
	defer cancel()
	if err := c.Write(ctx, websocket.MessageText, data); err != nil {
		c.CloseNow()
	}
}

type room struct {
	id      string
	seats   [2]*seat
	created time.Time
	touched time.Time // laatste aanmelding, relaybericht of vertrek
	joined  [2]bool   // per stoeltje: ooit verbonden geweest
}

func (r *room) hasGame() bool { return r.joined[0] && r.joined[1] }

// live lockvrij lezen: seat.mu onder s.mu nemen zou een trage schrijver de
// hele server laten bevriezen
func (r *room) occupied() bool { return r.seats[0].live.Load() || r.seats[1].live.Load() }

func (r *room) lifetimes() (idle, maxAge time.Duration) {
	if r.hasGame() {
		return gameIdle, gameMaxAge
	}
	return roomIdle, roomMaxAge
}

type pendingPair struct {
	dirA    string // hash van de richting (ik, ander) van de eerste inzender
	expires time.Time

	// gezet zodra de tweede kant matcht; beide kanten halen daarna hun
	// eigen stoel idempotent op tot de TTL om is (een verloren antwoord of
	// een even weggeklikte iPad strandt zo niemand)
	roomID string
	seatA  string // stoel voor dirA (de host, eerste inzender)
	seatB  string // stoel voor de andere richting (de gast)
}

func newSeat() *seat { return &seat{token: newToken()} }

func (s *server) newRoomLocked() (*room, bool) {
	s.sweepRoomsLocked()
	if len(s.rooms) >= maxRooms && !s.evictRoomLocked() {
		return nil, false
	}
	now := s.cfg.now()
	r := &room{id: newToken(), seats: [2]*seat{newSeat(), newSeat()}, created: now, touched: now}
	s.rooms[r.id] = r
	return r, true
}

// evictRoomLocked maakt plaats in een volle tabel. Weigeren zou bij kamers
// met een potje een halve dag geen nieuw potje betekenen, voor iedereen. Een
// kamer waar iemand in zit wijkt nooit; wie zijn kamer zo kwijt is, krijgt
// bij terugkomen hetzelfde antwoord als bij een verlopen kamer.
func (s *server) evictRoomLocked() bool {
	var weg *room
	for _, r := range s.rooms {
		if !r.occupied() && (weg == nil || wijktEerder(r, weg)) {
			weg = r
		}
	}
	if weg == nil {
		return false
	}
	delete(s.rooms, weg.id)
	return true
}

// een kamer zonder potje (die leeft toch maar een kwartier) voor een
// gepauzeerd potje, en daarbinnen de langst stille
func wijktEerder(a, b *room) bool {
	if a.hasGame() != b.hasGame() {
		return !a.hasGame()
	}
	return a.touched.Before(b.touched)
}

func (s *server) sweepRoomsLocked() {
	now := s.cfg.now()
	for id, r := range s.rooms {
		idle, maxAge := r.lifetimes()
		// harde bovengrens ongeacht activiteit: anders houdt een
		// opengehouden socket zijn kamer voor eeuwig bezet en is de
		// kamer-cap uit te putten
		if now.Sub(r.created) >= maxAge {
			delete(s.rooms, id)
			continue
		}
		if now.Sub(r.touched) < idle {
			continue
		}
		if !r.occupied() {
			delete(s.rooms, id)
		}
	}
	for k, p := range s.pending {
		if !now.Before(p.expires) {
			delete(s.pending, k)
		}
	}
}

/* ---------- kamer maken (QR-route, endpoint 4) ---------- */

func (s *server) handleRoomCreate(w http.ResponseWriter, r *http.Request) {
	if !s.acquire(w, s.roomC) {
		return
	}
	defer func() { <-s.roomC }()
	time.Sleep(s.cfg.redeemDelay)
	s.mu.Lock()
	rm, ok := s.newRoomLocked()
	s.mu.Unlock()
	if !ok {
		http.Error(w, "te druk", http.StatusTooManyRequests)
		return
	}
	writeJSON(w, map[string]string{
		"room":  rm.id,
		"seat":  rm.seats[0].token,
		"guest": rm.seats[1].token,
	})
}

/* ---------- wederzijdse woordcodes (endpoint 4, afstandsroute) ---------- */

// handlePair: {mine, theirs} zijn hashes van de eigen en de overgetypte
// woordcode. Herhaald insturen van hetzelfde paar is pollen. Antwoorden:
// 200 met kamer en stoel bij een match, 204 zolang de ander er nog niet
// is. Meer smaken zijn er niet, dus er valt ook niets af te lezen.
func (s *server) handlePair(w http.ResponseWriter, r *http.Request) {
	var in struct{ Mine, Theirs string }
	if !readJSON(w, r, 4096, &in) {
		return
	}
	if !idRe.MatchString(in.Mine) || !idRe.MatchString(in.Theirs) || in.Mine == in.Theirs {
		http.Error(w, "ongeldig verzoek", http.StatusBadRequest)
		return
	}
	if !s.acquire(w, s.pairC) {
		return
	}
	defer func() { <-s.pairC }()
	time.Sleep(s.cfg.redeemDelay)

	// dezelfde sleutel voor beide richtingen, plus de richting apart:
	// zo matcht alleen wederzijds aanwijzen
	lo, hi := in.Mine, in.Theirs
	if lo > hi {
		lo, hi = hi, lo
	}
	key := lo + "|" + hi
	dir := in.Mine

	s.mu.Lock()
	defer s.mu.Unlock()
	s.sweepRoomsLocked()
	now := s.cfg.now()
	p, bestaat := s.pending[key]

	switch {
	case !bestaat:
		// de tabel is een cache, geen grootboek: bij vol gooien we de
		// oudste eruit in plaats van elke nieuwe koppeling te weigeren.
		// Een legitiem paar matcht binnen een pollcyclus en wordt anders
		// gewoon opnieuw ingestuurd; een spuiter kan zo het koppelen niet
		// vijf minuten platleggen.
		if len(s.pending) >= maxPending {
			s.evictOldestPendingLocked()
		}
		s.pending[key] = &pendingPair{dirA: dir, expires: now.Add(pairTTL)}
		w.WriteHeader(http.StatusNoContent)

	case p.roomID != "":
		// de match is er al; elke kant haalt idempotent zijn eigen stoel
		// op, de hele TTL lang. dir is per constructie of dirA of de
		// complementaire richting.
		if dir == p.dirA {
			writeJSON(w, map[string]any{"room": p.roomID, "seat": p.seatA, "host": true})
		} else {
			writeJSON(w, map[string]any{"room": p.roomID, "seat": p.seatB, "host": false})
		}

	case p.dirA == dir:
		// zelfde kant polt opnieuw; TTL loopt gewoon door
		w.WriteHeader(http.StatusNoContent)

	default:
		// complementaire richting: wederzijds aangewezen, kamer maken.
		// Beide stoelen blijven in de entry staan zodat een verloren
		// antwoord idempotent opnieuw op te halen is.
		rm, ok := s.newRoomLocked()
		if !ok {
			http.Error(w, "te druk", http.StatusTooManyRequests)
			return
		}
		p.roomID = rm.id
		p.seatA = rm.seats[0].token
		p.seatB = rm.seats[1].token
		p.expires = now.Add(pairTTL) // vanaf de match nog een volle TTL om op te halen
		writeJSON(w, map[string]any{"room": rm.id, "seat": p.seatB, "host": false})
	}
}

func (s *server) evictOldestPendingLocked() {
	var oudsteKey string
	var oudste time.Time
	for k, p := range s.pending {
		if oudsteKey == "" || p.expires.Before(oudste) {
			oudsteKey, oudste = k, p.expires
		}
	}
	if oudsteKey != "" {
		delete(s.pending, oudsteKey)
	}
}

/* ---------- de relay (endpoint 5) ---------- */

// handleRoomWS: na de upgrade stuurt de client als eerste bericht
// {"room": ..., "seat": ...}; een geldig stoeltoken is de toegang. Daarna
// gaan tekstberichten ongelezen naar het andere stoeltje. Opnieuw
// verbinden met hetzelfde token neemt het stoeltje over (hersync doet de
// client zelf, via FEN). Het andere stoeltje hoort komen en gaan via
// {"t":"peer","aan":bool}.
func (s *server) handleRoomWS(w http.ResponseWriter, r *http.Request) {
	// globale bovengrens op gelijktijdige verbindingen: het enige
	// onge-authenticeerde pad zonder semafoor mag geen goroutine- en
	// fd-lek worden
	if s.wsActive.Add(1) > maxWsConns {
		s.wsActive.Add(-1)
		http.Error(w, "te druk", http.StatusTooManyRequests)
		return
	}
	defer s.wsActive.Add(-1)

	pat := "*"
	if u, err := url.Parse(s.cfg.origin); err == nil && u.Host != "" {
		pat = u.Host
	}
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: []string{pat}})
	if err != nil {
		return
	}
	c.SetReadLimit(maxWsBytes)
	ctx := r.Context()

	jctx, cancel := context.WithTimeout(ctx, joinTimeout)
	typ, data, err := c.Read(jctx)
	cancel()
	var join struct{ Room, Seat string }
	if err != nil || typ != websocket.MessageText || json.Unmarshal(data, &join) != nil {
		c.Close(websocket.StatusPolicyViolation, "eerst joinen")
		return
	}

	s.mu.Lock()
	rm := s.rooms[join.Room]
	var mine, peer *seat
	if rm != nil {
		if rm.seats[0].token == join.Seat {
			mine, peer = rm.seats[0], rm.seats[1]
			rm.joined[0] = true
		} else if rm.seats[1].token == join.Seat {
			mine, peer = rm.seats[1], rm.seats[0]
			rm.joined[1] = true
		}
		rm.touched = s.cfg.now()
	}
	s.mu.Unlock()
	if mine == nil {
		// onbekende kamer en fout token zijn hetzelfde antwoord
		c.Close(websocket.StatusPolicyViolation, "onbekend")
		return
	}

	// stoel innemen; een oude verbinding (tab kwijt, wifi weg) wordt
	// vervangen door de nieuwe
	mine.mu.Lock()
	old := mine.conn
	mine.conn = c
	mine.live.Store(true)
	mine.mu.Unlock()
	if old != nil {
		// zeg erbij waarom we sluiten. Zonder dat kan de oude kant niet
		// zien of zijn wifi hikte of dat een ander apparaat het stoeltje
		// overnam, en verbindt hij dus opnieuw - waarmee hij de nieuwe
		// eruit gooit, die weer terugkomt, eindeloos. Twee apparaten van
		// hetzelfde kind (dezelfde uitnodiging, allebei aangenomen) doen
		// dat zonder dit bericht om de paar honderd milliseconden.
		writeConn(old, []byte(`{"t":"stoel"}`))
		old.CloseNow()
	}
	// eerst het eigen welkom, dan pas de peer porren: anders kan een
	// relay-bericht of het hallo-antwoord van de peer vóór het welkom
	// binnenkomen, en juist het welkom triggert de hersync bij herverbinden
	mine.write([]byte(`{"t":"welkom"}`))
	peer.write([]byte(`{"t":"peer","aan":true}`))

	// keepalive: ping de peer periodiek zodat een half-open verbinding
	// (kind loopt uit wifi-bereik) binnen seconden opvalt in plaats van
	// pas als TCP het opgeeft. Nadenken tijdens een potje is prima: pongs
	// worden automatisch beantwoord, alleen een dode lijn faalt de ping.
	stopPing := make(chan struct{})
	go func() {
		t := time.NewTicker(pingEvery)
		defer t.Stop()
		for {
			select {
			case <-stopPing:
				return
			case <-t.C:
				pctx, cancel := context.WithTimeout(context.Background(), pingWait)
				err := c.Ping(pctx)
				cancel()
				if err != nil {
					c.CloseNow()
					return
				}
			}
		}
	}()

	for {
		typ, data, err := c.Read(ctx)
		if err != nil {
			break
		}
		if typ != websocket.MessageText {
			continue
		}
		s.mu.Lock()
		rm.touched = s.cfg.now()
		s.mu.Unlock()
		peer.write(data)
	}
	close(stopPing)

	// de stille tijd telt vanaf het vertrek, niet vanaf de laatste zet: een
	// kind dat lang nadenkt en dan de app sluit, verliest die tijd niet
	s.mu.Lock()
	rm.touched = s.cfg.now()
	s.mu.Unlock()

	// alleen opruimen als het stoeltje nog van deze verbinding is
	mine.mu.Lock()
	nog := mine.conn == c
	if nog {
		mine.conn = nil
		mine.live.Store(false)
	}
	mine.mu.Unlock()
	if nog {
		peer.write([]byte(`{"t":"peer","aan":false}`))
	}
	c.CloseNow()
}
