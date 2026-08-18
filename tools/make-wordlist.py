# /// script
# requires-python = ">=3.11"
# dependencies = ["pypdf"]
# ///
"""Maakt src/words-nl.txt: 1024 kindvriendelijke Nederlandse woorden voor
koppel- en speelcodes (zie het multiplayer-memo).

Draaien: uv run tools/make-wordlist.py

Pijplijn:
  1. OpenTaal-woordenlijst (spelling met Keurmerk van de Taalunie; dual
     Revised BSD / CC BY 3.0, attributie in het colofon van de app).
  2. Basiswoordenlijst Amsterdamse Kleuters (BAK): 3000 woorden die
     kleuters kennen. Geen open licentie, dus alleen een filter: onze
     lijst is een eigen selectie uit OpenTaal, BAK-lidmaatschap is het
     signaal "kent een kind dit woord".
  3. Telefoonfilters: alleen a-z, 4-8 letters, en geen spellingsvallen
     die je na horen niet eenduidig kunt typen (c/k, ei/ij, au/ou, en
     x/y/q). Een woordkiezer met autocomplete vangt de rest.
  4. Klanksleutel-dedup: van elk paar dat hetzelfde klinkt (hard/hart,
     zwart/zwarte) blijft er een over.
  5. Blocklist voor woorden die mechanisch door alles heen komen maar
     niet in een kindercode horen.
  6. Deterministische keuze van precies 1024: korte woorden eerst,
     daarbinnen alfabetisch. Herdraaien geeft byte-voor-byte dezelfde
     lijst.
"""

import hashlib
import io
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = pathlib.Path(__file__).resolve().parent / ".wordlist-cache"
OUT = ROOT / "src" / "words-nl.txt"
N = 1024

SOURCES = {
    "opentaal.txt": "https://raw.githubusercontent.com/OpenTaal/opentaal-wordlist/master/wordlist.txt",
    "bak-1.pdf": "https://www.bobbi.nl/wp-content/uploads/2018/08/Basiswoordenlijst-Amsterdamse-Kleuters.pdf",
    "bak-2.pdf": "https://nouwelslogopedie.nl/wp-content/uploads/2016/06/BAKlijst.pdf",
}

# Komt mechanisch door de filters maar hoort niet in een kindercode: eng,
# vies, volwassen of kwetsend.
BLOCKLIST = {
    "aanslag", "afgang", "afval", "angst", "beroerd", "bier", "bloed",
    "bloot", "dood", "doden", "domoor", "drank", "dronken", "geweer",
    "geweld", "graf", "griezel", "gulp", "hel", "janken", "lijk", "moord",
    "oorlog", "pesten", "pistool", "pijn", "poepen", "ramp", "rottig",
    "rotten", "steken", "stelen", "stom", "urine", "vent", "wapen",
    "wond", "ziek", "zieke", "ziekte", "zielig", "zonde",
}

# Geen codemateriaal: grammaticawoorden en kale verbuigingen zijn slecht te
# onthouden als plaatje, vervoegingen en losse flarden uit de BAK-placemats
# ("avonds", "ziens") zijn geen woorden die je een kind laat intypen, en
# merknamen horen er niet in. De grondvorm blijft steeds wel beschikbaar.
SAAI = {
    # flarden en vervoegingen
    "avonds", "ziens", "doeg", "gedag", "komaan", "jawel", "baten", "dook",
    "steeg", "hagelt", "regent", "stormt", "waait", "staat", "doet",
    "geeft", "hangt", "klopt", "komt", "lukt", "meet", "heet", "volst",
    # vergrotende en overtreffende trappen en dubbele vormen
    "beter", "best", "dikker", "dikst", "dunner", "dunst", "eerder",
    "eerst", "groter", "grote", "hoger", "hoogst", "korter", "kortst",
    "langer", "langst", "laatst", "leegst", "liefst", "liever", "meest",
    "minder", "minst", "slappe", "verst", "verte", "zware", "openen",
    "bomen", "draden", "haren", "ramen", "dieren", "mensen", "rusten",
    # grammatica- en vulwoorden
    "allang", "alle", "alleen", "alles", "alsof", "alvast", "alweer",
    "ander", "anders", "daar", "daarin", "daarna", "daarom", "dank",
    "degene", "deze", "eens", "eentje", "elkaar", "enig", "enkel",
    "enorm", "eraan", "eraf", "ergens", "erin", "ermee", "ernaar", "erom",
    "erop", "eruit", "ervan", "even", "heen", "heus", "hier", "hoewel",
    "ieder", "iemand", "iets", "indien", "ineens", "juist", "jullie",
    "langs", "maar", "meteen", "nadat", "niet", "niets", "niks", "nodig",
    "nogal", "nooit", "omdat", "opeens", "over", "overal", "overig",
    "reeds", "soms", "steeds", "tegen", "terug", "toen", "vaak", "vanaf",
    "veel", "voor", "vorig", "welk", "zeker", "zelf", "zelfs", "zoals",
    "zodat", "zodra", "zover", "zulk", "door", "omver", "omheen",
    "rondom", "gewoon", "genoeg",
    # hulpwerkwoorden en abstracties zonder plaatje
    "aantal", "advies", "belang", "bezig", "bezit", "doen", "etmaal",
    "gaan", "gemak", "geval", "geven", "hebben", "heten", "hoeven",
    "kennen", "kennis", "komen", "kunnen", "laten", "manier", "mening",
    "moeten", "mogen", "moment", "nemen", "noemen", "weten", "zien",
    # losse vondsten: verouderd, te volwassen of een merk
    "afgaan", "afvoer", "fors", "franje", "hinder", "indoen", "keten",
    "kribbe", "lego", "legen", "nadoen", "norm", "omdoen", "omgaan",
    "orde", "pers", "piet", "poos", "sint", "solide", "trede", "turen",
    "zeem",
    # tweede ronde, uit de 7-letterinstroom: somber of eng
    "angstig", "bezorgd", "doodmoe", "droevig", "eenzaam", "ernstig",
    # tweede ronde: scheidbare werkwoorden en abstracties zonder plaatje
    "aanblik", "aandoen", "afhalen", "aflopen", "afmaken", "afvegen",
    "beleven", "bestaan", "eetlust", "eetwaar", "geboren", "gedoken",
    "geleden", "geloven", "inhalen", "inladen",
    # tweede ronde: grammatica en dubbele vormen
    "behalve", "beurten", "bloemen", "blokken", "blootje", "bovenin",
    "bovenop", "daaraan", "daarmee", "daarnet", "groeten", "grootst",
    "hiermee", "hoeveel", "jazeker",
    # tweede ronde: gedateerde term
    "indiaan",
    # derde ronde
    "kundige", "laarzen", "languit", "maanden",
}


