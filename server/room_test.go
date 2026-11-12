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
