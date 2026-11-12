package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
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
	nogNiet(t, "[4.10] een koppelcode werkt tien minuten", func(t tb) {
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
	})
}
