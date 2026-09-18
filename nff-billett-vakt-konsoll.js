/*
  NFF Billett-vakt — kjør i konsollen på https://resale.fotball.no/list/resaleProducts/?lang=no
  ------------------------------------------------------------------------------------------------
  1. Åpne siden i Chrome eller Edge.
  2. Trykk F12 (åpner utviklerverktøy), velg fanen "Console".
  3. Lim inn HELE denne koden og trykk Enter.
  4. Si "Tillat" hvis nettleseren spør om varslingstillatelse (Notification).
  5. La fanen stå åpen. Du får lyd + varsel + rød banner når det dukker opp billetter.
     Sjekken kjører automatisk hvert 20.-35. sekund uten at du behøver å gjøre noe mer.
  6. Vil du stoppe det: skriv  clearInterval(window.__nffWatcher)  i konsollen.

  Merk: Dette script kjører kun i denne ene fanen/vinduet, og stopper hvis du lukker fanen,
  lukker nettleseren, eller laster siden på nytt (F5). Du må lime det inn på nytt da.
*/

(function () {
  'use strict';

  const CATALOG_URL = '/list/resale/resaleProductCatalog.json?lang=no';
  const CHECK_MIN_MS = 20000;
  const CHECK_MAX_MS = 35000;

  function randomDelay() {
    return CHECK_MIN_MS + Math.random() * (CHECK_MAX_MS - CHECK_MIN_MS);
  }

  function beep(times) {
    times = times || 10;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      let i = 0;
      const play = () => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.frequency.value = 880;
        g.gain.value = 0.3;
        o.start();
        setTimeout(() => o.stop(), 250);
        i++;
        if (i < times) setTimeout(play, 400);
      };
      play();
    } catch (e) { /* lyd feilet, ignorer */ }
  }

  function showBanner(text) {
    let el = document.getElementById('nff-watcher-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'nff-watcher-banner';
      el.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:999999;' +
        'background:#e30613;color:#fff;font-size:20px;font-weight:bold;' +
        'padding:16px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.4);';
      document.body.appendChild(el);
    }
    el.textContent = text;
  }

  function notifyAvailable(items) {
    const count = items.length;
    const names = items.slice(0, 3).map(p => p.name || 'billett').join(', ');
    const title = 'Billetter tilgjengelig!';
    const body = count + ' billett(er) ledig: ' + names;

    if (window.Notification && Notification.permission === 'granted') {
      const n = new Notification(title, { body: body, requireInteraction: true });
      n.onclick = function () {
        window.focus();
        n.close();
      };
    }
    document.title = '\u{1F534} BILLETTER LEDIG! ' + document.title;
    beep(12);
    showBanner(body + ' — sjekken er nå satt på pause. Kjøp raskt, oppdater siden manuelt!');
  }

  function requestNotificationPermission() {
    if (window.Notification && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  // Graver gjennom JSON-svaret (uansett nøyaktig struktur) og plukker ut
  // alle produkt-objekter som har en ekte "productPagePath" (= kjøpbar).
  function findAvailableProducts(obj, out) {
    out = out || [];
    if (!obj || typeof obj !== 'object') return out;
    if (Array.isArray(obj)) {
      obj.forEach(item => findAvailableProducts(item, out));
      return out;
    }
    if (typeof obj.productPagePath === 'string' && obj.productPagePath.length > 0) {
      out.push(obj);
    }
    Object.keys(obj).forEach(key => {
      const val = obj[key];
      if (val && typeof val === 'object') {
        findAvailableProducts(val, out);
      }
    });
    return out;
  }

  async function checkOnce() {
    try {
      const res = await fetch(CATALOG_URL, {
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      if (!res.ok) {
        console.warn('[NFF billett-vakt] Uventet svar (' + res.status + '), prøver igjen senere.');
        return false;
      }
      const data = await res.json();
      const available = findAvailableProducts(data);
      if (available.length > 0) {
        console.log('[NFF billett-vakt] FANT BILLETTER:', available);
        notifyAvailable(available);
        return true; // fant noe -> stopp
      } else {
        console.log('[NFF billett-vakt] Ingen billetter ennå (' + new Date().toLocaleTimeString() + ')');
        return false;
      }
    } catch (e) {
      console.warn('[NFF billett-vakt] Feil under sjekk, prøver igjen senere:', e);
      return false;
    }
  }

  let stopped = false;
  window.__nffWatcherStop = function () {
    stopped = true;
    if (window.__nffWatcherTimeout) clearTimeout(window.__nffWatcherTimeout);
    console.log('[NFF billett-vakt] Stoppet manuelt.');
  };

  async function loop() {
    if (stopped) return;
    let found = false;
    try {
      found = await checkOnce();
    } catch (e) {
      // checkOnce() har allerede sin egen try/catch, men vi tar høyde for at
      // NOE uforutsett kan gå galt, slik at løkken aldri stopper stille av seg selv.
      console.error('[NFF billett-vakt] Uventet feil, fortsetter likevel:', e);
      found = false;
    }
    window.__nffWatcherTimeout = null;
    if (found || stopped) return; // fant billetter, eller brukeren stoppet manuelt
    window.__nffWatcherTimeout = setTimeout(loop, randomDelay());
  }

  // Uavhengig "vaktbikkje": logger hvert minutt at fanen fortsatt lever, og
  // starter løkken på nytt hvis den mot all formodning har stoppet uventet
  // (f.eks. fordi Mac'en har sovet, eller siden har gjort noe uforutsett).
  window.__nffWatcherHeartbeat = setInterval(function () {
    console.log('[NFF billett-vakt] ... fortsatt aktiv (' + new Date().toLocaleTimeString() + ')');
    if (!stopped && !window.__nffWatcherTimeout) {
      console.log('[NFF billett-vakt] Løkken hadde stoppet uventet — starter den på nytt.');
      loop();
    }
  }, 60000);

  requestNotificationPermission();
  console.log('[NFF billett-vakt] Startet. Sjekker hvert 20.-35. sekund. Skriv __nffWatcherStop() for å stoppe helt.');
  loop();
})();
