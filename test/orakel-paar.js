/* Orakel, tweeapparatentests voor een apparaat op de staat van een paar: één staat per paar vrienden op de server,
   die een apparaat alleen verandert met een schrijfactie die de versie noemt die het las. pasToe(fid, actie) zet een
   handeling achteraan in de rij die wacht en werkt die rij af; leesPaar(fid) leest de server en verwerkt wat er staat;
   paarVan(fid) is wat het apparaat per vriend bewaart. Rollen a en b zijn die van de vriendschap. Gebruikt
   test/harnas.js, test/orakel-twee.js en test/orakel-twee-6.js (onderweg, tweedeApparaat, MAT_WIT, RUSTIG). */

var J = JSON.stringify;
/* het adres van de staat van een paar: het bewijs komt uit K zonder rol, het adres is de sha256 ervan */
function paarAdres(app, fid) {
  return app.ev('(async function () { var f = P.friends[' + J(fid) + ']; return sha256hex(b64url(await hkdfBits(f.k, "potje", 32))); })()');
}
/* de staat zoals de server hem heeft, geopend met K; null als er niets staat */
async function serverStaat(app, fid) {
  const p = __server.potjes[await paarAdres(app, fid)];
  return p ? app.ev('blobNaarStaat(P.friends[' + J(fid) + '].k, ' + J(p.blob) + ')') : null;
}
async function serverVersie(app, fid) {
  const p = __server.potjes[await paarAdres(app, fid)];
  return p ? app.ev('versieVan(' + J(p.blob) + ')') : '';
}
function bewaard(app, fid) { return JSON.parse(app.get('JSON.stringify(paarVan(' + J(fid) + '))')); }
function rolVan(app, fid) { return app.get('myRole(P.friends[' + J(fid) + '])'); }
function eigenTeller(app, pad) { return app.get('(DOC.cnt[' + J(pad) + '] || {})[DEV] || 0'); }
async function doe(app, fid, actie) { const r = await app.ev('pasToe(' + J(fid) + ', ' + J(actie) + ')'); await wacht(); return r; }
async function leesP(app, fid) { await app.ev('leesPaar(' + J(fid) + ')'); await wacht(); }

/* Mees en Fien worden vrienden; elk heeft een eigen id voor de ander */
async function paarMeesFien() {
  zetDatum('2026-11-20T10:00:00');
  const mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
  await wordenVrienden(mees, fien);
  /* de snelle blik naar uitnodigingen leest geen staat van een paar; uit, anders loopt de klok bij elke wacht() vijf tellen door */
  for (const x of [mees, fien]) x.ev('clearTimeout(snelKijkKlok); snelKijken = function () {}');
  const fm = mees.get('Object.keys(P.friends)[0]'), ff = fien.get('Object.keys(P.friends)[0]');
  return { mees, fien, fm, ff, rm: rolVan(mees, fm), rf: rolVan(fien, ff) };
}
/* een potje dat loopt, met Mees wit; zetten uit een lijst, om beurten, elk na het lezen van de ander */
async function potjeMeesWit(w, id, op) {
  await doe(w.mees, w.fm, { soort: 'uitdaging', id: id, wit: w.rm, op: op || null });
  await leesP(w.fien, w.ff);
  await doe(w.fien, w.ff, { soort: 'ja', id: id });
  await leesP(w.mees, w.fm);
}
async function zetten(w, id, lijst, van, tot) {
  for (let i = van; i < tot; i++) {
    const [x, f] = i % 2 === 0 ? [w.mees, w.fm] : [w.fien, w.ff];
    await leesP(x, f);
    await doe(x, f, { soort: 'zet', id: id, ply: i, zet: lijst[i] });
  }
}

