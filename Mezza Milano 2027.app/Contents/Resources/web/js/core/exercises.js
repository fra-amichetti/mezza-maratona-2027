/* Disegni (figure stilizzate in SVG) e istruzioni per gli esercizi di forza.
   Ogni posa è descritta da angoli articolari (in gradi, 0 = verso il basso, positivo = in avanti/destra)
   e trasformata in punti con una piccola cinematica diretta: così le proporzioni restano coerenti.
   Il busto usa 0 = verticale verso l'alto, positivo = inclinato in avanti. */
var MM = globalThis.MM || (globalThis.MM = {});

MM.exercises = (function () {
  const L = { torso: 42, thigh: 32, shin: 30, ua: 22, fa: 20, foot: 12, head: 13 };
  const GROUND = 149, PANEL = 160;
  const rad = d => d * Math.PI / 180;
  const add = (p, len, ang) => [p[0] + len * Math.sin(rad(ang)), p[1] + len * Math.cos(rad(ang))];
  const footPt = (an, ang) => [an[0] + L.foot * Math.cos(rad(ang)), an[1] + L.foot * Math.sin(rad(ang))];

  // Posa -> punti. a = angoli { torso, thigh, shin, foot, ua, fa, thigh2, shin2, foot2, ua2, fa2 }
  function solve(pose) {
    const a = Object.assign({ torso: 0, thigh: 0, shin: 0, foot: 25, ua: 0, fa: 0 }, pose.a || {});
    let hip = (pose.hip || [80, 0]).slice();
    const build = h => {
      const P = { hip: h };
      const up = [Math.sin(rad(a.torso)), -Math.cos(rad(a.torso))];
      P.sh = [h[0] + L.torso * up[0], h[1] + L.torso * up[1]];
      P.head = [P.sh[0] + L.head * up[0], P.sh[1] + L.head * up[1]];
      P.kn = add(h, L.thigh, a.thigh); P.an = add(P.kn, L.shin, a.shin); P.to = footPt(P.an, a.foot);
      P.el = add(P.sh, L.ua, a.ua); P.ha = add(P.el, L.fa, a.fa);
      if (a.thigh2 != null) {
        P.kn2 = add(h, L.thigh, a.thigh2); P.an2 = add(P.kn2, L.shin, a.shin2 != null ? a.shin2 : a.thigh2);
        P.to2 = footPt(P.an2, a.foot2 != null ? a.foot2 : 25);
      }
      if (a.ua2 != null) { P.el2 = add(P.sh, L.ua, a.ua2); P.ha2 = add(P.el2, L.fa, a.fa2 != null ? a.fa2 : a.ua2); }
      return P;
    };
    let P = build(hip);
    if (pose.ground) {
      // appoggia il piede della gamba principale a terra (o sul gradino)
      const g = pose.groundY || GROUND;
      const low = Math.max(P.an[1], P.to[1]);
      hip = [hip[0], hip[1] + (g - low) - (pose.lift || 0)];
      P = build(hip);
    }
    return Object.assign(P, pose.pts || {});
  }

  // ---- Disegno -----------------------------------------------------------------------
  const f = n => Math.round(n * 10) / 10;
  const line = (pts, cls) => '<polyline class="' + cls + '" points="' + pts.filter(Boolean).map(p => f(p[0]) + ',' + f(p[1])).join(' ') + '"/>';

  function figure(P) {
    let s = '';
    if (P.kn2) s += line([P.hip2 || P.hip, P.kn2, P.an2, P.to2], 'lb');
    if (P.el2) s += line([P.sh2 || P.sh, P.el2, P.ha2], 'lb');
    if (P.sh2 && P.hip2) {
      const ms = [(P.sh[0] + P.sh2[0]) / 2, (P.sh[1] + P.sh2[1]) / 2], mh = [(P.hip[0] + P.hip2[0]) / 2, (P.hip[1] + P.hip2[1]) / 2];
      s += line([P.sh, P.sh2], 'lf') + line([P.hip, P.hip2], 'lf') + line([ms, mh], 'lt');
    } else s += line([P.sh, P.hip], 'lt');
    s += line([P.hip, P.kn, P.an, P.to], 'lf');
    s += line([P.sh, P.el, P.ha], 'lf');
    s += '<circle class="hd" cx="' + f(P.head[0]) + '" cy="' + f(P.head[1]) + '" r="8"/>';
    return s;
  }

  function prop(p) {
    switch (p.t) {
      case 'db': { // manubrio
        const [x, y] = p.at, v = p.dir === 'v';
        const h = v ? '<line class="eq" x1="' + f(x) + '" y1="' + f(y - 7) + '" x2="' + f(x) + '" y2="' + f(y + 7) + '"/>'
          : '<line class="eq" x1="' + f(x - 7) + '" y1="' + f(y) + '" x2="' + f(x + 7) + '" y2="' + f(y) + '"/>';
        const plate = (cx, cy) => '<rect class="eqf" x="' + f(cx - (v ? 6 : 3)) + '" y="' + f(cy - (v ? 3 : 6)) + '" width="' + (v ? 12 : 6) + '" height="' + (v ? 6 : 12) + '" rx="2"/>';
        return h + (v ? plate(x, y - 8) + plate(x, y + 8) : plate(x - 8, y) + plate(x + 8, y));
      }
      case 'box': return '<rect class="box" x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + (p.h || GROUND - p.y) + '" rx="3"/>';
      case 'post': return '<rect class="box" x="' + p.x + '" y="' + (p.y || 30) + '" width="6" height="' + (GROUND - (p.y || 30)) + '" rx="2"/>';
      case 'band': return '<polyline class="band" points="' + p.pts.map(q => f(q[0]) + ',' + f(q[1])).join(' ') + '"/>';
      case 'arrow': {
        const [x1, y1] = p.from, [x2, y2] = p.to;
        const ang = Math.atan2(y2 - y1, x2 - x1), k = 6;
        const a1 = [x2 - k * Math.cos(ang - 0.5), y2 - k * Math.sin(ang - 0.5)], a2 = [x2 - k * Math.cos(ang + 0.5), y2 - k * Math.sin(ang + 0.5)];
        return '<line class="ar" x1="' + f(x1) + '" y1="' + f(y1) + '" x2="' + f(x2) + '" y2="' + f(y2) + '"/>' +
          '<polyline class="ar" points="' + f(a1[0]) + ',' + f(a1[1]) + ' ' + f(x2) + ',' + f(y2) + ' ' + f(a2[0]) + ',' + f(a2[1]) + '"/>';
      }
      default: return '';
    }
  }

  // ---- Pose degli esercizi -------------------------------------------------------------------
  const stand = { torso: 0, thigh: 0, shin: 0, foot: 25, ua: 0, fa: 0 };
  const S = o => Object.assign({}, stand, o);

  const EX = {
    // ---------------- Seduta A ----------------
    squat: {
      phases: [
        { label: 'Inizio', pose: { hip: [78, 0], ground: true, a: S({}) }, props: () => [] },
        { label: 'Fine', pose: { hip: [60, 0], ground: true, a: { torso: 30, thigh: 75, shin: -25, foot: 25, ua: 85, fa: 85 } },
          props: () => [{ t: 'arrow', from: [26, 70], to: [26, 110] }] }
      ],
      cues: ['Piedi poco più larghi delle spalle, punte leggermente in fuori.', 'Scendi in 3" portando le anche indietro e in basso, braccia avanti per equilibrio.',
        'Petto alto, talloni sempre a terra, ginocchia in linea con le punte.', 'Risali spingendo dai talloni. Per renderlo più duro: pausa di 1" in basso.'],
      why: 'Quadricipiti e glutei forti proteggono le ginocchia nelle discese e nel finale di gara.'
    },
    lunge: {
      phases: [
        { label: 'Inizio', pose: { hip: [86, 0], ground: true, a: S({ thigh2: 0, shin2: 0, foot2: 25 }) }, props: () => [] },
        { label: 'Fine', pose: { hip: [61, 0], ground: true, a: { torso: 5, thigh: 70, shin: -10, foot: 25, ua: 0, fa: 0, thigh2: -20, shin2: -70, foot2: 30 } },
          props: () => [{ t: 'arrow', from: [128, 66], to: [128, 98] }] }
      ],
      cues: ['In piedi, fai un passo lungo all\'indietro con una gamba.', 'Scendi in verticale finché il ginocchio dietro sfiora il pavimento.',
        'Ginocchio davanti sopra al piede, busto dritto.', 'Torna su spingendo col tallone della gamba davanti; alterna o fai tutte le ripetizioni per lato.'],
      why: 'L\'affondo indietro carica meno il ginocchio di quello in avanti e allena una gamba alla volta, come la corsa.'
    },
    bridge: {
      phases: [
        { label: 'Inizio', pose: { hip: [90, 136], a: { torso: -90, thigh: 131, shin: 10, foot: 25, ua: 92, fa: 92 } }, props: () => [] },
        { label: 'Fine', pose: { hip: [92, 120], a: { torso: -114, thigh: 100, shin: 5, foot: 25, ua: 96, fa: 92 } },
          props: () => [{ t: 'arrow', from: [92, 104], to: [92, 86] }] }
      ],
      cues: ['A pancia in su, ginocchia piegate, piedi a terra vicino al sedere.', 'Spingi coi talloni e solleva il bacino finché spalle, anche e ginocchia sono in linea.',
        'Stringi i glutei 2" in alto, senza inarcare la schiena.', 'Scendi lento. Più duro: piedi su una sedia o versione a una gamba.'],
      why: 'Il gluteo stabilizza il bacino a ogni appoggio e scarica ginocchia e tibie.'
    },
    calfsingle: {
      phases: [
        { label: 'Inizio (tallone giù)', pose: { hip: [86, 0], ground: true, groundY: 138, a: S({ foot: -30, ua: 72, fa: 88, thigh2: -5, shin2: -60, foot2: 40 }) },
          props: () => [{ t: 'box', x: 92, y: 138, w: 34 }, { t: 'post', x: 130 }] },
        { label: 'Fine (sulle punte)', pose: { hip: [86, 0], ground: true, groundY: 138, a: S({ foot: 60, ua: 72, fa: 88, thigh2: -5, shin2: -60, foot2: 40 }) },
          props: () => [{ t: 'box', x: 92, y: 138, w: 34 }, { t: 'post', x: 130 }, { t: 'arrow', from: [60, 118], to: [60, 96] }] }
      ],
      cues: ['Avampiede sul bordo di un gradino, una mano al muro solo per l\'equilibrio.', 'Lascia scendere il tallone sotto il livello del gradino.',
        'Sali più in alto che puoi sulla punta, ginocchio disteso, tieni 1".', 'Scendi in 3". Fai tutte le ripetizioni e poi cambia gamba.'],
      why: 'Polpaccio forte = meno carico sulla tibia: è la prima difesa contro la periostite.'
    },
    calfbent: {
      phases: [
        { label: 'Inizio', pose: { hip: [70, 0], ground: true, a: { torso: 10, thigh: 25, shin: -25, foot: 25, ua: 70, fa: 82 } },
          props: () => [{ t: 'post', x: 132 }] },
        { label: 'Fine', pose: { hip: [70, 0], ground: true, a: { torso: 10, thigh: 25, shin: -25, foot: 62, ua: 70, fa: 82 } },
          props: () => [{ t: 'post', x: 132 }, { t: 'arrow', from: [40, 128], to: [40, 106] }] }
      ],
      cues: ['Mani al muro, ginocchia piegate a circa 30–40° (mezzo accosciato).', 'Tieni le ginocchia piegate per tutto il movimento.',
        'Sali sulle punte, 1" in alto, scendi lento.', 'Quando diventa facile, fallo su una gamba sola.'],
      why: 'A ginocchio piegato lavora il soleo, il muscolo che assorbe di più nella corsa lenta e lunga e che sostiene la tibia.'
    },
    tibraise: {
      phases: [
        { label: 'Inizio', pose: { hip: [31, 0], ground: true, a: { torso: -12, thigh: 15, shin: 15, foot: 25, ua: -5, fa: -5 } },
          props: () => [{ t: 'post', x: 6 }] },
        { label: 'Fine', pose: { hip: [31, 0], ground: true, a: { torso: -12, thigh: 15, shin: 15, foot: -25, ua: -5, fa: -5 } },
          props: () => [{ t: 'post', x: 6 }, { t: 'arrow', from: [76, 140], to: [76, 118] }] }
      ],
      cues: ['Schiena appoggiata al muro, talloni a circa 30 cm dal muro, gambe tese.', 'Solleva le punte dei piedi più che puoi, tenendo i talloni a terra.',
        'Tieni 1" in alto e riabbassa lentamente senza far "sbattere" i piedi.', 'Deve bruciare davanti alla tibia: è normale. Più vicino al muro = più facile.'],
      why: 'Rinforza il tibiale anteriore, il muscolo lungo la tibia che si infiamma nella periostite.'
    },
    plank: {
      phases: [
        { label: 'Posizione', pose: { hip: [92, 126], a: { torso: -86, thigh: 78, shin: 78, foot: 60, ua: 0, fa: 90 } }, props: () => [] }
      ],
      cues: ['Avambracci a terra, gomiti sotto le spalle.', 'Corpo in linea da testa a talloni: né sedere alto né pancia che cade.',
        'Addome e glutei contratti, respira normalmente.', 'Tieni 30–45"; se perdi la posizione, fermati.'],
      why: 'Un busto stabile mantiene la postura quando arriva la fatica.'
    },
    deadbug: {
      phases: [
        { label: 'Inizio', pose: { hip: [90, 140], a: { torso: -90, thigh: 180, shin: 90, foot: -90, ua: 180, fa: 180, thigh2: 180, shin2: 90, foot2: -90, ua2: 180, fa2: 180 } }, props: () => [] },
        { label: 'Fine', pose: { hip: [90, 140], a: { torso: -90, thigh: 100, shin: 100, foot: 10, ua: 180, fa: 180, thigh2: 180, shin2: 90, foot2: -90, ua2: -98, fa2: -98 } },
          props: () => [{ t: 'arrow', from: [126, 106], to: [142, 116] }, { t: 'arrow', from: [30, 110], to: [14, 122] }] }
      ],
      cues: ['Sdraiato a pancia in su, braccia verso il soffitto, ginocchia a 90° sopra le anche.', 'Zona lombare sempre schiacciata a terra.',
        'Espirando allunga braccio e gamba opposti senza toccare terra.', 'Torna al centro lentamente e alterna i lati.'],
      why: 'Insegna al core a stabilizzare il bacino mentre braccia e gambe si muovono, come in corsa.'
    },
    // ---------------- Seduta B ----------------
    wallsit: {
      phases: [
        { label: 'Posizione', pose: { hip: [22, 0], ground: true, a: { torso: 0, thigh: 90, shin: 0, foot: 25, ua: 30, fa: 70 } },
          props: () => [{ t: 'post', x: 6 }] }
      ],
      cues: ['Schiena appoggiata al muro, scivola giù finché le cosce sono quasi parallele al pavimento.', 'Tibie verticali: ginocchia sopra le caviglie, non oltre le punte.',
        'Peso sui talloni, respira normalmente.', 'Tieni 30–45". Se le ginocchia danno fastidio, sali un po\' (angolo meno chiuso).'],
      why: 'Isometria che rinforza quadricipite e tendine rotuleo senza impatti: utile per le ginocchia.'
    },
    bulgarian: {
      phases: [
        { label: 'Inizio', pose: { hip: [74, 0], ground: true, a: { torso: 5, thigh: 5, shin: -2, foot: 25, ua: 0, fa: 0, thigh2: -35, shin2: -80, foot2: 170 } },
          props: () => [{ t: 'box', x: 4, y: 117, w: 36 }] },
        { label: 'Fine', pose: { hip: [54, 0], ground: true, a: { torso: 15, thigh: 70, shin: -15, foot: 25, ua: 0, fa: 0, thigh2: -10, shin2: -136, foot2: 170 } },
          props: () => [{ t: 'box', x: 4, y: 117, w: 36 }, { t: 'arrow', from: [128, 70], to: [128, 100] }] }
      ],
      cues: ['Collo del piede dietro appoggiato su una sedia, piede davanti a un passo lungo di distanza.', 'Scendi in verticale finché la coscia davanti è quasi parallela al pavimento.',
        'Ginocchio davanti sopra al piede, busto leggermente in avanti.', 'Risali spingendo col piede davanti; fai tutte le ripetizioni e poi cambia gamba.'],
      why: 'Lavora una gamba alla volta, come la corsa, e corregge le differenze tra destra e sinistra.'
    },
    sldl: {
      phases: [
        { label: 'Inizio', pose: { hip: [80, 0], ground: true, a: { torso: 0, thigh: 0, shin: 0, foot: 25, ua: 0, fa: 0, thigh2: -6, shin2: -30, foot2: 60 } }, props: () => [] },
        { label: 'Fine', pose: { hip: [70, 0], ground: true, a: { torso: 82, thigh: 15, shin: -5, foot: 25, ua: 0, fa: 0, thigh2: -84, shin2: -84, foot2: 100 } },
          props: () => [{ t: 'arrow', from: [46, 58], to: [30, 66] }] }
      ],
      cues: ['In piedi su una gamba, ginocchio d\'appoggio leggermente flesso.', 'Porta il busto avanti mentre l\'altra gamba si allunga indietro, in linea con la schiena.',
        'Bacino parallelo al pavimento: l\'anca della gamba sollevata non deve aprirsi.', 'Scendi finché senti il femorale; appoggia una mano al muro se perdi l\'equilibrio.'],
      why: 'Forza ed equilibrio su una gamba: bacino più stabile e caviglia più reattiva a ogni appoggio.'
    },
    slbridge: {
      phases: [
        { label: 'Inizio', pose: { hip: [90, 136], a: { torso: -90, thigh: 131, shin: 10, foot: 25, ua: 92, fa: 92, thigh2: 120, shin2: 120, foot2: 0 } }, props: () => [] },
        { label: 'Fine', pose: { hip: [92, 120], a: { torso: -114, thigh: 100, shin: 5, foot: 25, ua: 96, fa: 92, thigh2: 100, shin2: 100, foot2: 10 } },
          props: () => [{ t: 'arrow', from: [92, 104], to: [92, 86] }] }
      ],
      cues: ['A pancia in su, un piede a terra vicino al sedere, l\'altra gamba distesa.', 'Spingi col tallone a terra e solleva il bacino finché è in linea con spalle e ginocchio.',
        'Il bacino resta orizzontale: non deve cadere dal lato della gamba sollevata.', 'Tieni 1–2" in alto e scendi lento.'],
      why: 'Gluteo e femorale di una gamba sola, come nell\'appoggio della corsa.'
    },
    abduction: {
      phases: [
        { label: 'Inizio', pose: { pts: { head: [22, 134], sh: [38, 138], hip: [86, 138], kn: [116, 136], an: [146, 135], to: [152, 130],
          kn2: [116, 143], an2: [146, 144], to2: [152, 140], el: [56, 146], ha: [72, 146], el2: [26, 146], ha2: [12, 136] } }, props: () => [] },
        { label: 'Fine', pose: { pts: { head: [22, 134], sh: [38, 138], hip: [86, 138], kn: [114, 124], an: [141, 110], to: [146, 104],
          kn2: [116, 143], an2: [146, 144], to2: [152, 140], el: [56, 146], ha: [72, 146], el2: [26, 146], ha2: [12, 136] } },
          props: () => [{ t: 'arrow', from: [150, 124], to: [150, 98] }] }
      ],
      cues: ['Sdraiato sul fianco, gamba sotto leggermente piegata, testa appoggiata sul braccio.', 'Gamba sopra tesa, punta del piede rivolta in avanti (non verso il soffitto).',
        'Sollevala di 30–40 cm portandola leggermente indietro, senza ruotare il bacino.', 'Scendi lento. Deve lavorare il fianco (medio gluteo), non la coscia davanti.'],
      why: 'Il medio gluteo impedisce al ginocchio di "cadere" verso l\'interno: meno stress su ginocchio e tibia.'
    },
    calfecc: {
      phases: [
        { label: 'In alto (2 piedi)', pose: { hip: [86, 0], ground: true, groundY: 138, a: S({ foot: 60 }) },
          props: () => [{ t: 'box', x: 92, y: 138, w: 60 }] },
        { label: 'Discesa (1 piede)', pose: { hip: [86, 0], ground: true, groundY: 138, a: S({ foot: -30, thigh2: -5, shin2: -60, foot2: 40 }) },
          props: () => [{ t: 'box', x: 92, y: 138, w: 60 }, { t: 'arrow', from: [62, 112], to: [62, 136] }] }
      ],
      cues: ['Avampiedi sul bordo di un gradino, talloni fuori.', 'Sali sulle punte con entrambi i piedi.',
        'Sposta il peso su una gamba e scendi lentamente (3–4") con il tallone sotto il livello del gradino.', 'Risali con due piedi e ripeti; poi cambia gamba.'],
      why: 'La fase eccentrica rinforza polpaccio e tendine d\'Achille ed è tra le prevenzioni più efficaci per la parte bassa della gamba.'
    },
    heelwalk: {
      phases: [
        { label: 'Passo', pose: { hip: [74, 0], ground: true, a: { torso: 3, thigh: 15, shin: 8, foot: -30, thigh2: -12, shin2: -12, foot2: -30, ua: -15, fa: -10, ua2: 15, fa2: 30 } }, props: () => [] },
        { label: 'Passo', pose: { hip: [74, 0], ground: true, a: { torso: 3, thigh: -12, shin: -12, foot: -30, thigh2: 15, shin2: 8, foot2: -30, ua: 15, fa: 30, ua2: -15, fa2: -10 } },
          props: () => [{ t: 'arrow', from: [100, 20], to: [130, 20] }] }
      ],
      cues: ['Cammina appoggiando solo i talloni, punte dei piedi sollevate verso l\'alto.', 'Passi corti, busto dritto, ginocchia quasi tese.',
        'Senti lavorare la parte davanti della tibia.', '20 m, poi torna camminando normalmente. Scalzo o con scarpe leggere.'],
      why: 'Altro esercizio per il tibiale anteriore, il muscolo coinvolto nella periostite tibiale.'
    },
    balance: {
      phases: [
        { label: 'Posizione', pose: { hip: [80, 0], ground: true, a: { torso: 0, thigh: 0, shin: 0, foot: 25, thigh2: 70, shin2: -20, foot2: 10, ua: 30, fa: 30, ua2: -30, fa2: -30 } }, props: () => [] }
      ],
      cues: ['In piedi su una gamba, scalzo, ginocchio d\'appoggio leggermente flesso.', 'Tieni il bacino orizzontale e il piede ben "aperto" a terra (alluce spinto giù).',
        '30" per lato. Più difficile: occhi chiusi, o su un cuscino.', 'Puoi farlo anche mentre ti lavi i denti, ogni giorno.'],
      why: 'Allena i piccoli muscoli di piede e caviglia, che ammortizzano l\'appoggio prima che il carico arrivi alla tibia.'
    },
    sideplank: {
      phases: [
        { label: 'Posizione', pose: { pts: { head: [38.3, 118.9], sh: [52, 122], hip: [100.8, 133], kn: [130, 139.5], an: [149.6, 143.9], to: [152, 149],
          el: [52, 146], ha: [68, 146], el2: [74, 112], ha2: [96, 126] } }, props: () => [] }
      ],
      cues: ['Sul fianco, gomito sotto la spalla, piedi uno sopra l\'altro.', 'Solleva il bacino finché il corpo è dritto dalla testa ai piedi.',
        'Non lasciar cadere le anche, non ruotare il busto.', 'Tieni 30" per lato. Più facile: ginocchia a terra.'],
      why: 'Rinforza i muscoli laterali del busto che tengono il bacino in asse a ogni passo.'
    },
    birddog: {
      phases: [
        { label: 'Inizio', pose: { hip: [70, 117], a: { torso: 77, thigh: 0, shin: -90, foot: 180, ua: 0, fa: 0, thigh2: 0, shin2: -90, foot2: 180, ua2: 0, fa2: 0 } }, props: () => [] },
        { label: 'Fine', pose: { hip: [70, 117], a: { torso: 77, thigh: 0, shin: -90, foot: 180, ua: 100, fa: 100, thigh2: -95, shin2: -95, foot2: 100, ua2: 0, fa2: 0 } },
          props: () => [{ t: 'arrow', from: [138, 84], to: [154, 84] }, { t: 'arrow', from: [30, 98], to: [12, 98] }] }
      ],
      cues: ['A quattro zampe: mani sotto le spalle, ginocchia sotto le anche, schiena piatta.', 'Allunga insieme un braccio in avanti e la gamba opposta indietro.',
        'Bacino fermo e parallelo al pavimento, come se avessi un bicchiere sulla schiena.', 'Tieni 2", torna al centro e alterna i lati.'],
      why: 'Allena il core a restare stabile mentre braccia e gambe si muovono in modo alternato, come in corsa.'
    },
    // ---------------- Pliometria (dalla settimana 9) ----------------
    pogo: {
      phases: [
        { label: 'Appoggio', pose: { hip: [80, 0], ground: true, a: S({ foot: 55, ua: 10, fa: 40 }) }, props: () => [] },
        { label: 'Volo', pose: { hip: [80, 0], ground: true, lift: 14, a: S({ foot: 55, ua: 10, fa: 40 }) },
          props: () => [{ t: 'arrow', from: [112, 120], to: [112, 96] }] }
      ],
      cues: ['Solo se le tibie non fanno male. Su superficie morbida (prato, parquet), non sull\'asfalto.', 'Piccoli salti rapidi sul posto, sugli avampiedi, ginocchia quasi tese.',
        'Contatto col terreno il più breve possibile, atterraggio silenzioso.', 'Se senti dolore alla tibia, interrompi e salta questo esercizio per quella settimana.'],
      why: 'Rende tendini e caviglie più "elastici": più energia restituita a ogni passo.'
    },
    skip: {
      phases: [
        { label: 'Destra su', pose: { hip: [80, 0], ground: true, a: { torso: 3, thigh: 0, shin: 0, foot: 50, ua: 40, fa: 150, thigh2: 88, shin2: 0, foot2: -10, ua2: -30, fa2: -10 } }, props: () => [] },
        { label: 'Sinistra su', pose: { hip: [80, 0], ground: true, groundLeg: 2, a: { torso: 3, thigh: 88, shin: 0, foot: -10, ua: -30, fa: -10, thigh2: 0, shin2: 0, foot2: 50, ua2: 40, fa2: 150 } },
          props: () => [{ t: 'arrow', from: [24, 40], to: [48, 40] }] }
      ],
      cues: ['Corsa saltellata: ginocchio alto fino all\'altezza dell\'anca.', 'Appoggio sull\'avampiede, sotto il bacino, attivo e veloce.',
        'Braccia coordinate con le gambe (braccio opposto al ginocchio che sale).', 'Busto alto; 20 m, recupero camminando. Niente se le tibie fanno male.'],
      why: 'Migliora tecnica e frequenza del passo: appoggi più brevi e meno "frenati" caricano meno la tibia.'
    }
  };

  // La seconda gamba d'appoggio (skip): appoggia a terra quella indicata
  function solvePhase(ph) {
    const pose = ph.pose;
    if (pose.groundLeg === 2) {
      const tmp = solve(Object.assign({}, pose, { ground: false, hip: [pose.hip[0], 0] }));
      const low = Math.max(tmp.an2[1], tmp.to2[1]);
      return solve(Object.assign({}, pose, { ground: false, hip: [pose.hip[0], GROUND - low] }));
    }
    return solve(pose);
  }

  // SVG completo dell'esercizio (una vignetta per fase)
  function svg(id, opts) {
    const ex = EX[id];
    if (!ex) return '';
    opts = opts || {};
    const phases = opts.only === 'last' ? ex.phases.slice(-1) : ex.phases;
    const W = PANEL * phases.length;
    const H = opts.only ? PANEL : PANEL + 18;
    let s = '<svg class="exfig" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Esecuzione: ' + id + '">';
    phases.forEach((ph, i) => {
      const P = solvePhase(ph);
      s += '<g transform="translate(' + i * PANEL + ',0)">';
      if (i > 0) s += '<line class="sep" x1="0" y1="10" x2="0" y2="150"/>';
      s += '<line class="gr" x1="4" y1="' + GROUND + '" x2="' + (PANEL - 4) + '" y2="' + GROUND + '"/>';
      const props = ph.props ? ph.props(P) : [];
      s += props.filter(p => p.t === 'box' || p.t === 'post').map(prop).join('');
      s += figure(P);
      s += props.filter(p => p.t !== 'box' && p.t !== 'post').map(prop).join('');
      if (!opts.only) s += '<text class="lbl" x="' + PANEL / 2 + '" y="' + (PANEL + 12) + '" text-anchor="middle">' + (phases.length > 1 ? (i + 1) + ' · ' : '') + ph.label + '</text>';
      s += '</g>';
    });
    return s + '</svg>';
  }

  function info(id) { return EX[id] || null; }
  function ids() { return Object.keys(EX); }

  return { svg, info, ids, solve };
})();
