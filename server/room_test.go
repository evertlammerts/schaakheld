package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// de "codes" zijn client-side al gehasht; hier volstaan strings in het
// juiste repertoire
const (
	codeA = "aaaaaaaaaaaaaaaa"
	codeB = "bbbbbbbbbbbbbbbb"
	codeX = "xxxxxxxxxxxxxxxx"
	codeY = "yyyyyyyyyyyyyyyy"
)

func pairDo(t *testing.T, s *server, mine, theirs string) *httptest.ResponseRecorder {
	t.Helper()
	return do(t, s, "POST", "/v1/pair", "", jsonBody(t, map[string]string{
		"mine": mine, "theirs": theirs}))
}

func TestKamerMaken(t *testing.T) {
	s, _ := newTestServer(t, nil)
	w := do(t, s, "POST", "/v1/room", "", nil)
	if w.Code != 200 {
		t.Fatalf("status %d", w.Code)
	}
	var out struct{ Room, Seat, Guest string }
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if !idRe.MatchString(out.Room) || !idRe.MatchString(out.Seat) || !idRe.MatchString(out.Guest) {
		t.Fatalf("rare tokens: %+v", out)
	}
	if out.Seat == out.Guest || out.Room == out.Seat {
		t.Fatalf("tokens niet uniek: %+v", out)
	}
}

func TestPairWederzijds(t *testing.T) {
	s, _ := newTestServer(t, nil)
	if w := pairDo(t, s, codeA, codeB); w.Code != 204 {
		t.Fatalf("eerste inzending: status %d", w.Code)
	}
	// zelfde kant pollt: blijft wachten
	if w := pairDo(t, s, codeA, codeB); w.Code != 204 {
		t.Fatalf("poll zelfde kant: status %d", w.Code)
	}
	// de ander wijst wederzijds aan en krijgt meteen een stoel
	w := pairDo(t, s, codeB, codeA)
	if w.Code != 200 {
		t.Fatalf("wederzijdse inzending: status %d", w.Code)
	}
	var b struct {
		Room, Seat string
		Host       bool
	}
	json.Unmarshal(w.Body.Bytes(), &b)
	// de eerste kant haalt bij de volgende poll zijn stoel op
	w = pairDo(t, s, codeA, codeB)
	if w.Code != 200 {
		t.Fatalf("ophalen eerste kant: status %d", w.Code)
	}
	var a struct {
		Room, Seat string
		Host       bool
	}
	json.Unmarshal(w.Body.Bytes(), &a)
	if a.Room != b.Room || a.Seat == b.Seat || a.Seat == "" {
		t.Fatalf("stoelen kloppen niet: a=%+v b=%+v", a, b)
	}
	// precies een van beide is de host (de eerste inzender)
	if !a.Host || b.Host {
		t.Fatalf("hostrol verkeerd verdeeld: a.Host=%v b.Host=%v", a.Host, b.Host)
	}
	// idempotent: elke kant mag zijn eigen stoel opnieuw ophalen (een
	// verloren antwoord strandt zo niemand), en krijgt steeds dezelfde
	var a2, b2 struct {
		Room, Seat string
		Host       bool
	}
	json.Unmarshal(pairDo(t, s, codeA, codeB).Body.Bytes(), &a2)
	json.Unmarshal(pairDo(t, s, codeB, codeA).Body.Bytes(), &b2)
	if a2.Seat != a.Seat || !a2.Host || b2.Seat != b.Seat || b2.Host {
		t.Fatalf("herophalen niet idempotent: a2=%+v b2=%+v", a2, b2)
	}
}

func TestPairEvictOudste(t *testing.T) {
	s, _ := newTestServer(t, nil)
	// vul de tabel met junk tot de cap
	for i := 0; i < maxPending; i++ {
		mine := fmt.Sprintf("mine%08d", i)
		theirs := fmt.Sprintf("them%08d", i)
		if w := pairDo(t, s, mine, theirs); w.Code != 204 {
			t.Fatalf("junk %d: status %d", i, w.Code)
		}
	}
	// een echt paar moet er nog bij passen (oudste junk wordt geevict),
	// niet geweigerd worden
	if w := pairDo(t, s, codeA, codeB); w.Code != 204 {
		t.Fatalf("echt paar bij volle tabel: status %d, wil 204", w.Code)
	}
	if w := pairDo(t, s, codeB, codeA); w.Code != 200 {
		t.Fatalf("echt paar matcht niet: status %d, wil 200", w.Code)
	}
}

