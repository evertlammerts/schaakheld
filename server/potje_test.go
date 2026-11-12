package main

import (
	"fmt"
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
	goed := string(jsonBody(t, map[string]string{"bus": bus, "bewijs": bewijs, "blob": "x"}))
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
	getal := []byte(`{"bus":"` + bus + `","bewijs":"` + bewijs + `","blob":42}`)
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
