package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

/* ---------- testgereedschap ---------- */

type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *fakeClock) now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *fakeClock) advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

func newTestServer(t *testing.T, mut func(*config)) (*server, *fakeClock) {
	t.Helper()
	clk := &fakeClock{t: time.Date(2026, 8, 17, 12, 0, 0, 0, time.UTC)}
	cfg := config{
		dataDir:     t.TempDir(),
		origin:      "https://evert.lammerts.online",
		redeemDelay: 0,
		redeemSlots: 8,
		now:         clk.now,
	}
	if mut != nil {
		mut(&cfg)
	}
	s, err := newServer(cfg)
	if err != nil {
		t.Fatal(err)
	}
	return s, clk
}

func do(t *testing.T, s *server, method, path, auth string, body []byte) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	if auth != "" {
		req.Header.Set("Authorization", "Bearer "+auth)
	}
	w := httptest.NewRecorder()
	s.ServeHTTP(w, req)
	return w
}

func jsonBody(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

const testSecret = "dit-is-een-lang-genoeg-testsecret"

/* ---------- koppelcodes ---------- */

func TestLinkRedeemEenmalig(t *testing.T) {
	s, _ := newTestServer(t, nil)
	w := do(t, s, "POST", "/v1/link", "", jsonBody(t, map[string]string{
		"code": "aap-noot-mies-wim", "payload": "geheim-blobje"}))
	if w.Code != 204 {
		t.Fatalf("registreren: status %d", w.Code)
	}
	w = do(t, s, "POST", "/v1/link/redeem", "", jsonBody(t, map[string]string{
		"code": "aap-noot-mies-wim"}))
	if w.Code != 200 {
		t.Fatalf("inwisselen: status %d", w.Code)
	}
	var out struct{ Payload string }
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil || out.Payload != "geheim-blobje" {
		t.Fatalf("inwisselen: payload %q, err %v", out.Payload, err)
	}
	w = do(t, s, "POST", "/v1/link/redeem", "", jsonBody(t, map[string]string{
		"code": "aap-noot-mies-wim"}))
	if w.Code != 404 {
		t.Fatalf("tweede keer inwisselen moet 404 zijn, kreeg %d", w.Code)
	}
}

func TestRedeemOnbekend(t *testing.T) {
	s, _ := newTestServer(t, nil)
	w := do(t, s, "POST", "/v1/link/redeem", "", jsonBody(t, map[string]string{
		"code": "boom-roos-vis-vuur"}))
	if w.Code != 404 {
		t.Fatalf("status %d", w.Code)
	}
}

func TestLinkTTL(t *testing.T) {
	s, clk := newTestServer(t, nil)
	do(t, s, "POST", "/v1/link", "", jsonBody(t, map[string]string{
		"code": "aap-noot-mies-wim", "payload": "x"}))
	clk.advance(6 * time.Minute)
	w := do(t, s, "POST", "/v1/link/redeem", "", jsonBody(t, map[string]string{
		"code": "aap-noot-mies-wim"}))
	if w.Code != 404 {
		t.Fatalf("verlopen code moet 404 zijn, kreeg %d", w.Code)
	}
	s.mu.Lock()
	n := len(s.links)
	s.mu.Unlock()
	if n != 0 {
		t.Fatalf("verlopen entries niet opgeruimd: %d over", n)
	}
}

func TestLinkOverschrijven(t *testing.T) {
	s, _ := newTestServer(t, nil)
	do(t, s, "POST", "/v1/link", "", jsonBody(t, map[string]string{
		"code": "aap-noot-mies-wim", "payload": "eerste"}))
	do(t, s, "POST", "/v1/link", "", jsonBody(t, map[string]string{
		"code": "aap-noot-mies-wim", "payload": "tweede"}))
	w := do(t, s, "POST", "/v1/link/redeem", "", jsonBody(t, map[string]string{
		"code": "aap-noot-mies-wim"}))
	var out struct{ Payload string }
	json.Unmarshal(w.Body.Bytes(), &out)
	if out.Payload != "tweede" {
		t.Fatalf("laatste registratie moet winnen, kreeg %q", out.Payload)
	}
}

func TestLinkValidatie(t *testing.T) {
	s, _ := newTestServer(t, nil)
	for _, code := range []string{"", "ab", "HOOFDLETTERS!", "spaties erin", strings.Repeat("a", 65)} {
		w := do(t, s, "POST", "/v1/link", "", jsonBody(t, map[string]string{
			"code": code, "payload": "x"}))
		// hoofdletters en spaties rond de code normaliseert de server zelf,
		// dus alleen echt ongeldige vormen horen 400 te geven
		norm := strings.ToLower(strings.TrimSpace(code))
		wantBad := !codeRe.MatchString(norm)
		if wantBad && w.Code != 400 {
			t.Errorf("code %q: status %d, wil 400", code, w.Code)
		}
	}
	w := do(t, s, "POST", "/v1/link", "", jsonBody(t, map[string]string{
		"code": "aap-noot-mies-wim", "payload": ""}))
	if w.Code != 400 {
		t.Errorf("lege payload: status %d, wil 400", w.Code)
	}
	w = do(t, s, "POST", "/v1/link", "", []byte("geen json"))
	if w.Code != 400 {
		t.Errorf("kapotte json: status %d, wil 400", w.Code)
	}
}

func TestRedeemVasteVertraging(t *testing.T) {
	s, _ := newTestServer(t, func(c *config) { c.redeemDelay = 30 * time.Millisecond })
	do(t, s, "POST", "/v1/link", "", jsonBody(t, map[string]string{
		"code": "aap-noot-mies-wim", "payload": "x"}))
	for name, code := range map[string]string{"raak": "aap-noot-mies-wim", "mis": "boom-roos-vis-vuur"} {
		start := time.Now()
		do(t, s, "POST", "/v1/link/redeem", "", jsonBody(t, map[string]string{"code": code}))
		if d := time.Since(start); d < 30*time.Millisecond {
			t.Errorf("%s: antwoord na %v, vertraging hoort minstens 30ms te zijn", name, d)
		}
	}
}

func TestRedeemGelijktijdigheidslimiet(t *testing.T) {
	s, _ := newTestServer(t, func(c *config) {
		c.redeemDelay = 100 * time.Millisecond
		c.redeemSlots = 1
		c.queueWait = 10 * time.Millisecond
	})
	var wg sync.WaitGroup
	codes := make(chan int, 3)
	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			w := do(t, s, "POST", "/v1/link/redeem", "", jsonBody(t, map[string]string{
				"code": "boom-roos-vis-vuur"}))
			codes <- w.Code
		}()
	}
	wg.Wait()
	close(codes)
	got429 := false
	for c := range codes {
		if c == 429 {
			got429 = true
		}
	}
	if !got429 {
		t.Error("met 1 slot en 3 gelijktijdige pogingen hoort er minstens 1 een 429 te krijgen")
	}
}

