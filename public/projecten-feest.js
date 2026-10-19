/**
 * Projecten -- een feestje als een taak afgevinkt wordt: confetti, een
 * softijsje dat gedraaid wordt, of een kabouterdansje. Willekeurig gekozen,
 * kort (twee seconden), en nooit in de weg: het ligt over de pagina en
 * vangt geen klikken (pointer-events: none).
 *
 * Confetti komt van canvas-confetti (cdn.jsdelivr.net, in projecten.html);
 * de andere twee zijn emoji met een CSS-animatie, zodat er geen bestanden
 * van buitenaf nodig zijn. Zet `localStorage.pmFeest = 'uit'` om het af te
 * zetten (voor wie het beu wordt).
 */

(function () {
  'use strict';

  var PM = window.PM;
  var TEKSTEN = ['Goed bezig!', 'Hop, weer eentje!', 'Afgevinkt!', 'Zo hoort het.', 'Lekker bezig!', 'Mooi zo!'];

  function stijl() {
    if (document.getElementById('pmFeestStijl')) return;
    var s = document.createElement('style');
    s.id = 'pmFeestStijl';
    s.textContent = [
      '#pmFeest { position: fixed; inset: 0; z-index: 90; pointer-events: none; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: .5rem; }',
      '#pmFeest .pm-feest-figuur { font-size: 6rem; line-height: 1; filter: drop-shadow(0 8px 16px rgba(0,0,0,.25)); }',
      '#pmFeest .pm-feest-tekst { font-weight: 800; font-size: 1.4rem; color: oklch(var(--bc)); background: oklch(var(--b1)); padding: .35rem 1rem; border-radius: 999px; box-shadow: 0 4px 16px rgba(0,0,0,.15); animation: pmFeestTekst 2s ease forwards; }',
      '@keyframes pmFeestTekst { 0% { opacity: 0; transform: translateY(12px) scale(.8); } 15% { opacity: 1; transform: none; } 80% { opacity: 1; } 100% { opacity: 0; transform: translateY(-8px); } }',
      /* Het softijsje: komt van onder, draait rond zoals aan de machine, en verdwijnt. */
      '.pm-feest-ijs { animation: pmIjs 2s ease-in-out forwards; }',
      '@keyframes pmIjs { 0% { opacity: 0; transform: translateY(80px) rotate(0) scale(.6); } 20% { opacity: 1; transform: translateY(0) rotate(0) scale(1); } 70% { transform: translateY(-10px) rotate(720deg) scale(1.15); } 100% { opacity: 0; transform: translateY(-60px) rotate(900deg) scale(.9); } }',
      /* Het kabouterdansje: wiegt, springt en zwaait, met een paar nootjes. */
      '.pm-feest-kabouter { animation: pmKabouter 2s ease-in-out forwards; }',
      '@keyframes pmKabouter { 0% { opacity: 0; transform: translateY(40px); } 10% { opacity: 1; transform: translateY(0) rotate(-10deg); } 25% { transform: translateY(-24px) rotate(10deg); } 40% { transform: translateY(0) rotate(-10deg); } 55% { transform: translateY(-24px) rotate(10deg); } 70% { transform: translateY(0) rotate(-10deg); } 85% { opacity: 1; transform: translateY(-16px) rotate(6deg); } 100% { opacity: 0; transform: translateY(-40px); } }',
      '.pm-feest-noot { position: absolute; font-size: 2rem; animation: pmNoot 1.6s ease-out forwards; }',
      '@keyframes pmNoot { 0% { opacity: 0; transform: translate(0, 0) scale(.6); } 20% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--dx), -140px) scale(1.2) rotate(20deg); } }',
      '@media (prefers-reduced-motion: reduce) { #pmFeest * { animation-duration: .01s !important; } }',
    ].join('\n');
    document.head.appendChild(s);
  }

  function kies() {
    var lijst = ['confetti', 'ijs', 'kabouter'];
    if (typeof window.confetti !== 'function') lijst.shift();
    return lijst[Math.floor(Math.random() * lijst.length)];
  }

  function toon(html) {
    var oud = document.getElementById('pmFeest');
    if (oud) oud.remove();
    var el = document.createElement('div');
    el.id = 'pmFeest';
    el.innerHTML = html;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2100);
  }

  PM.feest = function () {
    try { if (localStorage.getItem('pmFeest') === 'uit') return; } catch (x) { /* geen opslag */ }
    stijl();
    var tekst = '<div class="pm-feest-tekst">' + TEKSTEN[Math.floor(Math.random() * TEKSTEN.length)] + '</div>';
    var soort = kies();
    if (soort === 'confetti') {
      window.confetti({ particleCount: 140, spread: 80, startVelocity: 45, origin: { y: 0.65 }, scalar: 1.1 });
      setTimeout(function () { window.confetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } }); window.confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } }); }, 250);
      toon(tekst);
    } else if (soort === 'ijs') {
      toon('<div class="pm-feest-figuur pm-feest-ijs">🍦</div>' + tekst);
    } else {
      var noten = ['♪', '♫', '♩', '♬'].map(function (n, i) {
        return '<span class="pm-feest-noot" style="--dx:' + ((i - 1.5) * 70) + 'px; animation-delay:' + (i * 0.15) + 's; margin-left:' + ((i - 1.5) * 40) + 'px">' + n + '</span>';
      }).join('');
      toon('<div class="pm-feest-figuur pm-feest-kabouter">🧙‍♂️</div>' + noten + tekst);
    }
  };
})();