async function orakelPaar() {
  await regel('[V1] [V2] [P1] een uitdaging van Mees staat als één staat op de server, en Fien leest hem zoals hij er staat', async function (check) {
    const w = await paarMeesFien();
    await doe(w.mees, w.fm, { soort: 'uitdaging', id: 'potjeeen0001', wit: w.rm, op: null });
    const s = await serverStaat(w.mees, w.fm);
    check('op de server: de uitdaging van Mees, seq 1', !!s && s.seq === 1 && s.spel.fase === 'uitdaging' && s.spel.door === w.rm);
    check('Mees bewaart wat hij schreef en er wacht niets', bewaard(w.mees, w.fm).versie === await serverVersie(w.mees, w.fm) && bewaard(w.mees, w.fm).rij.length === 0);
    await leesP(w.fien, w.ff);
    check('Fien bewaart wat de server heeft', bewaard(w.fien, w.ff).versie === await serverVersie(w.fien, w.ff));
    check('Fien ziet de uitdaging', JSON.parse(w.fien.get('JSON.stringify(zichtVan(' + J(w.ff) + '))')).spel.fase === 'uitdaging');
  });

  await regel('[V2] [P2] Mees trekt in terwijl Fien ja zegt, op dezelfde versie: één wint, de ander leest en zijn handeling vervalt zonder woord', async function (check) {
    const w = await paarMeesFien();
    await doe(w.mees, w.fm, { soort: 'uitdaging', id: 'potjeeen0001', wit: w.rm, op: null });
    await leesP(w.fien, w.ff);
    const net = onderweg(), bus = await paarAdres(w.mees, w.fm);
    net.houd(bus);
    const trek = w.mees.ev('pasToe(' + J(w.fm) + ', ' + J({ soort: 'intrekken', id: 'potjeeen0001' }) + ')');
    await wacht();
    await doe(w.fien, w.ff, { soort: 'ja', id: 'potjeeen0001' });
    net.laat(bus);
    await trek;
    await wacht();
    net.stop();
    const s = await serverStaat(w.mees, w.fm), v = await serverVersie(w.mees, w.fm);
    check('het ja won: het potje loopt', !!s && s.spel.fase === 'potje' && s.seq === 2);
    check('Mees bewaart wat de server heeft, en er wacht niets', bewaard(w.mees, w.fm).versie === v && bewaard(w.mees, w.fm).rij.length === 0);
    check('Fien ook', bewaard(w.fien, w.ff).versie === v && bewaard(w.fien, w.ff).rij.length === 0);
    check('geen venster bij Mees', !w.mees.open());
  });

  await regel('[V2] [P3] het antwoord op de uitdaging van Mees raakt kwijt: bij het volgende lezen is ze gedaan, en ze staat er één keer', async function (check) {
    const w = await paarMeesFien();
    const net = onderweg(), bus = await paarAdres(w.mees, w.fm);
    net.kwijt(bus);
    await doe(w.mees, w.fm, { soort: 'uitdaging', id: 'potjeeen0001', wit: w.rm, op: null });
    net.stop();
    check('de handeling wacht nog', bewaard(w.mees, w.fm).rij.length === 1);
    await leesP(w.mees, w.fm);
    const s = await serverStaat(w.mees, w.fm);
    check('na het lezen wacht er niets meer', bewaard(w.mees, w.fm).rij.length === 0);
    check('de server ging één keer omhoog', !!s && s.seq === 1 && s.spel.id === 'potjeeen0001');
  });

  await regel('[V2] [P4] zonder netwerk wacht een uitdaging op het apparaat, ook na een herstart, en gaat ze zodra er netwerk is', async function (check) {
    const w = await paarMeesFien();
    geenNetwerk(w.mees);
    await doe(w.mees, w.fm, { soort: 'uitdaging', id: 'potjeeen0001', wit: w.rm, op: null });
    check('niets op de server', (await serverStaat(w.mees, w.fm)) === null);
    const mees = herlaad(w.mees);
    await wacht();
    check('na de herstart wacht ze nog', bewaard(mees, w.fm).rij.length === 1);
    weerNetwerk(mees);
    await leesP(mees, w.fm);
    const s = await serverStaat(mees, w.fm);
    check('met netwerk staat ze op de server', !!s && s.spel.fase === 'uitdaging' && s.spel.door === w.rm);
    check('en wacht er niets meer', bewaard(mees, w.fm).rij.length === 0);
  });

  await regel('[V2] [P5] een uitdaging die zonder netwerk wachtte, past niet meer als Fien al uitdaagde: ze vervalt zonder woord', async function (check) {
    const w = await paarMeesFien();
    geenNetwerk(w.mees);
    await doe(w.mees, w.fm, { soort: 'uitdaging', id: 'potjeeen0001', wit: w.rm, op: null });
    await doe(w.fien, w.ff, { soort: 'uitdaging', id: 'potjetwee002', wit: w.rf, op: null });
    weerNetwerk(w.mees);
    await leesP(w.mees, w.fm);
    const s = await serverStaat(w.mees, w.fm);
    check('de uitdaging van Fien staat er', !!s && s.spel.id === 'potjetwee002' && s.seq === 1);
    check('bij Mees wacht niets meer en hij bewaart wat de server heeft', bewaard(w.mees, w.fm).rij.length === 0 &&
      bewaard(w.mees, w.fm).versie === await serverVersie(w.mees, w.fm));
    check('geen venster bij Mees', !w.mees.open());
  });

  await regel('[V5] [P6] Mees zet mat; Fien leest het einde en zet haar merk, haar tablet daarna niet; elk kind telt één keer', async function (check) {
    const w = await paarMeesFien();
    const tablet = await tweedeApparaat(w.fien);
    const voorM = [eigenTeller(w.mees, 'c.gamesPlayed'), eigenTeller(w.mees, 'c.winsOnline'), eigenTeller(w.mees, 'xp')];
    const voorF = eigenTeller(w.fien, 'c.gamesPlayed'), voorFxp = eigenTeller(w.fien, 'xp'), voorT = eigenTeller(tablet, 'c.gamesPlayed');
    await potjeMeesWit(w, 'potjeeen0001');
    await zetten(w, 'potjeeen0001', MAT_WIT, 0, MAT_WIT.length);
    let s = await serverStaat(w.mees, w.fm);
    check('het potje is klaar, Mees weet het en heeft het bekeken', !!s && s.spel.fase === 'klaar' && s.spel.uitslag.soort === 'mat' &&
      s.spel.weet[w.rm] === bewaard(w.mees, w.fm).merk && s.spel.bekeken[w.rm] === true);
    check('Mees telde het één keer, met de winst en 30 XP', eigenTeller(w.mees, 'c.gamesPlayed') === voorM[0] + 1 && eigenTeller(w.mees, 'c.winsOnline') === voorM[1] + 1 &&
      eigenTeller(w.mees, 'xp') === voorM[2] + 30);
    await leesP(w.fien, w.ff);
    s = await serverStaat(w.fien, w.ff);
    check('Fien zette haar merk bij het lezen', s.spel.weet[w.rf] === bewaard(w.fien, w.ff).merk && s.spel.bekeken[w.rf] === false);
    check('Fien telde het één keer, met 30 XP', eigenTeller(w.fien, 'c.gamesPlayed') === voorF + 1 && eigenTeller(w.fien, 'xp') === voorFxp + 30);
    const seq = s.seq;
    await leesP(tablet, w.ff);
    await leesP(w.fien, w.ff);
    check('de tablet schreef niets en telde niets', (await serverStaat(w.fien, w.ff)).seq === seq && eigenTeller(tablet, 'c.gamesPlayed') === voorT);
    check('Fien telde niet nog eens', eigenTeller(w.fien, 'c.gamesPlayed') === voorF + 1);
  });

  await regel('[V5] [P7] het antwoord op de matzet van Mees raakt kwijt en hij is weg tot het potje derde is in vorige: dan telt hij het één keer, met de winst', async function (check) {
    const w = await paarMeesFien();
    const mees2 = await tweedeApparaat(w.mees);
    const voor = [eigenTeller(w.mees, 'c.gamesPlayed'), eigenTeller(w.mees, 'c.winsOnline')];
    await potjeMeesWit(w, 'potjeeen0001');
    await zetten(w, 'potjeeen0001', MAT_WIT, 0, MAT_WIT.length - 1);
    await leesP(w.mees, w.fm);
    const net = onderweg();
    net.kwijt(await paarAdres(w.mees, w.fm));
    await doe(w.mees, w.fm, { soort: 'zet', id: 'potjeeen0001', ply: MAT_WIT.length - 1, zet: MAT_WIT[MAT_WIT.length - 1] });
    net.stop();
    stopApparaat(w.mees);
    /* twee potjes verder met de tablet van Mees, elk opgegeven door Mees; een derde uitdaging zet het eerste derde in vorige */
    let op = 'potjeeen0001';
    for (const id of ['potjetwee002', 'potjedrie003']) {
      await leesP(w.fien, w.ff);
      await doe(w.fien, w.ff, { soort: 'uitdaging', id: id, wit: w.rf, op: op });
      await leesP(mees2, w.fm);
      await doe(mees2, w.fm, { soort: 'ja', id: id });
      await doe(mees2, w.fm, { soort: 'opgeven', id: id, eigen: 0 });
      await leesP(w.fien, w.ff);
      op = id;
    }
    await doe(w.fien, w.ff, { soort: 'uitdaging', id: 'potjevier004', wit: w.rf, op: op });
    const s = await serverStaat(w.fien, w.ff);
    check('testopzet: het eerste potje is derde in vorige', s.vorige.length === 3 && s.vorige[2].id === 'potjeeen0001' && !('uitslag' in s.vorige[2]));
    const mees = herlaad(w.mees);
    await leesP(mees, w.fm);
    check('Mees telde het één keer, met de winst', eigenTeller(mees, 'c.gamesPlayed') === voor[0] + 1 && eigenTeller(mees, 'c.winsOnline') === voor[1] + 1);
    await leesP(mees, w.fm);
    check('en niet nog eens bij het volgende lezen', eigenTeller(mees, 'c.gamesPlayed') === voor[0] + 1);
  });

  await regel('[V6] [P8] [P9] een aanbod zonder stempel krijgt de klok van de server zodra een apparaat het heeft, ook dat van wie het deed, één keer; na veertien dagen op die klok is het bij Mees remise, nog niet bekeken', async function (check) {
    const w = await paarMeesFien();
    await potjeMeesWit(w, 'potjeeen0001');
    await zetten(w, 'potjeeen0001', RUSTIG, 0, 4);
    await leesP(w.mees, w.fm);
    await doe(w.mees, w.fm, { soort: 'zet', id: 'potjeeen0001', ply: 4, zet: RUSTIG[4], bod: true });
    await leesP(w.fien, w.ff);
    let s = await serverStaat(w.fien, w.ff);
    const stempel = s.spel.bod && s.spel.bod.t, klokNa = Math.floor(__busNu() / 1000);
    check('het aanbod heeft de klok van de server', !!s.spel.bod && s.spel.bod.door === w.rm && Number.isInteger(stempel) && stempel <= klokNa && klokNa - stempel < 60);
    schuifKlok(UUR);
    await leesP(w.fien, w.ff);
    check('een tweede lezing verandert het niet', (await serverStaat(w.fien, w.ff)).spel.bod.t === stempel);
    schuifKlok(13 * DAG);
    await leesP(w.mees, w.fm);
    check('na dertien dagen nog niets', (await serverStaat(w.mees, w.fm)).spel.fase === 'potje');
    schuifKlok(DAG + UUR);
    await leesP(w.mees, w.fm);
    s = await serverStaat(w.mees, w.fm);
    check('na veertien dagen remise, door Mees, met het merk van Mees en nog niet bekeken', s.spel.fase === 'klaar' && s.spel.uitslag.soort === 'remise' &&
      s.spel.uitslag.vanzelf === true && s.spel.uitslag.bodT === stempel && s.spel.weet[w.rm] === bewaard(w.mees, w.fm).merk && s.spel.bekeken[w.rm] === false);
  });

  await regel('[V3] [P10] de server verliest de staat: Mees schrijft een lopend potje terug; een afgelopen potje dat allebei weten schrijft hij niet terug, en zijn volgende uitdaging bouwt erop voort', async function (check) {
    const w = await paarMeesFien();
    await potjeMeesWit(w, 'potjeeen0001');
    await zetten(w, 'potjeeen0001', RUSTIG, 0, 3);
    const seq = (await serverStaat(w.mees, w.fm)).seq;
    __potjesKwijt();
    await leesP(w.mees, w.fm);
    let s = await serverStaat(w.mees, w.fm);
    check('het lopende potje staat er weer, met zijn seq', !!s && s.spel.fase === 'potje' && s.spel.zetten.length === 3 && s.seq === seq);
    await leesP(w.fien, w.ff);
    await doe(w.fien, w.ff, { soort: 'opgeven', id: 'potjeeen0001', eigen: 1 });
    await leesP(w.mees, w.fm);
    await leesP(w.fien, w.ff);
    s = await serverStaat(w.mees, w.fm);
    check('testopzet: klaar en allebei weten het', s.spel.fase === 'klaar' && !!s.spel.weet.a && !!s.spel.weet.b);
    const seqKlaar = s.seq;
    __potjesKwijt();
    await leesP(w.mees, w.fm);
    check('niets teruggeschreven', (await serverStaat(w.mees, w.fm)) === null);
    await doe(w.mees, w.fm, { soort: 'uitdaging', id: 'potjetwee002', wit: w.rm, op: 'potjeeen0001' });
    s = await serverStaat(w.mees, w.fm);
    check('de uitdaging bouwt voort op wat Mees bewaarde', !!s && s.seq === seqKlaar + 1 && s.spel.id === 'potjetwee002' && s.vorige[0].id === 'potjeeen0001');
  });

  await regel('[V3] [P11] de server verloor de staat en een tablet die sliep schrijft een lopend potje terug; Mees kent het als afgelopen en schrijft zijn staat terug', async function (check) {
    const w = await paarMeesFien();
    const tablet = await tweedeApparaat(w.fien);
    await potjeMeesWit(w, 'potjeeen0001');
    await zetten(w, 'potjeeen0001', RUSTIG, 0, 2);
    await leesP(tablet, w.ff);
    stopApparaat(tablet);
    await zetten(w, 'potjeeen0001', RUSTIG, 2, 4);
    await doe(w.mees, w.fm, { soort: 'opgeven', id: 'potjeeen0001', eigen: 2 });
    await leesP(w.fien, w.ff);
    await leesP(w.mees, w.fm);
    const klaar = await serverStaat(w.mees, w.fm);
    __potjesKwijt();
    const t2 = herlaad(tablet);
    await leesP(t2, w.ff);
    let s = await serverStaat(w.mees, w.fm);
    check('testopzet: de tablet schreef het lopende potje terug', !!s && s.spel.fase === 'potje' && s.seq < klaar.seq);
    await leesP(w.mees, w.fm);
    s = await serverStaat(w.mees, w.fm);
    check('Mees schreef het afgelopen potje terug', !!s && s.spel.fase === 'klaar' && s.seq === klaar.seq);
    await leesP(t2, w.ff);
    check('de tablet neemt het over', bewaard(t2, w.ff).versie === await serverVersie(w.mees, w.fm));
  });

  await regel('[P12] een staat van een nieuwere app of een die niet te openen is, blijft staan: niets erover, de handeling wacht', async function (check) {
    const w = await paarMeesFien();
    const bus = await paarAdres(w.mees, w.fm);
    const nieuwer = await w.mees.ev('(async function () { return b64url(await sealJSON(P.friends[' + J(w.fm) + '].k, "paar", vasteLengte({ v: 3, seq: 4 }, POTJE_LENGTE))); })()');
    __server.potjes[bus] = { blob: nieuwer, tot: __busNu() + 30 * DAG };
    await doe(w.mees, w.fm, { soort: 'uitdaging', id: 'potjeeen0001', wit: w.rm, op: null });
    check('de nieuwere staat staat er nog', __server.potjes[bus].blob === nieuwer);
    check('de uitdaging wacht', bewaard(w.mees, w.fm).rij.length === 1);
    __server.potjes[bus] = { blob: 'nietteopenen' + nieuwer.slice(12), tot: __busNu() + 30 * DAG };
    await leesP(w.mees, w.fm);
    check('wat niet te openen is, staat er nog', __server.potjes[bus].blob.indexOf('nietteopenen') === 0 && bewaard(w.mees, w.fm).rij.length === 1);
  });

  await regel('[P13] een server zonder potjes met een versie zegt in de check geen tijd: er gaat niets heen, het apparaat onthoudt dat en leest niet verder', async function (check) {
    const w = await paarMeesFien();
    const echt = fetch, bus = await paarAdres(w.mees, w.fm);
    let schrijf = 0, lees = 0;
    fetch = function (url, o) {
      if (/\/v1\/potje$/.test(url)) schrijf++;
      if (/\/v1\/bus\/check$/.test(url) && JSON.parse(o.body).bussen.indexOf(bus) >= 0) {
        lees++;
        return echt(url, o).then(function (r) { return { status: r.status, json: function () { return r.json().then(function (d) { delete d.nu; return d; }); } }; });
      }
      return echt(url, o);
    };
    /* de laatste lezing is ouder dan een minuut: de schrijfactie leest eerst */
    schuifKlok(2 * 60000);
    try {
      const r = await doe(w.mees, w.fm, { soort: 'uitdaging', id: 'potjeeen0001', wit: w.rm, op: null });
      check('pasToe zegt dat de server het niet kent', !!r && r.oud === true);
      await doe(w.mees, w.fm, { soort: 'uitdaging', id: 'potjeeen0001', wit: w.rm, op: null });
      await leesP(w.mees, w.fm);
      check('er ging niets heen, en na de eerste keer leest het niet meer', schrijf === 0 && lees === 1);
      check('niets wacht', bewaard(w.mees, w.fm).rij.length === 0);
    } finally { fetch = echt; }
  });

  await regel('[V2] [P18] een 404 op een schrijfactie is een schrijfactie die niet lukte: de zet wacht en gaat de volgende keer, en er vervalt niets', async function (check) {
    const w = await paarMeesFien();
    await potjeMeesWit(w, 'potjeeen0001');
    const echt = fetch;
    let keer = 0;
    fetch = function (url, o) {
      if (/\/v1\/potje$/.test(url) && keer++ === 0) return Promise.resolve({ status: 404, json: function () { return Promise.reject(new SyntaxError('geen json')); } });
      return echt(url, o);
    };
    let r;
    try { r = await doe(w.mees, w.fm, { soort: 'zet', id: 'potjeeen0001', ply: 0, zet: RUSTIG[0] }); } finally { fetch = echt; }
    check('de zet wacht, en de server heet niet oud', !(r && r.oud) && bewaard(w.mees, w.fm).rij.length === 1 && w.mees.get('versiesOnbekend') === false);
    await leesP(w.mees, w.fm);
    const s = await serverStaat(w.mees, w.fm);
    check('de volgende keer staat hij erop', s.spel.zetten.length === 1 && bewaard(w.mees, w.fm).rij.length === 0);
  });

  await regel('[V6] [P16] na vijftien dagen weg zet Mees met een remise-aanbod voor hij las: het aanbod en de zet krijgen de klok van nu, en een minuut later is het geen remise', async function (check) {
    const w = await paarMeesFien();
    await potjeMeesWit(w, 'potjeeen0001');
    await zetten(w, 'potjeeen0001', RUSTIG, 0, 4);
    await leesP(w.mees, w.fm);
    stopApparaat(w.mees);
    schuifKlok(15 * DAG);
    const mees = herlaad(w.mees);
    await wacht();
    const nuVoor = Math.floor(__busNu() / 1000);
    await doe(mees, w.fm, { soort: 'zet', id: 'potjeeen0001', ply: 4, zet: RUSTIG[4], bod: true });
    let s = await serverStaat(mees, w.fm);
    check('de zet en het aanbod staan er, met de klok van nu', s.spel.zetten.length === 5 && !!s.spel.bod && s.spel.bod.t >= nuVoor && s.spel.t >= nuVoor);
    schuifKlok(60000);
    await leesP(mees, w.fm);
    s = await serverStaat(mees, w.fm);
    check('een minuut later loopt het potje nog', s.spel.fase === 'potje');
  });

  await regel('[V6] [P17] een schrijfactie leest eerst als de laatste lezing van deze run ouder is dan een minuut, en een 409 gooit de klok niet weg', async function (check) {
    const w = await paarMeesFien();
    await potjeMeesWit(w, 'potjeeen0001');
    await zetten(w, 'potjeeen0001', RUSTIG, 0, 4);
    await leesP(w.mees, w.fm);
    await doe(w.fien, w.ff, { soort: 'bod', id: 'potjeeen0001', ply: 4 });
    const bus = await paarAdres(w.mees, w.fm), echt = fetch;
    let lees = 0;
    fetch = function (url, o) { if (/\/v1\/bus\/check$/.test(url) && JSON.parse(o.body).bussen.indexOf(bus) >= 0) lees++; return echt(url, o); };
    try {
      await doe(w.mees, w.fm, { soort: 'zet', id: 'potjeeen0001', ply: 4, zet: RUSTIG[4] });
      let s = await serverStaat(w.mees, w.fm);
      check('testopzet: de zet van Mees beantwoordde het aanbod', s.spel.zetten.length === 5 && s.spel.bod === null);
      check('na de 409 zette Mees zonder opnieuw te lezen', lees === 0);
      schuifKlok(2 * 60000);
      await doe(w.mees, w.fm, { soort: 'bod', id: 'potjeeen0001', ply: 5 });
      s = await serverStaat(w.mees, w.fm);
      check('twee minuten later las hij eerst, en het aanbod staat er', lees === 1 && !!s.spel.bod && s.spel.bod.door === w.rm);
    } finally { fetch = echt; }
  });

  /* een staat op de server zetten zoals een ander apparaat hem geschreven kan hebben */
  const zetOpServer = async function (app, fid, staat) {
    const blob = await app.ev('staatNaarBlob(P.friends[' + J(fid) + '].k, ' + J(staat) + ')');
    __server.potjes[await paarAdres(app, fid)] = { blob: blob, tot: __busNu() + 30 * DAG };
  };
  const afgelopenBijAllebei = async function () {
    const w = await paarMeesFien();
    await potjeMeesWit(w, 'potjeeen0001');
    await zetten(w, 'potjeeen0001', RUSTIG, 0, 2);
    await doe(w.mees, w.fm, { soort: 'opgeven', id: 'potjeeen0001', eigen: 1 });
    await leesP(w.fien, w.ff);
    await leesP(w.mees, w.fm);
    return w;
  };
  await regel('[V3] [P19] bij dezelfde teller toont de server als lopend een potje dat dit apparaat als afgelopen kent en dat allebei weten: het schrijft zijn staat terug', async function (check) {
    const w = await afgelopenBijAllebei();
    const sy = bewaard(w.mees, w.fm).staat;
    check('testopzet: afgelopen en allebei weten het', sy.spel.fase === 'klaar' && !!sy.spel.weet.a && !!sy.spel.weet.b);
    const sx = JSON.parse(JSON.stringify(sy));
    Object.assign(sx.spel, { fase: 'potje', uitslag: null, weet: { a: null, b: null }, bekeken: { a: false, b: false } });
    await zetOpServer(w.mees, w.fm, sx);
    await leesP(w.mees, w.fm);
    const s = await serverStaat(w.mees, w.fm);
    check('de afgelopen staat staat weer op de server', s.spel.fase === 'klaar' && s.seq === sy.seq && !!s.spel.weet.a && !!s.spel.weet.b);
  });
  await regel('[V3] [P20] bij een lagere teller toont de server dat potje afgelopen met één merk: het apparaat schrijft zijn staat terug', async function (check) {
    const w = await afgelopenBijAllebei();
    const sy = bewaard(w.mees, w.fm).staat;
    const sx = JSON.parse(JSON.stringify(sy));
    sx.seq = sy.seq - 1;
    sx.spel.weet[w.rf] = null;
    await zetOpServer(w.mees, w.fm, sx);
    await leesP(w.mees, w.fm);
    const s = await serverStaat(w.mees, w.fm);
    check('de staat met beide merken staat weer op de server', s.seq === sy.seq && !!s.spel.weet.a && !!s.spel.weet.b);
  });

  await regel('[V2] [P14] een zet en meteen een aanbod: één verzoek tegelijk, op volgorde (de zet, het aanbod, de stempel erop), en alles staat er', async function (check) {
    const w = await paarMeesFien();
    await potjeMeesWit(w, 'potjeeen0001');
    const log = potjesLog();
    const a = w.mees.ev('pasToe(' + J(w.fm) + ', ' + J({ soort: 'zet', id: 'potjeeen0001', ply: 0, zet: RUSTIG[0] }) + ')');
    const b = w.mees.ev('pasToe(' + J(w.fm) + ', ' + J({ soort: 'bod', id: 'potjeeen0001', ply: 1 }) + ')');
    await a; await b; await wacht();
    log.stop();
    const s = await serverStaat(w.mees, w.fm);
    check('drie schrijfacties, geen 409', log.log.length === 3 && s.seq === 5);
    check('de zet, het aanbod en de stempel staan er', s.spel.zetten.length === 1 && !!s.spel.bod && s.spel.bod.ply === 1 && Number.isInteger(s.spel.bod.t));
  });

  await regel('[V2] [P15] een 429 van de server bij schrijven of lezen: de handeling wacht en gaat de volgende keer, en het kind ziet niets', async function (check) {
    const w = await paarMeesFien();
    const echt = fetch, druk = { status: 429, json: function () { return Promise.reject(new SyntaxError('geen json')); } };
    let keer = 0;
    fetch = function (url, o) { if (/\/v1\/potje$/.test(url) && keer++ === 0) return Promise.resolve(druk); return echt(url, o); };
    try { await doe(w.mees, w.fm, { soort: 'uitdaging', id: 'potjeeen0001', wit: w.rm, op: null }); } finally { fetch = echt; }
    check('na een 429 bij schrijven wacht de uitdaging, en de server heeft niets', bewaard(w.mees, w.fm).rij.length === 1 && (await serverStaat(w.mees, w.fm)) === null);
    fetch = function (url, o) { if (/\/v1\/bus\/check$/.test(url)) return Promise.resolve(druk); return echt(url, o); };
    try { await leesP(w.mees, w.fm); } finally { fetch = echt; }
    check('na een 429 bij lezen wacht ze nog', bewaard(w.mees, w.fm).rij.length === 1 && (await serverStaat(w.mees, w.fm)) === null);
    check('geen venster', !w.mees.open());
    await leesP(w.mees, w.fm);
    const s = await serverStaat(w.mees, w.fm);
    check('de volgende keer staat ze op de server, één keer', !!s && s.seq === 1 && s.spel.fase === 'uitdaging' && bewaard(w.mees, w.fm).rij.length === 0);
  });

  await regel('[V3] [P21] de server verliest de staat met een einde dat Fien nog niet kent: Mees schrijft het terug, en Fien neemt het', async function (check) {
    const w = await paarMeesFien();
    await potjeMeesWit(w, 'potjeeen0001');
    await zetten(w, 'potjeeen0001', RUSTIG, 0, 2);
    await doe(w.mees, w.fm, { soort: 'opgeven', id: 'potjeeen0001', eigen: 1 });
    const klaar = await serverStaat(w.mees, w.fm);
    check('testopzet: afgelopen, en alleen Mees weet het', klaar.spel.fase === 'klaar' && !!klaar.spel.weet[w.rm] && !klaar.spel.weet[w.rf]);
    __potjesKwijt();
    await leesP(w.mees, w.fm);
    let s = await serverStaat(w.mees, w.fm);
    check('Mees schreef het einde terug, met zijn seq', !!s && s.spel.fase === 'klaar' && s.seq === klaar.seq);
    await leesP(w.fien, w.ff);
    s = await serverStaat(w.mees, w.fm);
    check('Fien nam het einde', !!s && !!s.spel.weet[w.rf]);
  });

  await regel('[V3] [P22] na een verloren staat toont de server een lagere seq met een nieuwe uitdaging van Fien: Mees neemt die, ook als het einde dat hij bewaart afgelopen is, en volgt daarna wat Fien schrijft', async function (check) {
    const w = await afgelopenBijAllebei();
    const sy = bewaard(w.mees, w.fm).staat;
    /* zoals een tablet van Fien die sinds lang sliep, na het verlies een uitdaging schrijft op wat zij nog had */
    const sx = { v: 2, seq: sy.seq - 2, spel: { id: 'potjetwee002', wit: w.rf, door: w.rf, fase: 'uitdaging', zetten: [], bod: null, uitslag: null,
      weet: { a: null, b: null }, bekeken: { a: false, b: false }, t: Math.floor(__busNu() / 1000) }, vorige: [] };
    __potjesKwijt();
    await zetOpServer(w.mees, w.fm, sx);
    await leesP(w.mees, w.fm);
    let s = await serverStaat(w.mees, w.fm);
    check('de uitdaging van Fien staat er nog', !!s && !!s.spel && s.spel.id === 'potjetwee002' && s.seq === sy.seq - 2);
    check('Mees heeft haar', bewaard(w.mees, w.fm).staat.spel.id === 'potjetwee002');
    await leesP(w.fien, w.ff);
    await doe(w.fien, w.ff, { soort: 'intrekken', id: 'potjetwee002' });
    s = await serverStaat(w.mees, w.fm);
    check('testopzet: Fien trok in, nog onder de seq die Mees ooit zag', !!s && s.spel === null && s.seq === sy.seq - 1);
    await leesP(w.mees, w.fm);
    s = await serverStaat(w.mees, w.fm);
    check('Mees volgt: hij schrijft zijn uitdaging niet terug', !!s && s.spel === null && bewaard(w.mees, w.fm).staat.spel === null);
  });

  await regel('[V3] [P23] een potje dat al uit vorige is, kent Mees als afgelopen door zijn lijst van getelde potjes: toont de server het lopend met een lagere seq, dan schrijft hij zijn staat terug', async function (check) {
    const w = await paarMeesFien();
    await potjeMeesWit(w, 'potjeeen0001');
    const lopend = await serverStaat(w.mees, w.fm);
    let vorig = 'potjeeen0001';
    for (const id of [null, 'potjetwee002', 'potjedrie003', 'potjevier004', 'potjevijf005']) {
      if (id) { await potjeMeesWit(w, id, vorig); vorig = id; }
      await doe(w.mees, w.fm, { soort: 'opgeven', id: vorig, eigen: 0 });
      await leesP(w.fien, w.ff);
      await leesP(w.mees, w.fm);
    }
    const sy = bewaard(w.mees, w.fm).staat;
    check('testopzet: het eerste potje staat niet meer in de staat, wel in de lijst', sy.spel.id === 'potjevijf005' &&
      !sy.vorige.some(function (v) { return v.id === 'potjeeen0001'; }) && w.mees.get('getelde(' + J(w.fm) + ').includes("potjeeen0001")'));
    await zetOpServer(w.mees, w.fm, lopend);
    await leesP(w.mees, w.fm);
    const s = await serverStaat(w.mees, w.fm);
    check('Mees schreef zijn staat terug', !!s && s.seq === sy.seq && s.spel.id === 'potjevijf005');
  });

  await regel('[V2] [P24] Mees schrijft na een verloren staat terug en krijgt een 409: hij verwerkt wat er dan staat, en zijn zet die wachtte gaat in dezelfde lezing', async function (check) {
    const w = await paarMeesFien();
    await potjeMeesWit(w, 'potjeeen0001');
    await leesP(w.fien, w.ff);
    geenNetwerk(w.mees);
    await doe(w.mees, w.fm, { soort: 'zet', id: 'potjeeen0001', ply: 0, zet: RUSTIG[0] });
    check('testopzet: de zet wacht', bewaard(w.mees, w.fm).rij.length === 1);
    __potjesKwijt();
    weerNetwerk(w.mees);
    /* vlak voor het terugschrijven van Mees schrijft Fien het potje terug */
    const echt = fetch, bus = await paarAdres(w.mees, w.fm);
    let eerst = true, fienSchreef = false;
    fetch = function (url, o) {
      if (eerst && /\/v1\/potje$/.test(url)) {
        eerst = false;
        return w.fien.ev('leesPaar(' + J(w.ff) + ')').then(function () { fienSchreef = !!__server.potjes[bus]; return echt(url, o); });
      }
      return echt(url, o);
    };
    try { await leesP(w.mees, w.fm); } finally { fetch = echt; }
    check('testopzet: Fien schreef eerst', fienSchreef);
    const s = await serverStaat(w.mees, w.fm);
    check('de zet staat er, en niets wacht', !!s && s.spel.zetten.length === 1 && bewaard(w.mees, w.fm).rij.length === 0);
  });

  await regel('[V6] [P25] wat het apparaat zelf doet, gaat voor wat wachtte: het eigen aanbod van veertien dagen is remise voordat een opgave die zonder netwerk wachtte, gaat', async function (check) {
    const w = await paarMeesFien();
    await potjeMeesWit(w, 'potjeeen0001');
    await zetten(w, 'potjeeen0001', RUSTIG, 0, 4);
    await leesP(w.mees, w.fm);
    await doe(w.mees, w.fm, { soort: 'zet', id: 'potjeeen0001', ply: 4, zet: RUSTIG[4], bod: true });
    let s = await serverStaat(w.mees, w.fm);
    check('testopzet: het aanbod staat er met een stempel', !!s.spel.bod && Number.isInteger(s.spel.bod.t));
    stopApparaat(w.mees);
    schuifKlok(15 * DAG);
    const mees = herlaad(w.mees);
    geenNetwerk(mees);
    await wacht();
    await doe(mees, w.fm, { soort: 'opgeven', id: 'potjeeen0001', eigen: 3 });
    check('testopzet: de opgave wacht', bewaard(mees, w.fm).rij.length === 1);
    weerNetwerk(mees);
    await leesP(mees, w.fm);
    s = await serverStaat(mees, w.fm);
    check('remise vanzelf, geen opgave', s.spel.fase === 'klaar' && s.spel.uitslag.soort === 'remise' && s.spel.uitslag.vanzelf === true);
    check('de opgave is vervallen', bewaard(mees, w.fm).rij.length === 0);
  });

  await regel('[V5] [P26] een potje dat te kort was om te tellen, staat toch meteen in de bewaarde lijst van getelde potjes', async function (check) {
    const w = await paarMeesFien();
    await potjeMeesWit(w, 'potjeeen0001');
    await zetten(w, 'potjeeen0001', RUSTIG, 0, 2);
    const voor = w.mees.get('JSON.stringify([P.c.gamesPlayed, P.c.winsOnline])');
    await doe(w.mees, w.fm, { soort: 'opgeven', id: 'potjeeen0001', eigen: 1 });
    const d = JSON.parse(w.mees.opslag.getItem('schaakheld1'));
    check('testopzet: er telde niets', w.mees.get('JSON.stringify([P.c.gamesPlayed, P.c.winsOnline])') === voor);
    check('de lijst in de opslag heeft het potje', !!d.loc.geteld && JSON.stringify(d.loc.geteld[w.fm]) === '["potjeeen0001"]');
  });

  await regel('[V2] [P27] een zet op een potje dat dit apparaat nog niet las: het leest eerst, en de zet telt', async function (check) {
    const w = await paarMeesFien();
    await leesP(w.fien, w.ff);
    await doe(w.mees, w.fm, { soort: 'start', id: 'potjeeen0001', wit: w.rf, op: null, totVrij: true });
    check('testopzet: het potje staat op de server, Fien las het niet', !!(await serverStaat(w.mees, w.fm)).spel && !bewaard(w.fien, w.ff).staat);
    const r = await doe(w.fien, w.ff, { soort: 'zet', id: 'potjeeen0001', ply: 0, zet: RUSTIG[0] });
    const s = await serverStaat(w.mees, w.fm);
    check('de zet staat er', r.afloop === 'geschreven' && s.spel.zetten.length === 1);
  });

  await regel('[V2] [P28] een nieuw potje in de kamer wacht tot de vriend het vorige einde nam, en gaat dan', async function (check) {
    const w = await paarMeesFien();
    await potjeMeesWit(w, 'potjeeen0001');
    await doe(w.mees, w.fm, { soort: 'opgeven', id: 'potjeeen0001', eigen: 0 });
    const r = await doe(w.mees, w.fm, { soort: 'start', id: 'potjetwee002', wit: w.rm, op: 'potjeeen0001', totVrij: true });
    let s = await serverStaat(w.mees, w.fm);
    check('het begin wacht, en het einde staat er nog', r.afloop === 'wacht' && bewaard(w.mees, w.fm).rij.length === 1 && s.spel.id === 'potjeeen0001');
    await leesP(w.fien, w.ff);
    await leesP(w.mees, w.fm);
    s = await serverStaat(w.mees, w.fm);
    check('zodra Fien het einde nam, staat het nieuwe potje er', s.spel.id === 'potjetwee002' && s.spel.fase === 'potje' && bewaard(w.mees, w.fm).rij.length === 0);
  });

  await regel('[V6] [P30] de app blijft open terwijl vijftien dagen verstrijken en de looptijd van het apparaat stilstaat (een telefoon die sliep): het aanbod krijgt de klok van nu, en een minuut later is het geen remise', async function (check) {
    const w = await paarMeesFien();
    await potjeMeesWit(w, 'potjeeen0001');
    await zetten(w, 'potjeeen0001', RUSTIG, 0, 4);
    await leesP(w.mees, w.fm);
    const loop = __klok;
    schuifKlok(15 * DAG);
    check('testopzet: de looptijd stond stil', __klok === loop);
    const nuVoor = Math.floor(__busNu() / 1000);
    await doe(w.mees, w.fm, { soort: 'zet', id: 'potjeeen0001', ply: 4, zet: RUSTIG[4], bod: true });
    let s = await serverStaat(w.mees, w.fm);
    check('de zet en het aanbod hebben de klok van nu', s.spel.zetten.length === 5 && !!s.spel.bod && s.spel.bod.t >= nuVoor && s.spel.t >= nuVoor);
    schuifKlok(60000);
    await leesP(w.mees, w.fm);
    s = await serverStaat(w.mees, w.fm);
    check('een minuut later geen remise', s.spel.fase === 'potje');
  });

  await regel('[V6] [P31] de klok van het apparaat staat stil terwijl het twee minuten doorloopt: voor zijn schrijfactie leest het eerst', async function (check) {
    const w = await paarMeesFien();
    await potjeMeesWit(w, 'potjeeen0001');
    await leesP(w.mees, w.fm);
    const muur = Date.now(), echt = fetch, bus = await paarAdres(w.mees, w.fm), volgorde = [];
    /* de lezingen van de vriendenronde lukken intussen niet: anders is de klok steeds vers */
    fetch = function (url, o) { return /\/v1\/bus\/check$/.test(url) ? Promise.resolve({ status: 503, json: function () { return Promise.resolve({}); } }) : echt(url, o); };
    try { await tijd(2 * 60000); } finally { fetch = echt; }
    zetOp(muur);
    fetch = function (url, o) {
      if (/\/v1\/bus\/check$/.test(url) && JSON.parse(o.body).bussen.indexOf(bus) >= 0) volgorde.push('lees');
      if (/\/v1\/potje$/.test(url)) volgorde.push('schrijf');
      return echt(url, o);
    };
    try { await doe(w.mees, w.fm, { soort: 'zet', id: 'potjeeen0001', ply: 0, zet: RUSTIG[0] }); } finally { fetch = echt; }
    check('testopzet: de klok van het apparaat zegt dezelfde tijd', Math.abs(Date.now() - muur) < 30000);
    check('eerst gelezen, en de zet staat er', volgorde[0] === 'lees' && volgorde.indexOf('schrijf') > 0 && (await serverStaat(w.mees, w.fm)).spel.zetten.length === 1);
  });

  await regel('[V6] [P34] de klok van het apparaat gaat een dag terug terwijl de app open blijft: voor zijn schrijfactie leest het eerst', async function (check) {
    const w = await paarMeesFien();
    await potjeMeesWit(w, 'potjeeen0001');
    await leesP(w.mees, w.fm);
    zetOp(Date.now() - DAG);
    const echt = fetch, bus = await paarAdres(w.mees, w.fm), volgorde = [];
    fetch = function (url, o) {
      if (/\/v1\/bus\/check$/.test(url) && JSON.parse(o.body).bussen.indexOf(bus) >= 0) volgorde.push('lees');
      if (/\/v1\/potje$/.test(url)) volgorde.push('schrijf');
      return echt(url, o);
    };
    try { await doe(w.mees, w.fm, { soort: 'zet', id: 'potjeeen0001', ply: 0, zet: RUSTIG[0] }); } finally { fetch = echt; }
    check('eerst gelezen, en de zet staat er', volgorde[0] === 'lees' && volgorde.indexOf('schrijf') > 0 && (await serverStaat(w.mees, w.fm)).spel.zetten.length === 1);
  });

  await regel('[V6] [P32] een zet veertig seconden na een lezing krijgt de klok van die lezing plus veertig seconden, zonder opnieuw te lezen', async function (check) {
    const w = await paarMeesFien();
    await potjeMeesWit(w, 'potjeeen0001');
    await leesP(w.mees, w.fm);
    const nuLees = Math.floor(__busNu() / 1000);
    await tijd(40000);
    const echt = fetch, bus = await paarAdres(w.mees, w.fm), volgorde = [];
    fetch = function (url, o) {
      if (/\/v1\/bus\/check$/.test(url) && JSON.parse(o.body).bussen.indexOf(bus) >= 0) volgorde.push('lees');
      if (/\/v1\/potje$/.test(url)) volgorde.push('schrijf');
      return echt(url, o);
    };
    try { await doe(w.mees, w.fm, { soort: 'zet', id: 'potjeeen0001', ply: 0, zet: RUSTIG[0] }); } finally { fetch = echt; }
    const s = await serverStaat(w.mees, w.fm);
    check('niet opnieuw gelezen voor de schrijfactie', volgorde[0] === 'schrijf');
    check('de zet heeft de klok van de lezing plus veertig seconden', s.spel.zetten.length === 1 && Math.abs(s.spel.t - (nuLees + 40)) <= 1);
  });

  await regel('[V4] [P33] een zet die zonder netwerk wacht, houdt in wat het kind ziet een tijd, ook als de laatste lezing langer dan een minuut geleden is', async function (check) {
    const w = await paarMeesFien();
    await potjeMeesWit(w, 'potjeeen0001');
    await leesP(w.mees, w.fm);
    geenNetwerk(w.mees);
    await doe(w.mees, w.fm, { soort: 'zet', id: 'potjeeen0001', ply: 0, zet: RUSTIG[0] });
    await tijd(2 * 60000);
    const nu = Math.floor(__busNu() / 1000), s = w.mees.get('zichtVan(' + J(w.fm) + ')');
    check('testopzet: de zet wacht en de klok is oud', bewaard(w.mees, w.fm).rij.length === 1 && w.mees.get('klokNu(' + J(w.fm) + ')') === null);
    check('het zicht heeft de zet met een tijd van nu', s.spel.zetten.length === 1 && Number.isFinite(s.spel.t) && Math.abs(s.spel.t - nu) <= 5);
  });

  await regel('[V5] [P35] een potje tussen vrienden dat telt, geeft 30 XP; het vierde op een dag met dezelfde vriend 15, en met een andere vriend weer 30', async function (check) {
    const w = await paarMeesFien();
    const daan = maakApparaat('Daan');
    await wordenVrienden(w.mees, daan);
    const fd = w.mees.get('Object.keys(P.friends).filter(function (k) { return k !== ' + J(w.fm) + '; })[0]'), fdD = daan.get('Object.keys(P.friends)[0]');
    const matVan = async function (x, fx, y, fy, id, op) {
      await doe(x, fx, { soort: 'uitdaging', id: id, wit: rolVan(x, fx), op: op });
      await leesP(y, fy);
      await doe(y, fy, { soort: 'ja', id: id });
      for (let i = 0; i < MAT_WIT.length; i++) {
        const [a, f] = i % 2 === 0 ? [x, fx] : [y, fy];
        await leesP(a, f);
        await doe(a, f, { soort: 'zet', id: id, ply: i, zet: MAT_WIT[i] });
      }
      await leesP(y, fy);
      await leesP(x, fx);
    };
    const xp = function () { return w.mees.get('P.xp || 0'); }, erbij = [];
    let vorig = null;
    for (const id of ['potjeeen0001', 'potjetwee002', 'potjedrie003', 'potjevier004']) {
      const voor = xp();
      await matVan(w.mees, w.fm, w.fien, w.ff, id, vorig);
      vorig = id;
      erbij.push(xp() - voor);
    }
    const voorDaan = xp();
    await matVan(w.mees, fd, daan, fdD, 'potjedaan001', null);
    check('testopzet: elk potje liep af met mat', JSON.stringify(bewaard(w.mees, fd).staat.spel.uitslag.soort) === '"mat"');
    check('met Fien 30, 30, 30 en dan 15', JSON.stringify(erbij) === '[30,30,30,15]');
    check('met Daan daarna weer 30', xp() - voorDaan === 30);
  });

  await regel('[V2] [V3] [V5] [P29] willekeurige reeksen op vier apparaten (Mees en Fien, elk met een tablet): tikken, lezen, een schrijfactie die blijft hangen of haar antwoord kwijtraakt, netwerk weg, herstarts en de klok; daarna komt alles tot rust, elk apparaat heeft wat de server heeft, niets wacht, elk kind telt elk afgelopen potje één keer met de juiste tellers, en geen afgelopen potje loopt weer', async function (check) {
    const r = await willekeurigeReeksen(1, 20, 60);
    check('testopzet: er liepen potjes af', r.afgelopen >= 20);
    check('geen reeks met een fout' + (r.fouten ? ': ' + Object.keys(r.soorten).join(' | ') : ''), r.fouten === 0);
  });
}