func TestLinkBegrensd(t *testing.T) {
	s, _ := newTestServer(t, func(c *config) { c.maxLinks = 2 })
	for _, code := range []string{"code-een", "code-twee"} {
		w := do(t, s, "POST", "/v1/link", "", jsonBody(t, map[string]string{
			"code": code, "payload": "x"}))
		if w.Code != 204 {
			t.Fatalf("registreren %s: status %d", code, w.Code)
		}
	}
	w := do(t, s, "POST", "/v1/link", "", jsonBody(t, map[string]string{
		"code": "code-drie", "payload": "x"}))
	if w.Code != 429 {
		t.Errorf("boven de limiet: status %d, wil 429", w.Code)
	}
	// vol is vol, ook voor een bestaande code: een ander antwoord voor
	// bestaand-vs-nieuw zou een orakel zijn voor welke codes bestaan
	w = do(t, s, "POST", "/v1/link", "", jsonBody(t, map[string]string{
		"code": "code-een", "payload": "vers"}))
	if w.Code != 429 {
		t.Errorf("herregistreren bij volle tabel: status %d, wil 429", w.Code)
	}
	// en wat er stond is niet overschreven door de geweigerde poging
	w = do(t, s, "POST", "/v1/link/redeem", "", jsonBody(t, map[string]string{
		"code": "code-een"}))
	var out struct{ Payload string }
	json.Unmarshal(w.Body.Bytes(), &out)
	if out.Payload != "x" {
		t.Errorf("payload veranderd door geweigerde registratie: %q", out.Payload)
	}
}

