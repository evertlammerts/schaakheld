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
//
// Een potjesbus is dezelfde soort bus voor een potje dat over dagen loopt:
// elk kind schrijft de stand in zijn eigen bus en leest die van de ander.
// Hij leeft dertig dagen na het laatste schrijven, en de check meldt hoe
// lang zijn bytes gelijk bleven. Het potje zelf staat op beide apparaten;
// de bus is alleen de weg ernaartoe, dus een herstart of een weggeduwde
// bus kost een zet vertraging, nooit een potje.

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
	potjeTTL    = 30 * 24 * time.Hour
	maxPotjes   = 1024
)

var busRe = regexp.MustCompile(`^[a-f0-9]{64}$`)

type busEntry struct {
	blob    string
	expires time.Time
}

type potjeEntry struct {
	blob    string
	expires time.Time // laatste schrijven plus potjeTTL, dus ook de volgorde van plaatsmaken
	changed time.Time // laatste schrijven met andere bytes
}

// busGeldig: de bus moet sha256(bewijs) zijn, anders 400. Dat verraadt
// niets: wie een bewijs heeft kan die hash zelf uitrekenen.
func busGeldig(bus, bewijs, blob string) bool {
	sum := sha256.Sum256([]byte(bewijs))
	return busRe.MatchString(bus) && idRe.MatchString(bewijs) &&
		hex.EncodeToString(sum[:]) == bus && len(blob) <= maxBusBlob
}

func (s *server) sweepBusesLocked() {
	now := s.cfg.now()
	for id, b := range s.buses {
		if !now.Before(b.expires) {
			delete(s.buses, id)
		}
	}
}

func (s *server) sweepPotjesLocked() {
	now := s.cfg.now()
	for id, p := range s.potjes {
		if !now.Before(p.expires) {
			delete(s.potjes, id)
		}
	}
}

// handleBusPost legt een briefje in een bus. {bus, bewijs, blob}, zie
// busGeldig. Leeg blob = wissen.
func (s *server) handleBusPost(w http.ResponseWriter, r *http.Request) {
	var in struct{ Bus, Bewijs, Blob string }
	if !readJSON(w, r, maxBusBlob+1024, &in) {
		return
	}
	if !busGeldig(in.Bus, in.Bewijs, in.Blob) {
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

// handlePotjePost schrijft de stand van een potje in een potjesbus, met
// de regels van handleBusPost, behalve: een volle tabel maakt plaats in
// plaats van te weigeren, want weigeren zou na een vloed van verzonnen
// bussen een maand lang geen nieuw potje toelaten, terwijl een weggeduwde
// bus gewoon opnieuw geschreven wordt door zijn kant. En onbekende velden
// worden geweigerd.
func (s *server) handlePotjePost(w http.ResponseWriter, r *http.Request) {
	var in struct{ Bus, Bewijs, Blob string }
	if !readJSONStrict(w, r, maxBusBlob+1024, &in) {
		return
	}
	if !busGeldig(in.Bus, in.Bewijs, in.Blob) {
		http.Error(w, "ongeldig verzoek", http.StatusBadRequest)
		return
	}
	if !s.acquire(w, s.potjeC) {
		return
	}
	defer func() { <-s.potjeC }()
	time.Sleep(s.cfg.redeemDelay)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sweepPotjesLocked()
	if in.Blob == "" {
		delete(s.potjes, in.Bus)
		w.WriteHeader(http.StatusNoContent)
		return
	}
	now := s.cfg.now()
	p, bestaat := s.potjes[in.Bus]
	if !bestaat && len(s.potjes) >= maxPotjes {
		s.evictOldestPotjeLocked()
	}
	// dezelfde bytes opnieuw verlengen alleen: zo meet ongewijzigd hoe lang
	// een kant niets nieuws schreef, ook als de app zijn bus vernieuwt
	if !bestaat || p.blob != in.Blob {
		p.changed = now
	}
	p.blob = in.Blob
	p.expires = now.Add(potjeTTL)
	s.potjes[in.Bus] = p
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) evictOldestPotjeLocked() {
	var oudste string
	for id, p := range s.potjes {
		if oudste == "" || p.expires.Before(s.potjes[oudste].expires) {
			oudste = id
		}
	}
	delete(s.potjes, oudste)
}

// handleBusCheck geeft de briefjes uit de opgegeven bussen terug (alleen
// de bestaande), uitnodigingen en potjes door elkaar; voor een potjesbus
// ook hoeveel seconden zijn bytes gelijk bleven, allemaal gemeten op
// hetzelfde moment, zodat twee apparaten met hetzelfde antwoord dezelfde
// volgorde zien. Zelfde rem als elk onge-authenticeerd pad: het is een
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
	ongewijzigd := map[string]int64{}
	s.mu.Lock()
	s.sweepBusesLocked()
	s.sweepPotjesLocked()
	now := s.cfg.now()
	for _, id := range in.Bussen {
		if !busRe.MatchString(id) {
			continue
		}
		if b, ok := s.buses[id]; ok {
			out[id] = b.blob
		}
		if p, ok := s.potjes[id]; ok {
			out[id] = p.blob
			ongewijzigd[id] = int64(now.Sub(p.changed) / time.Second)
		}
	}
	s.mu.Unlock()
	writeJSON(w, map[string]any{"blobs": out, "ongewijzigd": ongewijzigd})
}
