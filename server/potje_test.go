package main

import (
	"fmt"
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
