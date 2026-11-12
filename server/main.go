// SchaakHeld-server: koppelcodes en profiel-sync (endpoints 1-3 uit het
// multiplayer-memo). Draait als statische binary, achter Traefik op de
// homelab (die doet TLS en logging). Later ook als Nanos-unikernel.
package main

import (
	"flag"
	"log"
	"net/http"
	"time"
)

func main() {
	addr := flag.String("addr", ":8484", "listen-adres")
	data := flag.String("data", "./data", "map voor profielblobs")
	origin := flag.String("origin", "https://evert.lammerts.online", "toegestane CORS-origin (de PWA)")
	delay := flag.Duration("delay", defaultDelay, "vaste vertraging op inwissel-antwoorden")
	slots := flag.Int("redeem-slots", defaultSlots, "max gelijktijdige inwisselpogingen")
	maxLinks := flag.Int("max-links", defaultMaxLinks, "max openstaande koppelcodes")
	maxAccounts := flag.Int("max-accounts", 64, "max profielen op schijf")
	flag.Parse()

	srv, err := newServer(config{
		dataDir:     *data,
		origin:      *origin,
		redeemDelay: *delay,
		redeemSlots: *slots,
		maxLinks:    *maxLinks,
		maxAccounts: *maxAccounts,
	})
	if err != nil {
		log.Fatal(err)
	}
	// ReadTimeout/WriteTimeout gelden voor gewone requests. Ze raken de
	// websocket-relay NIET: websocket.Accept hijackt de verbinding en zet
	// de deadlines terug op nul, dus een lang potje wordt hier niet na 30s
	// afgekapt. Niet "opschonen" naar een kortere timeout in de veronder-
	// stelling dat de relay meelift; dat breekt juist het samenspelen.
	s := &http.Server{
		Addr:              *addr,
		Handler:           srv,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
	}
	log.Printf("schaakheld-server luistert op %s", *addr)
	log.Fatal(s.ListenAndServe())
}
