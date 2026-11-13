/* Orakel voor de staat van een paar vrienden: één potje of uitdaging, met een versie. staatNa(staat, actie, rol, nu)
   is de tabel van de overgangen; hier staat die tabel als gegevens: voor elke soort staat elke handeling van beide
   rollen, wat mag en wat er dan staat, en dat al het andere niet past. Rollen a en b zijn die van de vriendschap,
   een merk is het eigen teken van een apparaat, nu is de klok van de server in seconden. De app staat in de flowsuite
   in de globale scope. */

async function orakelVersies() {
  const NU = 1800000000, DAG_S = 86400;
  const leeg = { v: 2, seq: 7, spel: null, vorige: [] };
  const spel = function (extra) {
    return Object.assign({ id: 'potjeeen0001', wit: 'a', door: 'a', fase: 'potje', zetten: [], bod: null, uitslag: null,
      weet: { a: null, b: null }, bekeken: { a: false, b: false }, t: NU - DAG_S }, extra);
  };
  const met = function (s) { return { v: 2, seq: 7, spel: s, vorige: [] }; };
  /* a zet met de negentiende halve zet pat; b zet met de honderdste halve zet zonder slaan of pionzet remise */
  const PAT_VOOR = ['e2e3', 'a7a5', 'd1h5', 'a8a6', 'h5a5', 'h7h5', 'h2h4', 'a6h6', 'a5c7', 'f7f6', 'c7d7', 'e8f7', 'd7b7',
    'd8d3', 'b7b8', 'd3h7', 'b8c8', 'f7g6'];
  /* een rustig potje van n halve zetten: paarden heen en weer, en om de 98 halve zetten een pionzet van elk, zodat de
     vijftigzettenregel het niet beëindigt */
  const rustig = function (n) {
    const z = [], wit = ['a2a3', 'b2b3', 'c2c3', 'd2d3', 'e2e3', 'f2f3'], zwart = ['a7a6', 'b7b6', 'c7c6', 'd7d6', 'e7e6', 'f7f6'];
    while (z.length < n) {
      const i = z.length % 98, blok = Math.floor(z.length / 98);
      z.push(i === 96 ? wit[blok] : i === 97 ? zwart[blok] : ['g1f3', 'g8f6', 'f3g1', 'f6g8'][i % 4]);
    }
    return z;
  };
  const VIJFTIG_VOOR = [];
  while (VIJFTIG_VOOR.length < 99) VIJFTIG_VOOR.push(['g1f3', 'g8f6', 'f3g1', 'f6g8'][VIJFTIG_VOOR.length % 4]);
  /* de soorten staat; bij elk wie aan zet is en welke zet er kan */
  const STATEN = {
    leeg: leeg,
    uitdagingVanA: met(spel({ fase: 'uitdaging' })),
    uitdagingVanB: met(spel({ fase: 'uitdaging', door: 'b' })),
    voorPat: met(spel({ zetten: PAT_VOOR })),
    voorVijftig: met(spel({ zetten: VIJFTIG_VOOR })),
    neeOnbekend: met(spel({ fase: 'nee', weet: { a: null, b: 'merk-b----------' } })),
    neeBekend: met(spel({ fase: 'nee', weet: { a: 'merk-a----------', b: 'merk-b----------' } })),
    aAanZet: met(spel({})),
    bAanZet: met(spel({ zetten: ['e2e4'] })),
    bodZonderStempel: met(spel({ zetten: ['e2e4'], bod: { door: 'a', ply: 1, t: null } })),
    bodVanEenDag: met(spel({ zetten: ['e2e4'], bod: { door: 'a', ply: 1, t: NU - DAG_S } })),
    bodVanVeertienDagen: met(spel({ zetten: ['e2e4'], bod: { door: 'a', ply: 1, t: NU - 15 * DAG_S } })),
    klaarOnbekend: met(spel({ fase: 'klaar', zetten: ['e2e4'], uitslag: { soort: 'opgave', door: 'a', ply: 1 }, weet: { a: 'merk-a----------', b: null },
      bekeken: { a: true, b: false } })),
    klaarBekend: met(spel({ fase: 'klaar', zetten: ['e2e4'], uitslag: { soort: 'opgave', door: 'a', ply: 1 }, weet: { a: 'merk-a----------', b: 'merk-b----------' },
      bekeken: { a: true, b: false } }))
  };
  const ZET = { voorPat: 'c8e6', voorVijftig: 'f6g8', aAanZet: 'e2e4', bAanZet: 'e7e5', bodZonderStempel: 'e7e5', bodVanEenDag: 'e7e5', bodVanVeertienDagen: 'e7e5' };
  /* de handelingen, op het potje en de halve zet van de staat */
  const handeling = function (soort, staat, rol, naam) {
    const s = staat.spel, id = s ? s.id : 'niets', ply = s ? s.zetten.length : 0, merk = ('nieuw-' + rol).padEnd(16, '-');
    if (soort === 'uitdaging' || soort === 'start') return { soort: soort, id: 'potjetwee002', wit: 'b', op: s ? s.id : null, merk: merk };
    if (soort === 'opgeven') return { soort: soort, id: id, eigen: s ? (s.wit === rol ? Math.ceil(ply / 2) : Math.floor(ply / 2)) : 0, merk: merk };
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
    ['uitdagingVanA', 'nee', 'b', function (u) { return u.spel.fase === 'nee' && u.spel.weet.b === 'nieuw-b---------' && u.spel.weet.a === null && u.spel.bekeken.b === false; }],
    ['uitdagingVanA', 'weghalen', 'b', function (u) { return u.spel.fase === 'nee' && u.spel.weet.b === 'nieuw-b---------'; }],
    ['uitdagingVanB', 'intrekken', 'b', function (u) { return u.spel === null; }],
    ['uitdagingVanB', 'weghalen', 'b', function (u) { return u.spel === null; }],
    ['uitdagingVanB', 'ja', 'a', function (u) { return u.spel.fase === 'potje' && u.spel.door === 'b' && u.spel.t === NU; }],
    ['uitdagingVanB', 'nee', 'a', function (u) { return u.spel.fase === 'nee' && u.spel.weet.a === 'nieuw-a---------' && u.spel.weet.b === null && u.spel.bekeken.a === false; }],
    ['uitdagingVanB', 'weghalen', 'a', function (u) { return u.spel.fase === 'nee' && u.spel.weet.a === 'nieuw-a---------'; }],
    ['voorPat', 'zet', 'a', function (u) { return u.spel.fase === 'klaar' && u.spel.uitslag.soort === 'pat' && u.spel.uitslag.door === 'a' && u.spel.uitslag.ply === 19 &&
      u.spel.weet.a === 'nieuw-a---------' && u.spel.bekeken.a === true && u.spel.t === NU; }],
    ['voorPat', 'zetMetBod', 'a', function (u) { return u.spel.fase === 'klaar' && u.spel.uitslag.soort === 'pat' && u.spel.bod === null; }],
    ['voorPat', 'bod', 'b', function (u) { return u.spel.bod.door === 'b' && u.spel.bod.ply === 18; }],
    ['voorPat', 'opgeven', 'a', function (u) { return u.spel.uitslag.soort === 'opgave' && u.spel.uitslag.door === 'a'; }],
    ['voorPat', 'opgeven', 'b', function (u) { return u.spel.uitslag.soort === 'opgave' && u.spel.uitslag.door === 'b'; }],
    ['voorPat', 'weghalen', 'a', function (u) { return u.spel.uitslag.door === 'a'; }],
    ['voorPat', 'weghalen', 'b', function (u) { return u.spel.uitslag.door === 'b'; }],
    ['voorVijftig', 'zet', 'b', function (u) { return u.spel.fase === 'klaar' && u.spel.uitslag.soort === '50' && u.spel.uitslag.door === 'b' && u.spel.uitslag.ply === 100 &&
      u.spel.weet.b === 'nieuw-b---------' && u.spel.bekeken.b === true; }],
    ['voorVijftig', 'zetMetBod', 'b', function (u) { return u.spel.uitslag.soort === '50' && u.spel.bod === null; }],
    ['voorVijftig', 'bod', 'a', function (u) { return u.spel.bod.door === 'a' && u.spel.bod.ply === 99; }],
    ['voorVijftig', 'opgeven', 'a', function (u) { return u.spel.uitslag.soort === 'opgave'; }],
    ['voorVijftig', 'opgeven', 'b', function (u) { return u.spel.uitslag.soort === 'opgave'; }],
    ['voorVijftig', 'weghalen', 'a', function (u) { return u.spel.fase === 'klaar'; }],
    ['voorVijftig', 'weghalen', 'b', function (u) { return u.spel.fase === 'klaar'; }],
    ['neeOnbekend', 'neem', 'a', function (u) { return u.spel.weet.a === 'nieuw-a---------' && u.spel.weet.b === 'merk-b----------'; }],
    ['neeOnbekend', 'weghalen', 'a', function (u) { return u.spel.weet.a === 'nieuw-a---------'; }],
    ['neeBekend', 'uitdaging', 'a', function (u) { return u.spel.fase === 'uitdaging' && u.vorige.length === 0; }],
    ['neeBekend', 'uitdaging', 'b', function (u) { return u.spel.door === 'b'; }],
    ['neeBekend', 'start', 'a', function (u) { return u.spel.fase === 'potje'; }],
    ['neeBekend', 'start', 'b', function (u) { return u.spel.fase === 'potje'; }],
    ['aAanZet', 'zet', 'a', function (u) { return u.spel.zetten.join() === 'e2e4' && u.spel.bod === null && u.spel.t === NU; }],
    ['aAanZet', 'zetMetBod', 'a', function (u) { return u.spel.zetten.length === 1 && u.spel.bod.door === 'a' && u.spel.bod.ply === 1 && u.spel.bod.t === null; }],
    ['aAanZet', 'opgeven', 'a', function (u) { return u.spel.fase === 'klaar' && u.spel.uitslag.soort === 'opgave' && u.spel.uitslag.door === 'a' && u.spel.weet.a === 'nieuw-a---------'; }],
    ['aAanZet', 'opgeven', 'b', function (u) { return u.spel.uitslag.door === 'b' && u.spel.weet.b === 'nieuw-b---------' && u.spel.weet.a === null && u.spel.bekeken.b === true; }],
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
    ['bodZonderStempel', 'aannemen', 'b', function (u) { return u.spel.fase === 'klaar' && u.spel.uitslag.soort === 'remise' && u.spel.uitslag.door === 'a' && !u.spel.uitslag.vanzelf && u.spel.weet.b === 'nieuw-b---------' &&
      u.spel.weet.a === null && u.spel.bekeken.b === true && u.spel.bekeken.a === false; }],
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
      u.spel.uitslag.door === 'a' && u.spel.uitslag.bodT === NU - 15 * DAG_S && u.spel.weet.a === 'nieuw-a---------' && u.spel.bekeken.a === false; }],
    ['bodVanVeertienDagen', 'zet', 'b', function (u) { return u.spel.bod === null; }],
    ['bodVanVeertienDagen', 'zetMetBod', 'b', function (u) { return u.spel.bod.door === 'b'; }],
    ['bodVanVeertienDagen', 'aannemen', 'b', function (u) { return u.spel.uitslag.soort === 'remise'; }],
    ['bodVanVeertienDagen', 'opgeven', 'a', function (u) { return u.spel.fase === 'klaar'; }],
    ['bodVanVeertienDagen', 'opgeven', 'b', function (u) { return u.spel.fase === 'klaar'; }],
    ['bodVanVeertienDagen', 'weghalen', 'a', function (u) { return u.spel.fase === 'klaar'; }],
    ['bodVanVeertienDagen', 'weghalen', 'b', function (u) { return u.spel.fase === 'klaar'; }],
    ['klaarOnbekend', 'neem', 'b', function (u) { return u.spel.weet.b === 'nieuw-b---------' && u.spel.weet.a === 'merk-a----------' && u.spel.t === NU - DAG_S; }],
    ['klaarOnbekend', 'weghalen', 'b', function (u) { return u.spel.weet.b === 'nieuw-b---------'; }],
    ['klaarOnbekend', 'bekijk', 'b', function (u) { return u.spel.bekeken.b === true && u.spel.t === NU - DAG_S; }],
    ['klaarBekend', 'uitdaging', 'a', function (u) { return u.spel.fase === 'uitdaging' && u.vorige.length === 1 && u.vorige[0].id === 'potjeeen0001' && u.vorige[0].uitslag.soort === 'opgave' &&
      u.vorige[0].weet.a === 'merk-a----------' && u.vorige[0].bekeken.b === false && !('zetten' in u.vorige[0]); }],
    ['klaarBekend', 'uitdaging', 'b', function (u) { return u.spel.door === 'b'; }],
    ['klaarBekend', 'start', 'a', function (u) { return u.spel.fase === 'potje' && u.vorige[0].id === 'potjeeen0001'; }],
    ['klaarBekend', 'start', 'b', function (u) { return u.spel.fase === 'potje'; }],
    ['klaarBekend', 'bekijk', 'b', function (u) { return u.spel.bekeken.b === true; }]
  ];
  const mag = {};
  /* JSON met de sleutels op volgorde: twee staten zijn gelijk als dit gelijk is */
  const vast = function (o) { return JSON.stringify(o, function (k, v) { return v && typeof v === 'object' && !Array.isArray(v) ?
    Object.keys(v).sort().reduce(function (x, n) { x[n] = v[n]; return x; }, {}) : v; }); };
  const K = 'geheimvoordeinhoud-xxxxxxxxxxxxxxxx';
  MAG.forEach(function (r) { mag[r[0] + ' ' + r[1] + ' ' + r[2]] = r[3]; });

  await regel('[V1] de tabel: in elke soort staat past precies wat mag, met wat er dan staat, en al het andere niet; wat past, gaat door de inhoud en komt gelijk terug', async function (check) {
    const fout = [];
    for (const naam in STATEN) for (const soort of SOORTEN) for (const rol of ['a', 'b']) {
      const staat = STATEN[naam], voor = JSON.stringify(staat), r = staatNa(staat, handeling(soort, staat, rol, naam), rol, NU);
      const verwacht = mag[naam + ' ' + soort + ' ' + rol];
      if (JSON.stringify(staat) !== voor) fout.push(naam + ' ' + soort + ' ' + rol + ': de staat zelf veranderde');
      if (verwacht && !(r.past && r.staat.seq === 8 && verwacht(r.staat))) fout.push(naam + ' ' + soort + ' ' + rol + ': ' + JSON.stringify(r).slice(0, 160));
      if (r.past && vast(await blobNaarStaat(K, await staatNaarBlob(K, r.staat))) !== vast(r.staat)) fout.push(naam + ' ' + soort + ' ' + rol + ': komt niet gelijk terug uit de inhoud');
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
      if (['zet', 'zetMetBod', 'bod', 'aannemen', 'vanzelf'].indexOf(soort) >= 0) {
        const later = Object.assign({}, h, { ply: h.ply + 1 });
        if (staatNa(staat, later, rol, NU).past) fout.push(naam + ' ' + soort + ' ' + rol + ' op een andere halve zet');
      }
    }
    check('niets past' + (fout.length ? ': ' + fout.slice(0, 6).join(' | ') : ''), fout.length === 0);
  });

  await regel('[V1] een zet die mat zet, beëindigt het potje met de winst voor wie zette, en het aanbod bij die zet vervalt', async function (check) {
    const mat = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6'], staat = met(spel({ zetten: mat }));
    const r = staatNa(staat, { soort: 'zet', id: 'potjeeen0001', ply: 6, zet: 'h5f7', bod: true, merk: 'nieuw-a---------' }, 'a', NU);
    check('klaar, mat door a, met het merk van a', r.past && r.staat.spel.fase === 'klaar' && r.staat.spel.uitslag.soort === 'mat' &&
      r.staat.spel.uitslag.door === 'a' && r.staat.spel.uitslag.ply === 7 && r.staat.spel.weet.a === 'nieuw-a---------' && r.staat.spel.bod === null &&
      r.staat.spel.bekeken.a === true && r.staat.spel.bekeken.b === false);
    const zet = staatNa(staat, { soort: 'zet', id: 'potjeeen0001', ply: 6, zet: 'h5h8', merk: 'nieuw-a---------' }, 'a', NU);
    check('een zet die niet kan, past niet', !zet.past);
  });

  await regel('[V1] alGedaan: na een geweigerde schrijfactie ziet het apparaat of de staat al heeft wat het wilde', async function (check) {
    const zetGedaan = met(spel({ zetten: ['e2e4'] }));
    check('de zet staat er al', alGedaan(zetGedaan, { soort: 'zet', id: 'potjeeen0001', ply: 0, zet: 'e2e4' }, 'a', 'nieuw-a---------'));
    check('een andere zet op die plek is niet gedaan', !alGedaan(zetGedaan, { soort: 'zet', id: 'potjeeen0001', ply: 0, zet: 'd2d4' }, 'a', 'nieuw-a---------'));
    const opgegeven = met(spel({ fase: 'klaar', uitslag: { soort: 'opgave', door: 'a', ply: 0 }, weet: { a: 'nieuw-a---------', b: null } }));
    check('het eigen einde met het eigen merk', alGedaan(opgegeven, { soort: 'opgeven', id: 'potjeeen0001', ply: 0 }, 'a', 'nieuw-a---------'));
    check('een einde met een ander merk van dit kind is niet dit apparaat', !alGedaan(opgegeven, { soort: 'opgeven', id: 'potjeeen0001', ply: 0 }, 'a', 'ander-a---------'));
    const verder = { v: 2, seq: 9, spel: spel({ id: 'potjevier004', fase: 'uitdaging', door: 'b' }),
      vorige: [{ id: 'potjedrie003', uitslag: { soort: 'opgave', door: 'b', ply: 0 }, weet: { a: 'merk-a----------', b: 'merk-b----------' }, bekeken: { a: true, b: true } },
        { id: 'potjetwee002', weet: { a: 'merk-a----------', b: 'merk-b----------' } }, { id: 'potjeeen0001', weet: { a: 'nieuw-a---------', b: 'merk-b----------' } }] };
    check('ook als er al drie potjes verder gespeeld is: het merk in de lijst vorige', alGedaan(verder, { soort: 'opgeven', id: 'potjeeen0001' }, 'a', 'nieuw-a---------'));
    check('een eigen uitdaging staat er', alGedaan(STATEN.uitdagingVanA, { soort: 'uitdaging', id: 'potjeeen0001' }, 'a', 'nieuw-a---------'));
    check('een intrekking is gedaan als de uitdaging weg is', alGedaan(leeg, { soort: 'intrekken', id: 'potjeeen0001' }, 'a', 'nieuw-a---------'));
    check('maar niet als de vriend hem aannam', !alGedaan(STATEN.aAanZet, { soort: 'intrekken', id: 'potjeeen0001' }, 'a', 'nieuw-a---------'));
    check('een ja is gedaan als het potje loopt', alGedaan(STATEN.aAanZet, { soort: 'ja', id: 'potjeeen0001' }, 'b', 'nieuw-b---------'));
    check('een aanbod staat er', alGedaan(STATEN.bodZonderStempel, { soort: 'bod', id: 'potjeeen0001', ply: 1 }, 'a', 'nieuw-a---------'));
    check('een stempel staat er', alGedaan(STATEN.bodVanEenDag, { soort: 'stempel', id: 'potjeeen0001' }, 'b', 'nieuw-b---------'));
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
    const vol = { v: 2, seq: 7, spel: spel({ zetten: ['e2e4'] }), vorige: [
      { id: 'potjedrie003', uitslag: { soort: 'remise', door: 'a', ply: 10, vanzelf: true, bodT: NU }, weet: { a: 'abcdefghijklmnop', b: 'abcdefghijklmnop' }, bekeken: { a: true, b: true } },
      { id: 'potjetwee002', weet: { a: 'abcdefghijklmnop', b: 'abcdefghijklmnop' } }, { id: 'potjeeen0001', weet: { a: 'abcdefghijklmnop', b: 'abcdefghijklmnop' } }] };
    const volBlob = await staatNaarBlob(k, vol), volTerug = await blobNaarStaat(k, volBlob);
    check('een volle lijst vorige komt terug, en de inhoud is even lang', volBlob.length === blobs[0].length && !!volTerug && volTerug.vorige.length === 3 &&
      volTerug.vorige[0].uitslag.vanzelf === true && !('uitslag' in volTerug.vorige[1]));
    /* het langste potje: vijfhonderd halve zetten, en elk veld zo lang als de inhoud het toelaat */
    const M16 = 'abcdefghijklmnop', langst = Object.assign({}, vol, { seq: 999999999, spel: spel({ fase: 'klaar', zetten: rustig(LANGSTE_POTJE), t: NU,
      weet: { a: M16, b: M16 }, bekeken: { a: true, b: true }, uitslag: { soort: 'remise', door: 'a', ply: LANGSTE_POTJE, vanzelf: true, bodT: NU } }) });
    const langstBlob = await staatNaarBlob(k, langst);
    check('het langste potje met de lijst vol past in de ene lengte en komt gelijk terug', langstBlob.length === blobs[0].length &&
      vast(await blobNaarStaat(k, langstBlob)) === vast(langst));
    const zegel = async function (o) { return b64url(await sealJSON(k, 'paar', vasteLengte(o, POTJE_LENGTE))); };
    const rauw = function (s) { return { v: 2, seq: 3, spel: Object.assign({}, s, { zetten: zettenNaarBus(s.zetten) }), vorige: [] }; };
    check('een lopend potje van vijfhonderd halve zetten is niet te lezen: de vijfhonderdste beëindigt het', (await blobNaarStaat(k, await zegel(rauw(spel({ zetten: rustig(LANGSTE_POTJE) }))))) === null);
    check('meer dan vijfhonderd halve zetten is niet te lezen', (await blobNaarStaat(k, await zegel(rauw(spel({ zetten: rustig(LANGSTE_POTJE + 1) }))))) === null);
    check('een merk van een andere lengte is niet te lezen', (await blobNaarStaat(k, await zegel(rauw(spel({ fase: 'klaar', uitslag: { soort: 'opgave', door: 'a', ply: 0 },
      weet: { a: 'kortmerk', b: null } }))))) === null && (await blobNaarStaat(k, await zegel(rauw(spel({ fase: 'klaar', uitslag: { soort: 'opgave', door: 'a', ply: 0 },
      weet: { a: M16 + 'x', b: null } }))))) === null);
    const zonderId = rauw(spel({}));
    delete zonderId.spel.id;
    check('een potje zonder id of met een id van een andere lengte is niet te lezen', (await blobNaarStaat(k, await zegel(zonderId))) === null &&
      (await blobNaarStaat(k, await zegel(rauw(spel({ id: 'potjeeen00011' }))))) === null &&
      (await blobNaarStaat(k, await zegel({ v: 2, seq: 3, spel: null, vorige: [{ weet: { a: null, b: null }, uitslag: { soort: 'opgave', door: 'a', ply: 0 },
        bekeken: { a: false, b: false } }] }))) === null);
    check('een aanbod buiten een lopend potje of de remise na veertien dagen bij een andere uitslag is niet te lezen',
      (await blobNaarStaat(k, await zegel(rauw(spel({ fase: 'klaar', zetten: ['e2e4'], bod: { door: 'a', ply: 1, t: null }, uitslag: { soort: 'opgave', door: 'b', ply: 1 },
        weet: { a: null, b: M16 } }))))) === null &&
      (await blobNaarStaat(k, await zegel(rauw(spel({ fase: 'klaar', uitslag: { soort: 'opgave', door: 'a', ply: 0, vanzelf: true, bodT: NU }, weet: { a: M16, b: null } }))))) === null);
    const nieuwer = b64url(await sealJSON(k, 'paar', vasteLengte({ v: 3, seq: 1 }, POTJE_LENGTE)));
    check('een nieuwere versie zegt dat ze nieuwer is', JSON.stringify(await blobNaarStaat(k, nieuwer)) === JSON.stringify({ nieuwer: true }));
    const v = await versieVan(blobs[0]);
    check('de versie is de hex van sha256 van de tekst', /^[0-9a-f]{64}$/.test(v) && v === (await sha256hex(blobs[0])) && v !== (await versieVan(blobs[1])));
  });

  await regel('[V1] een opgave rust op de eigen zetten: ze staat ook als de vriend intussen zette, en niet als het kind zelf zette of het potje al klaar is', async function (check) {
    const vriendZette = met(spel({ zetten: ['e2e4', 'e7e5'] }));
    check('a gaf op na één eigen zet; b zette intussen', staatNa(vriendZette, { soort: 'opgeven', id: 'potjeeen0001', eigen: 1, merk: 'nieuw-a---------' }, 'a', NU).past);
    const zelfGezet = met(spel({ zetten: ['e2e4', 'e7e5', 'g1f3'] }));
    check('a zette intussen zelf nog eens: de opgave past niet', !staatNa(zelfGezet, { soort: 'opgeven', id: 'potjeeen0001', eigen: 1, merk: 'nieuw-a---------' }, 'a', NU).past);
    check('een potje dat al klaar is: past niet', !staatNa(STATEN.klaarOnbekend, { soort: 'opgeven', id: 'potjeeen0001', eigen: 1, merk: 'nieuw-a---------' }, 'a', NU).past);
  });

  await regel('[V1] een uitdaging of een begin noemt wat het vervangt; staat er iets anders, dan past het niet', async function (check) {
    check('op een leeg paar met niets', staatNa(leeg, { soort: 'uitdaging', id: 'potjetwee002', wit: 'a', op: null, merk: 'nieuw-a---------' }, 'a', NU).past);
    check('op een leeg paar met een oud potje: past niet', !staatNa(leeg, { soort: 'uitdaging', id: 'potjetwee002', wit: 'a', op: 'potjeeen0001', merk: 'nieuw-a---------' }, 'a', NU).past);
    check('op het afgelopen potje dat er staat', staatNa(STATEN.klaarBekend, { soort: 'start', id: 'potjetwee002', wit: 'a', op: 'potjeeen0001', merk: 'nieuw-a---------' }, 'a', NU).past);
    check('een begin waarvan het antwoord kwijt was, nadat er verder gespeeld is: past niet',
      !staatNa(STATEN.klaarBekend, { soort: 'start', id: 'potjetwee002', wit: 'a', op: null, merk: 'nieuw-a---------' }, 'a', NU).past);
  });

  await regel('[V1] vorige houdt de laatste drie: het nieuwste met uitslag en bekeken, de twee daarvoor met alleen id en merken; bekijken kan het nieuwste', async function (check) {
    let st = STATEN.klaarBekend;
    for (const id of ['potjetwee002', 'potjedrie003', 'potjevier004']) {
      st = staatNa(st, { soort: 'start', id: id, wit: 'a', op: st.spel.id, merk: 'nieuw-a---------' }, 'a', NU).staat;
      st = staatNa(st, { soort: 'opgeven', id: id, eigen: 0, merk: 'nieuw-a---------' }, 'a', NU).staat;
      st = staatNa(st, { soort: 'neem', id: id, merk: 'nieuw-b---------' }, 'b', NU).staat;
    }
    st = staatNa(st, { soort: 'uitdaging', id: 'potjevijf005', wit: 'a', op: 'potjevier004', merk: 'nieuw-a---------' }, 'a', NU).staat;
    check('drie in de lijst, het nieuwste eerst', st.vorige.length === 3 && st.vorige.map(function (x) { return x.id; }).join() === 'potjevier004,potjedrie003,potjetwee002');
    check('het nieuwste met uitslag en bekeken, de andere zonder', !!st.vorige[0].uitslag && !!st.vorige[0].bekeken && !('uitslag' in st.vorige[1]) && !('bekeken' in st.vorige[2]));
    const b = staatNa(st, { soort: 'bekijk', id: 'potjevier004' }, 'b', NU);
    check('b kan het nieuwste bekijken', b.past && b.staat.vorige[0].bekeken.b === true);
    check('niet een ouder potje', !staatNa(st, { soort: 'bekijk', id: 'potjedrie003' }, 'b', NU).past);
    check('het merk van wie opgaf, staat in een ouder potje nog te vinden', alGedaan(st, { soort: 'opgeven', id: 'potjetwee002' }, 'a', 'nieuw-a---------'));
    let nn = staatNa(st, { soort: 'nee', id: 'potjevijf005', merk: 'nieuw-b---------' }, 'b', NU).staat;
    nn = staatNa(nn, { soort: 'neem', id: 'potjevijf005', merk: 'nieuw-a---------' }, 'a', NU).staat;
    nn = staatNa(nn, { soort: 'uitdaging', id: 'potjezes0006', wit: 'b', op: 'potjevijf005', merk: 'nieuw-a---------' }, 'a', NU).staat;
    check('een Nu niet dat vervangen wordt, gaat niet in vorige: het laatste potje blijft voorop', nn.spel.id === 'potjezes0006' &&
      nn.vorige.map(function (x) { return x.id; }).join() === 'potjevier004,potjedrie003,potjetwee002');
  });

  await regel('[V9] een potje tussen vrienden is remise met zijn vijfhonderdste halve zet, geschreven met die zet, voor beide kleuren', async function (check) {
    const z = rustig(LANGSTE_POTJE);
    for (const wit of ['a', 'b']) {
      const zetter = wit === 'a' ? 'b' : 'a', merk = ('nieuw-' + zetter).padEnd(16, '-');
      const r = staatNa(met(spel({ wit: wit, zetten: z.slice(0, LANGSTE_POTJE - 1) })), { soort: 'zet', id: 'potjeeen0001', ply: LANGSTE_POTJE - 1,
        zet: z[LANGSTE_POTJE - 1], bod: true, merk: merk }, zetter, NU);
      check('wit ' + wit + ': klaar, remise omdat het zo lang duurde, met de zet erbij en zonder aanbod', r.past && r.staat.spel.fase === 'klaar' &&
        r.staat.spel.uitslag.soort === 'lang' && r.staat.spel.uitslag.door === zetter && r.staat.spel.uitslag.ply === LANGSTE_POTJE &&
        r.staat.spel.zetten.length === LANGSTE_POTJE && r.staat.spel.bod === null && r.staat.spel.t === NU);
      check('wit ' + wit + ': wie zette, weet het en heeft het bekeken', r.past && r.staat.spel.weet[zetter] === merk && r.staat.spel.weet[wit] === null &&
        r.staat.spel.bekeken[zetter] === true && r.staat.spel.bekeken[wit] === false);
      const ervoor = staatNa(met(spel({ wit: wit, zetten: z.slice(0, LANGSTE_POTJE - 2) })), { soort: 'zet', id: 'potjeeen0001', ply: LANGSTE_POTJE - 2,
        zet: z[LANGSTE_POTJE - 2] }, wit, NU);
      check('wit ' + wit + ': de halve zet ervoor laat het lopen', ervoor.past && ervoor.staat.spel.fase === 'potje');
    }
  });

  await regel('[V1] een handeling die niet goed gevormd is, past niet: een slecht id of een slechte kleur, een einde of Nu niet zonder goed merk, een rol die geen a of b is', async function (check) {
    const goedMerk = 'nieuw-a---------', slecht = [undefined, null, 'kort', goedMerk + 'x', 'nieuw.a---------'];
    check('een uitdaging of begin met een slecht id', ['kort', 'potjeeen00011', undefined, 12].every(function (id) {
      return !staatNa(leeg, { soort: 'uitdaging', id: id, wit: 'a', op: null, merk: goedMerk }, 'a', NU).past &&
        !staatNa(leeg, { soort: 'start', id: id, wit: 'a', op: null, merk: goedMerk }, 'a', NU).past; }));
    check('of een slechte kleur', ['c', undefined, 'w'].every(function (w) {
      return !staatNa(leeg, { soort: 'start', id: 'potjetwee002', wit: w, op: null }, 'a', NU).past; }));
    const mat = met(spel({ zetten: ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6'] }));
    const zonder = [[STATEN.uitdagingVanA, { soort: 'nee', id: 'potjeeen0001' }, 'b'], [STATEN.aAanZet, { soort: 'opgeven', id: 'potjeeen0001', eigen: 0 }, 'a'],
      [STATEN.bodZonderStempel, { soort: 'aannemen', id: 'potjeeen0001', ply: 1 }, 'b'], [STATEN.bodVanVeertienDagen, { soort: 'vanzelf', id: 'potjeeen0001', ply: 1 }, 'a'],
      [STATEN.klaarOnbekend, { soort: 'neem', id: 'potjeeen0001' }, 'b'], [STATEN.aAanZet, { soort: 'weghalen' }, 'a'],
      [mat, { soort: 'zet', id: 'potjeeen0001', ply: 6, zet: 'h5f7' }, 'a']];
    const fout = [];
    zonder.forEach(function (g) { slecht.forEach(function (m) {
      const voor = JSON.stringify(g[0]), r = staatNa(g[0], Object.assign({}, g[1], { merk: m }), g[2], NU);
      if (r.past || !r.waarom || JSON.stringify(g[0]) !== voor) fout.push(g[1].soort + ' met merk ' + m);
    }); });
    check('een einde of Nu niet zonder goed merk' + (fout.length ? ': ' + fout.join(', ') : ''), fout.length === 0);
    check('met een goed merk past elk ervan', zonder.every(function (g) { return staatNa(g[0], Object.assign({}, g[1], { merk: goedMerk.replace('-a', '-' + g[2]) }), g[2], NU).past; }));
    check('een zet die het potje niet beëindigt, heeft geen merk nodig', staatNa(STATEN.aAanZet, { soort: 'zet', id: 'potjeeen0001', ply: 0, zet: 'e2e4' }, 'a', NU).past);
    const rolFout = [];
    for (const naam in STATEN) for (const soort of SOORTEN) for (const rol of ['c', undefined, 'A']) {
      if (staatNa(STATEN[naam], handeling(soort, STATEN[naam], 'a', naam), rol, NU).past) rolFout.push(naam + ' ' + soort + ' ' + rol);
    }
    check('een rol die geen a of b is' + (rolFout.length ? ': ' + rolFout.slice(0, 4).join(', ') : ''), rolFout.length === 0);
  });
}
