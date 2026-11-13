package main

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestPotjeHerschrijvenBijVolDuwtNiemandWeg(t *testing.T) {
	// ook niet als de herschreven bus niet de langst niet geschreven is
	s, clk := newTestServer(t, nil)
	var bussen []string
	for i := 0; i < maxPotjes; i++ {
		b, id := potjeBus(fmt.Sprintf("v%04d", i))
		if c := schrijfPotje(s, b, id, "x"); c != 204 {
			t.Fatalf("bus %d: %d", i, c)
		}
		bussen = append(bussen, id)
		clk.advance(time.Second)
	}
	b, id := potjeBus("v0500")
	if c := schrijfPotje(s, b, id, "y"); c != 204 {
		t.Fatalf("herschrijven bij een volle tabel: %d", c)
	}
	s.mu.Lock()
	n := len(s.potjes)
	_, oudste := s.potjes[bussen[0]]
	s.mu.Unlock()
	if n != maxPotjes || !oudste {
		t.Fatalf("%d bussen, de oudste aanwezig: %v; wil %d en ja", n, oudste, maxPotjes)
	}
}

func TestPotjeVerlopenEnTerugMetDezelfdeBytesBegintVers(t *testing.T) {
	s, clk := newTestServer(t, nil)
	bewijs, bus := potjeBus("a")
	if c := schrijfPotje(s, bewijs, bus, "zet-1"); c != 204 {
		t.Fatalf("schrijven: %d", c)
	}
	// geen check tussendoor: die veegt ook, en verbergt dan een schrijven dat niet veegt
	clk.advance(potjeTTL + time.Hour)
	if c := schrijfPotje(s, bewijs, bus, "zet-1"); c != 204 {
		t.Fatalf("opnieuw schrijven na het verlopen: %d", c)
	}
	clk.advance(5 * time.Second)
	if g := leesPotjes(s, bus); g.Blobs[bus] != "zet-1" || g.Ongewijzigd[bus] != 5 {
		t.Fatalf("verlopen en met dezelfde bytes terug: %+v, wil 5 seconden", g)
	}
}

func TestPotjeTabelTeltUitnodigingenNietMee(t *testing.T) {
	s, clk := newTestServer(t, nil)
	for i := 0; i < maxBuses; i++ {
		b := fmt.Sprintf("uitnodiging-%04d-0123456789abcdef", i)
		if c := busPost(t, s, busID(b), b, "x"); c != 204 {
			t.Fatalf("uitnodiging %d: %d", i, c)
		}
	}
	var eerste string
	for i := 0; i < maxPotjes; i++ {
		b, id := potjeBus(fmt.Sprintf("v%04d", i))
		if c := schrijfPotje(s, b, id, "x"); c != 204 {
			t.Fatalf("potje %d: %d", i, c)
		}
		if i == 0 {
			eerste = id
		}
		clk.advance(time.Second)
	}
	s.mu.Lock()
	n := len(s.potjes)
	s.mu.Unlock()
	if g := leesPotjes(s, eerste); n != maxPotjes || g.Blobs[eerste] != "x" {
		t.Fatalf("naast %d uitnodigingen: %d potjes, het eerste nog leesbaar: %v; wil %d en ja",
			maxBuses, n, g.Blobs[eerste] == "x", maxPotjes)
	}
}

func TestPotjeAlleenEenJSONObject(t *testing.T) {
	s, _ := newTestServer(t, nil)
	bewijs, bus := potjeBus("a")
	goed := string(jsonBody(t, map[string]string{"bus": bus, "bewijs": bewijs, "blob": "x", "als": ""}))
	for _, staart := range []string{" x", `{"naam":"Fien"}`, "}", `]{"naam":"Fien"}`} {
		if c := do(t, s, "POST", "/v1/potje", "", []byte(goed+staart)).Code; c != 400 {
			t.Errorf("met %q erachter: %d, wil 400", staart, c)
		}
	}
	if g := leesPotjes(s, bus); len(g.Blobs) != 0 {
		t.Fatalf("een geweigerd verzoek schreef toch: %+v", g)
	}
	if c := do(t, s, "POST", "/v1/potje", "", []byte(goed+" \n")).Code; c != 204 {
		t.Fatalf("met alleen witruimte erachter: %d, wil 204", c)
	}
}

