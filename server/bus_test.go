package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

func busID(bewijs string) string {
	sum := sha256.Sum256([]byte(bewijs))
	return hex.EncodeToString(sum[:])
}

func busPost(t *testing.T, s *server, bus, bewijs, blob string) int {
	t.Helper()
	w := do(t, s, "POST", "/v1/bus", "", jsonBody(t, map[string]string{"bus": bus, "bewijs": bewijs, "blob": blob}))
	return w.Code
}

func busCheck(t *testing.T, s *server, ids ...string) map[string]string {
	t.Helper()
	w := do(t, s, "POST", "/v1/bus/check", "", jsonBody(t, map[string]any{"bussen": ids}))
	if w.Code != http.StatusOK {
		t.Fatalf("check: status %d", w.Code)
	}
	var out struct{ Blobs map[string]string }
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	return out.Blobs
}

const bewijsA = "bewijs-voor-bus-A-0123456789abcdef"
const bewijsB = "bewijs-voor-bus-B-0123456789abcdef"

func TestBusPostAndCheck(t *testing.T) {
	s, _ := newTestServer(t, nil)
	if code := busPost(t, s, busID(bewijsA), bewijsA, "briefje-a"); code != http.StatusNoContent {
		t.Fatalf("post: %d", code)
	}
	blobs := busCheck(t, s, busID(bewijsA), busID(bewijsB))
	if blobs[busID(bewijsA)] != "briefje-a" || len(blobs) != 1 {
		t.Fatalf("check: %v", blobs)
	}
	// een tweede briefje vervangt het eerste: een bus houdt er precies een
	busPost(t, s, busID(bewijsA), bewijsA, "briefje-a2")
	if blobs := busCheck(t, s, busID(bewijsA)); blobs[busID(bewijsA)] != "briefje-a2" {
		t.Fatalf("vervangen: %v", blobs)
	}
	// leeg briefje wist de bus
	busPost(t, s, busID(bewijsA), bewijsA, "")
	if blobs := busCheck(t, s, busID(bewijsA)); len(blobs) != 0 {
		t.Fatalf("wissen: %v", blobs)
	}
}

func TestBusNeedsMatchingProof(t *testing.T) {
	s, _ := newTestServer(t, nil)
	// bus-id hoort niet bij dit bewijs
	if code := busPost(t, s, busID(bewijsA), bewijsB, "x"); code != http.StatusBadRequest {
		t.Fatalf("mismatch: %d", code)
	}
	// rare tekens in het bewijs, geen hex in de bus
	if code := busPost(t, s, busID("kort"), "kort", "x"); code != http.StatusBadRequest {
		t.Fatalf("kort bewijs: %d", code)
	}
	if code := busPost(t, s, "GEEN-HEX", bewijsA, "x"); code != http.StatusBadRequest {
		t.Fatalf("geen hex: %d", code)
	}
	if blobs := busCheck(t, s, busID(bewijsA)); len(blobs) != 0 {
		t.Fatalf("er mag niets liggen: %v", blobs)
	}
}

func TestBusExpires(t *testing.T) {
	s, clk := newTestServer(t, nil)
	busPost(t, s, busID(bewijsA), bewijsA, "x")
	clk.advance(busTTL - time.Second)
	if blobs := busCheck(t, s, busID(bewijsA)); len(blobs) != 1 {
		t.Fatalf("te vroeg weg: %v", blobs)
	}
	clk.advance(2 * time.Second)
	if blobs := busCheck(t, s, busID(bewijsA)); len(blobs) != 0 {
		t.Fatalf("verlopen briefje nog zichtbaar: %v", blobs)
	}
}

// vol is vol: verzonnen bussen kunnen een echte uitnodiging niet wegdrukken,
// en wat er stond blijft staan (zelfde invariant als TestLinkBegrensd)
func TestBusFullRejectsButKeeps(t *testing.T) {
	s, clk := newTestServer(t, nil)
	eerste := "eerste-bewijs-0123456789abcdef"
	busPost(t, s, busID(eerste), eerste, "oud")
	for i := 0; i < maxBuses-1; i++ {
		clk.advance(time.Millisecond)
		b := "vulling-" + hex.EncodeToString([]byte{byte(i >> 8), byte(i)}) + "-0123456789abcdef"
		if code := busPost(t, s, busID(b), b, "x"); code != http.StatusNoContent {
			t.Fatalf("vulling %d: %d", i, code)
		}
	}
	extra := "extra-bewijs-0123456789abcdef"
	if code := busPost(t, s, busID(extra), extra, "x"); code != http.StatusTooManyRequests {
		t.Fatalf("vol had 429 moeten geven: %d", code)
	}
	if blobs := busCheck(t, s, busID(eerste), busID(extra)); blobs[busID(eerste)] != "oud" || len(blobs) != 1 {
		t.Fatalf("de eerste moet blijven, de extra niet: %v", blobs)
	}
	// een bestaande bus overschrijven mag ook als het vol is
	if code := busPost(t, s, busID(eerste), eerste, "nieuwer"); code != http.StatusNoContent {
		t.Fatalf("vervangen bij vol: %d", code)
	}
	// na de TTL is er weer plek
	clk.advance(busTTL + time.Second)
	if code := busPost(t, s, busID(extra), extra, "x"); code != http.StatusNoContent {
		t.Fatalf("na verlopen weer plek: %d", code)
	}
	s.mu.Lock()
	n := len(s.buses)
	s.mu.Unlock()
	if n > maxBuses {
		t.Fatalf("cap overschreden: %d", n)
	}
}

func TestBusCheckLimits(t *testing.T) {
	s, _ := newTestServer(t, nil)
	ids := make([]string, maxBusCheck+1)
	for i := range ids {
		ids[i] = busID(hex.EncodeToString([]byte{byte(i)}))
	}
	w := do(t, s, "POST", "/v1/bus/check", "", jsonBody(t, map[string]any{"bussen": ids}))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("te veel bussen: %d", w.Code)
	}
	// onzin-ids worden overgeslagen, niet bestraft
	blobs := busCheck(t, s, "niet-hex", busID(bewijsA))
	if len(blobs) != 0 {
		t.Fatalf("onverwacht: %v", blobs)
	}
	// te groot briefje
	big := make([]byte, maxBusBlob+1)
	for i := range big {
		big[i] = 'a'
	}
	if code := busPost(t, s, busID(bewijsA), bewijsA, string(big)); code != http.StatusBadRequest {
		t.Fatalf("te groot: %d", code)
	}
}