func TestLinkEnPutVasteVertraging(t *testing.T) {
	s, _ := newTestServer(t, func(c *config) { c.redeemDelay = 30 * time.Millisecond })
	start := time.Now()
	do(t, s, "POST", "/v1/link", "", jsonBody(t, map[string]string{
		"code": "aap-noot-mies-wim", "payload": "x"}))
	if d := time.Since(start); d < 30*time.Millisecond {
		t.Errorf("registreren na %v, vertraging hoort minstens 30ms te zijn", d)
	}
	start = time.Now()
	do(t, s, "PUT", "/v1/profile/a1b2c3d4e5f6a7b8", testSecret, []byte("blob"))
	if d := time.Since(start); d < 30*time.Millisecond {
		t.Errorf("put na %v, vertraging hoort minstens 30ms te zijn", d)
	}
}

/* ---------- profielblobs ---------- */

func TestProfielRoundTrip(t *testing.T) {
	s, _ := newTestServer(t, nil)
	id := "a1b2c3d4e5f6a7b8"
	w := do(t, s, "PUT", "/v1/profile/"+id, testSecret, []byte("versleuteld-blob-1"))
	if w.Code != 204 {
		t.Fatalf("eerste PUT: status %d", w.Code)
	}
	w = do(t, s, "GET", "/v1/profile/"+id, testSecret, nil)
	if w.Code != 200 || w.Body.String() != "versleuteld-blob-1" {
		t.Fatalf("GET: status %d, body %q", w.Code, w.Body.String())
	}
	w = do(t, s, "PUT", "/v1/profile/"+id, testSecret, []byte("versleuteld-blob-2"))
	if w.Code != 204 {
		t.Fatalf("tweede PUT: status %d", w.Code)
	}
	w = do(t, s, "GET", "/v1/profile/"+id, testSecret, nil)
	if body := w.Body.String(); body != "versleuteld-blob-2" {
		t.Fatalf("na update: body %q", body)
	}
}

func TestProfielFoutIsOnbekend(t *testing.T) {
	s, _ := newTestServer(t, nil)
	id := "a1b2c3d4e5f6a7b8"
	do(t, s, "PUT", "/v1/profile/"+id, testSecret, []byte("blob"))

	// fout secret, onbekend id, ongeldig id en ontbrekende auth: allemaal
	// exact hetzelfde antwoord, dus niets valt te peilen
	responses := []*httptest.ResponseRecorder{
		do(t, s, "GET", "/v1/profile/"+id, "een-ander-fout-secret-hier", nil),
		do(t, s, "GET", "/v1/profile/ffffffffffffffff", testSecret, nil),
		// ".." zelf komt nooit bij de handler (de mux herschrijft het pad),
		// maar een id met punten wel en dat moet de validatie tegenhouden
		do(t, s, "GET", "/v1/profile/heeft.punten.hier", testSecret, nil),
		do(t, s, "GET", "/v1/profile/"+id, "", nil),
	}
	for i, w := range responses {
		if w.Code != 404 {
			t.Errorf("geval %d: status %d, wil 404", i, w.Code)
		}
		if w.Body.String() != responses[0].Body.String() {
			t.Errorf("geval %d: ander body dan geval 0", i)
		}
	}
	// en het blob is niet aangeraakt door de foute PUT-poging
	w := do(t, s, "PUT", "/v1/profile/"+id, "een-ander-fout-secret-hier", []byte("kaping"))
	if w.Code != 404 {
		t.Fatalf("PUT met fout secret: status %d", w.Code)
	}
	w = do(t, s, "GET", "/v1/profile/"+id, testSecret, nil)
	if w.Body.String() != "blob" {
		t.Fatalf("blob veranderd door foute PUT: %q", w.Body.String())
	}
}

func TestProfielLimieten(t *testing.T) {
	s, _ := newTestServer(t, nil)
	id := "a1b2c3d4e5f6a7b8"
	w := do(t, s, "PUT", "/v1/profile/"+id, testSecret, bytes.Repeat([]byte("x"), maxBlob+1))
	if w.Code != 413 {
		t.Errorf("te groot blob: status %d, wil 413", w.Code)
	}
	w = do(t, s, "PUT", "/v1/profile/"+id, testSecret, nil)
	if w.Code != 400 {
		t.Errorf("leeg blob: status %d, wil 400", w.Code)
	}
	w = do(t, s, "PUT", "/v1/profile/"+id, "kort", []byte("blob"))
	if w.Code != 404 {
		t.Errorf("te kort secret: status %d, wil 404", w.Code)
	}
}

