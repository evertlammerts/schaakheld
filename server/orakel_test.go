package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
)

/* Regels uit plan.md die nog niet gebouwd zijn: hun blok moet falen. Faalt
   het, dan logt de test "NOG NIET GEBOUWD" en is hij groen; slaagt het, dan
   is hij rood, zodat een gebouwde regel niet als "nog niet" blijft staan.
   Een gebouwde regel roept het blok rechtstreeks aan met t. Go's eigen
   t.Skip zou het blok nooit draaien en een onverwachte slaag niet zien. */

type tb interface {
	Helper()
	Errorf(format string, args ...any)
	Fatalf(format string, args ...any)
}

type rapport interface {
	Helper()
	Errorf(format string, args ...any)
	Logf(format string, args ...any)
}

type proef struct{ fouten []string }

type stopProef struct{}

func (p *proef) Helper() {}
func (p *proef) Errorf(f string, a ...any) {
	p.fouten = append(p.fouten, fmt.Sprintf(f, a...))
}
func (p *proef) Fatalf(f string, a ...any) {
	p.Errorf(f, a...)
	panic(stopProef{})
}

func nogNiet(r rapport, regel string, blok func(t tb)) {
	r.Helper()
	p := &proef{}
	func() {
		defer func() {
			if x := recover(); x != nil {
				if _, ok := x.(stopProef); !ok {
					p.fouten = append(p.fouten, fmt.Sprint("paniek: ", x))
				}
			}
		}()
		blok(p)
	}()
	if len(p.fouten) == 0 {
		r.Errorf("%s staat als nog niet gebouwd, maar slaagt al: maak er een gewone test van", regel)
		return
	}
	r.Logf("NOG NIET GEBOUWD %s (%s)", regel, p.fouten[0])
}

type opname struct{ fouten, logs []string }

func (o *opname) Helper() {}
func (o *opname) Errorf(f string, a ...any) {
	o.fouten = append(o.fouten, fmt.Sprintf(f, a...))
}
func (o *opname) Logf(f string, a ...any) { o.logs = append(o.logs, fmt.Sprintf(f, a...)) }

func TestOrakelMechanisme(t *testing.T) {
	faalt := &opname{}
	nogNiet(faalt, "[proef]", func(t tb) { t.Errorf("nog niet") })
	if len(faalt.fouten) != 0 || len(faalt.logs) != 1 {
		t.Fatalf("een falend blok moet groen blijven met een log, kreeg %+v", faalt)
	}
	stopt := &opname{}
	nogNiet(stopt, "[proef]", func(t tb) { t.Fatalf("stopt hier"); t.Errorf("komt hier niet") })
	if len(stopt.fouten) != 0 || len(stopt.logs) != 1 {
		t.Fatalf("Fatalf moet het blok stoppen en groen blijven, kreeg %+v", stopt)
	}
	slaagt := &opname{}
	nogNiet(slaagt, "[proef]", func(t tb) {})
	if len(slaagt.fouten) != 1 {
		t.Fatalf("een slagend blok moet rood worden, kreeg %+v", slaagt)
	}
}

/* ---------- 4.9: hoe lang een kamer leeft ---------- */

// zonder *testing.T, zodat een blok van nogNiet ze ook kan gebruiken
func doe(s *server, method, path string, body any) *httptest.ResponseRecorder {
	var b []byte
	if body != nil {
		b, _ = json.Marshal(body)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(b))
	w := httptest.NewRecorder()
	s.ServeHTTP(w, req)
	return w
}

func kamerBestaat(s *server, id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.rooms[id]
	return ok
}

// opruimen gebeurt bij het maken van een kamer, zoals op de echte server
func veeg(t tb, s *server) {
	t.Helper()
	if w := doe(s, "POST", "/v1/room", nil); w.Code != 200 {
		t.Fatalf("nieuwe kamer: %d", w.Code)
	}
}

func nieuweKamer(s *server) (room, seat, guest string) {
	var rm struct{ Room, Seat, Guest string }
	json.Unmarshal(doe(s, "POST", "/v1/room", nil).Body.Bytes(), &rm)
	return rm.Room, rm.Seat, rm.Guest
}