func TestBusEnPotjeGrensInBytes(t *testing.T) {
	s, _ := newTestServer(t, nil)
	bewijs, bus := potjeBus("a")
	vol, teVeel := strings.Repeat("é", 2048), strings.Repeat("é", 2049)
	if c := schrijfPotje(s, bewijs, bus, teVeel); c != 400 {
		t.Errorf("potje, 2049 keer é (4098 bytes): %d, wil 400", c)
	}
	if c := schrijfPotje(s, bewijs, bus, vol); c != 204 {
		t.Errorf("potje, 2048 keer é (4096 bytes): %d, wil 204", c)
	}
	if c := busPost(t, s, bus, bewijs, teVeel); c != 400 {
		t.Errorf("uitnodiging, 2049 keer é: %d, wil 400", c)
	}
	if c := busPost(t, s, bus, bewijs, vol); c != 204 {
		t.Errorf("uitnodiging, 2048 keer é: %d, wil 204", c)
	}
	getal := []byte(`{"bus":"` + bus + `","bewijs":"` + bewijs + `","blob":42,"als":""}`)
	for _, pad := range []string{"/v1/potje", "/v1/bus"} {
		if c := do(t, s, "POST", pad, "", getal).Code; c != 400 {
			t.Errorf("%s met een getal als blob: %d, wil 400", pad, c)
		}
	}
}

func TestPotjeLeeftijdAlleenVoorPotjesbussen(t *testing.T) {
	s, _ := newTestServer(t, nil)
	u := "uitnodiging-0123456789abcdef"
	bewijs, bus := potjeBus("a")
	if busPost(t, s, busID(u), u, "x") != 204 || schrijfPotje(s, bewijs, bus, "y") != 204 {
		t.Fatalf("schrijven lukt niet")
	}
	g := leesPotjes(s, busID(u), bus)
	if g.Blobs[busID(u)] != "x" || g.Blobs[bus] != "y" {
		t.Fatalf("lezen: %+v", g)
	}
	if _, heeft := g.Ongewijzigd[busID(u)]; heeft || len(g.Ongewijzigd) != 1 {
		t.Fatalf("alleen de potjesbus krijgt een leeftijd: %+v", g.Ongewijzigd)
	}
}

/* ---------- de staat van een paar staat op schijf ---------- */

// een testserver op de map dir die echt naar schijf schrijft, met fsync
func opSchijf(dir string, klok func() time.Time) func(*config) {
	return func(c *config) {
		c.dataDir, c.fsync = dir, nil
		if klok != nil {
			c.now = klok
		}
	}
}

func potjesMapIn(dir string) string { return filepath.Join(dir, "potjes") }

func potjeBestand(dir, bus string) string { return filepath.Join(potjesMapIn(dir), bus+".json") }

func bestaat(pad string) bool {
	_, err := os.Stat(pad)
	return err == nil
}

func schrijfBestand(t *testing.T, pad, inhoud string) {
	t.Helper()
	if err := os.WriteFile(pad, []byte(inhoud), 0o600); err != nil {
		t.Fatal(err)
	}
}

func staatOpSchijf(tot time.Time, blob string) string {
	return fmt.Sprintf(`{"tot":%q,"blob":%q}`, tot.Format(time.RFC3339Nano), blob)
}

func aantalPotjes(s *server) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.potjes)
}

