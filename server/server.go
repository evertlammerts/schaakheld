package main

// Vijf principes, uit het ontwerp-memo:
//   - geen enkel endpoint dat iets opsomt: kinderen zijn niet vindbaar
//   - bezit van code of secret is de autorisatie, geen accounts of sessies
//   - "fout" en "bestaat niet" zijn niet te onderscheiden (zelfde status)
//   - inwisselen is eenmalig, met vaste vertraging en een kleine
//     gelijktijdigheidslimiet: gokken op woordcodes loont niet
//   - de server ziet alleen versleutelde bytes, nooit inhoud

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	linkTTL    = 10 * time.Minute
	maxPayload = 4 << 10  // versleutelde credentials in een koppelcode
	maxBlob    = 64 << 10 // versleuteld profielblob
)

// Registreren gaat door defaultSlots plekken die elk defaultDelay bezet
// zijn, dus er leven hoogstens linkTTL/defaultDelay*defaultSlots codes
// tegelijk (6000). defaultMaxLinks ligt daarboven: anders houdt een spuiter
// de tabel vol en krijgt een echt kind 429.
const (
	defaultDelay    = 200 * time.Millisecond
	defaultSlots    = 2
	defaultMaxLinks = 8192
)

var (
	codeRe = regexp.MustCompile(`^[a-z0-9-]{4,64}$`)
	idRe   = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)
)

type config struct {
	dataDir     string
	origin      string
	redeemDelay time.Duration
	redeemSlots int
	maxLinks    int              // max openstaande koppelcodes tegelijk
	maxAccounts int              // max profielen op schijf
	queueWait   time.Duration    // hoe lang een verzoek op een slot wacht
	now         func() time.Time // injecteerbaar voor de TTL-tests
}

type linkEntry struct {
	payload string
	expires time.Time
}

type server struct {
	cfg config
	mux *http.ServeMux

	mu       sync.Mutex // beschermt links, accounts, rooms, pending en de profielbestanden
	links    map[string]linkEntry
	accounts int // aantal profielbestanden, begrensd door maxAccounts
	rooms    map[string]*room
	pending  map[string]*pendingPair
	buses    map[string]busEntry

	// losse semaforen (elk cfg.redeemSlots breed) voor de
	// onge-authenticeerde schrijfpaden, zodat een vloed op het ene pad
	// het andere niet meesleept
	redeemC chan struct{}
	linkC   chan struct{}
	putC    chan struct{}
	roomC   chan struct{}
	pairC   chan struct{}
	busC    chan struct{}

	wsActive atomic.Int32 // gelijktijdige websocket-verbindingen, begrensd door maxWsConns
}

func newServer(cfg config) (*server, error) {
	if cfg.now == nil {
		cfg.now = time.Now
	}
	if cfg.redeemSlots <= 0 {
		cfg.redeemSlots = defaultSlots
	}
	if cfg.maxLinks <= 0 {
		cfg.maxLinks = defaultMaxLinks
	}
	if cfg.maxAccounts <= 0 {
		cfg.maxAccounts = 64
	}
	if cfg.queueWait <= 0 {
		cfg.queueWait = 2 * time.Second
	}
	if err := os.MkdirAll(cfg.dataDir, 0o700); err != nil {
		return nil, err
	}
	s := &server{
		cfg:     cfg,
		links:   map[string]linkEntry{},
		rooms:   map[string]*room{},
		pending: map[string]*pendingPair{},
		buses:   map[string]busEntry{},
		redeemC: make(chan struct{}, cfg.redeemSlots),
		linkC:   make(chan struct{}, cfg.redeemSlots),
		putC:    make(chan struct{}, cfg.redeemSlots),
		roomC:   make(chan struct{}, cfg.redeemSlots),
		pairC:   make(chan struct{}, cfg.redeemSlots),
		busC:    make(chan struct{}, cfg.redeemSlots),
	}
	entries, err := os.ReadDir(cfg.dataDir)
	if err != nil {
		return nil, err
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".json") {
			s.accounts++
		}
		// door een crash achtergebleven tempbestanden opruimen
		if strings.HasPrefix(e.Name(), ".tmp-") {
			os.Remove(filepath.Join(cfg.dataDir, e.Name()))
		}
	}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/link", s.handleLink)
	mux.HandleFunc("POST /v1/link/redeem", s.handleRedeem)
	mux.HandleFunc("GET /v1/profile/{id}", s.handleProfileGet)
	mux.HandleFunc("PUT /v1/profile/{id}", s.handleProfilePut)
	mux.HandleFunc("POST /v1/room", s.handleRoomCreate)
	mux.HandleFunc("POST /v1/pair", s.handlePair)
	mux.HandleFunc("GET /v1/room/ws", s.handleRoomWS)
	mux.HandleFunc("POST /v1/bus", s.handleBusPost)
	mux.HandleFunc("POST /v1/bus/check", s.handleBusCheck)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, "ok\n")
	})
	s.mux = mux
	return s, nil
}