func TestPairPinning(t *testing.T) {
	s, _ := newTestServer(t, nil)
	pairDo(t, s, codeA, codeB)
	// een vreemde die codeA geraden heeft en zichzelf aanwijst matcht
	// nooit met het kind: het kind heeft de code van de vreemde niet
	// ingevuld
	if w := pairDo(t, s, codeX, codeA); w.Code != 204 {
		t.Fatalf("gok (X,A): status %d, wil 204", w.Code)
	}
	if w := pairDo(t, s, codeY, codeA); w.Code != 204 {
		t.Fatalf("gok (Y,A): status %d, wil 204", w.Code)
	}
	// wie beide richtingen van een eigen paar instuurt "paart" hooguit
	// met zichzelf; het wachtende paar van het kind blijft onaangeraakt
	w := pairDo(t, s, codeA, codeX)
	if w.Code != 200 {
		t.Fatalf("zelf-paar: status %d, wil 200", w.Code)
	}
	var zelf struct{ Room string }
	json.Unmarshal(w.Body.Bytes(), &zelf)
	// en het echte paar komt daarna gewoon tot stand, in een andere kamer
	w = pairDo(t, s, codeB, codeA)
	if w.Code != 200 {
		t.Fatalf("echte match na gokpogingen: status %d", w.Code)
	}
	var echt struct{ Room string }
	json.Unmarshal(w.Body.Bytes(), &echt)
	if echt.Room == zelf.Room || echt.Room == "" {
		t.Fatalf("kind belandde in de kamer van de gokker: %q", echt.Room)
	}
}

func TestPairTTL(t *testing.T) {
	s, clk := newTestServer(t, nil)
	pairDo(t, s, codeA, codeB)
	clk.advance(6 * time.Minute)
	// de oude inzending is verlopen; dit wordt een verse eerste inzending
	if w := pairDo(t, s, codeB, codeA); w.Code != 204 {
		t.Fatalf("na verlopen: status %d, wil 204", w.Code)
	}
}

func TestPairValidatie(t *testing.T) {
	s, _ := newTestServer(t, nil)
	for name, body := range map[string][2]string{
		"zelfde code": {codeA, codeA},
		"rare tekens": {"met spatie!", codeB},
		"te kort":     {"kort", codeB},
	} {
		if w := pairDo(t, s, body[0], body[1]); w.Code != 400 {
			t.Errorf("%s: status %d, wil 400", name, w.Code)
		}
	}
}

func TestKamerCap(t *testing.T) {
	s, _ := newTestServer(t, nil)
	for i := 0; i < maxRooms; i++ {
		if w := do(t, s, "POST", "/v1/room", "", nil); w.Code != 200 {
			t.Fatalf("kamer %d: status %d", i, w.Code)
		}
	}
	if w := do(t, s, "POST", "/v1/room", "", nil); w.Code != 429 {
		t.Fatalf("boven de limiet: status %d, wil 429", w.Code)
	}
}

/* ---------- de relay zelf, over echte websockets ---------- */

