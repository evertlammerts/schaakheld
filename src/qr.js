/* ---------- QR-encoder ----------
   Byte-mode, foutcorrectie M, versie 1-6 (max 106 bytes payload): genoeg
   voor de koppel-URL. Zelf geschreven omdat het artifact achter een
   strikte CSP draait: geen externe libraries. qrMatrix(text) geeft een
   vierkante 0/1-matrix, qrSvg(text) een kant-en-klare SVG-string.
   Indeling volgens ISO 18004; geverifieerd door round-trip-decoderen. */

const QR = (() => {
  /* datacodewoorden en foutcorrectie-opbouw per versie, niveau M:
     [datacodewoorden totaal, ec-codewoorden per blok, aantal blokken] */
  const VERSIONS = [
    null,
    [16, 10, 1], [28, 16, 1], [44, 26, 1],
    [64, 18, 2], [86, 24, 2], [108, 16, 4]
  ];
  const ALIGN = [null, null, 18, 22, 26, 30, 34]; /* centrum tweede patroon */

  /* GF(256) met polynoom 0x11d */
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const gmul = (a, b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;

  function rsRemainder(data, ecLen) {
    /* generatorpolynoom (x-a^0)(x-a^1)...(x-a^(ecLen-1)) */
    let gen = [1];
    for (let i = 0; i < ecLen; i++) {
      const next = new Array(gen.length + 1).fill(0);
      for (let j = 0; j < gen.length; j++) {
        next[j] ^= gmul(gen[j], EXP[i]);
        next[j + 1] ^= gen[j];
      }
      gen = next;
    }
    gen.reverse(); /* hoogste graad eerst */
    const rem = new Uint8Array(ecLen);
    for (const d of data) {
      const f = d ^ rem[0];
      rem.copyWithin(0, 1);
      rem[ecLen - 1] = 0;
      if (f) for (let j = 0; j < ecLen; j++) rem[j] ^= gmul(gen[j + 1], f);
    }
    return rem;
  }

  function utf8(s) {
    const out = [];
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | c >> 6, 0x80 | c & 63);
      else if (c < 0x10000) out.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
      else out.push(0xf0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    }
    return out;
  }

  function codewords(bytes, version) {
    const [dataLen, ecLen, blocks] = VERSIONS[version];
    /* bitstream: mode 0100, lengte (8 bits), data, terminator, padding */
    const bits = [];
    const push = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push(v >> i & 1); };
    push(4, 4);
    push(bytes.length, 8);
    for (const b of bytes) push(b, 8);
    push(0, Math.min(4, dataLen * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = b << 1 | bits[i + j];
      data.push(b);
    }
    for (let p = 0xec; data.length < dataLen; p ^= 0xfd) data.push(p);
    /* blokken (bij versie 4-6 gelijke groottes), dan interleaven */
    const per = dataLen / blocks;
    const dblocks = [], eblocks = [];
    for (let b = 0; b < blocks; b++) {
      const d = data.slice(b * per, (b + 1) * per);
      dblocks.push(d);
      eblocks.push(rsRemainder(d, ecLen));
    }
    const out = [];
    for (let i = 0; i < per; i++) for (const d of dblocks) out.push(d[i]);
    for (let i = 0; i < ecLen; i++) for (const e of eblocks) out.push(e[i]);
    return out;
  }

  function bch15(data5) {
    /* 15-bits formaatinfo: 5 databits + 10 BCH-bits, daarna de vaste mask */
    let v = data5 << 10;
    for (let i = 14; i >= 10; i--) if (v >> i & 1) v ^= 0x537 << (i - 10);
    return ((data5 << 10) | v) ^ 0x5412;
  }

  function qrMatrix(text) {
    const bytes = utf8(text);
    let version = 0;
    for (let v = 1; v < VERSIONS.length; v++) {
      if (bytes.length <= VERSIONS[v][0] - 2) { version = v; break; }
    }
    if (!version) throw new Error('te lang voor QR v6: ' + bytes.length + ' bytes');
    const size = 17 + 4 * version;
    const m = [], fn = []; /* module-waarden en functie-gebied-vlaggen */
    for (let r = 0; r < size; r++) { m.push(new Array(size).fill(0)); fn.push(new Array(size).fill(false)); }
    const set = (r, c, v) => { m[r][c] = v ? 1 : 0; fn[r][c] = true; };

    /* zoekpatronen plus separators */
    const finder = (r0, c0) => {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const rr = r0 + r, cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const on = r >= 0 && r <= 6 && c >= 0 && c <= 6 &&
          (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        set(rr, cc, on);
      }
    };
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

    /* timingpatronen */
    for (let i = 8; i < size - 8; i++) {
      if (!fn[6][i]) set(6, i, i % 2 === 0);
      if (!fn[i][6]) set(i, 6, i % 2 === 0);
    }

    /* uitlijnpatroon (versie 2-6: alleen rechtsonder) */
    if (ALIGN[version]) {
      const a = ALIGN[version];
      for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
        set(a + r, a + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
      }
    }

    /* donkere module en gereserveerde formaatgebieden */
    set(size - 8, 8, 1);
    for (let i = 0; i < 9; i++) {
      if (!fn[8][i]) set(8, i, 0);
      if (!fn[i][8]) set(i, 8, 0);
    }
    for (let i = 0; i < 8; i++) {
      if (!fn[8][size - 1 - i]) set(8, size - 1 - i, 0);
      if (!fn[size - 1 - i][8]) set(size - 1 - i, 8, 0);
    }

    /* datamodules in zigzag van rechtsonder naar linksboven */
    const cw = codewords(bytes, version);
    const dataPos = []; /* volgorde van (r,c) zodat maskeren makkelijk is */
    let up = true;
    for (let right = size - 1; right > 0; right -= 2) {
      if (right === 6) right--;
      for (let i = 0; i < size; i++) {
        const r = up ? size - 1 - i : i;
        for (const c of [right, right - 1]) {
          if (!fn[r][c]) dataPos.push([r, c]);
        }
      }
      up = !up;
    }
    dataPos.forEach(([r, c], i) => {
      m[r][c] = i < cw.length * 8 ? (cw[i >> 3] >> (7 - (i & 7))) & 1 : 0;
    });

    /* alle acht masks proberen, laagste strafscore wint */
    const MASKS = [
      (r, c) => (r + c) % 2 === 0,
      (r, c) => r % 2 === 0,
      (r, c) => c % 3 === 0,
      (r, c) => (r + c) % 3 === 0,
      (r, c) => ((r >> 1) + Math.floor(c / 3)) % 2 === 0,
      (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
      (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
      (r, c) => (((r + c) % 2) + (r * c) % 3) % 2 === 0
    ];
    const penalty = () => {
      let p = 0;
      /* regel 1: reeksen van 5+ gelijke modules */
      for (let pass = 0; pass < 2; pass++) {
        for (let r = 0; r < size; r++) {
          let run = 1;
          for (let c = 1; c <= size; c++) {
            const cur = c < size ? (pass ? m[c][r] : m[r][c]) : -1;
            const prev = pass ? m[c - 1][r] : m[r][c - 1];
            if (cur === prev) run++;
            else { if (run >= 5) p += run - 2; run = 1; }
          }
        }
      }
      /* regel 2: 2x2-blokken */
      for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
        if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) p += 3;
      }
      /* regel 3: zoekpatroon-achtige reeks 1011101 met 4 wit ervoor of erna */
      const pat = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], tap = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
      for (let r = 0; r < size; r++) for (let c = 0; c <= size - 11; c++) {
        let a = true, b = true, ta = true, tb = true;
        for (let i = 0; i < 11; i++) {
          if (m[r][c + i] !== pat[i]) a = false;
          if (m[r][c + i] !== tap[i]) b = false;
          if (m[c + i] === undefined || m[c + i][r] !== pat[i]) ta = false;
          if (m[c + i] === undefined || m[c + i][r] !== tap[i]) tb = false;
        }
        if (a || b) p += 40;
        if (ta || tb) p += 40;
      }
      /* regel 4: donker-aandeel ver van 50% */
      let dark = 0;
      for (const row of m) for (const v of row) dark += v;
      p += Math.floor(Math.abs(dark * 100 / (size * size) - 50) / 5) * 10;
      return p;
    };
    const writeFormat = mask => {
      /* ISO 18004 figuur 25: het meest significante bit staat op (8,0);
         de tweede kopie loopt via de rand rechtsonder */
      const f = bch15(mask); /* niveau M = 00, dus alleen de maskbits */
      const bit = i => f >> (14 - i) & 1;
      for (let i = 0; i <= 5; i++) m[8][i] = bit(i);
      m[8][7] = bit(6); m[8][8] = bit(7); m[7][8] = bit(8);
      for (let i = 9; i <= 14; i++) m[14 - i][8] = bit(i);
      for (let i = 0; i <= 6; i++) m[size - 1 - i][8] = bit(i);
      for (let i = 7; i <= 14; i++) m[8][size - 15 + i] = bit(i);
      m[size - 8][8] = 1; /* de donkere module blijft altijd donker */
    };
    let best = -1, bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      for (const [r, c] of dataPos) if (MASKS[mask](r, c)) m[r][c] ^= 1;
      writeFormat(mask);
      const score = penalty();
      if (score < bestScore) { bestScore = score; best = mask; }
      for (const [r, c] of dataPos) if (MASKS[mask](r, c)) m[r][c] ^= 1;
    }
    for (const [r, c] of dataPos) if (MASKS[best](r, c)) m[r][c] ^= 1;
    writeFormat(best);
    return m;
  }

  function qrSvg(text) {
    const m = qrMatrix(text);
    const n = m.length, q = 4; /* stille zone van 4 modules */
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (m[r][c]) d += 'M' + (c + q) + ' ' + (r + q) + 'h1v1h-1z';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (n + 2 * q) + ' ' + (n + 2 * q) +
      '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/>' +
      '<path d="' + d + '" fill="#000"/></svg>';
  }

  return { qrMatrix, qrSvg, _cw: codewords, _utf8: utf8 };
})();
