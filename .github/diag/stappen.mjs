import { chromium } from 'playwright-core';
const url = process.argv[2];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
for (const [w, h] of [[1440, 900], [1366, 768]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const fouten = [];
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') fouten.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', e => fouten.push('pageerror: ' + e.message));
  await p.goto(url, { waitUntil: 'load', timeout: 60000 });
  await p.mouse.wheel(0, 300); await p.waitForTimeout(3000);
  const r = await p.evaluate(() => {
    const el = document.querySelector('.mymmo-stappen');
    const scripts = [...document.scripts].map(s => (s.src || '[inline] ' + s.textContent.slice(0, 60)) + ' type=' + s.type).filter(s => /stappen|rocket|delay|lazy|defer|litespeed|autoptimize|wp-optimize|perfmatters|flying/i.test(s));
    if (!el) return { geen: true, scripts };
    const rij = el.querySelector('.mymmo-stappen-rij');
    const st = [...el.querySelectorAll('.mymmo-stap')];
    return {
      openTag: el.outerHTML.slice(0, 400),
      klassen: el.className, breed: el.offsetWidth, innerH: innerHeight,
      directeKinderen: rij ? [...rij.children].map(c => c.tagName + '.' + c.className).slice(0, 6) : 'geen rij',
      stappen: st.map(s => ({ h: Math.round(s.getBoundingClientRect().height), nummer: Math.round(s.querySelector('.mymmo-stap-nummer')?.getBoundingClientRect().height || 0), inhoud: Math.round(s.querySelector('.mymmo-stap-inhoud')?.getBoundingClientRect().height || 0), schaal: s.style.getPropertyValue('--mk-schaal'), pad: getComputedStyle(s).paddingTop })),
      stappenJs: [...document.scripts].filter(s => /stappen/.test(s.src + s.getAttribute('data-rocket-src'))).map(s => s.outerHTML.slice(0, 300)),
      scripts,
      ancestorsOverflow: (() => { const o = []; let n = el.parentElement; while (n) { const cs = getComputedStyle(n); if (cs.overflow !== 'visible' || cs.transform !== 'none') o.push(n.tagName + '.' + n.className.toString().slice(0, 40) + ' ' + cs.overflow + ' ' + cs.transform); n = n.parentElement; } return o; })(),
    };
  });
  console.log('=== ' + w + 'x' + h + '\n' + JSON.stringify(r, null, 1) + '\nFOUTEN:\n' + fouten.join('\n'));
}
await b.close();
