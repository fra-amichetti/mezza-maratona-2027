# Mezza Maratona 2027

App per macOS per preparare la Mezza Maratona di Milano del 21 marzo 2027: piano di 24 settimane, registro degli allenamenti, test, statistiche, schede di forza, strategia di gara e nutrizione.

## Piano di allenamento

3 allenamenti a settimana, tutte le corse in piano:

| Martedì | Giovedì | Sabato |
|---|---|---|
| Corsa di qualità (ripetute, tempo o fartlek a rotazione) | Lungo facile | Forza a corpo libero |

- Test al posto della qualità circa ogni 5–6 settimane (settimane 2, 7, 13, 17): i ritmi si ricalcolano dal risultato.
- Settimana di scarico ogni 3–4 settimane (4, 8, 12, 16, 19, 22) e sempre dopo un lungo con tratti a ritmo gara.
- Lungo fino a 19 km, ritmo gara solo nella fase specifica (settimane 15, 18, 21).
- Ultime due settimane di taper. Nella settimana della gara la forza è il giovedì e la gara la domenica.

## Struttura

```
Mezza Milano 2027.app/Contents/
├── MacOS/MezzaMilano          # contenitore nativo (WebKit, Promemoria, notifiche)
└── Resources/web/
    ├── index.html
    ├── css/app.css
    └── js/
        ├── core/              # logica: piano, ritmi, forza, regole, previsioni, dati
        └── ui/                # schermate
```

Il piano è in `js/core/plan-data.js`, le schede di forza in `js/core/gym.js`.

## Uso

Apri `Mezza Milano 2027.app` su macOS 13 o successivo. Se macOS segnala che l'app è danneggiata (succede con le app scaricate e firmate localmente):

```
xattr -cr "Mezza Milano 2027.app"
```

Per lo sviluppo si può aprire anche `Resources/web/index.html` in un browser: in quel caso i dati restano nel `localStorage`.