func wsDial(t *testing.T, ctx context.Context, ts *httptest.Server, room, seat string) *websocket.Conn {
	t.Helper()
	u := "ws" + strings.TrimPrefix(ts.URL, "http") + "/v1/room/ws"
	c, _, err := websocket.Dial(ctx, u, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := c.Write(ctx, websocket.MessageText,
		[]byte(`{"room":"`+room+`","seat":"`+seat+`"}`)); err != nil {
		t.Fatal(err)
	}
	return c
}

func wsRead(t *testing.T, ctx context.Context, c *websocket.Conn) string {
	t.Helper()
	_, data, err := c.Read(ctx)
	if err != nil {
		t.Fatalf("lezen: %v", err)
	}
	return string(data)
}

func TestRelay(t *testing.T) {
	s, _ := newTestServer(t, nil)
	ts := httptest.NewServer(s)
	defer ts.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	w := do(t, s, "POST", "/v1/room", "", nil)
	var rm struct{ Room, Seat, Guest string }
	json.Unmarshal(w.Body.Bytes(), &rm)

	host := wsDial(t, ctx, ts, rm.Room, rm.Seat)
	if got := wsRead(t, ctx, host); !strings.Contains(got, "welkom") {
		t.Fatalf("host verwacht welkom, kreeg %q", got)
	}
	gast := wsDial(t, ctx, ts, rm.Room, rm.Guest)
	if got := wsRead(t, ctx, gast); !strings.Contains(got, "welkom") {
		t.Fatalf("gast verwacht welkom, kreeg %q", got)
	}
	if got := wsRead(t, ctx, host); !strings.Contains(got, `"aan":true`) {
		t.Fatalf("host verwacht peer-aan, kreeg %q", got)
	}

	// beide kanten relayen, inhoud ongemoeid
	host.Write(ctx, websocket.MessageText, []byte(`{"t":"zet","from":12,"to":28}`))
	if got := wsRead(t, ctx, gast); got != `{"t":"zet","from":12,"to":28}` {
		t.Fatalf("gast kreeg %q", got)
	}
	gast.Write(ctx, websocket.MessageText, []byte(`{"t":"zet","from":52,"to":36}`))
	if got := wsRead(t, ctx, host); got != `{"t":"zet","from":52,"to":36}` {
		t.Fatalf("host kreeg %q", got)
	}

	// opnieuw verbinden met hetzelfde token neemt het stoeltje over
	gast2 := wsDial(t, ctx, ts, rm.Room, rm.Guest)
	if got := wsRead(t, ctx, gast2); !strings.Contains(got, "welkom") {
		t.Fatalf("gast2 verwacht welkom, kreeg %q", got)
	}
	if got := wsRead(t, ctx, host); !strings.Contains(got, `"aan":true`) {
		t.Fatalf("host verwacht peer-aan na herverbinden, kreeg %q", got)
	}
	// de oude verbinding hoort eerst te horen waaróm ze dichtgaat: zonder
	// dat bericht verbindt die kant opnieuw, duwt de nieuwe eruit, en dat
	// gaat eindeloos heen en weer
	if got := wsRead(t, ctx, gast); !strings.Contains(got, `"t":"stoel"`) {
		t.Fatalf("oude gast verwacht een stoel-bericht, kreeg %q", got)
	}
	if _, _, err := gast.Read(ctx); err == nil {
		t.Fatal("de oude gastverbinding hoort gesloten te zijn")
	}
	host.Write(ctx, websocket.MessageText, []byte(`{"t":"hoi"}`))
	if got := wsRead(t, ctx, gast2); got != `{"t":"hoi"}` {
		t.Fatalf("gast2 kreeg %q", got)
	}

	// weggaan meldt de peer dat de ander weg is
	host.Close(websocket.StatusNormalClosure, "")
	if got := wsRead(t, ctx, gast2); !strings.Contains(got, `"aan":false`) {
		t.Fatalf("gast2 verwacht peer-weg, kreeg %q", got)
	}
	gast2.Close(websocket.StatusNormalClosure, "")
}

/* ---------- hoe lang een kamer leeft ---------- */

func verbind(t *testing.T, ctx context.Context, ts *httptest.Server, room, seat string) *websocket.Conn {
	t.Helper()
	c := wsDial(t, ctx, ts, room, seat)
	if got := wsRead(t, ctx, c); !strings.Contains(got, "welkom") {
		t.Fatalf("verwacht welkom, kreeg %q", got)
	}
	return c
}

// wacht tot de server het vertrek verwerkt heeft, anders loopt de nep-klok
// voor op het vertrek
func vertrek(t *testing.T, s *server, room, seat string, c *websocket.Conn) {
	t.Helper()
	c.CloseNow()
	for i := 0; i < 400; i++ {
		s.mu.Lock()
		r := s.rooms[room]
		klaar := r == nil
		if r != nil {
			for _, st := range r.seats {
				if st.token == seat && !st.live.Load() {
					klaar = true
				}
			}
		}
		s.mu.Unlock()
		if klaar {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("het stoeltje bleef verbonden")
}

func geweigerd(t *testing.T, ctx context.Context, ts *httptest.Server, room, seat string) {
	t.Helper()
	c := wsDial(t, ctx, ts, room, seat)
	if _, _, err := c.Read(ctx); err == nil {
		t.Fatalf("de server hoort dit stoeltje te weigeren")
	}
}

func TestKamerTweedeStoelLaatMaarOpTijd(t *testing.T) {
	s, clk := newTestServer(t, nil)
	ts := httptest.NewServer(s)
	defer ts.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	room, seat, guest := nieuweKamer(s)
	vertrek(t, s, room, seat, verbind(t, ctx, ts, room, seat))
	clk.advance(10 * time.Minute)
	vertrek(t, s, room, guest, verbind(t, ctx, ts, room, guest))
	clk.advance(2 * time.Hour)
	veeg(t, s)
	if !kamerBestaat(s, room) {
		t.Fatalf("een tweede stoel na 10 minuten maakt er een kamer met een potje van; na 2 uur stil hoort hij er nog te zijn")
	}
}

func TestKamerTweedeStoelTeLaat(t *testing.T) {
	s, clk := newTestServer(t, nil)
	ts := httptest.NewServer(s)
	defer ts.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	room, seat, guest := nieuweKamer(s)
	vertrek(t, s, room, seat, verbind(t, ctx, ts, room, seat))
	clk.advance(16 * time.Minute)
	veeg(t, s)
	if kamerBestaat(s, room) {
		t.Fatalf("een kamer met een stoel is na 16 minuten stil weg")
	}
	geweigerd(t, ctx, ts, room, guest)
}

func TestKamerZelfdeStoelTweeKeerIsGeenPotje(t *testing.T) {
	// alleen beide stoeltjes samen maken een potje: twee keer dezelfde
	// stoel, of een poging met een fout token, telt niet
	s, clk := newTestServer(t, nil)
	ts := httptest.NewServer(s)
	defer ts.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	room, seat, _ := nieuweKamer(s)
	vertrek(t, s, room, seat, verbind(t, ctx, ts, room, seat))
	vertrek(t, s, room, seat, verbind(t, ctx, ts, room, seat))
	geweigerd(t, ctx, ts, room, "heelverkeerdtoken")
	clk.advance(14 * time.Minute)
	veeg(t, s)
	if !kamerBestaat(s, room) {
		t.Fatalf("na 14 minuten stil hoort de kamer er nog te zijn")
	}
	clk.advance(2 * time.Minute)
	veeg(t, s)
	if kamerBestaat(s, room) {
		t.Fatalf("na 16 minuten stil hoort een kamer zonder potje weg te zijn")
	}
}

func TestKamerZonderPotjeHoogstensDrieUur(t *testing.T) {
	// ook met een stoel die de hele tijd verbonden blijft
	s, clk := newTestServer(t, nil)
	ts := httptest.NewServer(s)
	defer ts.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	room, seat, _ := nieuweKamer(s)
	host := verbind(t, ctx, ts, room, seat)
	defer host.CloseNow()
	clk.advance(2*time.Hour + 50*time.Minute)
	veeg(t, s)
	if !kamerBestaat(s, room) {
		t.Fatalf("na 2 uur 50 met de host erin hoort de kamer er nog te zijn")
	}
	clk.advance(20 * time.Minute)
	veeg(t, s)
	if kamerBestaat(s, room) {
		t.Fatalf("na 3 uur 10 hoort een kamer zonder potje weg te zijn, ook met de host erin")
	}
}

func TestKamerMetPotjeVerbondenHoogstens48Uur(t *testing.T) {
	s, clk := newTestServer(t, nil)
	ts := httptest.NewServer(s)
	defer ts.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	room, seat, guest := nieuweKamer(s)
	host := verbind(t, ctx, ts, room, seat)
	defer host.CloseNow()
	vertrek(t, s, room, guest, verbind(t, ctx, ts, room, guest))
	clk.advance(47*time.Hour + 50*time.Minute)
	veeg(t, s)
	if !kamerBestaat(s, room) {
		t.Fatalf("na 47 uur 50 met de host erin hoort de kamer er nog te zijn")
	}
	clk.advance(20 * time.Minute)
	veeg(t, s)
	if kamerBestaat(s, room) {
		t.Fatalf("na 48 uur 10 hoort hij weg te zijn, ook met de host erin")
	}
}

func TestKamerStilVanafVertrek(t *testing.T) {
	// de 12 uur stilte tellen vanaf het moment dat de laatste vertrekt,
	// niet vanaf het laatste bericht
	s, clk := newTestServer(t, nil)
	ts := httptest.NewServer(s)
	defer ts.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	room, seat, guest := nieuweKamer(s)
	host := verbind(t, ctx, ts, room, seat)
	vertrek(t, s, room, guest, verbind(t, ctx, ts, room, guest))
	clk.advance(13 * time.Hour)
	vertrek(t, s, room, seat, host)
	clk.advance(11*time.Hour + 50*time.Minute)
	veeg(t, s)
	if !kamerBestaat(s, room) {
		t.Fatalf("11 uur 50 na het vertrek hoort de kamer er nog te zijn")
	}
	clk.advance(20 * time.Minute)
	veeg(t, s)
	if kamerBestaat(s, room) {
		t.Fatalf("12 uur 10 na het vertrek hoort hij weg te zijn")
	}
}

func TestKamerHerverbindenNaUren(t *testing.T) {
	// een stoeltoken neemt zijn stoel ook na uren terug, en het potje gaat
	// gewoon verder
	s, clk := newTestServer(t, nil)
	ts := httptest.NewServer(s)
	defer ts.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	room, seat, guest := nieuweKamer(s)
	host := verbind(t, ctx, ts, room, seat)
	gast := verbind(t, ctx, ts, room, guest)
	vertrek(t, s, room, seat, host)
	vertrek(t, s, room, guest, gast)

	clk.advance(11 * time.Hour)
	veeg(t, s)
	gast = verbind(t, ctx, ts, room, guest)
	defer gast.CloseNow()
	clk.advance(11 * time.Hour)
	veeg(t, s)
	host = verbind(t, ctx, ts, room, seat)
	defer host.CloseNow()
	if got := wsRead(t, ctx, gast); !strings.Contains(got, `"aan":true`) {
		t.Fatalf("de gast hoort te horen dat de host terug is, kreeg %q", got)
	}
	host.Write(ctx, websocket.MessageText, []byte(`{"t":"zet","from":12,"to":28}`))
	if got := wsRead(t, ctx, gast); got != `{"t":"zet","from":12,"to":28}` {
		t.Fatalf("de zet kwam niet aan na 22 uur: %q", got)
	}
}

func TestRelayFoutToken(t *testing.T) {
	s, _ := newTestServer(t, nil)
	ts := httptest.NewServer(s)
	defer ts.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	w := do(t, s, "POST", "/v1/room", "", nil)
	var rm struct{ Room, Seat, Guest string }
	json.Unmarshal(w.Body.Bytes(), &rm)

	// fout stoeltoken en onbekende kamer: allebei meteen dicht
	c := wsDial(t, ctx, ts, rm.Room, "heelverkeerdtoken")
	if _, _, err := c.Read(ctx); err == nil {
		t.Fatal("fout token hoort een gesloten verbinding te geven")
	}
	c = wsDial(t, ctx, ts, "onbekendekamer12", rm.Seat)
	if _, _, err := c.Read(ctx); err == nil {
		t.Fatal("onbekende kamer hoort een gesloten verbinding te geven")
	}
}