func TestProfielAccountsBegrensd(t *testing.T) {
	dir := t.TempDir()
	s, _ := newTestServer(t, func(c *config) { c.dataDir = dir; c.maxAccounts = 2 })
	for _, id := range []string{"a1b2c3d4e5f6a7b8", "b1b2c3d4e5f6a7b8"} {
		w := do(t, s, "PUT", "/v1/profile/"+id, testSecret, []byte("blob"))
		if w.Code != 204 {
			t.Fatalf("aanmaken %s: status %d", id, w.Code)
		}
	}
	// vol geeft hetzelfde 404 als elk ander falen: geen vol-orakel
	w := do(t, s, "PUT", "/v1/profile/d1b2c3d4e5f6a7b8", testSecret, []byte("blob"))
	if w.Code != 404 {
		t.Errorf("derde account boven limiet: status %d, wil 404", w.Code)
	}
	// bestaande accounts blijven gewoon schrijfbaar
	w = do(t, s, "PUT", "/v1/profile/a1b2c3d4e5f6a7b8", testSecret, []byte("update"))
	if w.Code != 204 {
		t.Errorf("update binnen limiet: status %d, wil 204", w.Code)
	}
	// en de teller telt bestaande bestanden mee na een herstart
	s2, _ := newTestServer(t, func(c *config) { c.dataDir = dir; c.maxAccounts = 2 })
	w = do(t, s2, "PUT", "/v1/profile/d1b2c3d4e5f6a7b8", testSecret, []byte("blob"))
	if w.Code != 404 {
		t.Errorf("na herstart boven limiet: status %d, wil 404", w.Code)
	}
}

func TestProfielOverleeftHerstart(t *testing.T) {
	dir := t.TempDir()
	s1, _ := newTestServer(t, func(c *config) { c.dataDir = dir })
	id := "a1b2c3d4e5f6a7b8"
	do(t, s1, "PUT", "/v1/profile/"+id, testSecret, []byte("blijvend-blob"))

	s2, _ := newTestServer(t, func(c *config) { c.dataDir = dir })
	w := do(t, s2, "GET", "/v1/profile/"+id, testSecret, nil)
	if w.Code != 200 || w.Body.String() != "blijvend-blob" {
		t.Fatalf("na herstart: status %d, body %q", w.Code, w.Body.String())
	}
}

/* ---------- CORS en gezondheid ---------- */

func TestCORS(t *testing.T) {
	s, _ := newTestServer(t, nil)
	req := httptest.NewRequest("OPTIONS", "/v1/link", nil)
	req.Header.Set("Origin", "https://evert.lammerts.online")
	w := httptest.NewRecorder()
	s.ServeHTTP(w, req)
	if w.Code != 204 || w.Header().Get("Access-Control-Allow-Origin") != "https://evert.lammerts.online" {
		t.Errorf("preflight eigen origin: status %d, ACAO %q", w.Code, w.Header().Get("Access-Control-Allow-Origin"))
	}
	if h := w.Header().Get("Access-Control-Allow-Headers"); !strings.Contains(h, "Authorization") {
		t.Errorf("Authorization mist in allow-headers: %q", h)
	}

	req = httptest.NewRequest("OPTIONS", "/v1/link", nil)
	req.Header.Set("Origin", "https://kwaadaardig.example")
	w = httptest.NewRecorder()
	s.ServeHTTP(w, req)
	if w.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Error("vreemde origin kreeg CORS-toestemming")
	}
}

func TestGeenOpsomming(t *testing.T) {
	// de kernbelofte: er bestaat geen pad dat iets teruggeeft zonder dat je
	// vooraf een code of secret bezit
	s, _ := newTestServer(t, nil)
	do(t, s, "PUT", "/v1/profile/a1b2c3d4e5f6a7b8", testSecret, []byte("blob"))
	for _, path := range []string{"/v1/profile", "/v1/profile/", "/v1/link", "/v1", "/"} {
		w := do(t, s, "GET", path, "", nil)
		if w.Code == 200 {
			t.Errorf("GET %s gaf 200; body: %q", path, w.Body.String())
		}
		if strings.Contains(w.Body.String(), "a1b2c3d4") {
			t.Errorf("GET %s lekt een account-id", path)
		}
	}
}

func TestHealthz(t *testing.T) {
	s, _ := newTestServer(t, nil)
	w := do(t, s, "GET", "/healthz", "", nil)
	if w.Code != 200 {
		t.Fatalf("status %d", w.Code)
	}
	if body, _ := io.ReadAll(w.Body); string(body) != "ok\n" {
		t.Fatalf("body %q", body)
	}
}