/* Een eigen willekeur met een zaad, zodat elke run dezelfde reeksen speelt. */
function willekeurVan(zaad) {
  let z = (zaad * 2654435761) >>> 0;
  return function (n) {
    z = (z + 0x6D2B79F5) | 0;
    let t = Math.imul(z ^ (z >>> 15), 1 | z);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor(((t ^ (t >>> 14)) >>> 0) / 4294967296 * n);
  };
}
/* wat een kind kan proberen in de staat die het voor zich heeft */
function kandidatenVoor(app, s, rol, nieuwId) {
  const sp = s.spel, l = [];
  /* wie een einde bekijkt, noemt het einde dat hij voor zich heeft */
  const einde = function (u) { return u ? app.get('eindeVan(' + J(u) + ')') : null; };
  if (s.vorige[0]) l.push({ soort: 'bekijk', id: s.vorige[0].id, einde: einde(s.vorige[0].uitslag) });
  if (app.get('paarVrij(' + J(s) + ')')) {
    const op = sp ? sp.id : null;
    l.push({ soort: 'uitdaging', id: nieuwId, wit: 'a', op: op }, { soort: 'start', id: nieuwId, wit: 'b', op: op });
    if (!sp) return l;
  }
  const id = sp.id, ply = sp.zetten.length;
  for (const soort of ['intrekken', 'ja', 'nee', 'bod', 'aannemen']) l.push({ soort: soort, id: id, ply: ply });
  l.push({ soort: 'bekijk', id: id, ply: ply, einde: einde(sp.uitslag) });
  l.push({ soort: 'opgeven', id: id, eigen: app.get('eigenZetten(' + J(sp) + ', ' + J(rol) + ')') });
  if (sp.fase === 'potje') {
    const zetten = app.get('(function () { var S = standVanZetten(' + J(sp.zetten) + '); return S ? legalMoves(S).slice(0, 2).map(moveKey) : []; })()');
    zetten.forEach(function (z) { l.push({ soort: 'zet', id: id, ply: ply, zet: z }, { soort: 'zet', id: id, ply: ply, zet: z, bod: true }); });
  }
  return l;
}
/* Willekeurige reeksen op de staat van een paar. De server raakt de staat hier nooit kwijt: dat is een grens die het
   ontwerp noemt, en die reeksen gaan anders fout om die reden. */
