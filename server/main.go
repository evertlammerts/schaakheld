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
	delay := flag.Duration("delay", 200*time.Millisecond, "vaste vertraging op inwissel-antwoorden")
	slots := flag.Int("redeem-slots", 2, "max gelijktijdige inwisselpogingen")
	maxLinks := flag.Int("max-links", 4096, "max openstaande koppelcodes")
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