func (s *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.cors(w, r)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	s.mux.ServeHTTP(w, r)
}

// cors staat alleen de PWA-origin toe. Zonder Origin-header (curl, apps)
// doen we niets: CORS is een browserhek, geen autorisatie.
func (s *server) cors(w http.ResponseWriter, r *http.Request) {
	o := r.Header.Get("Origin")
	if o == "" {
		return
	}
	w.Header().Add("Vary", "Origin")
	if o != s.cfg.origin {
		return
	}
	h := w.Header()
	h.Set("Access-Control-Allow-Origin", o)
	h.Set("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS")
	h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
	h.Set("Access-Control-Max-Age", "86400")
}

/* ---------- koppelcodes (endpoint 1 en 2) ---------- */

// acquire pakt een plekje in een semafoor of wacht daar kort op; wie na
// queueWait nog geen plek heeft krijgt 429. Zo overleeft normaal gebruik
// een korte piek, terwijl een vloed geen eindeloze wachtrij opbouwt.
func (s *server) acquire(w http.ResponseWriter, c chan struct{}) bool {
	select {
	case c <- struct{}{}:
		return true
	case <-time.After(s.cfg.queueWait):
		http.Error(w, "te druk", http.StatusTooManyRequests)
		return false
	}
}

// handleLink registreert {code -> versleutelde credentials} met een TTL.
// Opnieuw registreren onder dezelfde code overschrijft: de code is
// hoog-entropisch en machine-gegenereerd, wie hem kent mag hem zetten.
// Registreren krijgt dezelfde rem als inwisselen (het is even
// onge-authenticeerd), en een volle tabel geeft ALLES 429, ook een
// bestaande code: anders was vol-zijn een orakel voor welke codes bestaan.
func (s *server) handleLink(w http.ResponseWriter, r *http.Request) {
	var in struct{ Code, Payload string }
	if !readJSON(w, r, maxPayload+1024, &in) {
		return
	}
	in.Code = strings.ToLower(strings.TrimSpace(in.Code))
	if !codeRe.MatchString(in.Code) || in.Payload == "" || len(in.Payload) > maxPayload {
		http.Error(w, "ongeldig verzoek", http.StatusBadRequest)
		return
	}
	if !s.acquire(w, s.linkC) {
		return
	}
	defer func() { <-s.linkC }()
	time.Sleep(s.cfg.redeemDelay)
	s.mu.Lock()
	s.sweepLocked()
	// begrensd: wie het endpoint bespuit met verzonnen codes vult anders
	// onbeperkt geheugen binnen een TTL-venster
	vol := len(s.links) >= s.cfg.maxLinks
	if !vol {
		s.links[in.Code] = linkEntry{payload: in.Payload, expires: s.cfg.now().Add(linkTTL)}
	}
	s.mu.Unlock()
	if vol {
		http.Error(w, "te druk", http.StatusTooManyRequests)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleRedeem wisselt een koppelcode eenmalig in. Elke uitkomst duurt even
// lang (vaste vertraging) en de semafoor begrenst hoeveel pogingen er
// tegelijk lopen, dus ook hoeveel er per seconde kunnen.
func (s *server) handleRedeem(w http.ResponseWriter, r *http.Request) {
	// eerst de body lezen, dan pas een slot pakken: anders houdt een
	// traag-druppelende client een slot de volle ReadTimeout bezet en is
	// de gelijktijdigheidslimiet zelf een denial-of-service-knop
	var in struct{ Code string }
	if !readJSON(w, r, 4096, &in) {
		return
	}
	in.Code = strings.ToLower(strings.TrimSpace(in.Code))
	if !s.acquire(w, s.redeemC) {
		return
	}
	defer func() { <-s.redeemC }()
	time.Sleep(s.cfg.redeemDelay)
	payload := ""
	s.mu.Lock()
	if e, ok := s.links[in.Code]; ok && s.cfg.now().Before(e.expires) {
		payload = e.payload
	}
	delete(s.links, in.Code) // eenmalig, ook een verlopen entry gaat weg
	s.sweepLocked()
	s.mu.Unlock()
	if payload == "" {
		http.Error(w, "onbekende of verlopen code", http.StatusNotFound)
		return
	}
	writeJSON(w, map[string]string{"payload": payload})
}

func (s *server) sweepLocked() {
	now := s.cfg.now()
	for c, e := range s.links {
		if !now.Before(e.expires) {
			delete(s.links, c)
		}
	}
}

/* ---------- profielblobs (endpoint 3) ---------- */

type profileFile struct {
	SecretHash string `json:"secret_hash"`
	Blob       string `json:"blob"`
	Updated    int64  `json:"updated"`
}

// bearerHash haalt het accountSecret uit de Authorization-header en hasht
// het meteen: het secret zelf raakt verder niets aan.
func bearerHash(r *http.Request) (string, bool) {
	h := r.Header.Get("Authorization")
	const p = "Bearer "
	if !strings.HasPrefix(h, p) {
		return "", false
	}
	secret := strings.TrimSpace(h[len(p):])
	if len(secret) < 16 || len(secret) > 128 {
		return "", false
	}
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:]), true
}

