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
    const voorM = [eigenTeller(w.mees, 'c.gamesPlayed'), eigenTeller(w.mees, 'c.winsOnline')];
    const voorF = eigenTeller(w.fien, 'c.gamesPlayed'), voorT = eigenTeller(tablet, 'c.gamesPlayed');
    await potjeMeesWit(w, 'potjeeen0001');
    await zetten(w, 'potjeeen0001', MAT_WIT, 0, MAT_WIT.length);
    let s = await serverStaat(w.mees, w.fm);
    check('het potje is klaar, Mees weet het en heeft het bekeken', !!s && s.spel.fase === 'klaar' && s.spel.uitslag.soort === 'mat' &&
      s.spel.weet[w.rm] === bewaard(w.mees, w.fm).merk && s.spel.bekeken[w.rm] === true);
    check('Mees telde het één keer, met de winst', eigenTeller(w.mees, 'c.gamesPlayed') === voorM[0] + 1 && eigenTeller(w.mees, 'c.winsOnline') === voorM[1] + 1);
    await leesP(w.fien, w.ff);
    s = await serverStaat(w.fien, w.ff);
    check('Fien zette haar merk bij het lezen', s.spel.weet[w.rf] === bewaard(w.fien, w.ff).merk && s.spel.bekeken[w.rf] === false);
    check('Fien telde het één keer', eigenTeller(w.fien, 'c.gamesPlayed') === voorF + 1);
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
    __server.potjes[bus] = { blob: nieuwer, tot: __busNu() + 30 * DAG, veranderd: __busNu() };
    await doe(w.mees, w.fm, { soort: 'uitdaging', id: 'potjeeen0001', wit: w.rm, op: null });
    check('de nieuwere staat staat er nog', __server.potjes[bus].blob === nieuwer);
    check('de uitdaging wacht', bewaard(w.mees, w.fm).rij.length === 1);
    __server.potjes[bus] = { blob: 'nietteopenen' + nieuwer.slice(12), tot: __busNu() + 30 * DAG, veranderd: __busNu() };
    await leesP(w.mees, w.fm);
    check('wat niet te openen is, staat er nog', __server.potjes[bus].blob.indexOf('nietteopenen') === 0 && bewaard(w.mees, w.fm).rij.length === 1);
  });

  await regel('[P13] een server zonder potjes met een versie: er gaat niets heen en het apparaat onthoudt dat', async function (check) {
    const w = await paarMeesFien();
    const echt = fetch;
    let n = 0;
    fetch = function (url, o) { if (/\/v1\/potje$/.test(url)) { n++; return Promise.resolve({ status: 404, json: function () { return Promise.reject(new SyntaxError('geen json')); } }); } return echt(url, o); };
    try {
      const r = await doe(w.mees, w.fm, { soort: 'uitdaging', id: 'potjeeen0001', wit: w.rm, op: null });
      check('pasToe zegt dat de server het niet kent', !!r && r.oud === true);
      await doe(w.mees, w.fm, { soort: 'uitdaging', id: 'potjeeen0001', wit: w.rm, op: null });
      check('de tweede keer gaat er niets meer heen', n === 1);
      check('niets wacht', bewaard(w.mees, w.fm).rij.length === 0);
    } finally { fetch = echt; }
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
}