// beide stoeltjes zijn een keer verbonden geweest: er is een potje begonnen
func kamerMetPotje(t tb, s *server, ts *httptest.Server) string {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	room, seat, guest := nieuweKamer(s)
	u := "ws" + strings.TrimPrefix(ts.URL, "http") + "/v1/room/ws"
	var conns []*websocket.Conn
	for _, tok := range []string{seat, guest} {
		c, _, err := websocket.Dial(ctx, u, nil)
		if err != nil {
			t.Fatalf("verbinden: %v", err)
		}
		if err := c.Write(ctx, websocket.MessageText, []byte(`{"room":"`+room+`","seat":"`+tok+`"}`)); err != nil {
			t.Fatalf("aanmelden: %v", err)
		}
		if _, _, err := c.Read(ctx); err != nil {
			t.Fatalf("welkom: %v", err)
		}
		conns = append(conns, c)
	}
	for _, c := range conns {
		c.CloseNow()
	}
	for i := 0; i < 400; i++ {
		s.mu.Lock()
		r := s.rooms[room]
		leeg := r != nil && !r.seats[0].live.Load() && !r.seats[1].live.Load()
		s.mu.Unlock()
		if leeg {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	return room
}

func TestOrakelKamerZonderTweedeStoelVerlooptNaKwartier(t *testing.T) {
	// [4.9] zoals vandaag: een kamer waar nooit een tweede stoel kwam, is na 15 minuten stil weg
	s, clk := newTestServer(t, nil)
	room, _, _ := nieuweKamer(s)
	clk.advance(14 * time.Minute)
	veeg(t, s)
	if !kamerBestaat(s, room) {
		t.Fatalf("na 14 minuten moet de kamer er nog zijn")
	}
	clk.advance(2 * time.Minute)
	veeg(t, s)
	if kamerBestaat(s, room) {
		t.Fatalf("na 16 minuten stil moet een kamer zonder potje weg zijn")
	}
}

func TestOrakelKamerMetPotjeLeeftTwaalfUurStil(t *testing.T) {
	s, clk := newTestServer(t, nil)
	ts := httptest.NewServer(s)
	defer ts.Close()
	// [4.9] een kamer met een potje leeft 12 uur stil
	func(t tb) {
		id := kamerMetPotje(t, s, ts)
		clk.advance(2 * time.Hour)
		veeg(t, s)
		if !kamerBestaat(s, id) {
			t.Fatalf("na 2 uur stil moet een kamer met een potje er nog zijn")
		}
		clk.advance(9*time.Hour + 50*time.Minute)
		veeg(t, s)
		if !kamerBestaat(s, id) {
			t.Fatalf("na 11 uur 50 stil moet hij er nog zijn")
		}
		clk.advance(20 * time.Minute)
		veeg(t, s)
		if kamerBestaat(s, id) {
			t.Fatalf("na 12 uur 10 stil moet hij weg zijn")
		}
	}(t)
}

func TestOrakelKamerMetPotjeHoogstens48Uur(t *testing.T) {
	s, clk := newTestServer(t, nil)
	ts := httptest.NewServer(s)
	defer ts.Close()
	// [4.9] een kamer met een potje leeft hoogstens 48 uur
	func(t tb) {
		id := kamerMetPotje(t, s, ts)
		// elke 10 uur even iemand terug: nooit 12 uur stil, maar de kamer wordt ouder
		for i := 0; i < 4; i++ {
			clk.advance(10 * time.Hour)
			s.mu.Lock()
			if r := s.rooms[id]; r != nil {
				r.touched = clk.now()
			}
			s.mu.Unlock()
		}
		veeg(t, s)
		if !kamerBestaat(s, id) {
			t.Fatalf("na 40 uur met bezoek moet hij er nog zijn")
		}
		clk.advance(9 * time.Hour)
		veeg(t, s)
		if kamerBestaat(s, id) {
			t.Fatalf("na 49 uur moet hij weg zijn, ook met bezoek")
		}
	}(t)
}

/* ---------- 4.10: een koppelcode werkt tien minuten ---------- */

func TestOrakelKoppelcodeTienMinuten(t *testing.T) {
	s, clk := newTestServer(t, nil)
	// [4.10] een koppelcode werkt tien minuten
	func(t tb) {
		doe(s, "POST", "/v1/link", map[string]string{"code": "aap-noot-mies-wim", "payload": "x"})
		clk.advance(9*time.Minute + 30*time.Second)
		if w := doe(s, "POST", "/v1/link/redeem", map[string]string{"code": "aap-noot-mies-wim"}); w.Code != 200 {
			t.Fatalf("na 9,5 minuten moet de code nog werken, kreeg %d", w.Code)
		}
		doe(s, "POST", "/v1/link", map[string]string{"code": "kat-vis-boom-lamp", "payload": "y"})
		clk.advance(10*time.Minute + 30*time.Second)
		if w := doe(s, "POST", "/v1/link/redeem", map[string]string{"code": "kat-vis-boom-lamp"}); w.Code != 404 {
			t.Fatalf("na 10,5 minuten moet de code op zijn, kreeg %d", w.Code)
		}
	}(t)
}

/* ---------- 6.10 en 6.11: brievenbussen voor potjes over dagen ---------- */

// een bewijs en de bus die erbij hoort, zoals de app ze uit K afleidt
func potjeBus(naam string) (bewijs, bus string) {
	bewijs = "potje-" + naam + "-0123456789abcdef"
	return bewijs, busID(bewijs)
}

func schrijfPotje(s *server, bewijs, bus, blob string) int {
	return doe(s, "POST", "/v1/potje", map[string]string{"bus": bus, "bewijs": bewijs, "blob": blob}).Code
}

type potjesGelezen struct {
	Blobs       map[string]string
	Ongewijzigd map[string]int64
	Nu          *int64
}

func leesPotjes(s *server, ids ...string) potjesGelezen {
	var g potjesGelezen
	json.Unmarshal(doe(s, "POST", "/v1/bus/check", map[string]any{"bussen": ids}).Body.Bytes(), &g)
	return g
}

func TestOrakelPotjeSchrijvenEnLezen(t *testing.T) {
	s, _ := newTestServer(t, nil)
	// [6.10] een potjesbus: schrijven met het bewijs, lezen via de check, opnieuw schrijven vervangt
	func(t tb) {
		bewijs, bus := potjeBus("a")
		if c := schrijfPotje(s, bewijs, bus, "potje-1"); c != 204 {
			t.Fatalf("schrijven: %d, wil 204", c)
		}
		if g := leesPotjes(s, bus); g.Blobs[bus] != "potje-1" {
			t.Fatalf("lezen: %+v", g)
		}
		if c := schrijfPotje(s, bewijs, bus, "potje-2"); c != 204 {
			t.Fatalf("opnieuw schrijven: %d, wil 204", c)
		}
		if g := leesPotjes(s, bus); g.Blobs[bus] != "potje-2" || len(g.Blobs) != 1 {
			t.Fatalf("het tweede vervangt het eerste: %+v", g)
		}
	}(t)
}

func TestOrakelPotjeBewijsEnGrootte(t *testing.T) {
	s, _ := newTestServer(t, nil)
	// [6.10] een potjesbus vraagt het juiste bewijs en houdt hoogstens 4096 tekens
	func(t tb) {
		bewijs, bus := potjeBus("a")
		_, ander := potjeBus("b")
		if c := schrijfPotje(s, bewijs, ander, "x"); c != 400 {
			t.Fatalf("bus hoort niet bij het bewijs: %d, wil 400", c)
		}
		if c := schrijfPotje(s, bewijs, bus, strings.Repeat("a", 4097)); c != 400 {
			t.Fatalf("4097 tekens: %d, wil 400", c)
		}
		if g := leesPotjes(s, bus, ander); len(g.Blobs) != 0 {
			t.Fatalf("na geweigerde pogingen hoort er niets te liggen: %+v", g)
		}
		if c := schrijfPotje(s, bewijs, bus, strings.Repeat("a", 4096)); c != 204 {
			t.Fatalf("precies 4096 tekens: %d, wil 204", c)
		}
	}(t)
}

func TestOrakelPotjeLeeftDertigDagen(t *testing.T) {
	s, clk := newTestServer(t, nil)
	// [6.10] een potjesbus leeft 30 dagen na het laatste schrijven
	func(t tb) {
		bewijs, bus := potjeBus("a")
		if c := schrijfPotje(s, bewijs, bus, "x"); c != 204 {
			t.Fatalf("schrijven: %d", c)
		}
		clk.advance(30*24*time.Hour - time.Second)
		if g := leesPotjes(s, bus); g.Blobs[bus] != "x" {
			t.Fatalf("een seconde voor 30 dagen hoort hij er nog te zijn: %+v", g)
		}
		clk.advance(time.Second)
		if g := leesPotjes(s, bus); len(g.Blobs) != 0 {
			t.Fatalf("na 30 dagen hoort hij weg te zijn: %+v", g)
		}
	}(t)
}

func TestOrakelPotjeSchrijvenVerlengt(t *testing.T) {
	s, clk := newTestServer(t, nil)
	// [6.10] elk schrijven verlengt, ook met dezelfde bytes
	func(t tb) {
		bewijs, bus := potjeBus("a")
		if c := schrijfPotje(s, bewijs, bus, "x"); c != 204 {
			t.Fatalf("schrijven: %d", c)
		}
		clk.advance(20 * 24 * time.Hour)
		if c := schrijfPotje(s, bewijs, bus, "x"); c != 204 {
			t.Fatalf("opnieuw schrijven op dag 20: %d", c)
		}
		clk.advance(30*24*time.Hour - time.Second)
		if g := leesPotjes(s, bus); g.Blobs[bus] != "x" {
			t.Fatalf("op dag 50 min een seconde hoort hij er nog te zijn: %+v", g)
		}
		clk.advance(time.Second)
		if g := leesPotjes(s, bus); len(g.Blobs) != 0 {
			t.Fatalf("op dag 50 hoort hij weg te zijn: %+v", g)
		}
	}(t)
}

func TestOrakelPotjeLezenVerlengtNiet(t *testing.T) {
	s, clk := newTestServer(t, nil)
	// [6.10] lezen verlengt een potjesbus niet
	func(t tb) {
		bewijs, bus := potjeBus("a")
		if c := schrijfPotje(s, bewijs, bus, "x"); c != 204 {
			t.Fatalf("schrijven: %d", c)
		}
		clk.advance(29 * 24 * time.Hour)
		if g := leesPotjes(s, bus); g.Blobs[bus] != "x" {
			t.Fatalf("op dag 29 hoort hij er te zijn: %+v", g)
		}
		clk.advance(24 * time.Hour)
		if g := leesPotjes(s, bus); len(g.Blobs) != 0 {
			t.Fatalf("op dag 30 hoort hij weg te zijn, ook na het lezen: %+v", g)
		}
	}(t)
}

func TestOrakelPotjeLeegWist(t *testing.T) {
	s, _ := newTestServer(t, nil)
	// [6.10] een leeg potje wist de bus
	func(t tb) {
		bewijs, bus := potjeBus("a")
		if c := schrijfPotje(s, bewijs, bus, "x"); c != 204 {
			t.Fatalf("schrijven: %d", c)
		}
		if c := schrijfPotje(s, bewijs, bus, ""); c != 204 {
			t.Fatalf("wissen: %d, wil 204", c)
		}
		if g := leesPotjes(s, bus); len(g.Blobs) != 0 {
			t.Fatalf("na wissen hoort er niets te liggen: %+v", g)
		}
		onbekend, onbekendeBus := potjeBus("onbekend")
		if c := schrijfPotje(s, onbekend, onbekendeBus, ""); c != 204 {
			t.Fatalf("een onbekende bus wissen: %d, wil 204", c)
		}
	}(t)
}

func TestOrakelPotjeVolMaaktPlaats(t *testing.T) {
	s, clk := newTestServer(t, nil)
	// [6.10] bij 1024 potjesbussen maakt de langst niet geschreven bus plaats
	func(t tb) {
		var bussen []string
		schrijf := func(i int) {
			bewijs, bus := potjeBus(fmt.Sprintf("v%04d", i))
			if c := schrijfPotje(s, bewijs, bus, "x"); c != 204 {
				t.Fatalf("bus %d: %d, wil 204", i, c)
			}
			if i >= len(bussen) {
				bussen = append(bussen, bus)
			}
		}
		aanwezig := func() map[string]bool {
			uit := map[string]bool{}
			for i := 0; i < len(bussen); i += 64 {
				for id := range leesPotjes(s, bussen[i:min(i+64, len(bussen))]...).Blobs {
					uit[id] = true
				}
			}
			return uit
		}
		for i := 0; i < 1024; i++ {
			schrijf(i)
			clk.advance(time.Second)
		}
		schrijf(1024)
		a := aanwezig()
		if len(a) != 1024 || a[bussen[0]] || !a[bussen[1]] || !a[bussen[1024]] {
			t.Fatalf("na de 1025e: %d aanwezig, de eerste %v, de tweede %v, de nieuwe %v; wil 1024, de eerste weg",
				len(a), a[bussen[0]], a[bussen[1]], a[bussen[1024]])
		}
		clk.advance(time.Second)
		schrijf(1)
		if a := aanwezig(); len(a) != 1024 || !a[bussen[2]] {
			t.Fatalf("een bestaande bus opnieuw schrijven hoort niemand weg te duwen: %d aanwezig", len(a))
		}
		clk.advance(time.Second)
		schrijf(1025)
		if a := aanwezig(); len(a) != 1024 || !a[bussen[1]] || a[bussen[2]] {
			t.Fatalf("de langst niet geschreven bus hoort plaats te maken, niet de oudste: de tweede %v, de derde %v",
				a[bussen[1]], a[bussen[2]])
		}
	}(t)
}

func TestOrakelPotjeEnUitnodigingApart(t *testing.T) {
	sU, _ := newTestServer(t, nil)
	sP, clkP := newTestServer(t, nil)
	// [6.10] potjesbussen en uitnodigingen hebben elk hun eigen tabel en leven
	func(t tb) {
		for i := 0; i < 512; i++ {
			b := fmt.Sprintf("uitnodiging-%04d-0123456789abcdef", i)
			if c := doe(sU, "POST", "/v1/bus", map[string]string{"bus": busID(b), "bewijs": b, "blob": "x"}).Code; c != 204 {
				t.Fatalf("uitnodiging %d: %d", i, c)
			}
		}
		bewijs, bus := potjeBus("a")
		if c := schrijfPotje(sU, bewijs, bus, "x"); c != 204 {
			t.Fatalf("potje bij 512 uitnodigingen: %d, wil 204", c)
		}
		for i := 0; i < 1024; i++ {
			b, id := potjeBus(fmt.Sprintf("v%04d", i))
			if c := schrijfPotje(sP, b, id, "x"); c != 204 {
				t.Fatalf("potje %d: %d", i, c)
			}
		}
		u := "uitnodiging-0123456789abcdef"
		if c := doe(sP, "POST", "/v1/bus", map[string]string{"bus": busID(u), "bewijs": u, "blob": "x"}).Code; c != 204 {
			t.Fatalf("uitnodiging bij 1024 potjes: %d, wil 204", c)
		}
		_, eerste := potjeBus("v0000")
		clkP.advance(10*time.Minute + time.Second)
		g := leesPotjes(sP, eerste, busID(u))
		if g.Blobs[eerste] != "x" || g.Blobs[busID(u)] != "" {
			t.Fatalf("na 10 minuten: het potje hoort er te zijn en de uitnodiging niet: %+v", g)
		}
	}(t)
}

func TestOrakelPotjeEigenRem(t *testing.T) {
	s, _ := newTestServer(t, func(c *config) {
		c.redeemDelay = 300 * time.Millisecond
		c.redeemSlots = 1
		c.queueWait = 20 * time.Millisecond
	})
	// [6.10] een potje schrijven wacht niet op de plek van de uitnodigingen
	func(t tb) {
		b := "uitnodiging-0123456789abcdef"
		klaar := make(chan int, 1)
		go func() {
			klaar <- doe(s, "POST", "/v1/bus", map[string]string{"bus": busID(b), "bewijs": b, "blob": "x"}).Code
		}()
		time.Sleep(50 * time.Millisecond)
		if c := doe(s, "POST", "/v1/bus", map[string]string{"bus": busID(b), "bewijs": b, "blob": "y"}).Code; c != 429 {
			t.Fatalf("testopzet: de plek van de uitnodigingen hoort bezet te zijn, kreeg %d", c)
		}
		bewijs, bus := potjeBus("a")
		c := schrijfPotje(s, bewijs, bus, "x")
		<-klaar
		if c != 204 {
			t.Fatalf("potje terwijl de uitnodigingen hun plek bezet houden: %d, wil 204", c)
		}
	}(t)
}

func TestOrakelPotjeVastVertraagd(t *testing.T) {
	s, _ := newTestServer(t, func(c *config) { c.redeemDelay = 30 * time.Millisecond })
	// [6.10] schrijven en lezen van een potjesbus duren de vaste vertraging
	func(t tb) {
		bewijs, bus := potjeBus("a")
		start := time.Now()
		c := schrijfPotje(s, bewijs, bus, "x")
		if d := time.Since(start); c != 204 || d < 30*time.Millisecond {
			t.Fatalf("schrijven: %d na %v, wil 204 na minstens 30ms", c, d)
		}
		start = time.Now()
		leesPotjes(s, bus)
		if d := time.Since(start); d < 30*time.Millisecond {
			t.Fatalf("lezen na %v, wil minstens 30ms", d)
		}
	}(t)
}

func TestOrakelPotjeWegNaHerstart(tt *testing.T) {
	dir := tt.TempDir()
	s1, _ := newTestServer(tt, func(c *config) { c.dataDir = dir })
	// [6.10] een herstart verliest de potjesbussen en verder niets
	func(t tb) {
		bewijs, bus := potjeBus("a")
		if c := schrijfPotje(s1, bewijs, bus, "x"); c != 204 {
			t.Fatalf("schrijven: %d", c)
		}
		req := httptest.NewRequest("PUT", "/v1/profile/a1b2c3d4e5f6a7b8", strings.NewReader("profiel"))
		req.Header.Set("Authorization", "Bearer "+testSecret)
		w := httptest.NewRecorder()
		s1.ServeHTTP(w, req)
		if w.Code != 204 {
			t.Fatalf("profiel bewaren: %d", w.Code)
		}
		s2, clk2 := newTestServer(tt, func(c *config) { c.dataDir = dir })
		if g := leesPotjes(s2, bus); len(g.Blobs) != 0 {
			t.Fatalf("na de herstart hoort er geen potje meer te zijn: %+v", g)
		}
		req = httptest.NewRequest("GET", "/v1/profile/a1b2c3d4e5f6a7b8", nil)
		req.Header.Set("Authorization", "Bearer "+testSecret)
		w = httptest.NewRecorder()
		s2.ServeHTTP(w, req)
		if w.Code != 200 || w.Body.String() != "profiel" {
			t.Fatalf("het profiel hoort de herstart te overleven: %d %q", w.Code, w.Body.String())
		}
		if c := schrijfPotje(s2, bewijs, bus, "x"); c != 204 {
			t.Fatalf("opnieuw schrijven na de herstart: %d", c)
		}
		clk2.advance(time.Hour)
		if g := leesPotjes(s2, bus); g.Ongewijzigd[bus] != 3600 {
			t.Fatalf("na de herstart telt de tijd vanaf het opnieuw schrijven: %+v", g)
		}
	}(tt)
}

// een klok die op verzoek bij elke vraag een seconde verder loopt
type tikKlok struct {
	mu     sync.Mutex
	t      time.Time
	tikken bool
}

func (k *tikKlok) now() time.Time {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.tikken {
		k.t = k.t.Add(time.Second)
	}
	return k.t
}

func TestOrakelPotjeOngewijzigd(t *testing.T) {
	s, clk := newTestServer(t, nil)
	// [6.10] de check meldt hoe lang de bytes van een potjesbus gelijk bleven
	func(t tb) {
		bewijs, bus := potjeBus("a")
		if c := schrijfPotje(s, bewijs, bus, "zet-1"); c != 204 {
			t.Fatalf("schrijven: %d", c)
		}
		clk.advance(2 * time.Hour)
		if g := leesPotjes(s, bus); g.Ongewijzigd[bus] != 7200 {
			t.Fatalf("na 2 uur: %+v, wil 7200", g)
		}
		schrijfPotje(s, bewijs, bus, "zet-1")
		if g := leesPotjes(s, bus); g.Ongewijzigd[bus] != 7200 {
			t.Fatalf("dezelfde bytes opnieuw houden de tijd: %+v, wil 7200", g)
		}
		clk.advance(time.Hour)
		schrijfPotje(s, bewijs, bus, "zet-2")
		if g := leesPotjes(s, bus); g.Ongewijzigd[bus] != 0 {
			t.Fatalf("andere bytes zetten de tijd op nul: %+v", g)
		}
		clk.advance(30 * time.Minute)
		if g := leesPotjes(s, bus); g.Ongewijzigd[bus] != 1800 {
			t.Fatalf("een half uur na de wijziging: %+v, wil 1800", g)
		}
		schrijfPotje(s, bewijs, bus, "")
		schrijfPotje(s, bewijs, bus, "zet-2")
		if g := leesPotjes(s, bus); g.Blobs[bus] != "zet-2" || g.Ongewijzigd[bus] != 0 {
			t.Fatalf("wissen en opnieuw maken begint vers, ook met dezelfde bytes: %+v", g)
		}
	}(t)
}

func TestOrakelPotjeOngewijzigdEenMoment(t *testing.T) {
	klok := &tikKlok{t: time.Date(2026, 11, 12, 12, 0, 0, 0, time.UTC)}
	s, _ := newTestServer(t, func(c *config) { c.now = klok.now })
	// [6.10] alle tijden in een antwoord komen van hetzelfde moment
	func(t tb) {
		bewijsA, busA := potjeBus("a")
		bewijsB, busB := potjeBus("b")
		if schrijfPotje(s, bewijsA, busA, "x") != 204 || schrijfPotje(s, bewijsB, busB, "y") != 204 {
			t.Fatalf("schrijven lukt niet")
		}
		klok.mu.Lock()
		klok.tikken = true
		klok.mu.Unlock()
		g := leesPotjes(s, busA, busB)
		if len(g.Ongewijzigd) != 2 || g.Ongewijzigd[busA] != g.Ongewijzigd[busB] {
			t.Fatalf("twee bussen van hetzelfde moment, in een antwoord: %+v", g)
		}
	}(t)
}

func TestOrakelPotjeGeenOnbekendeVelden(t *testing.T) {
	s, _ := newTestServer(t, nil)
	// [6.11] een potjesbus kent alleen bus, bewijs en blob
	func(t tb) {
		bewijs, bus := potjeBus("a")
		w := doe(s, "POST", "/v1/potje", map[string]string{"bus": bus, "bewijs": bewijs, "blob": "x", "naam": "Fien"})
		if w.Code != 400 {
			t.Fatalf("met een veld naam: %d, wil 400", w.Code)
		}
		if g := leesPotjes(s, bus); len(g.Blobs) != 0 {
			t.Fatalf("een geweigerd verzoek hoort niets te bewaren: %+v", g)
		}
		if c := schrijfPotje(s, bewijs, bus, "x"); c != 204 {
			t.Fatalf("met precies bus, bewijs en blob: %d, wil 204", c)
		}
	}(t)
}

func TestOrakelPotjeGeenOpsomming(t *testing.T) {
	s, _ := newTestServer(t, nil)
	// [6.11] geen pad somt potjesbussen op
	func(t tb) {
		bewijs, bus := potjeBus("a")
		if c := schrijfPotje(s, bewijs, bus, "x"); c != 204 {
			t.Fatalf("schrijven: %d", c)
		}
		for _, pad := range []string{"/v1/potje", "/v1/potje/", "/v1/potje/" + bus, "/v1/bus", "/v1/bus/check"} {
			w := doe(s, "GET", pad, nil)
			if w.Code == 200 || strings.Contains(w.Body.String(), bus) {
				t.Fatalf("GET %s: %d %q", pad, w.Code, w.Body.String())
			}
		}
		if w := doe(s, "POST", "/v1/bus/check", map[string]any{"bussen": []string{}}); strings.Contains(w.Body.String(), bus) {
			t.Fatalf("een lege check noemt een bus: %q", w.Body.String())
		}
	}(t)
}

/* ---------- V2 en V6: een staat per paar, alleen voorwaardelijk te schrijven ---------- */

// de versie zoals elk apparaat hem zelf uitrekent: sha256 van de tekst van
// het briefje, in kleine hex
func versieVan(blob string) string {
	sum := sha256.Sum256([]byte(blob))
	return hex.EncodeToString(sum[:])
}

type potjeAntwoord struct {
	code    int
	blob    string
	metBlob bool
	soort   string
}

func schrijfPotjeAls(s *server, bewijs, bus, blob, als string) potjeAntwoord {
	w := doe(s, "POST", "/v1/potje", map[string]string{"bus": bus, "bewijs": bewijs, "blob": blob, "als": als})
	a := potjeAntwoord{code: w.Code, soort: w.Header().Get("Content-Type")}
	var lijf struct{ Blob *string }
	if json.Unmarshal(w.Body.Bytes(), &lijf) == nil && lijf.Blob != nil {
		a.blob, a.metBlob = *lijf.Blob, true
	}
	return a
}

func TestOrakelPotjeAlsGelijk(t *testing.T) {
	s, _ := newTestServer(t, nil)
	nogNiet(t, "[V2] een schrijven met de versie die de server houdt, gaat door", func(t tb) {
		bewijs, bus := potjeBus("a")
		if a := schrijfPotjeAls(s, bewijs, bus, "staat-1", ""); a.code != 204 {
			t.Fatalf("eerste staat met als leeg: %+v, wil 204", a)
		}
		if a := schrijfPotjeAls(s, bewijs, bus, "staat-2", versieVan("staat-1")); a.code != 204 {
			t.Fatalf("tweede staat met de versie van de eerste: %+v, wil 204", a)
		}
		if g := leesPotjes(s, bus); g.Blobs[bus] != "staat-2" {
			t.Fatalf("na twee schrijven: %+v, wil staat-2", g)
		}
	})
}

func TestOrakelPotjeAlsOngelijk(t *testing.T) {
	s, _ := newTestServer(t, nil)
	nogNiet(t, "[V2] een schrijven met een andere versie verandert niets en krijgt 409 met wat er staat", func(t tb) {
		bewijs, bus := potjeBus("a")
		if a := schrijfPotjeAls(s, bewijs, bus, "staat-1", ""); a.code != 204 {
			t.Fatalf("eerste staat: %+v", a)
		}
		for _, als := range []string{versieVan("staat-0"), ""} {
			a := schrijfPotjeAls(s, bewijs, bus, "staat-2", als)
			if a.code != 409 || !a.metBlob || a.blob != "staat-1" || a.soort != "application/json" {
				t.Fatalf("als %q: %+v, wil 409 met json {\"blob\": \"staat-1\"}", als, a)
			}
		}
		if g := leesPotjes(s, bus); g.Blobs[bus] != "staat-1" {
			t.Fatalf("na twee geweigerde schrijven: %+v, wil staat-1", g)
		}
	})
}

func TestOrakelPotjeNietsDaar(t *testing.T) {
	s, _ := newTestServer(t, nil)
	nogNiet(t, "[V2] staat er niets, dan gaat alleen een schrijven met een lege als door", func(t tb) {
		bewijs, bus := potjeBus("a")
		if a := schrijfPotjeAls(s, bewijs, bus, "staat-1", versieVan("staat-0")); a.code != 409 || !a.metBlob || a.blob != "" {
			t.Fatalf("met een versie terwijl er niets staat: %+v, wil 409 met een leeg briefje", a)
		}
		if g := leesPotjes(s, bus); len(g.Blobs) != 0 {
			t.Fatalf("een geweigerd schrijven maakte toch een bus: %+v", g)
		}
		if a := schrijfPotjeAls(s, bewijs, bus, "staat-1", ""); a.code != 204 {
			t.Fatalf("met een lege als: %+v, wil 204", a)
		}
	})
}

func TestOrakelPotjeZelfdeBytesMetVoorwaarde(t *testing.T) {
	s, clk := newTestServer(t, nil)
	nogNiet(t, "[V2] dezelfde bytes met hun eigen versie: 204, en de dertig dagen beginnen opnieuw", func(t tb) {
		bewijs, bus := potjeBus("a")
		if a := schrijfPotjeAls(s, bewijs, bus, "staat-1", ""); a.code != 204 {
			t.Fatalf("eerste staat: %+v", a)
		}
		clk.advance(20 * 24 * time.Hour)
		if a := schrijfPotjeAls(s, bewijs, bus, "staat-1", versieVan("staat-1")); a.code != 204 {
			t.Fatalf("dezelfde bytes op dag 20: %+v, wil 204", a)
		}
		clk.advance(30*24*time.Hour - time.Second)
		if g := leesPotjes(s, bus); g.Blobs[bus] != "staat-1" {
			t.Fatalf("een seconde voor dag 50: %+v, wil er nog", g)
		}
		clk.advance(time.Second)
		if g := leesPotjes(s, bus); len(g.Blobs) != 0 {
			t.Fatalf("op dag 50: %+v, wil weg", g)
		}
	})
}

func TestOrakelPotjeTweeSchrijvers(t *testing.T) {
	s, _ := newTestServer(t, nil)
	nogNiet(t, "[V2] twee schrijvers op een versie: precies een krijgt 204, de ander 409 met wat de eerste schreef", func(t tb) {
		bewijs, bus := potjeBus("a")
		nu := "staat-0"
		if a := schrijfPotjeAls(s, bewijs, bus, nu, ""); a.code != 204 {
			t.Fatalf("eerste staat: %+v", a)
		}
		for ronde := 0; ronde < 20; ronde++ {
			als := versieVan(nu)
			var wg sync.WaitGroup
			start := make(chan struct{})
			uit := make([]potjeAntwoord, 2)
			for i := range uit {
				wg.Add(1)
				go func(i int) {
					defer wg.Done()
					<-start
					uit[i] = schrijfPotjeAls(s, bewijs, bus, fmt.Sprintf("staat-%d-%d", ronde+1, i), als)
				}(i)
			}
			close(start)
			wg.Wait()
			winnaar := -1
			for i, a := range uit {
				if a.code == 204 {
					if winnaar >= 0 {
						t.Fatalf("ronde %d: allebei 204", ronde)
					}
					winnaar = i
				}
			}
			if winnaar < 0 {
				t.Fatalf("ronde %d: niemand 204: %+v", ronde, uit)
			}
			nu = fmt.Sprintf("staat-%d-%d", ronde+1, winnaar)
			if a := uit[1-winnaar]; a.code != 409 || a.blob != nu {
				t.Fatalf("ronde %d: de verliezer kreeg %+v, wil 409 met %q", ronde, a, nu)
			}
			if g := leesPotjes(s, bus); g.Blobs[bus] != nu {
				t.Fatalf("ronde %d: de server houdt %+v, wil %q", ronde, g, nu)
			}
		}
	})
}

func TestOrakelPotjeWissenMetVoorwaarde(t *testing.T) {
	s, _ := newTestServer(t, nil)
	nogNiet(t, "[V2] wissen met een leeg briefje volgt dezelfde voorwaarde", func(t tb) {
		bewijs, bus := potjeBus("a")
		if a := schrijfPotjeAls(s, bewijs, bus, "staat-1", ""); a.code != 204 {
			t.Fatalf("eerste staat: %+v", a)
		}
		for _, als := range []string{versieVan("staat-0"), ""} {
			if a := schrijfPotjeAls(s, bewijs, bus, "", als); a.code != 409 || a.blob != "staat-1" {
				t.Fatalf("wissen met als %q: %+v, wil 409 met staat-1", als, a)
			}
		}
		if g := leesPotjes(s, bus); g.Blobs[bus] != "staat-1" {
			t.Fatalf("na geweigerd wissen: %+v, wil staat-1", g)
		}
		if a := schrijfPotjeAls(s, bewijs, bus, "", versieVan("staat-1")); a.code != 204 {
			t.Fatalf("wissen met de goede versie: %+v, wil 204", a)
		}
		if g := leesPotjes(s, bus); len(g.Blobs) != 0 {
			t.Fatalf("na wissen: %+v, wil weg", g)
		}
		if a := schrijfPotjeAls(s, bewijs, bus, "", versieVan("staat-1")); a.code != 409 || !a.metBlob || a.blob != "" {
			t.Fatalf("nog eens wissen met de oude versie: %+v, wil 409 met een leeg briefje", a)
		}
		if a := schrijfPotjeAls(s, bewijs, bus, "", ""); a.code != 204 {
			t.Fatalf("niets wissen met een lege als: %+v, wil 204", a)
		}
	})
}

func TestOrakelPotjeVolMetVoorwaarde(t *testing.T) {
	s, clk := newTestServer(t, nil)
	nogNiet(t, "[V2] bij 1024 maakt alleen een gelukt nieuw schrijven plaats, een geweigerd schrijven duwt niemand weg", func(t tb) {
		var bussen []string
		for i := 0; i < 1024; i++ {
			bewijs, bus := potjeBus(fmt.Sprintf("v%04d", i))
			if a := schrijfPotjeAls(s, bewijs, bus, "x", ""); a.code != 204 {
				t.Fatalf("bus %d: %+v", i, a)
			}
			bussen = append(bussen, bus)
			clk.advance(time.Second)
		}
		bewijs, bus := potjeBus("nieuw")
		if a := schrijfPotjeAls(s, bewijs, bus, "x", versieVan("x")); a.code != 409 {
			t.Fatalf("nieuwe bus met een versie: %+v, wil 409", a)
		}
		if g := leesPotjes(s, bussen[0], bus); g.Blobs[bussen[0]] != "x" || len(g.Blobs) != 1 {
			t.Fatalf("na een geweigerd schrijven bij een volle tabel: %+v, wil de eerste nog en de nieuwe niet", g)
		}
		if a := schrijfPotjeAls(s, bewijs, bus, "x", ""); a.code != 204 {
			t.Fatalf("nieuwe bus met een lege als: %+v, wil 204", a)
		}
		if g := leesPotjes(s, bussen[0], bussen[1], bus); len(g.Blobs) != 2 || g.Blobs[bussen[0]] != "" {
			t.Fatalf("na een gelukt schrijven bij een volle tabel: %+v, wil de eerste weg, de tweede en de nieuwe er", g)
		}
	})
}

func TestOrakelPotjeConflictAlleenMetBewijs(t *testing.T) {
	s, _ := newTestServer(t, nil)
	nogNiet(t, "[V2] het briefje in een 409 krijgt alleen wie het bewijs heeft", func(t tb) {
		bewijs, bus := potjeBus("a")
		if a := schrijfPotjeAls(s, bewijs, bus, "staat-1", ""); a.code != 204 {
			t.Fatalf("eerste staat: %+v", a)
		}
		w := doe(s, "POST", "/v1/potje", map[string]string{"bus": bus, "bewijs": "een-ander-bewijs-0123456789", "blob": "x", "als": ""})
		if w.Code != 400 || strings.Contains(w.Body.String(), "staat-1") {
			t.Fatalf("met een verkeerd bewijs: %d %q, wil 400 zonder het briefje", w.Code, w.Body.String())
		}
	})
}

func TestOrakelPotjeZonderAlsGeweigerd(t *testing.T) {
	s, _ := newTestServer(t, nil)
	nogNiet(t, "[V2] een schrijven zonder als, of met een als die geen versie is, krijgt 400", func(t tb) {
		bewijs, bus := potjeBus("a")
		if a := schrijfPotjeAls(s, bewijs, bus, "staat-1", ""); a.code != 204 {
			t.Fatalf("eerste staat: %+v", a)
		}
		bodies := []map[string]any{
			{"bus": bus, "bewijs": bewijs, "blob": "staat-2"},
			{"bus": bus, "bewijs": bewijs, "blob": "staat-2", "als": nil},
			{"bus": bus, "bewijs": bewijs, "blob": "staat-2", "als": "staat-1"},
			{"bus": bus, "bewijs": bewijs, "blob": "staat-2", "als": strings.ToUpper(versieVan("staat-1"))},
			{"bus": bus, "bewijs": bewijs, "blob": "", "als": versieVan("staat-1")[:63]},
		}
		for _, b := range bodies {
			if w := doe(s, "POST", "/v1/potje", b); w.Code != 400 {
				t.Fatalf("%v: %d, wil 400", b, w.Code)
			}
		}
		if g := leesPotjes(s, bus); g.Blobs[bus] != "staat-1" {
			t.Fatalf("na de geweigerde schrijven: %+v, wil staat-1", g)
		}
	})
}

func TestOrakelPotjeNuInCheck(t *testing.T) {
	s, clk := newTestServer(t, nil)
	nogNiet(t, "[V6] de check zegt hoe laat het is op de server, in hele seconden", func(t tb) {
		start := clk.now().Unix()
		if g := leesPotjes(s); g.Nu == nil || *g.Nu != start {
			t.Fatalf("een lege check: nu %v, wil %d", g.Nu, start)
		}
		bewijs, bus := potjeBus("a")
		if a := schrijfPotjeAls(s, bewijs, bus, "staat-1", ""); a.code != 204 {
			t.Fatalf("eerste staat: %+v", a)
		}
		clk.advance(90*time.Second + 500*time.Millisecond)
		if g := leesPotjes(s, bus); g.Nu == nil || *g.Nu != start+90 || g.Blobs[bus] != "staat-1" {
			t.Fatalf("anderhalve minuut later: %+v, wil nu %d", g, start+90)
		}
	})
}