// idRe staat geen punten of schuine strepen toe, dus het pad blijft binnen
// de datamap.
func (s *server) profilePath(id string) string {
	return filepath.Join(s.cfg.dataDir, id+".json")
}

// notFound is het enige foutantwoord op de profiel-endpoints: een fout
// secret, een onbekend account en een kapot verzoek zien er identiek uit.
func notFound(w http.ResponseWriter) {
	http.Error(w, "niet gevonden", http.StatusNotFound)
}

// loadStored leest een profielbestand. Corrupt telt als onbestaand (het is
// hetzelfde antwoord waard); alleen echte IO-fouten komen als error terug.
func (s *server) loadStored(id string) (pf profileFile, exists bool, err error) {
	data, err := os.ReadFile(s.profilePath(id))
	if errors.Is(err, os.ErrNotExist) {
		return pf, false, nil
	}
	if err != nil {
		return pf, false, err
	}
	if json.Unmarshal(data, &pf) != nil {
		return pf, false, nil
	}
	return pf, true, nil
}

// dummyHash zorgt dat een onbekend account dezelfde vergelijking doorloopt
// als een bestaand account: het hash-vergelijk verraadt zo geen bestaan.
// Het bestandslees-verschil ervoor is niet volledig glad te strijken; dat
// is acceptabel omdat account-ids 128-bit random zijn en er dus geen
// afloopbare id-ruimte bestaat.
var dummyHash = func() string {
	sum := sha256.Sum256([]byte("schaakheld-dummy"))
	return hex.EncodeToString(sum[:])
}()

