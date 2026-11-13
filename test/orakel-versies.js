/* Orakel voor de staat van een paar vrienden: één potje of uitdaging, met een versie. staatNa(staat, actie, rol, nu)
   is de tabel van de overgangen; hier staat die tabel als gegevens: voor elke soort staat elke handeling van beide
   rollen, wat mag en wat er dan staat, en dat al het andere niet past. Rollen a en b zijn die van de vriendschap,
   een merk is het eigen teken van een apparaat, nu is de klok van de server in seconden. De app staat in de flowsuite
   in de globale scope. */

async function orakelVersies() {
  const NU = 1800000000, DAG_S = 86400;
  const leeg = { v: 2, seq: 7, spel: null, vorige: null };
  const spel = function (extra) {
    return Object.assign({ id: 'potjeeen0001', wit: 'a', door: 'a', fase: 'potje', zetten: [], bod: null, uitslag: null,
      weet: { a: null, b: null }, bekeken: { a: false, b: false }, t: NU - DAG_S }, extra);
  };
  const met = function (s) { return { v: 2, seq: 7, spel: s, vorige: null }; };
  /* de soorten staat; bij elk wie aan zet is en welke zet er kan */
  const STATEN = {
    leeg: leeg,
    uitdagingVanA: met(spel({ fase: 'uitdaging' })),
    neeOnbekend: met(spel({ fase: 'nee', weet: { a: null, b: 'merk-b' }, bekeken: { a: false, b: true } })),
    neeBekend: met(spel({ fase: 'nee', weet: { a: 'merk-a', b: 'merk-b' }, bekeken: { a: false, b: true } })),
    aAanZet: met(spel({})),
    bAanZet: met(spel({ zetten: ['e2e4'] })),
    bodZonderStempel: met(spel({ zetten: ['e2e4'], bod: { door: 'a', ply: 1, t: null } })),
    bodVanEenDag: met(spel({ zetten: ['e2e4'], bod: { door: 'a', ply: 1, t: NU - DAG_S } })),
    bodVanVeertienDagen: met(spel({ zetten: ['e2e4'], bod: { door: 'a', ply: 1, t: NU - 15 * DAG_S } })),
    klaarOnbekend: met(spel({ fase: 'klaar', zetten: ['e2e4'], uitslag: { soort: 'opgave', door: 'a', ply: 1 }, weet: { a: 'merk-a', b: null },
      bekeken: { a: true, b: false } })),
    klaarBekend: met(spel({ fase: 'klaar', zetten: ['e2e4'], uitslag: { soort: 'opgave', door: 'a', ply: 1 }, weet: { a: 'merk-a', b: 'merk-b' },
      bekeken: { a: true, b: false } }))
  };
  const ZET = { aAanZet: 'e2e4', bAanZet: 'e7e5', bodZonderStempel: 'e7e5', bodVanEenDag: 'e7e5', bodVanVeertienDagen: 'e7e5' };
  /* de handelingen, op het potje en de halve zet van de staat */
  const handeling = function (soort, staat, rol, naam) {
    const s = staat.spel, id = s ? s.id : 'niets', ply = s ? s.zetten.length : 0, merk = 'nieuw-' + rol;
    if (soort === 'uitdaging' || soort === 'start') return { soort: soort, id: 'potjetwee002', wit: 'b', merk: merk };
    if (soort === 'zet' || soort === 'zetMetBod') return { soort: 'zet', id: id, ply: ply, zet: ZET[naam] || 'e2e4', bod: soort === 'zetMetBod', merk: merk };
    return { soort: soort, id: id, ply: ply, merk: merk };
  };
  const SOORTEN = ['uitdaging', 'start', 'intrekken', 'ja', 'nee', 'zet', 'zetMetBod', 'bod', 'stempel', 'aannemen', 'vanzelf', 'opgeven',
    'neem', 'bekijk', 'weghalen'];
  /* wat mag: staat, handeling, rol, en wat er dan moet staan; al het andere past niet */
  const MAG = [
    ['leeg', 'uitdaging', 'a', function (u) { return u.spel.fase === 'uitdaging' && u.spel.door === 'a' && u.spel.wit === 'b' && u.spel.t === NU; }],
    ['leeg', 'uitdaging', 'b', function (u) { return u.spel.fase === 'uitdaging' && u.spel.door === 'b'; }],
    ['leeg', 'start', 'a', function (u) { return u.spel.fase === 'potje' && u.spel.door === 'a' && u.spel.zetten.length === 0; }],
    ['leeg', 'start', 'b', function (u) { return u.spel.fase === 'potje' && u.spel.door === 'b'; }],
    ['uitdagingVanA', 'intrekken', 'a', function (u) { return u.spel === null; }],
    ['uitdagingVanA', 'weghalen', 'a', function (u) { return u.spel === null; }],
    ['uitdagingVanA', 'ja', 'b', function (u) { return u.spel.fase === 'potje' && u.spel.t === NU; }],
    ['uitdagingVanA', 'nee', 'b', function (u) { return u.spel.fase === 'nee' && u.spel.weet.b === 'nieuw-b' && u.spel.weet.a === null && u.spel.bekeken.b === true; }],
    ['uitdagingVanA', 'weghalen', 'b', function (u) { return u.spel.fase === 'nee' && u.spel.weet.b === 'nieuw-b'; }],
    ['neeOnbekend', 'neem', 'a', function (u) { return u.spel.weet.a === 'nieuw-a' && u.spel.weet.b === 'merk-b'; }],
    ['neeOnbekend', 'weghalen', 'a', function (u) { return u.spel.weet.a === 'nieuw-a'; }],
    ['neeOnbekend', 'bekijk', 'a', function (u) { return u.spel.bekeken.a === true; }],
    ['neeBekend', 'uitdaging', 'a', function (u) { return u.spel.fase === 'uitdaging' && u.vorige.id === 'potjeeen0001' && u.vorige.fase === 'nee'; }],
    ['neeBekend', 'uitdaging', 'b', function (u) { return u.spel.door === 'b'; }],
    ['neeBekend', 'start', 'a', function (u) { return u.spel.fase === 'potje'; }],
    ['neeBekend', 'start', 'b', function (u) { return u.spel.fase === 'potje'; }],
    ['neeBekend', 'bekijk', 'a', function (u) { return u.spel.bekeken.a === true; }],
    ['aAanZet', 'zet', 'a', function (u) { return u.spel.zetten.join() === 'e2e4' && u.spel.bod === null && u.spel.t === NU; }],
    ['aAanZet', 'zetMetBod', 'a', function (u) { return u.spel.zetten.length === 1 && u.spel.bod.door === 'a' && u.spel.bod.ply === 1 && u.spel.bod.t === null; }],
    ['aAanZet', 'opgeven', 'a', function (u) { return u.spel.fase === 'klaar' && u.spel.uitslag.soort === 'opgave' && u.spel.uitslag.door === 'a' && u.spel.weet.a === 'nieuw-a'; }],
    ['aAanZet', 'opgeven', 'b', function (u) { return u.spel.uitslag.door === 'b' && u.spel.weet.b === 'nieuw-b' && u.spel.weet.a === null && u.spel.bekeken.b === true; }],
    ['aAanZet', 'weghalen', 'a', function (u) { return u.spel.uitslag.soort === 'opgave' && u.spel.uitslag.door === 'a'; }],
    ['aAanZet', 'weghalen', 'b', function (u) { return u.spel.uitslag.door === 'b'; }],
    ['bAanZet', 'zet', 'b', function (u) { return u.spel.zetten.join() === 'e2e4,e7e5'; }],
    ['bAanZet', 'zetMetBod', 'b', function (u) { return u.spel.bod.door === 'b' && u.spel.bod.ply === 2; }],
    ['bAanZet', 'bod', 'a', function (u) { return u.spel.bod.door === 'a' && u.spel.bod.ply === 1 && u.spel.bod.t === null && u.spel.t === NU - DAG_S; }],
    ['bAanZet', 'opgeven', 'a', function (u) { return u.spel.fase === 'klaar'; }],
    ['bAanZet', 'opgeven', 'b', function (u) { return u.spel.fase === 'klaar'; }],
    ['bAanZet', 'weghalen', 'a', function (u) { return u.spel.fase === 'klaar'; }],
    ['bAanZet', 'weghalen', 'b', function (u) { return u.spel.fase === 'klaar'; }],
    ['bodZonderStempel', 'stempel', 'a', function (u) { return u.spel.bod.t === NU && u.spel.t === NU - DAG_S; }],
    ['bodZonderStempel', 'stempel', 'b', function (u) { return u.spel.bod.t === NU; }],
    ['bodZonderStempel', 'zet', 'b', function (u) { return u.spel.bod === null && u.spel.zetten.length === 2; }],
    ['bodZonderStempel', 'zetMetBod', 'b', function (u) { return u.spel.bod.door === 'b' && u.spel.bod.ply === 2; }],
    ['bodZonderStempel', 'aannemen', 'b', function (u) { return u.spel.fase === 'klaar' && u.spel.uitslag.soort === 'remise' && u.spel.uitslag.door === 'a' && !u.spel.uitslag.vanzelf && u.spel.weet.b === 'nieuw-b'; }],
    ['bodZonderStempel', 'opgeven', 'a', function (u) { return u.spel.fase === 'klaar' && u.spel.bod === null; }],
    ['bodZonderStempel', 'opgeven', 'b', function (u) { return u.spel.fase === 'klaar'; }],
    ['bodZonderStempel', 'weghalen', 'a', function (u) { return u.spel.fase === 'klaar'; }],
    ['bodZonderStempel', 'weghalen', 'b', function (u) { return u.spel.fase === 'klaar'; }],
    ['bodVanEenDag', 'zet', 'b', function (u) { return u.spel.bod === null; }],
    ['bodVanEenDag', 'zetMetBod', 'b', function (u) { return u.spel.bod.door === 'b'; }],
    ['bodVanEenDag', 'aannemen', 'b', function (u) { return u.spel.uitslag.soort === 'remise'; }],
    ['bodVanEenDag', 'opgeven', 'a', function (u) { return u.spel.fase === 'klaar'; }],
    ['bodVanEenDag', 'opgeven', 'b', function (u) { return u.spel.fase === 'klaar'; }],
    ['bodVanEenDag', 'weghalen', 'a', function (u) { return u.spel.fase === 'klaar'; }],
    ['bodVanEenDag', 'weghalen', 'b', function (u) { return u.spel.fase === 'klaar'; }],
    ['bodVanVeertienDagen', 'vanzelf', 'a', function (u) { return u.spel.fase === 'klaar' && u.spel.uitslag.soort === 'remise' && u.spel.uitslag.vanzelf === true &&
      u.spel.uitslag.door === 'a' && u.spel.uitslag.bodT === NU - 15 * DAG_S && u.spel.weet.a === 'nieuw-a' && u.spel.bekeken.a === false; }],
    ['bodVanVeertienDagen', 'zet', 'b', function (u) { return u.spel.bod === null; }],
    ['bodVanVeertienDagen', 'zetMetBod', 'b', function (u) { return u.spel.bod.door === 'b'; }],
    ['bodVanVeertienDagen', 'aannemen', 'b', function (u) { return u.spel.uitslag.soort === 'remise'; }],
    ['bodVanVeertienDagen', 'opgeven', 'a', function (u) { return u.spel.fase === 'klaar'; }],
    ['bodVanVeertienDagen', 'opgeven', 'b', function (u) { return u.spel.fase === 'klaar'; }],
    ['bodVanVeertienDagen', 'weghalen', 'a', function (u) { return u.spel.fase === 'klaar'; }],
    ['bodVanVeertienDagen', 'weghalen', 'b', function (u) { return u.spel.fase === 'klaar'; }],
    ['klaarOnbekend', 'neem', 'b', function (u) { return u.spel.weet.b === 'nieuw-b' && u.spel.weet.a === 'merk-a' && u.spel.t === NU - DAG_S; }],
    ['klaarOnbekend', 'weghalen', 'b', function (u) { return u.spel.weet.b === 'nieuw-b'; }],
    ['klaarOnbekend', 'bekijk', 'b', function (u) { return u.spel.bekeken.b === true && u.spel.t === NU - DAG_S; }],
    ['klaarBekend', 'uitdaging', 'a', function (u) { return u.spel.fase === 'uitdaging' && u.vorige.id === 'potjeeen0001' && u.vorige.uitslag.soort === 'opgave' &&
      u.vorige.weet.a === 'merk-a' && u.vorige.bekeken.b === false && !('zetten' in u.vorige); }],
    ['klaarBekend', 'uitdaging', 'b', function (u) { return u.spel.door === 'b'; }],
    ['klaarBekend', 'start', 'a', function (u) { return u.spel.fase === 'potje' && u.vorige.id === 'potjeeen0001'; }],
    ['klaarBekend', 'start', 'b', function (u) { return u.spel.fase === 'potje'; }],
    ['klaarBekend', 'bekijk', 'b', function (u) { return u.spel.bekeken.b === true; }]
  ];
  const mag = {};
  MAG.forEach(function (r) { mag[r[0] + ' ' + r[1] + ' ' + r[2]] = r[3]; });

  await regel('[V1] de tabel: in elke soort staat past precies wat mag, met wat er dan staat, en al het andere niet', async function (check) {
    const fout = [];
    for (const naam in STATEN) for (const soort of SOORTEN) for (const rol of ['a', 'b']) {
      const staat = STATEN[naam], voor = JSON.stringify(staat), r = staatNa(staat, handeling(soort, staat, rol, naam), rol, NU);
      const verwacht = mag[naam + ' ' + soort + ' ' + rol];
      if (JSON.stringify(staat) !== voor) fout.push(naam + ' ' + soort + ' ' + rol + ': de staat zelf veranderde');
      if (verwacht && !(r.past && r.staat.seq === 8 && verwacht(r.staat))) fout.push(naam + ' ' + soort + ' ' + rol + ': ' + JSON.stringify(r).slice(0, 160));
      if (!verwacht && r.past) fout.push(naam + ' ' + soort + ' ' + rol + ': past, maar mag niet');
      if (!verwacht && !r.waarom) fout.push(naam + ' ' + soort + ' ' + rol + ': geen reden');
    }
    check('alles volgens de tabel' + (fout.length ? ': ' + fout.slice(0, 6).join(' | ') : ''), fout.length === 0);
  });

  await regel('[V1] een handeling op een ander potje of een andere halve zet past nooit', async function (check) {
    const fout = [];
    for (const r of MAG) {
      const [naam, soort, rol] = r, staat = STATEN[naam];
      if (['uitdaging', 'start', 'weghalen'].indexOf(soort) >= 0) continue;
      const h = handeling(soort, staat, rol, naam), ander = Object.assign({}, h, { id: 'eenanderpotj' });
      if (staatNa(staat, ander, rol, NU).past) fout.push(naam + ' ' + soort + ' ' + rol + ' op een ander potje');
      if (['zet', 'zetMetBod', 'bod', 'aannemen', 'vanzelf', 'opgeven'].indexOf(soort) >= 0) {
        const later = Object.assign({}, h, { ply: h.ply + 1 });
        if (staatNa(staat, later, rol, NU).past) fout.push(naam + ' ' + soort + ' ' + rol + ' op een andere halve zet');
      }
    }
    check('niets past' + (fout.length ? ': ' + fout.slice(0, 6).join(' | ') : ''), fout.length === 0);
  });

  await regel('[V1] een zet die mat zet, beëindigt het potje met de winst voor wie zette, en het aanbod bij die zet vervalt', async function (check) {
    const mat = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6'], staat = met(spel({ zetten: mat }));
    const r = staatNa(staat, { soort: 'zet', id: 'potjeeen0001', ply: 6, zet: 'h5f7', bod: true, merk: 'nieuw-a' }, 'a', NU);
    check('klaar, mat door a, met het merk van a', r.past && r.staat.spel.fase === 'klaar' && r.staat.spel.uitslag.soort === 'mat' &&
      r.staat.spel.uitslag.door === 'a' && r.staat.spel.uitslag.ply === 7 && r.staat.spel.weet.a === 'nieuw-a' && r.staat.spel.bod === null);
    const zet = staatNa(staat, { soort: 'zet', id: 'potjeeen0001', ply: 6, zet: 'h5h8', merk: 'nieuw-a' }, 'a', NU);
    check('een zet die niet kan, past niet', !zet.past);
  });

  await regel('[V1] alGedaan: na een geweigerde schrijfactie ziet het apparaat of de staat al heeft wat het wilde', async function (check) {
    const zetGedaan = met(spel({ zetten: ['e2e4'] }));
    check('de zet staat er al', alGedaan(zetGedaan, { soort: 'zet', id: 'potjeeen0001', ply: 0, zet: 'e2e4' }, 'a', 'nieuw-a'));
    check('een andere zet op die plek is niet gedaan', !alGedaan(zetGedaan, { soort: 'zet', id: 'potjeeen0001', ply: 0, zet: 'd2d4' }, 'a', 'nieuw-a'));
    const opgegeven = met(spel({ fase: 'klaar', uitslag: { soort: 'opgave', door: 'a', ply: 0 }, weet: { a: 'nieuw-a', b: null } }));
    check('het eigen einde met het eigen merk', alGedaan(opgegeven, { soort: 'opgeven', id: 'potjeeen0001', ply: 0 }, 'a', 'nieuw-a'));
    check('een einde met een ander merk van dit kind is niet dit apparaat', !alGedaan(opgegeven, { soort: 'opgeven', id: 'potjeeen0001', ply: 0 }, 'a', 'ander-a'));
    const verder = { v: 2, seq: 9, spel: spel({ id: 'potjetwee002', fase: 'uitdaging', door: 'b' }),
      vorige: { id: 'potjeeen0001', fase: 'klaar', uitslag: { soort: 'opgave', door: 'a', ply: 0 }, weet: { a: 'nieuw-a', b: 'merk-b' }, bekeken: { a: true, b: false } } };
    check('ook als er al iets nieuws staat: het merk in vorige', alGedaan(verder, { soort: 'opgeven', id: 'potjeeen0001', ply: 0 }, 'a', 'nieuw-a'));
    check('een eigen uitdaging staat er', alGedaan(STATEN.uitdagingVanA, { soort: 'uitdaging', id: 'potjeeen0001' }, 'a', 'nieuw-a'));
    check('een intrekking is gedaan als de uitdaging weg is', alGedaan(leeg, { soort: 'intrekken', id: 'potjeeen0001' }, 'a', 'nieuw-a'));
    check('maar niet als de vriend hem aannam', !alGedaan(STATEN.aAanZet, { soort: 'intrekken', id: 'potjeeen0001' }, 'a', 'nieuw-a'));
    check('een ja is gedaan als het potje loopt', alGedaan(STATEN.aAanZet, { soort: 'ja', id: 'potjeeen0001' }, 'b', 'nieuw-b'));
    check('een aanbod staat er', alGedaan(STATEN.bodZonderStempel, { soort: 'bod', id: 'potjeeen0001', ply: 1 }, 'a', 'nieuw-a'));
    check('een stempel staat er', alGedaan(STATEN.bodVanEenDag, { soort: 'stempel', id: 'potjeeen0001' }, 'b', 'nieuw-b'));
  });

  await regel('[V1] de inhoud in de bus: één lengte, de zetten terug, en wat niet klopt is niet te lezen', async function (check) {
    const k = 'geheimvoordeinhoud-xxxxxxxxxxxxxxxx';
    const staten = [leeg, STATEN.aAanZet, met(spel({ zetten: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'e1g1', 'f8c5', 'c2c3', 'd7d6'] })), STATEN.klaarBekend];
    const blobs = [];
    for (const s of staten) blobs.push(await staatNaarBlob(k, s));
    check('elke inhoud even lang', blobs.every(function (b) { return b.length === blobs[0].length; }));
    const terug = await blobNaarStaat(k, blobs[2]);
    check('de zetten komen terug', !!terug && JSON.stringify(terug.spel.zetten) === JSON.stringify(staten[2].spel.zetten) && terug.seq === 7);
    check('met een andere sleutel niet te lezen', (await blobNaarStaat('eenanderesleutel-xxxxxxxxxxxxxxxxxx', blobs[1])) === null);
    const fout = await staatNaarBlob(k, met(spel({ zetten: ['e2e4', 'e2e4'] })));
    check('een zet die niet kan, is niet te lezen', (await blobNaarStaat(k, fout)) === null);
    const nieuwer = b64url(await sealJSON(k, 'paar', vasteLengte({ v: 3, seq: 1 }, POTJE_LENGTE)));
    check('een nieuwere versie zegt dat ze nieuwer is', JSON.stringify(await blobNaarStaat(k, nieuwer)) === JSON.stringify({ nieuwer: true }));
    const v = await versieVan(blobs[0]);
    check('de versie is de hex van sha256 van de tekst', /^[0-9a-f]{64}$/.test(v) && v === (await sha256hex(blobs[0])) && v !== (await versieVan(blobs[1])));
  });
}