func TestPotjeOverleeftHerstart(t *testing.T) {
	dir := t.TempDir()
	s1, clk := newTestServer(t, opSchijf(dir, nil))
	bewijsA, busA := potjeBus("a")
	bewijsB, busB := potjeBus("b")
	if schrijfPotjeAls(s1, bewijsA, busA, "staat-a", "").code != 204 || schrijfPotjeAls(s1, bewijsB, busB, "staat-b", "").code != 204 {
		t.Fatal("schrijven lukt niet")
	}
	if c := do(t, s1, "PUT", "/v1/profile/a1b2c3d4e5f6a7b8", testSecret, []byte("profiel")).Code; c != 204 {
		t.Fatalf("profiel bewaren: %d", c)
	}
	clk.advance(20 * 24 * time.Hour)
	s2, _ := newTestServer(t, opSchijf(dir, clk.now))
	if g := leesPotjes(s2, busA, busB); g.Blobs[busA] != "staat-a" || g.Blobs[busB] != "staat-b" || g.Ongewijzigd[busA] != 0 {
		t.Fatalf("na de herstart: %+v, wil beide staten, ongewijzigd vanaf de herstart", g)
	}
	if a := schrijfPotjeAls(s2, bewijsB, busB, "staat-b2", versieVan("staat-x")); a.code != 409 || a.blob != "staat-b" {
		t.Fatalf("na de herstart met een verkeerde versie: %+v, wil 409 met staat-b", a)
	}
	if a := schrijfPotjeAls(s2, bewijsB, busB, "staat-b2", versieVan("staat-b")); a.code != 204 {
		t.Fatalf("na de herstart met de versie van wat er stond: %+v, wil 204", a)
	}
	if w := do(t, s2, "GET", "/v1/profile/a1b2c3d4e5f6a7b8", testSecret, nil); w.Code != 200 || w.Body.String() != "profiel" {
		t.Fatalf("het profiel na de herstart: %d %q", w.Code, w.Body.String())
	}
	clk.advance(10*24*time.Hour - time.Second)
	if g := leesPotjes(s2, busA); g.Blobs[busA] != "staat-a" {
		t.Fatalf("een seconde voor de dertig dagen van de eerste server: %+v, wil er nog", g)
	}
	clk.advance(time.Second)
	if g := leesPotjes(s2, busA); len(g.Blobs) != 0 || bestaat(potjeBestand(dir, busA)) {
		t.Fatalf("na de dertig dagen: %+v, bestand er nog %v; wil weg, ook van schijf", g, bestaat(potjeBestand(dir, busA)))
	}
	s3, _ := newTestServer(t, opSchijf(dir, clk.now))
	if g := leesPotjes(s3, busA, busB); len(g.Blobs) != 1 || g.Blobs[busB] != "staat-b2" {
		t.Fatalf("na een tweede herstart: %+v, wil alleen staat-b2", g)
	}
}

func TestPotjeVerlopenBestandNietGeladen(t *testing.T) {
	dir := t.TempDir()
	s1, clk := newTestServer(t, opSchijf(dir, nil))
	bewijs, bus := potjeBus("a")
	if schrijfPotjeAls(s1, bewijs, bus, "staat", "").code != 204 || !bestaat(potjeBestand(dir, bus)) {
		t.Fatal("na schrijven hoort de staat op schijf te staan")
	}
	clk.advance(potjeTTL)
	s2, _ := newTestServer(t, opSchijf(dir, clk.now))
	if n := aantalPotjes(s2); n != 0 || bestaat(potjeBestand(dir, bus)) {
		t.Fatalf("een verlopen staat bij de start: %d geladen, bestand er nog %v; wil 0 en weg", n, bestaat(potjeBestand(dir, bus)))
	}
}

func TestPotjeKapotBestandOvergeslagen(t *testing.T) {
	dir := t.TempDir()
	s1, clk := newTestServer(t, opSchijf(dir, nil))
	bewijs, bus := potjeBus("goed")
	if schrijfPotjeAls(s1, bewijs, bus, "staat", "").code != 204 {
		t.Fatal("schrijven lukt niet")
	}
	tot := clk.now().Add(24 * time.Hour)
	_, half := potjeBus("half")
	_, leeg := potjeBus("leeg")
	_, groot := potjeBus("groot")
	_, kort := potjeBus("kort")
	kapot := map[string]string{
		half + ".json":      staatOpSchijf(tot, "staat")[:30],
		leeg + ".json":      staatOpSchijf(tot, ""),
		groot + ".json":     staatOpSchijf(tot, strings.Repeat("a", 4097)),
		kort[:63] + ".json": staatOpSchijf(tot, "staat"),
		"geen-id.json":      staatOpSchijf(tot, "staat"),
		".tmp-123456":       "{",
	}
	for naam, inhoud := range kapot {
		schrijfBestand(t, filepath.Join(potjesMapIn(dir), naam), inhoud)
	}
	if err := os.Mkdir(filepath.Join(potjesMapIn(dir), "een-map"), 0o700); err != nil {
		t.Fatal(err)
	}
	s2, _ := newTestServer(t, opSchijf(dir, clk.now))
	if g := leesPotjes(s2, bus); aantalPotjes(s2) != 1 || g.Blobs[bus] != "staat" {
		t.Fatalf("na de start: %d geladen, %+v; wil alleen de goede staat", aantalPotjes(s2), g)
	}
	for naam := range kapot {
		if bestaat(filepath.Join(potjesMapIn(dir), naam)) {
			t.Errorf("%s staat er nog, wil weg", naam)
		}
	}
	if !bestaat(filepath.Join(potjesMapIn(dir), "een-map")) {
		t.Errorf("een map in de potjesmap is geen staat en hoort te blijven")
	}
}