// secretOK is de ENIGE plek waar het secret gecontroleerd wordt; GET en
// PUT delen hem zodat hun autorisatie nooit uiteen kan lopen.
func secretOK(pf profileFile, exists bool, hash string) bool {
	stored := dummyHash
	if exists {
		stored = pf.SecretHash
	}
	return subtle.ConstantTimeCompare([]byte(stored), []byte(hash)) == 1 && exists
}

func (s *server) handleProfileGet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	hash, ok := bearerHash(r)
	if !ok || !idRe.MatchString(id) {
		notFound(w)
		return
	}
	pf, exists, err := s.loadStored(id)
	if err != nil {
		log.Printf("profiel lezen: %v", err)
		http.Error(w, "opslag mislukt", http.StatusInternalServerError)
		return
	}
	if !secretOK(pf, exists, hash) {
		notFound(w)
		return
	}
	blob, err := base64.StdEncoding.DecodeString(pf.Blob)
	if err != nil {
		notFound(w)
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Write(blob)
}

// handleProfilePut maakt het account bij de eerste PUT (het secret claimt
// het id, tot maxAccounts) en eist daarna hetzelfde secret voor elke
// overschrijving.
func (s *server) handleProfilePut(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	hash, ok := bearerHash(r)
	if !ok || !idRe.MatchString(id) {
		notFound(w)
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBlob))
	if err != nil {
		http.Error(w, "te groot", http.StatusRequestEntityTooLarge)
		return
	}
	if len(body) == 0 {
		http.Error(w, "leeg", http.StatusBadRequest)
		return
	}
	// dezelfde rem als op de koppelcodes: aanmaken is onge-authenticeerd,
	// en doordat ELKE put erdoorheen gaat valt uit het tijdsverschil ook
	// niet af te lezen of een id bestond
	if !s.acquire(w, s.putC) {
		return
	}
	defer func() { <-s.putC }()
	time.Sleep(s.cfg.redeemDelay)
	s.mu.Lock()
	defer s.mu.Unlock()
	pf, exists, err := s.loadStored(id)
	if err != nil {
		log.Printf("profiel lezen: %v", err)
		http.Error(w, "opslag mislukt", http.StatusInternalServerError)
		return
	}
	if exists && !secretOK(pf, true, hash) {
		notFound(w)
		return
	}
	// begrensd: anders schrijft een spuiter met verzonnen ids de schijf
	// vol. Zelfde antwoord als elk ander falen, dus geen vol-orakel; dat
	// het echt vol raakt ziet de monitoring op de homelab, niet de klant.
	if !exists && s.accounts >= s.cfg.maxAccounts {
		notFound(w)
		return
	}
	out := profileFile{
		SecretHash: hash,
		Blob:       base64.StdEncoding.EncodeToString(body),
		Updated:    s.cfg.now().Unix(),
	}
	if err := writeFileAtomic(s.profilePath(id), out); err != nil {
		log.Printf("profiel schrijven: %v", err)
		http.Error(w, "opslag mislukt", http.StatusInternalServerError)
		return
	}
	if !exists {
		s.accounts++
	}
	w.WriteHeader(http.StatusNoContent)
}

func writeFileAtomic(path string, v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".tmp-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	// fsync van bestand en map: zonder dit kan een stroomstoring vlak na
	// de rename een leeg of ontbrekend profiel achterlaten, en de
	// eerstvolgende restic-run is pas dagen later
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmp.Name(), 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp.Name(), path); err != nil {
		return err
	}
	dir, err := os.Open(filepath.Dir(path))
	if err != nil {
		return err
	}
	defer dir.Close()
	return dir.Sync()
}

/* ---------- kleine helpers ---------- */

func readJSON(w http.ResponseWriter, r *http.Request, limit int64, v any) bool {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, limit))
	if err != nil {
		http.Error(w, "body te groot", http.StatusRequestEntityTooLarge)
		return false
	}
	if err := json.Unmarshal(body, v); err != nil {
		http.Error(w, "geen geldige json", http.StatusBadRequest)
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("json schrijven: %v", err)
	}
}