def fetch(name: str) -> bytes:
    CACHE.mkdir(exist_ok=True)
    path = CACHE / name
    if not path.exists():
        print(f"ophalen: {SOURCES[name]}")
        with urllib.request.urlopen(SOURCES[name], timeout=60) as r:
            path.write_bytes(r.read())
    data = path.read_bytes()
    print(f"{name}: {len(data)} bytes, sha256 {hashlib.sha256(data).hexdigest()[:16]}")
    return data


def pdf_words(data: bytes) -> set[str]:
    from pypdf import PdfReader

    text = " ".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(data)).pages)
    return {t.lower() for t in re.findall(r"[a-zA-Zéëï]+", text) if 2 <= len(t) <= 14}


def spreekbaar(w: str) -> bool:
    """Alleen woorden die je na horen door een telefoon eenduidig typt."""
    if not re.fullmatch(r"[a-z]{4,8}", w):
        return False
    return not any(val in w for val in ("c", "x", "y", "q", "ei", "ij", "au", "ou"))


def klanksleutel(w: str) -> str:
    """Woorden met dezelfde sleutel klinken door een telefoon (vrijwel)
    gelijk: eind-d en eind-b verstemlozen (hard/hart, krab/krap), v/f, w/v
    en z/s zijn nauwelijks te onderscheiden (wegen/vegen), ch klinkt als g
    (nu een no-op omdat de c-filter alle ch-woorden al weert, maar hij
    blijft staan voor als de filters ooit veranderen), een slot-m klinkt
    als slot-n (boom/boon, kraam/kraan) en een slot-e na een medeklinker is
    een sjwa die je makkelijk mist (slap/slappe)."""
    k = w.replace("ch", "g").replace("v", "f").replace("w", "f").replace("z", "s")
    if k.endswith("dt"):
        k = k[:-2] + "t"
    elif k.endswith("d"):
        k = k[:-1] + "t"
    elif k.endswith("b"):
        k = k[:-1] + "p"
    if k.endswith("e") and len(k) > 4 and k[-2] not in "aeiou":
        k = k[:-1]
        if len(k) > 1 and k[-1] == k[-2]:
            k = k[:-1]
    if k.endswith("m"):
        k = k[:-1] + "n"
    return k


def main() -> None:
    opentaal = {w.strip() for w in fetch("opentaal.txt").decode().splitlines()}
    bak = pdf_words(fetch("bak-1.pdf")) | pdf_words(fetch("bak-2.pdf"))
    print(f"opentaal: {len(opentaal)} woorden, bak: {len(bak)} tokens")

    cands = sorted(w for w in bak
                   if spreekbaar(w) and w in opentaal and w not in BLOCKLIST and w not in SAAI)
    print(f"na filters: {len(cands)}")

    # klank-dedup: kortste wint, bij gelijke lengte de alfabetisch eerste;
    # sorteren op (lengte, alfabet) maakt dat een enkele lineaire pas
    per_klank: dict[str, str] = {}
    for w in sorted(cands, key=lambda w: (len(w), w)):
        per_klank.setdefault(klanksleutel(w), w)
    uniek = sorted(per_klank.values(), key=lambda w: (len(w), w))
    print(f"na klank-dedup: {len(uniek)}")

    if len(uniek) < N:
        sys.exit(f"maar {len(uniek)} kandidaten, {N} nodig: filters te streng")
    final = sorted(uniek[:N])
    OUT.write_text("\n".join(final) + "\n")
    print(f"geschreven: {OUT} ({len(final)} woorden, "
          f"{min(len(w) for w in final)}-{max(len(w) for w in final)} letters)")


if __name__ == "__main__":
    main()