async function willekeurigeReeksen(zaad, aantal, stappen) {
  const kies = willekeurVan(zaad);
  zetDatum('2026-11-20T10:00:00');
  const mees = maakApparaat('Mees'), fien = maakApparaat('Fien');
  await wordenVrienden(mees, fien);
  const fm = mees.get('Object.keys(P.friends)[0]'), ff = fien.get('Object.keys(P.friends)[0]');
  const mees2 = await tweedeApparaat(mees), fien2 = await tweedeApparaat(fien);
  let D = [{ naam: 'a1', app: mees, fid: fm, kind: 'm' }, { naam: 'a2', app: mees2, fid: fm, kind: 'm' },
    { naam: 'b1', app: fien, fid: ff, kind: 'f' }, { naam: 'b2', app: fien2, fid: ff, kind: 'f' }];
  for (const d of D) d.rol = d.app.get('myRole(P.friends[' + J(d.fid) + '])');
  const bus = await paarAdres(mees, fm), k = mees.get('P.friends[' + J(fm) + '].k');
  const echt = fetch;
  let vast = [], modus = null;
  fetch = function (url, o) {
    if (/\/v1\/potje$/.test(url) && modus === 'houd') { modus = null; return new Promise(function (ok) { vast.push(function () { ok(echt(url, o)); }); }); }
    if (/\/v1\/potje$/.test(url) && modus === 'kwijt') { modus = null; return echt(url, o).then(function () { throw new TypeError('Load failed'); }); }
    return echt(url, o);
  };
  const open = async function (blob) { return blob ? mees.ev('blobNaarStaat(' + J(k) + ', ' + J(blob) + ')') : null; };
  let fouten = 0, afgelopen = 0;
  const soorten = {};
  try {
    for (let n = 0; n < aantal; n++) {
      /* elke reeks begint leeg: geen staat op de server, niets bewaard op de apparaten, een nieuw merk */
      delete __server.potjes[bus];
      vast = []; modus = null;
      D = D.map(function (d) { weerNetwerk(d.app); d.app.ev('opslag("schaakheld-paar", null); DOC.loc.geteld = {}; saveP()'); return Object.assign({}, d, { app: herlaad(d.app) }); });
      await wacht();
      const klaar = {}, herrezen = [];
      const tellersVoor = D.map(function (d) { return [eigenTeller(d.app, 'c.gamesPlayed'), eigenTeller(d.app, 'c.winsOnline')]; });
      let nr = 0;
      const volg = async function () {
        const p = __server.potjes[bus], s = p ? await open(p.blob) : null, sp = s && s.spel;
        if (sp && sp.fase === 'klaar') klaar[sp.id] = sp.uitslag;
        else if (sp && klaar[sp.id] && herrezen.indexOf(sp.id) < 0) herrezen.push(sp.id);
      };
      for (let i = 0; i < stappen; i++) {
        const d = D[kies(4)], h = kies(20);
        if (h < 8) {
          if (d.app.netwerk.uit && kies(2)) weerNetwerk(d.app);
          else {
            const s = d.app.get('zichtVan(' + J(d.fid) + ')');
            const l = kandidatenVoor(d.app, s, d.rol, 'pz' + String(zaad).padStart(3, '0') + 'r' + String(n).padStart(3, '0') + 'n' + String(nr + 1).padStart(2, '0')).filter(function (a) {
              return d.app.get('staatNa(' + J(s) + ', ' + J(Object.assign({ merk: 'merkmerkmerkmerk' }, a)) + ', ' + J(d.rol) + ', klokNu(' + J(d.fid) + ') || 0).past');
            });
            if (l.length) {
              let a = l[kies(l.length)];
              if (a.soort === 'opgeven' && kies(3)) a = l[kies(l.length)];
              if (a.soort === 'uitdaging' || a.soort === 'start') nr++;
              d.app.ev('pasToe(' + J(d.fid) + ', ' + J(a) + ')');
            }
          }
        } else if (h < 12) d.app.ev('leesPaar(' + J(d.fid) + ')');
        else if (h === 12) modus = 'houd';
        else if (h === 13) { if (vast.length) vast.shift()(); }
        else if (h === 14) modus = 'kwijt';
        else if (h === 15) geenNetwerk(d.app);
        else if (h === 16 && !vast.length) { const j = D.indexOf(d); D[j] = Object.assign({}, d, { app: herlaad(d.app) }); }
        else if (h === 17) __herstartServer();
        else schuifKlok(kies(6) === 0 ? 15 * DAG : (1 + kies(60)) * 1000);
        await wacht(300);
        if (__server.potjes[bus]) __server.potjes[bus].tot = __busNu() + 30 * DAG;
        await volg();
      }
      /* rust: alles komt aan, alles met netwerk, elk apparaat leest tot er niets meer verandert; dan bekijkt elk kind
         wat er te bekijken is, en weer rust */
      modus = null;
      while (vast.length) vast.shift()();
      const rust = async function () {
        for (let ronde = 0; ronde < 30; ronde++) {
          const voor = J(D.map(function (d) { const p = d.app.get('paarVan(' + J(d.fid) + ')'); return [p.versie, p.rij.length]; })) + ((__server.potjes[bus] || {}).blob || '');
          for (const d of D) { weerNetwerk(d.app); await d.app.ev('leesPaar(' + J(d.fid) + ')'); await wacht(300); await volg(); }
          const na = J(D.map(function (d) { const p = d.app.get('paarVan(' + J(d.fid) + ')'); return [p.versie, p.rij.length]; })) + ((__server.potjes[bus] || {}).blob || '');
          if (voor === na) return true;
        }
        return false;
      };
      let stil = await rust();
      for (const d of D) {
        const s = d.app.get('zichtVan(' + J(d.fid) + ')');
        for (const g of [s.spel && s.spel.fase === 'klaar' ? s.spel : null, s.vorige[0]]) if (g && !g.bekeken[d.rol]) await d.app.ev('pasToe(' + J(d.fid) + ', ' + J({ soort: 'bekijk', id: g.id, einde: d.app.get('eindeVan(' + J(g.uitslag) + ')') }) + ')');
        await wacht(300);
      }
      stil = (await rust()) && stil;
      const p = [];
      if (!stil) p.push('het komt niet tot rust');
      const sv = __server.potjes[bus] ? await mees.ev('versieVan(' + J(__server.potjes[bus].blob) + ')') : '';
      for (const d of D) {
        const b = d.app.get('paarVan(' + J(d.fid) + ')');
        if (b.versie !== sv && !(sv === '' && !d.app.get('staatTelt(paarVan(' + J(d.fid) + ').staat)'))) p.push('een apparaat bewaart iets anders dan de server heeft');
        if (b.rij.length) p.push('op een apparaat wacht nog ' + b.rij.map(function (a) { return a.soort; }).join(' '));
      }
      for (const id in klaar) for (const kind of ['m', 'f']) {
        const keer = D.filter(function (d) { return d.kind === kind; }).reduce(function (t, d) { return t + (d.app.get('getelde(' + J(d.fid) + ')').indexOf(id) >= 0 ? 1 : 0); }, 0);
        if (keer !== 1) p.push('een kind telde een potje ' + keer + ' keer');
      }
      for (const d of D) for (const id of d.app.get('getelde(' + J(d.fid) + ')')) if (!klaar[id]) p.push('een apparaat telde een potje dat nooit afliep');
      /* de tellers van elk kind, opgeteld over zijn twee apparaten: gespeeld als het potje telt, winst bij mat of opgave
         van de ander */
      for (const kind of ['m', 'f']) {
        const rol = D.find(function (d) { return d.kind === kind; }).rol;
        let gespeeld = 0, winst = 0;
        for (const id in klaar) {
          const u = klaar[id];
          if ((u.soort !== 'opgave' && u.soort !== 'remise') || u.ply >= 20) gespeeld++;
          if ((u.soort === 'mat' && u.door === rol) || (u.soort === 'opgave' && u.door !== rol)) winst++;
        }
        const erbij = D.reduce(function (t, d, i) { return d.kind !== kind ? t : [t[0] + eigenTeller(d.app, 'c.gamesPlayed') - tellersVoor[i][0], t[1] + eigenTeller(d.app, 'c.winsOnline') - tellersVoor[i][1]]; }, [0, 0]);
        if (erbij[0] !== gespeeld || erbij[1] !== winst) p.push('de tellers van een kind kloppen niet');
      }
      afgelopen += Object.keys(klaar).length;
      if (herrezen.length) p.push('een afgelopen potje liep weer');
      if (p.length) {
        fouten++;
        const kop = p.filter(function (f, i, l) { return l.indexOf(f) === i; }).join('; ');
        soorten[kop] = (soorten[kop] || 0) + 1;
      }
    }
  } finally { fetch = echt; }
  return { fouten, soorten, afgelopen };
}
