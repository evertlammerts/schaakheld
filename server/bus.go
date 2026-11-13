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
// Een potjesbus houdt de ene staat van een potje of uitdaging tussen twee
// vrienden, versleuteld met hun K. Hij verandert alleen met een schrijven
// dat de versie noemt die het las, leeft dertig dagen na het laatste
// schrijven en staat op schijf (een bestand per bus in de map potjes), zodat
// een herstart van de server geen oude staat terug laat komen.

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
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
}

// op schijf staat wat in het geheugen staat: de versleutelde bytes en tot
// wanneer ze leven; het id is de bestandsnaam
type potjeFile struct {
	Tot  time.Time `json:"tot"`
	Blob string    `json:"blob"`
}

const potjesMap = "potjes"

// alleen aangeroepen met een id dat busRe doorstond (busGeldig of
// laadPotjes), dus de naam blijft in de map
func (s *server) potjePad(id string) string {
	return filepath.Join(s.cfg.dataDir, potjesMap, id+".json")
}

// laadPotjes leest de staten die een vorige server op schijf liet. Wat geen
// geldige, levende staat is (verlopen, half geschreven, een tempbestand,
// een vreemde naam) wordt weggehaald en houdt de start niet tegen; een
// bestand dat niet te lezen is blijft staan.
func (s *server) laadPotjes() error {
	dir := filepath.Join(s.cfg.dataDir, potjesMap)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	items, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	now := s.cfg.now()
	for _, e := range items {
		if e.IsDir() {
			continue
		}
		pad := filepath.Join(dir, e.Name())
		id, isJSON := strings.CutSuffix(e.Name(), ".json")
		if !isJSON || !busRe.MatchString(id) {
			os.Remove(pad)
			continue
		}
		data, err := os.ReadFile(pad)
		if err != nil {
			continue
		}
		var pf potjeFile
		if json.Unmarshal(data, &pf) != nil || pf.Blob == "" || len(pf.Blob) > maxBusBlob || !now.Before(pf.Tot) {
			os.Remove(pad)
			continue
		}
		// verder dan dertig dagen vooruit schrijft deze server niet; zo'n
		// bestand krijgt dertig dagen vanaf nu, ook op schijf, anders begint
		// elke herstart die dertig dagen opnieuw
		if grens := now.Add(potjeTTL); pf.Tot.After(grens) {
			pf.Tot = grens
			s.writeFileAtomic(pad, pf)
		}
		s.potjes[id] = potjeEntry{blob: pf.Blob, expires: pf.Tot}
	}
	for len(s.potjes) > maxPotjes {
		s.evictOldestPotjeLocked()
	}
	return nil
}

// zonderPad: de bestandsnaam is het id van een bus, en dat hoort niet in de log
func zonderPad(err error) error {
	var pe *fs.PathError
	if errors.As(err, &pe) {
		return pe.Err
	}
	var le *os.LinkError
	if errors.As(err, &le) {
		return le.Err
	}
	return err
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

// een bestand dat niet weg wil, ruimt de volgende start op: dan is het verlopen
func (s *server) sweepPotjesLocked() {
	now := s.cfg.now()
	for id, p := range s.potjes {
		if !now.Before(p.expires) {
			delete(s.potjes, id)
			os.Remove(s.potjePad(id))
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

// versie van een briefje: sha256 van zijn tekst in kleine hex, zodat elk
// apparaat hem zelf kan uitrekenen
func versie(blob string) string {
	sum := sha256.Sum256([]byte(blob))
	return hex.EncodeToString(sum[:])
}

// als is een versie, of "" voor een bus waar niets in staat
func versieGeldig(v string) bool {
	return v == "" || busRe.MatchString(v)
}

// handlePotjePost schrijft de stand van een potje in een potjesbus, met
// de regels van handleBusPost, behalve: een volle tabel maakt plaats in
// plaats van te weigeren, want weigeren zou na een vloed van verzonnen
// bussen een maand lang geen nieuw potje toelaten, terwijl een weggeduwde
// bus gewoon opnieuw geschreven wordt door zijn kant. En onbekende velden
// worden geweigerd.
//
// Een schrijven zegt in als welke versie de schrijver las.
// Alleen als dat de versie is die de server houdt, gaat het door; anders
// verandert er niets en krijgt de schrijver 409 met wat er staat. Zo heeft
// elke verandering precies een winnaar, en hoeft geen apparaat twee
// versies samen te voegen.
func (s *server) handlePotjePost(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Bus, Bewijs, Blob string
		Als               *string
	}
	if !readJSONStrict(w, r, maxBusBlob+1024, &in) {
		return
	}
	// zonder als zou een schrijven niet zeggen wat het las, en dan kunnen twee
	// schrijvers allebei winnen; een leeg briefje wist niet, want geen schrijven
	// haalt een staat weg: dat zou de teller en de afgelopen potjes van het paar
	// kwijtmaken, dus een staat gaat alleen door te verlopen of plaats te maken
	if !busGeldig(in.Bus, in.Bewijs, in.Blob) || in.Blob == "" || in.Als == nil || !versieGeldig(*in.Als) {
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
	p, bestaat := s.potjes[in.Bus]
	huidig := ""
	if bestaat {
		huidig = versie(p.blob)
	}
	if *in.Als != huidig {
		writeJSONStatus(w, http.StatusConflict, map[string]string{"blob": p.blob})
		return
	}
	p.blob = in.Blob
	p.expires = s.cfg.now().Add(potjeTTL)
	// eerst de schijf: lukt die niet, dan verandert er ook in het geheugen niets
	if err := s.writeFileAtomic(s.potjePad(in.Bus), potjeFile{Tot: p.expires, Blob: p.blob}); err != nil {
		opslagMislukt(w, err)
		return
	}
	if !bestaat && len(s.potjes) >= maxPotjes {
		s.evictOldestPotjeLocked()
	}
	s.potjes[in.Bus] = p
	w.WriteHeader(http.StatusNoContent)
}

func opslagMislukt(w http.ResponseWriter, err error) {
	log.Printf("potjesbus opslaan: %v", zonderPad(err))
	http.Error(w, "opslag mislukt", http.StatusInternalServerError)
}

func (s *server) evictOldestPotjeLocked() {
	var oudste string
	for id, p := range s.potjes {
		if oudste == "" || p.expires.Before(s.potjes[oudste].expires) {
			oudste = id
		}
	}
	delete(s.potjes, oudste)
	os.Remove(s.potjePad(oudste))
}

// handleBusCheck geeft de briefjes uit de opgegeven bussen terug (alleen
// de bestaande), uitnodigingen en potjes door elkaar, en de klok van de
// server in hele seconden. Zelfde rem als elk onge-authenticeerd pad: het
// is een tweede hendel op dezelfde vergrendeling en die hoort niet gratis
// te zijn. Begrensd in aantal per verzoek.
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
		}
	}
	s.mu.Unlock()
	writeJSON(w, map[string]any{"blobs": out, "nu": now.Unix()})
}
