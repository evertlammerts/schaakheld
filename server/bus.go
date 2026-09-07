package main

// Brievenbussen voor uitnodigingen tussen vrienden. Twee kinderen die
// vrienden zijn delen een geheim K (via ECDH over de relay, de server
// kent het niet). Een bus-id is de sha256 van een uit K afgeleid bewijs;
// wie het bewijs kent mag in de bus leggen, wie het bus-id kent mag
// hem lezen. Zonder K is geen van beide te berekenen, en de inhoud is
// met K versleuteld. Er is niets dat bussen opsomt: lezen is opzoeken
// op ids die je al kent.
//
// Een bus houdt precies één briefje (de laatste uitnodiging), tien
// minuten. Een leeg briefje wist de bus (uitnodiging ingetrokken).

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"regexp"
	"time"
)

const (
	busTTL      = 10 * time.Minute
	maxBuses    = 512
	maxBusBlob  = 4 << 10
	maxBusCheck = 64
)

var busRe = regexp.MustCompile(`^[a-f0-9]{64}$`)

type busEntry struct {
	blob    string
	expires time.Time
}

func (s *server) sweepBusesLocked() {
	now := s.cfg.now()
	for id, b := range s.buses {
		if !now.Before(b.expires) {
			delete(s.buses, id)
		}
	}
}

// handleBusPost legt een briefje in een bus. {bus, bewijs, blob}: de bus
// moet sha256(bewijs) zijn, anders 400 (dat verraadt niets: wie een
// bewijs heeft kan die hash zelf uitrekenen). Leeg blob = wissen.
func (s *server) handleBusPost(w http.ResponseWriter, r *http.Request) {
	var in struct{ Bus, Bewijs, Blob string }
	if !readJSON(w, r, maxBusBlob+1024, &in) {
		return
	}
	sum := sha256.Sum256([]byte(in.Bewijs))
	if !busRe.MatchString(in.Bus) || !idRe.MatchString(in.Bewijs) ||
		hex.EncodeToString(sum[:]) != in.Bus || len(in.Blob) > maxBusBlob {
		http.Error(w, "ongeldig verzoek", http.StatusBadRequest)
		return
	}
	if !s.acquire(w, s.busC) {
		return
	}
	defer func() { <-s.busC }()
	time.Sleep(s.cfg.redeemDelay)
	s.mu.Lock()
	s.sweepBusesLocked()
	vol := false
	if in.Blob == "" {
		delete(s.buses, in.Bus)
	} else {
		// vol is vol, net als bij de koppelcodes: een spuiter met verzonnen
		// (maar zelf-consistente) bus-ids mag geen echte uitnodiging
		// wegdrukken. Een bestaande bus mag wel vervangen worden.
		_, bestaat := s.buses[in.Bus]
		vol = !bestaat && len(s.buses) >= maxBuses
		if !vol {
			s.buses[in.Bus] = busEntry{blob: in.Blob, expires: s.cfg.now().Add(busTTL)}
		}
	}
	s.mu.Unlock()
	if vol {
		http.Error(w, "te druk", http.StatusTooManyRequests)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleBusCheck geeft de briefjes uit de opgegeven bussen terug (alleen
// de bestaande). Zelfde rem als elk onge-authenticeerd pad: het is een
// tweede hendel op dezelfde vergrendeling en die hoort niet gratis te
// zijn. Begrensd in aantal per verzoek.
func (s *server) handleBusCheck(w http.ResponseWriter, r *http.Request) {
	var in struct{ Bussen []string }
	if !readJSON(w, r, 8192, &in) {
		return
	}
	if len(in.Bussen) > maxBusCheck {
		http.Error(w, "te veel bussen", http.StatusBadRequest)
		return
	}
	if !s.acquire(w, s.busC) {
		return
	}
	defer func() { <-s.busC }()
	time.Sleep(s.cfg.redeemDelay)
	out := map[string]string{}
	s.mu.Lock()
	s.sweepBusesLocked()
	for _, id := range in.Bussen {
		if !busRe.MatchString(id) {
			continue
		}
		if b, ok := s.buses[id]; ok {
			out[id] = b.blob
		}
	}
	s.mu.Unlock()
	writeJSON(w, map[string]any{"blobs": out})
}
