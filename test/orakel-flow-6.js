/* Orakel, flowtests voor vriendenpotjes die dagen doorlopen, op één apparaat: wat
   een kind ziet als de vriend er niet is. Een vriendenpotje staat klaar als de staat
   van het paar, zoals het apparaat die bewaart; er is geen kamer, dus het potje gaat
   verder via die staat op de server.
   Elke testnaam begint met zijn regelnummer. De helpers staan in deze functie, omdat
   de app in de flowsuite zijn namen in de globale scope heeft. */

async function orakelFlow6() {
  const DAG = 864e5, UUR = 36e5;
  const verder = function (ms) { zetDatum(new __EchteDate(Date.now() + ms).toISOString()); };
  const tellers = function (x) { return x.get('JSON.stringify([P.c.gamesPlayed, P.c.winsOnline, P.xp, P.wins])'); };

  /* een profiel met een naam en vrienden; wie zetten heeft, heeft een vriendenpotje waarin dit kind
     wit speelt (of zwart), en desgewenst een remise-aanbod van de vriend in de stand van nu. Elke keer een
     eigen geheim: de nep-server is gedeeld, en de staten van een andere test horen er niet bij. */
  let nummer = 0;
  /* een id zoals de app het maakt: twaalf tekens */
  const id12 = function (x) { return x.length === 12 ? x : x.length > 12 ? x.slice(0, 4) + x.slice(-8) : (x + '____________').slice(0, 12); };
  /* Een potje of uitdaging met een vriend zoals dit apparaat het kent: een staat van het paar, met de vriend als host
     (het kind heeft rol a). r heeft de vorm van een potje op de kaart: zetten, kleur, aanbod, uitslag, beurtT. */
  const alsPaar = function (r) {
    const rol = 'a', ander = 'b', kleur = r.myColor || 'w', rolVan = function (c) { return c === kleur ? rol : ander; };
    const t = Math.floor((r.beurtT || r.updated || Date.now() - UUR) / 1000), uitd = r.state === 'uitdaging';
    const spel = { id: id12(r.gameId), wit: rolVan('w'), door: uitd && r.host === false ? ander : rol, fase: uitd ? 'uitdaging' : r.result ? 'klaar' : 'potje',
      zetten: (r.moves || []).slice(), bod: r.offer ? { door: rolVan(r.offer.by), ply: r.offer.ply, t: r.offer.t ? Math.floor(r.offer.t / 1000) : t } : null,
      uitslag: r.result ? { soort: r.result.kind, door: r.result.by ? rolVan(r.result.by) : rol, ply: r.result.ply } : null,
      weet: { a: null, b: null }, bekeken: { a: false, b: false }, t: t };
    return { staat: { v: 2, seq: 3, spel: spel, vorige: [] }, hoogste: 3, merk: 'merkvandittoest1', rij: [] };
  };
  const opslagMetVrienden = function (vrienden, extra) {
    nummer++;
    const o = maakOpslag(), paren = {}, friends = {};
    vrienden.forEach(function (v, i) {
      friends[v.fid] = { k: 'geheimvoorvriendschap' + nummer + '-' + v.fid + '-xxxx', naam: v.naam, t: 1, weg: false, host: true, since: 1794500000000 + i * 1000 };
      if (!v.zetten) return;
      const kleur = v.kleur || 'w';
      paren[v.fid] = alsPaar({ gameId: 'potjevan' + v.fid, myColor: kleur, moves: v.zetten,
        offer: v.aanbod ? { by: kleur === 'w' ? 'b' : 'w', ply: v.zetten.length } : null, updated: v.updated || Date.now() - UUR });
    });
    o.setItem('schaakheld1', JSON.stringify({ v: 2, epoch: 0, cnt: {}, set: { badges: {} }, lww: { name: { v: 'Mees', t: 1 } },
      max: { best: 0, goal: {} }, friends, loc: {} }));
    if (Object.keys(paren).length) o.setItem('schaakheld-paar', JSON.stringify(paren));
    for (const k in extra || {}) o.setItem(k, extra[k]);
    return o;
  };
  const turboPotjes = function (perNiveau) {
    const games = {};
    for (const n in perNiveau) games[n] = { level: +n, moves: perNiveau[n][0], tips: 3, drawAsked: null, started: perNiveau[n][1] - UUR,
      updated: perNiveau[n][1], patXP: 0 };
    return JSON.stringify({ v: 2, games });
  };
  const MET_FIEN_MEES_AAN_ZET = { fid: 'vriendfien1', naam: 'Fien', zetten: ['d2d4', 'd7d5'] };
  /* het kind opent de app met deze opslag en kijkt even rond */
  const kind = async function (o) {
    await verzegelParen(o);
    const a = nieuwKind({ opslag: o });
    thuisVenstersWeg(a);
    await wacht(20000);
    return a;
  };
  const daagFienUit = async function (a) {
    tikInRij(a, 'vriendfien1', 'Uitnodigen');
    await wacht();
    tikTekst(a, 'Daag Fien uit voor later');
    await wacht();
  };

  /* een rustig potje van n halve zetten: geen slag, geen schaak, en het potje loopt nog */
  const stilPotje = function (n, zaad) {
    const S = newGame(), uit = [];
    for (let i = 0; i < n; i++) {
      const ms = legalMoves(S);
      let gekozen = null;
      for (let j = 0; j < ms.length && !gekozen; j++) {
        const m = ms[(j + zaad * 7 + i * 3) % ms.length];
        if (isCapture(S, m)) continue;
        makeMove(S, m);
        if (!inCheck(S) && !gameStatus(S).over) gekozen = m;
        unmakeMove(S);
      }
      if (!gekozen) throw new Error('testopzet: geen rustige zet meer');
      makeMove(S, gekozen);
      uit.push(moveKey(gekozen));
    }
    return uit;
  };

  /* ================= wat een keer lezen kost, en wat er per verzoek gaat ================= */

  await regel('[6.2] een keer lezen zonder iets nieuws kost niets: met vijf potjes van 80 halve zetten wordt geen zet nagespeeld, niets bewaard en niets opnieuw getekend', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const vrienden = [];
    for (let i = 0; i < 5; i++) vrienden.push({ fid: 'vriendstil' + i + 'xx', naam: 'Stil' + i, zetten: stilPotje(80, i) });
    const a = await kind(opslagMetVrienden(vrienden));
    await a.ev('friendPoll()');
    await wacht(5000);
    await a.ev('friendPoll()');
    await wacht(5000);
    check('testopzet: vijf potjes van 80 halve zetten bewaard', a.get('Object.keys(paren()).filter(function (k) { return paren()[k].staat && paren()[k].staat.spel.zetten.length === 80; }).length') === 5);
    a.ev('document.__tel = { zetten: 0, bewaard: 0, getekend: 0 };' +
      'var lm = legalMoves; legalMoves = function () { document.__tel.zetten++; return lm.apply(this, arguments); };' +
      'var ss = schrijfSamen; schrijfSamen = function (g) { document.__tel.bewaard++; return ss(g); };' +
      'var bp = bewaarPaar; bewaarPaar = function (f, p) { document.__tel.bewaard++; return bp(f, p); };' +
      'var rv = renderVerder; renderVerder = function () { document.__tel.getekend++; return rv.apply(this, arguments); };');
    await a.ev('friendPoll()');
    await wacht(1000);
    const tel = JSON.parse(a.get('JSON.stringify(document.__tel)'));
    check('geen zet nagespeeld', tel.zetten === 0);
    check('niets bewaard', tel.bewaard === 0);
    check('niets opnieuw getekend', tel.getekend === 0);
  });

  await regel('[6.10] met 40 vrienden gaan de twee adressen van elke vriend (de uitnodiging en de staat van het paar) in hetzelfde verzoek, en geen verzoek heeft er meer dan 64', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const vrienden = [];
    for (let i = 0; i < 40; i++) vrienden.push({ fid: 'vriendnummer' + (10 + i), naam: 'Vriend' + i });
    const a = await kind(opslagMetVrienden(vrienden));
    const verzoeken = [], echt = fetch;
    fetch = function (url, o) { if (/\/v1\/bus\/check$/.test(url)) verzoeken.push(JSON.parse(o.body).bussen); return echt(url, o); };
    try { await a.ev('friendPoll()'); } finally { fetch = echt; }
    const tweetallen = await a.ev('(async function () { const uit = []; for (const id in P.friends) { const f = P.friends[id];' +
      'uit.push([(await busFor(f, myRole(f))).bus, (await paarBus(f)).bus]); } return uit; })()');
    check('testopzet: 40 tweetallen in meer dan één verzoek', tweetallen.length === 40 && verzoeken.length > 1);
    check('elk tweetal in één verzoek', tweetallen.every(function (d) { return verzoeken.some(function (v) { return d.every(function (b) { return v.indexOf(b) >= 0; }); }); }));
    check('geen verzoek boven de 64', verzoeken.every(function (v) { return v.length <= 64; }));
  });

  await regel('[6.7] een profiel met 400 geziene vriendenpotjes gaat nog naar de server; boven 64 KB weigert de nep-server, zoals de echte', async function (check) {
    const a = await kind(opslagMetVrienden([{ fid: 'vriendfien1', naam: 'Fien' }]));
    await a.ev('ensureAccount()');
    a.ev('DOC.set.potjes = {}; for (let i = 0; i < 400; i++) DOC.set.potjes["potjenummer" + (100000 + i)] = curWeek(); saveP()');
    check('400 in de set', a.get('Object.keys(DOC.set.potjes).length') === 400);
    check('het profiel gaat naar de server', await a.ev('syncNow()') === true);
    const status = await a.ev('fetch(SYNC_URL + "/v1/profile/" + ACC.id, { method: "PUT", headers: { Authorization: "Bearer " + ACC.secret },' +
      ' body: new Uint8Array(65537) }).then(function (r) { return r.status; })');
    check('een profiel van 65537 bytes krijgt 413', status === 413);
  });

  /* een opslag met vrienden en precies deze bewaarde potjes en uitdagingen */
  const opslagMetPotjes = function (vrienden, records) {
    const o = opslagMetVrienden(vrienden), paren = JSON.parse(o.getItem('schaakheld-paar') || '{}');
    records.forEach(function (r) { paren[r.fid] = alsPaar(r); });
    o.setItem('schaakheld-paar', JSON.stringify(paren));
    return o;
  };

  await regel('[6.9] twee vriendenpotjes waarin het kind aan zet is en een uitdaging om te beantwoorden: de laatste zet eerst, dan de andere, dan de uitdaging', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const nu = Date.now();
    const a = await kind(opslagMetPotjes([{ fid: 'vriendfien1', naam: 'Fien' }, { fid: 'vriendsem01', naam: 'Sem' }, { fid: 'vrienddaan1', naam: 'Daan' }], [
      { gameId: 'potjevanfien1', fid: 'vriendfien1', peerName: 'Fien', moves: ['d2d4', 'd7d5'], beurtT: nu - 3 * UUR },
      { gameId: 'potjevansem01', fid: 'vriendsem01', peerName: 'Sem', moves: ['c2c4', 'e7e5'], beurtT: nu - UUR },
      { gameId: 'uitdvandaan01', fid: 'vrienddaan1', peerName: 'Daan', state: 'uitdaging', host: false, beurtT: nu - 10 * 60000 }]));
    check('de kaart: het potje met de laatste zet', /je potje met Sem/i.test(tekstVan(a, 'verderKaart')) && /Sem heeft gezet\. Jij bent aan zet\./.test(tekstVan(a, 'verderKaart')));
    tikTekst(a, 'Ook nog');
    await wacht();
    const blad = a.scherm(), plek = ['Je potje met Sem', 'Je potje met Fien', 'Daan daagt je uit'].map(function (t) { return blad.indexOf(t); });
    check('het blad: Sem, dan Fien, dan de uitdaging van Daan', plek.every(function (p) { return p >= 0; }) && plek[0] < plek[1] && plek[1] < plek[2]);
  });

  await regel('[6.8] dagen zijn kalenderdagen: twee uur geleden over middernacht is gisteren, een half uur geleden is vandaag, en zes dagen en een uur over zeven middernachten is een week', async function (check) {
    const potjeOm = function (beurt) {
      return opslagMetPotjes([{ fid: 'vriendfien1', naam: 'Fien' }],
        [{ gameId: 'potjevanfien1', fid: 'vriendfien1', peerName: 'Fien', moves: ['d2d4', 'd7d5', 'c2c4'], beurtT: new __EchteDate(beurt).getTime() }]);
    };
    for (const [beurt, nu, zin] of [['2026-11-13T23:00:00', '2026-11-14T01:00:00', 'Fien is sinds gisteren aan zet'],
      ['2026-11-14T00:30:00', '2026-11-14T01:00:00', 'Fien is aan zet']]) {
      zetDatum(nu);
      const a = await kind(potjeOm(beurt));
      a.tik('tabVrienden');
      check(zin, vriendRijTekst(a, 'vriendfien1').indexOf(zin) >= 0 && !/vandaag|geleden|·/.test(vriendRijTekst(a, 'vriendfien1')));
    }
    zetDatum('2026-11-14T00:30:00');
    const b = await kind(potjeOm('2026-11-07T23:30:00'));
    check('na zeven middernachten heet het potje stil, ook al is het nog geen 7 keer 24 uur', /Fien heeft al een week niet gezet\./.test(tekstVan(b, 'verder')));
  });

  await regel('[6.6] staat het eigen remise-aanbod, dan zegt de kaart dat, en staat er geen regel onder dat het potje blijft staan', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const a = await kind(opslagMetPotjes([{ fid: 'vriendfien1', naam: 'Fien' }], [{ gameId: 'potjevanfien1', fid: 'vriendfien1', peerName: 'Fien',
      moves: ['d2d4', 'd7d5', 'c2c4'], offer: { by: 'w', ply: 3, answer: null, t: Date.now() - UUR } }]));
    const v = tekstVan(a, 'verder');
    check('de kaart: het eigen aanbod', /Je bood remise aan\. Fien is aan zet\./.test(v));
    check('geen regel dat het potje blijft staan', !/blijft staan/.test(v));
  });

  await regel('[6.4] met acht potjes met vrienden tegelijk zegt Uitnodigen bij een negende vriend waarom het niet kan', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const vrienden = [], potjes = [];
    for (let i = 0; i < 9; i++) vrienden.push({ fid: 'vriendacht' + i + 'xx', naam: 'Vriend' + i });
    for (let i = 0; i < 8; i++) potjes.push({ gameId: 'potjeacht' + i + 'xxx', fid: 'vriendacht' + i + 'xx', peerName: 'Vriend' + i, moves: ['e2e4'] });
    const a = await kind(opslagMetPotjes(vrienden, potjes));
    tikInRij(a, 'vriendacht8xx', 'Uitnodigen');
    await wacht(100);
    check('de melding', toastTekst(a) === 'Je hebt al 8 potjes met vrienden tegelijk. Speel er eerst een uit.');
    check('geen wachtscherm', !/Wachten op/.test(a.scherm()));
  });

  /* ================= de kaart en het blad: wat de recensent van stap 8 nog ongetest vond ================= */

  const fien = { fid: 'vriendfien1', naam: 'Fien' }, sem = { fid: 'vriendsem01', naam: 'Sem' };
  await regel('[6.8] een potje waarin het kind zelf aan zet is, heet nooit stil, ook na tien dagen; na vijftien dagen zonder zet van de vriend heet het twee weken', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const a = await kind(opslagMetPotjes([fien], [{ gameId: 'potjevanfien1', fid: 'vriendfien1', peerName: 'Fien', moves: ['d2d4', 'd7d5'], beurtT: Date.now() - 10 * DAG }]));
    check('de eigen beurt', /Fien heeft gezet\. Jij bent aan zet\./.test(tekstVan(a, 'verder')) && !/niet gezet/.test(tekstVan(a, 'verder')));
    const b = await kind(opslagMetPotjes([fien], [{ gameId: 'potjevanfien1', fid: 'vriendfien1', peerName: 'Fien', moves: ['d2d4', 'd7d5', 'c2c4'], beurtT: Date.now() - 15 * DAG }]));
    check('twee weken', /Fien heeft al twee weken niet gezet\./.test(tekstVan(b, 'verder')));
  });

  await regel('[6.9] een remise-aanbod van een vriend hoort bij de potjes waarin het kind aan zet is: het gaat voor een potje tegen Turbo', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const a = await kind(opslagMetPotjes([fien, sem], [
      { gameId: 'potjevanfien1', fid: 'vriendfien1', peerName: 'Fien', moves: ['d2d4', 'd7d5'], offer: { by: 'b', ply: 2, answer: null, t: Date.now() - DAG } },
      { gameId: 'potjevansem01', fid: 'vriendsem01', peerName: 'Sem', moves: ['c2c4'] }]));
    a.opslag.setItem('schaakheld-potje', turboPotjes({ 1: [['e2e4', 'e7e5'], Date.now() - 10 * 60000] }));
    const b = await kind(a.opslag);
    check('de kaart is het aanbod van Fien', /Fien biedt remise aan/.test(tekstVan(b, 'verderKaart')));
  });

  await regel('[6.9] een uitdaging in het blad vraagt eerst Ja of Nu niet; een eigen uitdaging in het blad brengt naar Vrienden, zonder die vraag', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const daan = { fid: 'vrienddaan1', naam: 'Daan' };
    const a = await kind(opslagMetPotjes([fien, sem, daan], [
      { gameId: 'potjevansem01', fid: 'vriendsem01', peerName: 'Sem', moves: ['c2c4', 'e7e5'] },
      { gameId: 'uitdvanfien1x', fid: 'vriendfien1', peerName: 'Fien', state: 'uitdaging', host: false },
      { gameId: 'uitdaandaan1x', fid: 'vrienddaan1', peerName: 'Daan', state: 'uitdaging', mijnUitdaging: true }]));
    tikTekst(a, 'Ook nog');
    await wacht();
    tikTekst(a, 'Fien daagt je uit');
    await wacht();
    check('de vraag met Ja, spelen! en Nu niet', a.ziet('Fien daagt je uit') && kanTikken(a, 'Ja, spelen!') && kanTikken(a, 'Nu niet') && !opSpeelscherm(a));
    a.ev('closeModal()');
    await wacht();
    tikTekst(a, 'Ook nog');
    await wacht();
    tikTekst(a, 'Je uitdaging aan Daan');
    await wacht();
    check('de eigen uitdaging brengt naar Vrienden, zonder vraag', zichtbaar(a, 'view-vrienden') && !a.open());
  });

  await regel('[6.9] de telregel noemt potjes, dan uitdagingen, dan het rondje; een uitnodiging telt als uitdaging', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const a = await kind(opslagMetPotjes([fien, sem], [
      { gameId: 'potjevansem01', fid: 'vriendsem01', peerName: 'Sem', moves: ['c2c4', 'e7e5'] },
      { gameId: 'potjevanfien1', fid: 'vriendfien1', peerName: 'Fien', moves: ['d2d4'] }]));
    a.opslag.setItem('schaakheld-rondjes', JSON.stringify({ scan: { round: 2, earned: 6 } }));
    const b = await kind(a.opslag);
    b.ev('uitnodigingWacht = { fid: "vriendfien1", inv: { id: "uitnodiging1", room: "kamer12345678", seat: "stoel12345678", naam: "Fien", ts: Date.now() } }; renderVerder()');
    check('Ook nog een potje, een uitdaging en je rondje', JSON.stringify(ookNogRegels(b)) === JSON.stringify(['Ook nog een potje, een uitdaging en je rondje']));
  });

  await regel('[6.6] een potje met het eigen aanbod openen: de strook zegt het aanbod met de dag, en de balk "✔ bewaard · ½ aangeboden"', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const a = await kind(opslagMetPotjes([fien], [{ gameId: 'potjevanfien1', fid: 'vriendfien1', peerName: 'Fien',
      moves: ['d2d4', 'd7d5', 'c2c4'], offer: { by: 'w', ply: 3, answer: null, t: Date.now() - UUR } }]));
    a.tik('verderKaart');
    await wacht();
    check('de strook: het eigen aanbod met de dag', /Je biedt Fien remise aan\. Doet Fien tot en met .+ geen zet, dan is het remise\./.test(tekstVan(a, 'bubble')));
    check('de balk: bewaard en aangeboden', /✔ bewaard/.test(tekstVan(a, 'bewaard')) && /½ aangeboden/.test(tekstVan(a, 'verschil')));
  });

  await regel('[6.8] onder de kaart van een stil potje staat de uitweg, niet dat het potje blijft staan', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const a = await kind(opslagMetPotjes([fien], [{ gameId: 'potjevanfien1', fid: 'vriendfien1', peerName: 'Fien', moves: ['d2d4', 'd7d5', 'c2c4'],
      beurtT: Date.now() - 10 * DAG }]));
    const v = tekstVan(a, 'verder');
    check('de uitweg', /Klaar met wachten\? Tik in het potje op de drie puntjes en bied remise aan\./.test(v) && !/blijft staan|stopt nooit/.test(v));
  });

  /* ================= een beschadigd bewaard paar houdt de app niet tegen ================= */

  /* het kind opent de app met een paar dat in de opslag beschadigd is; wat de app bij het openen doet, mag niet stoppen */
  const opentMetPaar = async function (vervang, metGoedeStaat) {
    const o = opslagMetVrienden(metGoedeStaat ? [MET_FIEN_MEES_AAN_ZET] : [{ fid: 'vriendfien1', naam: 'Fien' }]);
    await verzegelParen(o);
    const paren = JSON.parse(o.getItem('schaakheld-paar') || '{}');
    const nieuw = vervang(paren.vriendfien1 || {});
    if (typeof nieuw === 'string') o.setItem('schaakheld-paar', nieuw);
    else o.setItem('schaakheld-paar', JSON.stringify(Object.assign(paren, { vriendfien1: nieuw })));
    let a = null, fout = '';
    try { a = nieuwKind({ opslag: o }); thuisVenstersWeg(a); await wacht(20000); } catch (e) { fout = String(e && e.message || e); }
    return { a, fout };
  };
  const opentGewoon = function (check, r) {
    check('de app opent' + (r.fout ? ' (' + r.fout + ')' : ''), !!r.a && !r.fout);
    check('thuis staat er', !!r.a && opThuis(r.a));
    const kaart = r.a ? tekstVan(r.a, 'verder') : '';
    if (r.a) r.a.tik('tabVrienden');
    check('de rij van Fien staat er', !!r.a && /Fien/.test(vriendRijTekst(r.a, 'vriendfien1')));
    if (r.a) r.a.tik('tabSpelen');
    return kaart;
  };

  await regel('[6.1] een bewaard paar met een staat zonder velden: de app opent, thuis staat er, en de rij van de vriend ook', async function (check) {
    const r = await opentMetPaar(function () { return { merk: 'abcdefghijklmnop', staat: { v: 2 } }; });
    opentGewoon(check, r);
  });

  await regel('[6.1] een bewaard paar met een staat zonder velden maar met zijn verzegelde tekst: het potje komt terug uit die tekst', async function (check) {
    const r = await opentMetPaar(function (p) { return Object.assign({}, p, { staat: { v: 2 } }); }, true);
    opentGewoon(check, r);
    check('het potje met Fien staat weer op de kaart', !!r.a && /je potje met Fien/i.test(tekstVan(r.a, 'verder')));
  });

  await regel('[6.1] een bewaard paar met een beschadigde staat en een beschadigde tekst: de app opent, en het paar telt als nog niet gelezen', async function (check) {
    const r = await opentMetPaar(function (p) { return Object.assign({}, p, { staat: { v: 2, seq: 3, spel: { id: 'potjevanvrien', fase: 'potje', zetten: 5 }, vorige: [] }, blob: 'kapot' }); }, true);
    opentGewoon(check, r);
    check('niets van het kapotte potje op de kaart', !!r.a && !/je potje met Fien/i.test(tekstVan(r.a, 'verder')));
  });

  await regel('[6.1] een bewaard paar met een staat van een nieuwere app: de app opent, en gebruikt die staat niet', async function (check) {
    const r = await opentMetPaar(function (p) { return Object.assign({}, p, { staat: { v: 3, seq: 9, iets: { nieuws: true } } }); }, true);
    opentGewoon(check, r);
    check('niets van die staat op de kaart', !!r.a && !/je potje met Fien/i.test(tekstVan(r.a, 'verder')));
  });

  await regel('[6.1] een bewaard paar met een rij die geen lijst is en velden van de verkeerde vorm: de app opent, en die velden tellen als leeg', async function (check) {
    const r = await opentMetPaar(function (p) {
      return Object.assign({}, p, { rij: { soort: 'zet' }, telBij: { potjevanvrien: 'remise' }, potjes: { potjevanvrien: { zetten: 'e2e4' } },
        telKaart: { potjevanvrien: { xp: 'veel' } }, hoogste: 'drie', verschil: 'x' });
    }, true);
    opentGewoon(check, r);
    check('het potje met Fien staat er nog', !!r.a && /je potje met Fien/i.test(tekstVan(r.a, 'verder')));
    check('de rij van wat wacht is leeg', !!r.a && r.a.get('paarVan("vriendfien1").rij.length') === 0);
  });

  await regel('[6.1] een bewaard paar waarvan de onthouden zetten van een afgelopen potje de verkeerde vorm hebben: de app opent, en de kaart toont het einde', async function (check) {
    const r = await opentMetPaar(function (p) {
      const staat = { v: 2, seq: 4, spel: null, vorige: [{ id: 'potjevanfien', weet: { a: null, b: 'merk-b----------' },
        uitslag: { soort: 'opgave', door: 'b', ply: 2 }, bekeken: { a: false, b: true } }] };
      return { merk: 'merkvandittoest1', hoogste: 4, rij: [], staat: staat, potjes: { potjevanfien: { wit: 'a', door: 'a', zetten: 'e2e4', t: 'gisteren' } },
        telKaart: { potjevanfien: { xp: 'veel', doelGehaald: false, uitslag: { soort: 'opgave', door: 'b' } } } };
    });
    const kaart = opentGewoon(check, r);
    check('de kaart toont het einde (' + kaart.replace(/\s+/g, ' ').slice(0, 80) + ')', /Fien gaf op/.test(kaart) && !/niet meer openen/.test(kaart));
    r.a.tik('verderKaart');
    await wacht();
    const ek = tekstVan(r.a, 'eindkaart');
    check('de eindkaart zonder een telregel van de verkeerde vorm (' + ek.replace(/\s+/g, ' ').slice(0, 80) + ')', /Fien gaf op/.test(ek) && !/veel|undefined|NaN/.test(ek));
  });

  await regel('[6.1] een gave bewaarde staat wordt meteen gebruikt zoals hij is, ook zonder zijn verzegelde tekst', async function (check) {
    const o = opslagMetVrienden([MET_FIEN_MEES_AAN_ZET]);
    const paren = JSON.parse(o.getItem('schaakheld-paar'));
    delete paren.vriendfien1.blob;
    o.setItem('schaakheld-paar', JSON.stringify(paren));
    const a = nieuwKind({ opslag: o });
    check('meteen bij het openen staat het potje in de staat van het paar', a.get('!!paarVan("vriendfien1").staat && paarVan("vriendfien1").staat.spel.zetten.length === 2'));
  });

  await regel('[6.1] het bewaarde item van de paren is geen JSON: de app opent, thuis staat er, en de rij van de vriend ook', async function (check) {
    const r = await opentMetPaar(function () { return '{kapot'; });
    opentGewoon(check, r);
  });

  await regel('[6.1] de zetten in de bus houden elke promotie: dame, toren, loper en paard', async function (check) {
    const a = await kind(opslagMetVrienden([]));
    const lijst = ['a2a4', 'b7b5', 'a4b5', 'a7a6', 'b5a6', 'c8b7', 'a6b7', 'b8c6', 'b7a8q'];
    check('een echt potje met een promotie leest terug', JSON.stringify(a.get('potjeZetten(zettenNaarBus(' + JSON.stringify(lijst) + '))')) === JSON.stringify(lijst));
    const vier = ['b7b8q', 'b7b8r', 'b7b8b', 'b7b8n'];
    check('alle vier de stukken', JSON.stringify(a.get('potjeZetten(zettenNaarBus(' + JSON.stringify(vier) + '))')) === JSON.stringify(vier));
  });

  /* ================= vriendenpotjes die dagen doorlopen ================= */

  await regel('[6.9] twee potjes tegen Turbo, een rondje en twee vriendenpotjes: de kaart, één telregel en het blad in de vaste volgorde', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const nu = Date.now();
    const a = await kind(opslagMetVrienden([MET_FIEN_MEES_AAN_ZET, { fid: 'vriendsem01', naam: 'Sem', zetten: ['c2c4'], updated: nu - 2 * DAG }], {
      'schaakheld-potje': turboPotjes({ 1: [['e2e4', 'e7e5'], nu - 2 * UUR], 2: [TWINTIG.slice(0, 8), nu - UUR] }),
      'schaakheld-rondjes': JSON.stringify({ scan: { round: 2, earned: 6 } }) }));
    const v = tekstVan(a, 'verder');
    check('de kaart: het potje waarin het kind aan zet is', /je potje met Fien/i.test(v) && /Fien heeft gezet\. Jij bent aan zet\./.test(v));
    check('de regel onder de kaart: het potje stopt nooit vanzelf, en geen apparaat', /✔ Dit potje stopt nooit vanzelf\. Het wacht, hoe lang het ook duurt\./.test(v) &&
      !/op deze|blijft staan/.test(v));
    check('precies één regel Ook nog, die telt', JSON.stringify(ookNogRegels(a)) === JSON.stringify(['Ook nog 3 potjes en je rondje']));
    tikTekst(a, 'Ook nog');
    await wacht();
    const blad = a.scherm(), plek = ['Je potje met Fien', 'zet 5', 'zet 2', 'Je rondje Speurogen', 'Je potje met Sem'].map(function (t) { return blad.indexOf(t); });
    check('het blad heet Wat nog bezig is', /Wat nog bezig is/.test(blad));
    check('elk ding in de volgorde van de kaart: aan zet, Turbo het laatst gespeeld eerst, het rondje, dan de vriend aan zet', plek.every(function (p) { return p >= 0; }) &&
      plek.every(function (p, i) { return i === 0 || p > plek[i - 1]; }));
    check('de rij van Sem zegt wie aan zet is en sinds wanneer', /Sem is al 2 dagen aan zet/.test(blad));
    tikTekst(a, 'Je potje met Sem');
    await wacht();
    check('een rij opent zijn potje', opSpeelscherm(a) && a.get('session.S.hist.length') === 1);
  });

  await regel('[6.9] één ander ding bezig: de regel noemt het en opent het; niets anders: geen regel', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const a = await kind(opslagMetVrienden([MET_FIEN_MEES_AAN_ZET], { 'schaakheld-rondjes': JSON.stringify({ scan: { round: 2, earned: 6 } }) }));
    check('de kaart: het vriendenpotje', /Fien heeft gezet\. Jij bent aan zet\./.test(tekstVan(a, 'verder')));
    check('de regel noemt het rondje', JSON.stringify(ookNogRegels(a)) === JSON.stringify(['Ook nog: je rondje Speurogen, opdracht 3 van 5']));
    tikTekst(a, 'Ook nog');
    await wacht();
    check('en opent het', opSpeelscherm(a) && a.get('session.kind') === 'scan');
    const b = await kind(opslagMetVrienden([MET_FIEN_MEES_AAN_ZET]));
    check('alleen het vriendenpotje: de kaart, en geen regel', /Fien heeft gezet\. Jij bent aan zet\./.test(tekstVan(b, 'verder')) && ookNogRegels(b).length === 0);
  });

  await regel('[6.9] de telregel noemt de soorten in de vaste volgorde, met "een" bij één en een getal bij meer', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const turbo = turboPotjes({ 2: [['e2e4', 'e7e5'], Date.now() - UUR] });
    const a = await kind(opslagMetVrienden([MET_FIEN_MEES_AAN_ZET], { 'schaakheld-potje': turbo,
      'schaakheld-rondjes': JSON.stringify({ scan: { round: 2, earned: 6 }, koning: { round: 1, earned: 3 } }) }));
    check('een potje en twee rondjes', JSON.stringify(ookNogRegels(a)) === JSON.stringify(['Ook nog een potje en 2 rondjes']));
    const b = await kind(opslagMetVrienden([MET_FIEN_MEES_AAN_ZET, { fid: 'vriendsem01', naam: 'Sem', zetten: ['c2c4'] }], { 'schaakheld-potje': turbo }));
    check('twee potjes', JSON.stringify(ookNogRegels(b)) === JSON.stringify(['Ook nog 2 potjes']));
  });

  await regel('[6.9] acht vriendenpotjes tegelijk is de grens: Uitnodigen zegt waarom, en bij zeven kan het nog', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const vrienden = function (n) {
      const l = [];
      for (let i = 0; i < n; i++) l.push({ fid: 'vriendnr0' + i, naam: 'Kind' + i, zetten: ['e2e4'] });
      return l.concat([{ fid: 'vriendlotte', naam: 'Lotte' }]);
    };
    const a = await kind(opslagMetVrienden(vrienden(8)));
    const bussen = JSON.stringify(__server.buses);
    tikInRij(a, 'vriendlotte', 'Uitnodigen');
    await wacht(100);
    check('de toast zegt waarom', toastTekst(a) === 'Je hebt al 8 potjes met vrienden tegelijk. Speel er eerst een uit.');
    check('geen uitnodiging en geen wachtvenster', !a.open() && JSON.stringify(__server.buses) === bussen);
    const b = await kind(opslagMetVrienden(vrienden(7)));
    tikInRij(b, 'vriendlotte', 'Uitnodigen');
    await wacht();
    check('bij zeven kan het nog', b.ziet('Wachten op Lotte'));
    if (kanTikken(b, 'Stop met wachten')) tikTekst(b, 'Stop met wachten');
  });

  await regel('[6.5] is de vriend er niet, dan zegt de strook dat het potje doorgaat: op je eigen beurt en na je zet', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const a = await kind(opslagMetVrienden([MET_FIEN_MEES_AAN_ZET]));
    const voor = tellers(a);
    a.tik('verderKaart');
    await wacht(20000);
    check('de terugknop is Pauze', /‹ Pauze/.test(tekstVan(a, 'backBtn')));
    check('op je eigen beurt', tekstVan(a, 'bubble').indexOf('Doe gerust je zet. Fien ziet hem zodra Fien het potje opent.') >= 0 && !/is er nu niet/.test(tekstVan(a, 'bubble')));
    zet(a, 'g1f3');
    await wacht(5000);
    check('na je zet', tekstVan(a, 'bubble').indexOf('Je zet is bewaard. Fien ziet hem zodra Fien het potje opent.') >= 0 && !/is er nu niet/.test(tekstVan(a, 'bubble')));
    check('✔ bewaard in de balk', zichtbaar(a, 'bewaard') && /✔ bewaard/.test(tekstVan(a, 'bewaard')));
    check('geen einde en geen teller veranderd', !a.get('session.over') && !/gestopt|telt voor niemand/.test(a.scherm()) && tellers(a) === voor);
  });

  await regel('[6.6] wie remise aanbiedt, leest de laatste dag om te antwoorden, en de balk houdt het aanbod vast, ook na herladen', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    let a = await kind(opslagMetVrienden([MET_FIEN_MEES_AAN_ZET]));
    a.tik('verderKaart');
    await wacht();
    zet(a, 'g1f3');
    await wacht();
    await biedRemise(a);
    check('de strook zegt de laatste dag', tekstVan(a, 'bubble').indexOf('Je biedt Fien remise aan. Doet Fien tot en met vrijdag 27 november geen zet, dan is het remise.') >= 0);
    check('een datum, geen klok', !/\d+:\d\d|nog \d+ dag/.test(tekstVan(a, 'bubble')));
    check('de balk: bewaard en aangeboden', zichtbaar(a, 'bewaard') && /½ aangeboden/.test(tekstVan(a, 'verschil')));
    a.tik('backBtn');
    await wacht();
    const v = tekstVan(a, 'verder');
    check('thuis: de kaart zegt dat het aanbod staat, en er staat geen regel onder', /Je bood remise aan\. Fien is aan zet\./.test(v) && !/blijft staan/.test(v));
    verder(DAG);
    a = herlaad(a);
    thuisVenstersWeg(a);
    await wacht(20000);
    a.tik('verderKaart');
    await wacht();
    check('een dag later staat het aanbod er nog', /½ aangeboden/.test(tekstVan(a, 'verschil')));
  });

  await regel('[6.6] een aanbod van de vriend: geen regel onder de kaart, de strook zegt hoe je antwoordt, Remise aannemen onder het bord, geen Nee; je zet wijst het af', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const a = await kind(opslagMetVrienden([{ fid: 'vriendfien1', naam: 'Fien', zetten: ['d2d4', 'd7d5'], aanbod: true }]));
    const v = tekstVan(a, 'verder');
    check('de kaart: Fien biedt remise aan, zonder regel eronder', /Fien biedt remise aan/.test(v) && !/blijft staan/.test(v));
    a.tik('verderKaart');
    await wacht();
    check('de strook', tekstVan(a, 'bubble').indexOf('Fien biedt remise aan. Tik onder het bord op Remise aannemen, of doe je zet om door te spelen.') >= 0);
    check('onder het bord Remise aannemen, geen Nee', kanTikken(a, 'Remise aannemen') && !knopTeksten(a).some(function (t) { return /\bNee\b/.test(t); }));
    zet(a, 'g1f3');
    await wacht();
    check('na je zet is het aanbod weg en loopt het potje', !kanTikken(a, 'Remise aannemen') && !a.get('session.over'));
  });

  await regel('[6.8] een vriend met een lopend potje weghalen: eerst de vraag, en Nee, laat staan houdt alles', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const a = await kind(opslagMetVrienden([MET_FIEN_MEES_AAN_ZET]));
    const voor = tellers(a);
    tikInRij(a, 'vriendfien1', '⋯');
    await wacht();
    tikTekst(a, 'Vriend weghalen');
    await wacht();
    check('de vraag', a.ziet('Fien weghalen?') && /Je potje met Fien loopt nog\. Weghalen kan als het potje klaar is\. Opgeven\?/.test(a.scherm()) &&
      kanTikken(a, 'Nee, laat staan') && kanTikken(a, 'Opgeven en weghalen'));
    tikTekst(a, 'Nee, laat staan');
    await wacht();
    check('Fien en het potje blijven', !a.open() && a.get('P.friends.vriendfien1.weg') === false && !!vriendenpotjeMet(a, 'vriendfien1'));
    check('geen teller veranderd', tellers(a) === voor);
  });

  await regel('[6.4] wie uitnodigt en niet wil wachten, maakt er een uitdaging voor later van: het venster, de kaart en de rij zeggen het', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const a = await kind(opslagMetVrienden([{ fid: 'vriendfien1', naam: 'Fien' }]));
    const voor = tellers(a), potjes = Object.keys(__server.potjes).length;
    tikInRij(a, 'vriendfien1', 'Uitnodigen');
    await wacht();
    check('het wachtvenster biedt de uitdaging aan', a.ziet('Wachten op Fien') && kanTikken(a, 'Daag Fien uit voor later') && kanTikken(a, 'Stop met wachten'));
    tikTekst(a, 'Daag Fien uit voor later');
    await wacht();
    const s = a.scherm();
    check('het venster daarna', /Uitdaging verstuurd!/.test(s) && kanTikken(a, 'Naar huis') &&
      /Fien is er nu niet\. Fien ziet je uitdaging bij het openen van SchaakHeld\. Je kunt intussen iets anders doen\./.test(s));
    check('de uitdaging staat in de staat van het paar', Object.keys(__server.potjes).length === potjes + 1);
    tikTekst(a, 'Naar huis');
    await wacht();
    a.tik('tabSpelen');
    const v = tekstVan(a, 'verder');
    check('de kaart', /Je uitdaging aan Fien/.test(v) && /Nog geen antwoord van Fien\./.test(v) && /Bekijk/.test(v) && !/blijft staan/.test(v));
    a.tik('verderKaart');
    await wacht();
    check('Bekijk opent Vrienden, met de rij van Fien', zichtbaar(a, 'view-vrienden') && /Uitgedaagd · nog geen antwoord/.test(vriendRijTekst(a, 'vriendfien1')) &&
      !/Uitnodigen/.test(vriendRijTekst(a, 'vriendfien1')));
    check('geen teller veranderd', tellers(a) === voor);
  });

  await regel('[6.4] wie een uitdaging intrekt, hoort het met een toast, en de rij en de kaart zijn weer als eerst', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const a = await kind(opslagMetVrienden([{ fid: 'vriendfien1', naam: 'Fien' }]));
    const voor = tellers(a);
    await daagFienUit(a);
    if (kanTikken(a, 'Naar huis')) { tikTekst(a, 'Naar huis'); await wacht(); }
    tikInRij(a, 'vriendfien1', '⋯');
    await wacht();
    check('⋯ heeft Uitdaging intrekken en Vriend weghalen', kanTikken(a, 'Uitdaging intrekken') && kanTikken(a, 'Vriend weghalen'));
    tikTekst(a, 'Uitdaging intrekken');
    await wacht(100);
    check('de toast', toastTekst(a) === 'Je uitdaging aan Fien is ingetrokken.');
    check('de rij is weer als eerst', /vrienden sinds/.test(vriendRijTekst(a, 'vriendfien1')) && /Uitnodigen/.test(vriendRijTekst(a, 'vriendfien1')));
    a.tik('tabSpelen');
    check('de kaart noemt geen uitdaging meer', !/uitdaging/i.test(tekstVan(a, 'verder')) && ookNogRegels(a).length === 0);
    check('geen teller veranderd', tellers(a) === voor);
  });

  await regel('[6.9] een nieuw potje ruimt de kaart op: wat niet te lezen is en een einde dat het kind zag en de vriend kent gaan weg; lopende potjes met andere kinderen, een einde dat het kind nog niet zag en wat de vriend nog moet leren blijven', function (check) {
    const a = maakApparaat('Mees');
    const r = function (id, extra) {
      return Object.assign({ gameId: id, fid: null, room: 'kamer' + id, seat: 'stoel' + id, host: true, myColor: 'w', gameNo: 1, moves: ['e2e4'],
        peerName: 'Daan', result: null, offer: null, shown: false, updated: 1 }, extra);
    };
    const klaar = { kind: 'opgave', by: 'b', ply: 1 };
    const g = {
      lopendVriend: r('lopendVriend', { fid: 'vriendfien1', room: null, seat: null }),
      lopendAnder: r('lopendAnder'),
      nietGezien: r('nietGezien', { result: klaar }),
      gezienBekend: r('gezienBekend', { fid: 'vriendfien1', result: klaar, shown: true, vriendWeet: true }),
      gezienNietBekend: r('gezienNietBekend', { fid: 'vriendfien1', result: klaar, shown: true }),
      gezienAnder: r('gezienAnder', { result: klaar, shown: true }),
      kapotPotje: { gameId: 'kapotPotje', moves: 'geen lijst' }
    };
    a.ev('schrijfSamen(' + JSON.stringify(g) + '); MP = { viaFriend: "vriendsem01", gameId: "nieuwpotje1" }; samenOpruimen(); MP = null');
    const blijft = Object.keys(a.get('samenRauw() || {}')).sort().join();
    check('blijven: de lopende potjes, het einde dat het kind niet zag, het einde dat de vriend nog moet leren',
      blijft === ['gezienNietBekend', 'lopendAnder', 'lopendVriend', 'nietGezien'].sort().join());
  });

  await regel('[6.9] een uitnodiging die de ene regel onder de kaart is, komt niet ook als venster; de regel opent haar vraag', async function (check) {
    const a = await kind(opslagMetVrienden([{ fid: 'vriendfien1', naam: 'Fien', zetten: ['e2e4', 'e7e5'] }, { fid: 'vriendsem01', naam: 'Sem' }]));
    a.ev('uitnodigingWacht = { fid: "vriendsem01", inv: { id: "uitnodiging1", room: "kamersem0001", seat: "stoelsem0001", ts: Date.now() } }; renderVerder()');
    await wacht(100);
    check('testopzet: de kaart is het potje met Fien', /je potje met Fien/i.test(tekstVan(a, 'verderKaart')));
    check('de regel noemt de uitnodiging', /Ook nog: Sem wil spelen/.test(tekstVan(a, 'ookNog')));
    check('en er staat geen venster', !a.open());
    a.tik('ookNog');
    await wacht();
    check('de regel opent haar vraag', /Sem wil een potje spelen!/.test(a.scherm()) && kanTikken(a, 'Ja, spelen!'));
  });
}