func TestPotjeGrensNaLaden(t *testing.T) {
	dir := t.TempDir()
	_, clk := newTestServer(t, opSchijf(dir, nil))
	var bussen []string
	for i := 0; i < maxPotjes+6; i++ {
		_, bus := potjeBus(fmt.Sprintf("v%04d", i))
		schrijfBestand(t, potjeBestand(dir, bus), staatOpSchijf(clk.now().Add(time.Hour+time.Duration(i)*time.Second), "x"))
		bussen = append(bussen, bus)
	}
	s, _ := newTestServer(t, opSchijf(dir, clk.now))
	if n := aantalPotjes(s); n != maxPotjes {
		t.Fatalf("na de start: %d geladen, wil %d", n, maxPotjes)
	}
	for i, bus := range bussen {
		if weg := i < 6; bestaat(potjeBestand(dir, bus)) == weg {
			t.Errorf("staat %d: op schijf %v, wil %v", i, !weg, weg)
		}
	}
	bewijs, nieuw := potjeBus("nieuw")
	if a := schrijfPotjeAls(s, bewijs, nieuw, "x", ""); a.code != 204 || aantalPotjes(s) != maxPotjes {
		t.Fatalf("een nieuwe staat bij een volle tabel: %+v, %d", a, aantalPotjes(s))
	}
	if bestaat(potjeBestand(dir, bussen[6])) || !bestaat(potjeBestand(dir, nieuw)) {
		t.Fatalf("wie plaatsmaakt hoort ook van schijf te gaan, de nieuwe erop")
	}
}

func TestPotjeGewistBestandWeg(t *testing.T) {
	dir := t.TempDir()
	s, _ := newTestServer(t, opSchijf(dir, nil))
	bewijs, bus := potjeBus("a")
	if schrijfPotjeAls(s, bewijs, bus, "staat", "").code != 204 || schrijfPotjeAls(s, bewijs, bus, "", versieVan("staat")).code != 204 {
		t.Fatal("schrijven en wissen lukken niet")
	}
	if bestaat(potjeBestand(dir, bus)) {
		t.Fatal("een gewiste staat hoort ook van schijf te gaan")
	}
}

func TestPotjeSchijfWeigert(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root schrijft ook in een map zonder schrijfrecht")
	}
	dir := t.TempDir()
	s, _ := newTestServer(t, opSchijf(dir, nil))
	bewijs, bus := potjeBus("a")
	if schrijfPotjeAls(s, bewijs, bus, "staat", "").code != 204 {
		t.Fatal("schrijven lukt niet")
	}
	if err := os.Chmod(potjesMapIn(dir), 0o500); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.Chmod(potjesMapIn(dir), 0o700) })
	var logboek bytes.Buffer
	log.SetOutput(&logboek)
	t.Cleanup(func() { log.SetOutput(os.Stderr) })
	if a := schrijfPotjeAls(s, bewijs, bus, "staat-2", versieVan("staat")); a.code != 500 {
		t.Fatalf("schrijven op een schijf die weigert: %+v, wil 500", a)
	}
	if a := schrijfPotjeAls(s, bewijs, bus, "", versieVan("staat")); a.code != 500 {
		t.Fatalf("wissen op een schijf die weigert: %+v, wil 500", a)
	}
	if g := leesPotjes(s, bus); g.Blobs[bus] != "staat" {
		t.Fatalf("na geweigerd opslaan: %+v, wil de oude staat", g)
	}
	if logboek.Len() == 0 || strings.Contains(logboek.String(), bus) {
		t.Fatalf("de log hoort het falen te melden zonder het id: %q", logboek.String())
	}
}

