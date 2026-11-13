/* Orakel, flowtests voor vriendenpotjes die dagen doorlopen, op één apparaat: wat
   een kind ziet als de vriend er niet is. Een vriendenpotje staat klaar zoals het nu
   bewaard wordt (een kaart van potjes per potje-id, met de kamer en het stoeltje van
   toen); die kamer bestaat niet meer, dus het potje gaat verder via de potjesbussen.
   Elke testnaam begint met zijn regelnummer. De helpers staan in deze functie, omdat
   de app in de flowsuite zijn namen in de globale scope heeft. */

async function orakelFlow6() {
  const DAG = 864e5, UUR = 36e5;
  const verder = function (ms) { zetDatum(new __EchteDate(Date.now() + ms).toISOString()); };
  const tellers = function (x) { return x.get('JSON.stringify([P.c.gamesPlayed, P.c.winsOnline, P.xp, P.wins])'); };

  /* een profiel met een naam en vrienden; wie zetten heeft, heeft een vriendenpotje waarin dit kind
     wit speelt (of zwart), en desgewenst een remise-aanbod van de vriend in de stand van nu */
  const opslagMetVrienden = function (vrienden, extra) {
    const o = maakOpslag(), games = {}, friends = {};
    vrienden.forEach(function (v, i) {
      friends[v.fid] = { k: 'geheimvoorvriendschap-' + v.fid + '-xxxxxxxx', naam: v.naam, t: 1, weg: false, host: true, since: 1794500000000 + i * 1000 };
      if (!v.zetten) return;
      const kleur = v.kleur || 'w';
      games['potjevan' + v.fid] = { gameId: 'potjevan' + v.fid, fid: v.fid, room: 'kamervantoen' + i + 'xx', seat: 'stoelvantoen' + i + 'xx',
        host: true, myColor: kleur, gameNo: 1, moves: v.zetten, peerName: v.naam, result: null,
        offer: v.aanbod ? { by: kleur === 'w' ? 'b' : 'w', ply: v.zetten.length, answer: null } : null, shown: false,
        updated: v.updated || Date.now() - UUR };
    });
    o.setItem('schaakheld1', JSON.stringify({ v: 2, epoch: 0, cnt: {}, set: { badges: {} }, lww: { name: { v: 'Mees', t: 1 } },
      max: { best: 0, goal: {} }, friends, loc: {} }));
    if (Object.keys(games).length) o.setItem('schaakheld-samen', JSON.stringify({ v: 1, games }));
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

  /* ================= vriendenpotjes die dagen doorlopen ================= */

  await nogNiet('[6.9] twee potjes tegen Turbo, een rondje en twee vriendenpotjes: de kaart, één telregel en het blad in de vaste volgorde', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const nu = Date.now();
    const a = await kind(opslagMetVrienden([MET_FIEN_MEES_AAN_ZET, { fid: 'vriendsem01', naam: 'Sem', zetten: ['c2c4'], updated: nu - 2 * DAG }], {
      'schaakheld-potje': turboPotjes({ 1: [['e2e4', 'e7e5'], nu - 2 * UUR], 2: [TWINTIG.slice(0, 8), nu - UUR] }),
      'schaakheld-rondjes': JSON.stringify({ scan: { round: 2, earned: 6 } }) }));
    const v = tekstVan(a, 'verder');
    check('de kaart: het potje waarin het kind aan zet is', /Je potje met Fien/.test(v) && /Fien heeft gezet\. Jij bent aan zet\./.test(v));
    check('de regel onder de kaart', /Je potje met Fien blijft staan, ook als jullie allebei de app dichtdoen\./.test(v));
    check('precies één regel Ook nog, die telt', JSON.stringify(ookNogRegels(a)) === JSON.stringify(['Ook nog 3 potjes en je rondje']));
    tikTekst(a, 'Ook nog');
    await wacht();
    const blad = a.scherm(), plek = ['Je potje met Fien', 'zet 5', 'zet 2', 'Je rondje Speurogen', 'Je potje met Sem'].map(function (t) { return blad.indexOf(t); });
    check('het blad heet Wat nog bezig is', /Wat nog bezig is/.test(blad));
    check('elk ding in de volgorde van de kaart: aan zet, Turbo het laatst gespeeld eerst, het rondje, dan de vriend aan zet', plek.every(function (p) { return p >= 0; }) &&
      plek.every(function (p, i) { return i === 0 || p > plek[i - 1]; }));
    check('de rij van Sem zegt wie aan zet is en sinds wanneer', /Sem is aan zet · 2 dagen geleden/.test(blad));
    tikTekst(a, 'Je potje met Sem');
    await wacht();
    check('een rij opent zijn potje', opSpeelscherm(a) && a.get('session.S.hist.length') === 1);
  });

  await nogNiet('[6.9] één ander ding bezig: de regel noemt het en opent het; niets anders: geen regel', async function (check) {
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

  await nogNiet('[6.9] de telregel noemt de soorten in de vaste volgorde, met "een" bij één en een getal bij meer', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const turbo = turboPotjes({ 2: [['e2e4', 'e7e5'], Date.now() - UUR] });
    const a = await kind(opslagMetVrienden([MET_FIEN_MEES_AAN_ZET], { 'schaakheld-potje': turbo,
      'schaakheld-rondjes': JSON.stringify({ scan: { round: 2, earned: 6 }, koning: { round: 1, earned: 3 } }) }));
    check('een potje en twee rondjes', JSON.stringify(ookNogRegels(a)) === JSON.stringify(['Ook nog een potje en 2 rondjes']));
    const b = await kind(opslagMetVrienden([MET_FIEN_MEES_AAN_ZET, { fid: 'vriendsem01', naam: 'Sem', zetten: ['c2c4'] }], { 'schaakheld-potje': turbo }));
    check('twee potjes', JSON.stringify(ookNogRegels(b)) === JSON.stringify(['Ook nog 2 potjes']));
  });

  await nogNiet('[6.9] acht vriendenpotjes tegelijk is de grens: Uitnodigen zegt waarom, en bij zeven kan het nog', async function (check) {
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

  await nogNiet('[6.5] is de vriend er niet, dan zegt de strook dat het potje doorgaat: op je eigen beurt en na je zet', async function (check) {
    zetDatum('2026-11-14T10:00:00');
    const a = await kind(opslagMetVrienden([MET_FIEN_MEES_AAN_ZET]));
    const voor = tellers(a);
    a.tik('verderKaart');
    await wacht(20000);
    check('de terugknop is Pauze', /‹ Pauze/.test(tekstVan(a, 'backBtn')));
    check('op je eigen beurt', tekstVan(a, 'bubble').indexOf('Fien is er nu niet. Doe gerust je zet: Fien ziet hem bij het openen van SchaakHeld.') >= 0);
    zet(a, 'g1f3');
    await wacht(5000);
    check('na je zet', tekstVan(a, 'bubble').indexOf('Fien is er nu niet. Je zet is bewaard: Fien ziet hem bij het openen van SchaakHeld.') >= 0);
    check('✔ bewaard in de balk', zichtbaar(a, 'bewaard') && /✔ bewaard/.test(tekstVan(a, 'bewaard')));
    check('geen einde en geen teller veranderd', !a.get('session.over') && !/gestopt|telt voor niemand/.test(a.scherm()) && tellers(a) === voor);
  });

  await nogNiet('[6.6] wie remise aanbiedt, leest de laatste dag om te antwoorden, en de balk houdt het aanbod vast, ook na herladen', async function (check) {
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
    verder(DAG);
    a = herlaad(a);
    thuisVenstersWeg(a);
    await wacht(20000);
    a.tik('verderKaart');
    await wacht();
    check('een dag later staat het aanbod er nog', /½ aangeboden/.test(tekstVan(a, 'verschil')));
  });

  await nogNiet('[6.6] een aanbod van de vriend: geen regel onder de kaart, de strook zegt hoe je antwoordt, Remise aannemen onder het bord, geen Nee; je zet wijst het af', async function (check) {
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

  await nogNiet('[6.8] een vriend met een lopend potje weghalen: eerst de vraag, en Nee, laat staan houdt alles', async function (check) {
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

  await nogNiet('[6.4] wie uitnodigt en niet wil wachten, maakt er een uitdaging voor later van: het venster, de kaart en de rij zeggen het', async function (check) {
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
    check('de uitdaging staat in de eigen potjesbus', Object.keys(__server.potjes).length === potjes + 1);
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

  await nogNiet('[6.4] wie een uitdaging intrekt, hoort het met een toast, en de rij en de kaart zijn weer als eerst', async function (check) {
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
}
