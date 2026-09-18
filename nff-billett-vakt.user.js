// ==UserScript==
// @name         NFF Billett-vakt (resale.fotball.no)
// @namespace    nff-resale-watcher
// @version      1.1
// @description  Oppdaterer resale.fotball.no automatisk og varsler med lyd/melding når det dukker opp ledige billetter
// @match        https://resale.fotball.no/list/resaleProducts*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // Hvor lenge (i millisekunder) skriptet venter mellom hver automatiske oppdatering av siden.
  // Det legges på litt tilfeldig variasjon slik at det ikke ser ut som en robot som slår til
  // på nøyaktig samme sekund hver gang.
  const REFRESH_MIN_MS = 25000; // 25 sek
  const REFRESH_MAX_MS = 45000; // 45 sek
  const STORAGE_KEY = 'nffTicketWatcherFoundAt';

  function randomDelay() {
    return REFRESH_MIN_MS + Math.random() * (REFRESH_MAX_MS - REFRESH_MIN_MS);
  }

  function beep(times) {
    times = times || 8;
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

  function notifyAvailable(count) {
    const title = 'Billetter tilgjengelig!';
    const body = count + ' billett(er) er nå ledig på resale.fotball.no';

    if (window.Notification && Notification.permission === 'granted') {
      const n = new Notification(title, { body: body, requireInteraction: true });
      n.onclick = function () {
        window.focus();
        n.close();
      };
    }

    document.title = '\u{1F534} BILLETTER LEDIG! ' + document.title;
    beep(10);
    showBanner(body + ' — siden har stoppet å oppdatere seg selv. Se listen og kjøp raskt!');
  }

  function requestNotificationPermission() {
    if (window.Notification && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  // Billetter som faktisk kan kjøpes får klassen "with_availability" og en ekte
  // "Kjøp"-lenke. Utsolgte/inaktive produkter får "no_availability" og ingen lenke.
  function countAvailable() {
    return document.querySelectorAll('#list_all_tickets .product.with_availability').length;
  }

  function scheduleReload() {
    const delay = randomDelay();
    console.log('[NFF billett-vakt] Ingen billetter ledig. Oppdaterer siden om ' + Math.round(delay / 1000) + ' sek...');
    setTimeout(function () {
      window.location.reload();
    }, delay);
  }

  function evaluate() {
    const count = countAvailable();
    if (count > 0) {
      notifyAvailable(count);
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
      // Stopper automatisk oppdatering når billetter er funnet, slik at du får tid til å kjøpe.
    } else {
      scheduleReload();
    }
  }

  function waitForListAndEvaluate() {
    const list = document.getElementById('list_all_tickets');
    if (!list) {
      setTimeout(waitForListAndEvaluate, 500);
      return;
    }

    // Listen lastes inn via en bakgrunnsforespørsel (AJAX) etter at siden har lastet.
    // Vent til "Laster opp"-spinneren er borte før vi sjekker innholdet.
    const observer = new MutationObserver(function () {
      if (!list.querySelector('#loading_mark')) {
        observer.disconnect();
        evaluate();
      }
    });
    observer.observe(list, { childList: true, subtree: true });

    // Sikkerhetsnett i tilfelle observeren ikke fanger opp endringen.
    setTimeout(function () {
      if (!list.querySelector('#loading_mark')) {
        observer.disconnect();
        evaluate();
      }
    }, 5000);
  }

  requestNotificationPermission();
  waitForListAndEvaluate();
})();