func TestPotjeBestandsnaamBlijftInDeMap(t *testing.T) {
	dir := t.TempDir()
	s, _ := newTestServer(t, opSchijf(dir, nil))
	for _, bus := range []string{"../" + strings.Repeat("a", 61), "..", strings.Repeat("a", 63) + "/", "potjes"} {
		w := doe(s, "POST", "/v1/potje", map[string]string{"bus": bus, "bewijs": "potje-a-0123456789abcdef", "blob": "x", "als": ""})
		if w.Code != 400 {
			t.Errorf("bus %q: %d, wil 400", bus, w.Code)
		}
	}
	if items, _ := os.ReadDir(dir); len(items) != 1 {
		t.Fatalf("in de datamap hoort alleen de potjesmap: %v", items)
	}
	if items, _ := os.ReadDir(potjesMapIn(dir)); len(items) != 0 {
		t.Fatalf("in de potjesmap hoort niets: %v", items)
	}
}

func TestPotjeVerlengingOverleeftHerstart(t *testing.T) {
	dir := t.TempDir()
	s1, clk := newTestServer(t, opSchijf(dir, nil))
	bewijs, bus := potjeBus("a")
	if schrijfPotjeAls(s1, bewijs, bus, "staat", "").code != 204 {
		t.Fatal("schrijven lukt niet")
	}
	clk.advance(20 * 24 * time.Hour)
	if a := schrijfPotjeAls(s1, bewijs, bus, "staat", versieVan("staat")); a.code != 204 {
		t.Fatalf("dezelfde bytes op dag 20: %+v", a)
	}
	clk.advance(5 * 24 * time.Hour)
	s2, _ := newTestServer(t, opSchijf(dir, clk.now))
	clk.advance(25*24*time.Hour - time.Second)
	if g := leesPotjes(s2, bus); g.Blobs[bus] != "staat" {
		t.Fatalf("een seconde voor dag 50, na een herstart op dag 25: %+v, wil er nog", g)
	}
	clk.advance(time.Second)
	if g := leesPotjes(s2, bus); len(g.Blobs) != 0 {
		t.Fatalf("op dag 50: %+v, wil weg", g)
	}
}

func TestPotjeSchijfWeigertBijVolleTabel(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root schrijft ook in een map zonder schrijfrecht")
	}
	dir := t.TempDir()
	_, clk := newTestServer(t, opSchijf(dir, nil))
	var bussen []string
	for i := 0; i < maxPotjes; i++ {
		_, bus := potjeBus(fmt.Sprintf("v%04d", i))
		schrijfBestand(t, potjeBestand(dir, bus), staatOpSchijf(clk.now().Add(time.Hour+time.Duration(i)*time.Second), "x"))
		bussen = append(bussen, bus)
	}
	s, _ := newTestServer(t, opSchijf(dir, clk.now))
	if err := os.Chmod(potjesMapIn(dir), 0o500); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.Chmod(potjesMapIn(dir), 0o700) })
	log.SetOutput(io.Discard)
	t.Cleanup(func() { log.SetOutput(os.Stderr) })
	bewijs, nieuw := potjeBus("nieuw")
	if a := schrijfPotjeAls(s, bewijs, nieuw, "x", ""); a.code != 500 {
		t.Fatalf("een nieuwe staat bij een volle tabel op een schijf die weigert: %+v, wil 500", a)
	}
	if g := leesPotjes(s, bussen[0], nieuw); aantalPotjes(s) != maxPotjes || g.Blobs[bussen[0]] != "x" || len(g.Blobs) != 1 {
		t.Fatalf("na geweigerd opslaan: %d staten, %+v; wil de oudste nog en de nieuwe niet", aantalPotjes(s), g)
	}
}

func TestPotjeOnleesbaarBestandBlijft(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root leest ook een bestand zonder leesrecht")
	}
	dir := t.TempDir()
	_, clk := newTestServer(t, opSchijf(dir, nil))
	_, bus := potjeBus("a")
	pad := potjeBestand(dir, bus)
	schrijfBestand(t, pad, staatOpSchijf(clk.now().Add(time.Hour), "staat"))
	if err := os.Chmod(pad, 0); err != nil {
		t.Fatal(err)
	}
	s, _ := newTestServer(t, opSchijf(dir, clk.now))
	if n := aantalPotjes(s); n != 0 || !bestaat(pad) {
		t.Fatalf("een bestand dat niet te lezen is: %d geladen, er nog %v; wil 0 en blijven staan", n, bestaat(pad))
	}
}
