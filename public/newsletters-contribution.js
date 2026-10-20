/**
 * Nieuwsbrieven -- het gekozen blok, in het paneel rechts (de regie).
 *
 * Wat de lezer ziet, typ je IN de brief (newsletters-edition.js maakt de
 * velden daar bewerkbaar). Hier staat enkel wat de lezer niet ziet: de
 * instellingen van het blok, wie het schrijft en de stand, de opmaak (voor
 * de hoofdredactie) en de opmerkingen. Bewaart vanzelf.
 */
(function () {
  'use strict';
  var NB = window.NB;
  var e = NB.esc;

  var bewaarTimer = null;
  var voorbeeldTimer = null;

  function c() { return NB.state.concept; }
  function s() { return NB.state.stukje; }
  function editor() { return Boolean(s() && s().series && s().series.is_editor); }

  function zet(pad, waarde) {
    var delen = pad.split('.');
    var obj = c();
    for (var i = 0; i < delen.length - 1; i++) {
      var k = /^\d+$/.test(delen[i]) ? Number(delen[i]) : delen[i];
      if (obj[k] === undefined || obj[k] === null) obj[k] = /^\d+$/.test(delen[i + 1]) ? [] : {};
      obj = obj[k];
    }
    obj[delen[delen.length - 1]] = waarde;
  }

  function lees(pad) {
    return pad.split('.').reduce(function (o, k) { return o === undefined || o === null ? undefined : o[k]; }, c());
  }

  function gewijzigd() {
    NB.state.vuil = true;
    zetBewaarStand('Niet bewaard');
    clearTimeout(bewaarTimer);
    bewaarTimer = setTimeout(bewaar, 1200);
    clearTimeout(voorbeeldTimer);
    voorbeeldTimer = setTimeout(function () { if (NB.vernieuwBrief) NB.vernieuwBrief(); }, 500);
  }

  /** Bewaren zonder de brief opnieuw te tekenen (typen IN de brief, notities). */
  function gewijzigdStil() {
    NB.state.vuil = true;
    zetBewaarStand('Niet bewaard');
    clearTimeout(bewaarTimer);
    bewaarTimer = setTimeout(bewaar, 1200);
  }

  /**
   * Voor de redactietafel: een veld wijzigen van buiten het formulier. `stil`
   * = de brief niet opnieuw tekenen (wie IN de brief typt, houdt zijn cursor).
   */
  NB.stukjeZet = function (pad, waarde, opties) {
    if (!s() || !c()) return;
    zet(pad, waarde);
    if (opties && opties.stil) { gewijzigdStil(); return; }
    gewijzigd();
    render();
  };
  NB.stukjeLees = function (pad) { return c() ? lees(pad) : undefined; };

  function zetBewaarStand(tekst) {
    var el = document.getElementById('stBewaard');
    if (el) el.textContent = tekst;
  }

  async function bewaar() {
    clearTimeout(bewaarTimer);
    if (!NB.state.vuil || !s() || !s().can_edit) return;
    var st = s();
    try {
      var bij = await NB.api('/api/contributions/' + st.item.id, {
        method: 'PUT',
        body: { kind: c().kind, title: c().title, content: c().content, raw_notes: c().raw_notes, series_ids: c().series_ids },
      });
      NB.state.vuil = false;
      st.item = Object.assign({}, st.item, bij);
      if (NB.stukjeBijgewerkt) NB.stukjeBijgewerkt(st.item);
      zetBewaarStand('Bewaard om ' + NB.datum(new Date().toISOString(), { hour: '2-digit', minute: '2-digit' }));
      var badge = document.getElementById('stStatus');
      if (badge) badge.innerHTML = NB.statusBadge(st.item.status);
    } catch (err) { zetBewaarStand('Bewaren mislukt'); NB.fout(err); }
  }
  NB.bewaarStukje = bewaar;

  // ─── Velden ───────────────────────────────────────────────────────────────

  function veld(label, pad, opties) {
    opties = opties || {};
    var waarde = lees(pad);
    var uit = s().can_edit ? '' : ' disabled';
    var invoer = opties.rijen
      ? '<textarea class="textarea textarea-bordered textarea-sm w-full" rows="' + opties.rijen + '" data-veld="' + pad + '"' + uit + ' placeholder="' + e(opties.hint || '') + '">' + e(waarde || '') + '</textarea>'
      : '<input type="' + (opties.type || 'text') + '" class="input input-bordered input-sm w-full" data-veld="' + pad + '" value="' + e(waarde || '') + '"' + uit + ' placeholder="' + e(opties.hint || '') + '">';
    return '<label class="form-control w-full"><span class="label-text text-xs mb-1">' + e(label) + '</span>' + invoer
      + (opties.uitleg ? '<span class="label-text-alt opacity-60 mt-1">' + e(opties.uitleg) + '</span>' : '') + '</label>';
  }

  function vinkje(label, pad) {
    var aan = lees(pad) !== false;
    return '<label class="label cursor-pointer justify-start gap-3 py-1"><input type="checkbox" class="checkbox checkbox-sm" data-veld="' + pad + '"' + (aan ? ' checked' : '') + (s().can_edit ? '' : ' disabled') + '><span class="label-text">' + e(label) + '</span></label>';
  }

  function uitleg(tekst) {
    return '<div class="flex gap-2 text-xs bg-base-200 rounded-xl p-2.5 opacity-80"><i data-lucide="mouse-pointer-click" class="w-4 h-4 shrink-0 mt-0.5"></i><span>' + tekst + '</span></div>';
  }

  /** Wie het woordje vooraf ondertekent: foto, voornaam en functie komen uit Odoo. */
  function ondertekenaarKeuze() {
    var st = s();
    var gekozen = lees('content.signer_user_id') || '';
    var schrijver = st.item.owner_name ? NB.voornaam(st.item.owner_name) : 'wie het schrijft';
    var users = (NB.state.boot && NB.state.boot.users) || [];
    return '<label class="form-control w-full"><span class="label-text text-xs mb-1">Wie ondertekent?</span>'
      + '<select class="select select-bordered select-sm w-full" data-veld="content.signer_user_id"' + (st.can_edit ? '' : ' disabled') + '>'
      + '<option value="">' + e(schrijver) + ' (schrijft dit)</option>'
      + users.filter(function (u) { return u.id !== st.item.owner_user_id; }).map(function (u) {
        return '<option value="' + e(u.id) + '"' + (u.id === gekozen ? ' selected' : '') + '>' + e(u.name) + '</option>';
      }).join('')
      + '</select><span class="label-text-alt opacity-60 mt-1">Foto, voornaam en functie komen uit Odoo.</span></label>';
  }

  // ─── Berichten uit Nieuws & updates ───────────────────────────────────────

  NB.actions['berichten-opnieuw'] = async function () {
    await NB.laadBerichten(true);
    render();
  };

  function berichtenFout() {
    return '<div class="alert alert-warning text-sm flex-col items-start gap-2"><span><strong>De berichten uit Nieuws &amp; updates konden niet geladen worden.</strong><br>' + e(NB.state.berichtenFout) + '</span>'
      + '<button class="btn btn-sm" data-action="berichten-opnieuw">Opnieuw proberen</button></div>';
  }

  /** Welk bericht uit Nieuws & updates: kiezen = alles invullen. */
  function berichtKeuze() {
    if (NB.state.berichtenFout) return berichtenFout();
    var lijst = NB.state.berichten || [];
    var gekozen = Number(lees('content.snippet_id')) || 0;
    var mag = s().can_edit;
    var datum = function (d) { return d ? ' · ' + NB.datum(d, { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
    return '<label class="form-control w-full"><span class="label-text text-xs mb-1 font-semibold">Bericht uit Nieuws &amp; updates</span>'
      + '<select class="select select-bordered select-sm w-full" data-change="bericht-kies"' + (mag ? '' : ' disabled') + '>'
      + '<option value="">' + (lijst.length ? 'Kies een bericht…' : 'Geen gepubliceerde berichten gevonden') + '</option>'
      + lijst.map(function (b) {
        return '<option value="' + b.id + '"' + (b.id === gekozen ? ' selected' : '') + '>' + e(b.title) + e(datum(b.published_on)) + '</option>';
      }).join('')
      + '</select></label>';
  }

  /** De labels van de ANDERE berichten in deze editie: een nieuw label moet daar niet op lijken. */
  function labelsInEditie() {
    var ed = NB.state.editie;
    var mijn = s() && s().item.id;
    return ((ed && ed.items) || []).filter(function (i) { return i.kind === 'snippet' && i.id !== mijn; })
      .map(function (i) { return (i.content && i.content.tag) || i.title; }).filter(Boolean);
  }

  function labelVeld() {
    var mag = s().can_edit;
    return '<label class="form-control w-full"><span class="label-text text-xs mb-1">Label boven het bericht</span>'
      + '<div class="flex gap-2"><input type="text" maxlength="40" class="input input-bordered input-sm w-full" data-veld="content.tag" value="' + e(lees('content.tag') || '') + '" placeholder="' + e(s().item.title || 'bv. Goed om te weten') + '"' + (mag ? '' : ' disabled') + '>'
      + (mag ? '<button type="button" class="btn btn-sm btn-ghost gap-1" data-action="bericht-label" title="Laat Nieuws &amp; updates een ander label voorstellen"><i data-lucide="sparkles" class="w-4 h-4"></i> Ander</button>' : '')
      + '</div></label>';
  }

  function keuzeKnoppen(lijst, nu, actie, dataNaam, mag, kan) {
    return '<div class="grid grid-cols-2 gap-1.5">' + lijst.map(function (v) {
      var ok = !kan || kan(v);
      return '<button type="button" class="btn btn-xs h-auto min-h-0 py-1.5 flex-col items-start text-left gap-0 normal-case font-normal ' + (v.key === nu ? 'btn-primary' : 'btn-outline border-base-content/20') + '"'
        + ' data-action="' + actie + '" data-' + dataNaam + '="' + e(v.key) + '"' + (mag && ok ? '' : ' disabled') + ' title="' + e(v.uitleg) + '">'
        + '<span class="font-semibold">' + e(v.label) + '</span><span class="text-[10px] leading-tight opacity-70">' + e(v.uitleg) + '</span></button>';
    }).join('') + '</div>';
  }

  /** Hoe het bericht in de brief staat (BERICHT_VORMEN, via /api/bootstrap). */
  function vormKeuze() {
    var vormen = (NB.state.boot && NB.state.boot.bericht_vormen) || [];
    if (!vormen.length) return '';
    var nu = lees('content.vorm') || 'klassiek';
    var heeftCitaat = String(lees('content.quote') || '').trim();
    return '<div><span class="label-text text-xs">Vorm in de brief</span><div class="mt-1">'
      + keuzeKnoppen(vormen, nu, 'bericht-vorm', 'vorm', s().can_edit, function (v) { return v.key !== 'citaat' || heeftCitaat; })
      + '</div><p class="text-[11px] opacity-60 mt-1">Wissel af: twee artikels na elkaar lezen beter in een andere vorm.</p></div>';
  }

  function berichtBron() {
    return '<div class="rounded-xl bg-base-200 p-2.5 text-xs flex items-start gap-2"><i data-lucide="info" class="w-4 h-4 mt-0.5 shrink-0"></i><span>Titel, tekst, beeld en link komen uit Nieuws &amp; updates en zijn altijd de laatste versie. Iets aanpassen? Doe het op het bericht zelf. '
      + '<a class="link link-primary" href="/content-feed" target="_blank" rel="noopener">Open Nieuws &amp; updates</a></span></div>';
  }

  function doorRegel() {
    var door = lees('content.door');
    return '<p class="text-xs opacity-70 flex items-center gap-2"><i data-lucide="user" class="w-4 h-4"></i>'
      + (door && door.name ? 'In de brief: <strong>Gedeeld door ' + e(door.name) + '</strong>' : 'Geen eigenaar in Nieuws &amp; updates: er komt geen naam onder.')
      + '</p>';
  }

  function volgendeVorm() {
    var ed = NB.state.editie;
    var mijn = s() && s().item.id;
    var gebruikt = ((ed && ed.items) || []).filter(function (i) { return i.kind === 'snippet' && i.id !== mijn && i.content && i.content.snippet_id; })
      .map(function (i) { return i.content.vorm || 'klassiek'; });
    var rij = ['klassiek', 'kaart', 'compact', 'uitgelicht'];
    return rij.find(function (v) { return gebruikt.indexOf(v) < 0; }) || rij[gebruikt.length % rij.length];
  }

  /** Hoe de feature in de brief staat (FEATURE_VORMEN, via /api/bootstrap). */
  function featureVormKeuze() {
    var vormen = (NB.state.boot && NB.state.boot.feature_vormen) || [];
    if (!vormen.length) return '';
    return '<div><span class="label-text text-xs">Vorm in de brief</span><div class="mt-1">'
      + keuzeKnoppen(vormen, lees('content.vorm') || 'kaart', 'feature-vorm', 'vorm', s().can_edit)
      + '</div></div>';
  }
  NB.actions['feature-vorm'] = function (el) { zet('content.vorm', el.dataset.vorm); gewijzigd(); render(); };

  /** Het paneel van een productfeature: wat de lezer niet in de brief typt. */
  function featureVelden() {
    var usps = (lees('content.usps') || []).join('\n');
    var uit = s().can_edit ? '' : ' disabled';
    return uitleg('Label, titel en korte uitleg typ je <strong>in de brief</strong>. De inhoud is een kopie uit de bibliotheek: die later aanpassen, verandert deze mail niet.')
      + '<label class="form-control w-full"><span class="label-text text-xs mb-1">USP\'s (één per regel, max. 6)</span><textarea class="textarea textarea-bordered textarea-sm w-full" rows="4" data-veld="content.usps" data-lijst="1"' + uit + '>' + e(usps) + '</textarea></label>'
      + vinkje('Toon de USP\'s', 'content.toon_usps')
      + veld('Waarom we dit gemaakt hebben', 'content.why', { rijen: 2 })
      + vinkje('Toon "Waarom we dit maakten"', 'content.toon_why')
      + '<div class="grid grid-cols-2 gap-2">' + veld('Link', 'content.url', { hint: 'https://' }) + veld('Tekst van de knop of link', 'content.link_label', { hint: 'Meer over deze functie' }) + '</div>'
      + beeldRij('Beeld')
      + '<a class="link text-xs" href="/productfeatures' + (lees('content.feature_id') ? '#/' + e(lees('content.feature_id')) : '') + '" target="_blank" rel="noopener">Open de bibliotheek Productfeatures</a>';
  }

  NB.actions['bericht-vorm'] = function (el) {
    zet('content.vorm', el.dataset.vorm);
    gewijzigd();
    render();
  };

  NB.actions['bericht-label'] = async function (el) {
    var id = lees('content.snippet_id');
    if (!id) return;
    el.disabled = true;
    try {
      var huidig = lees('content.tag');
      var r = await NB.api('/api/snippets/' + id + '/label', { method: 'POST', body: { vermijd: labelsInEditie().concat(huidig ? [huidig] : []) } });
      zet('content.tag', r.tag);
      gewijzigd();
      render();
    } catch (err) { NB.fout(err); el.disabled = false; }
  };

  /**
   * De inhoud van een bericht uit Nieuws & updates, klaar voor een blok. Een
   * WebP-beeld kan een mail niet tonen: hier omzetten naar JPEG en opladen.
   * Gebruikt door het paneel (bericht wisselen) en door "+" in de brief.
   */
  NB.berichtInhoud = async function (id, vermijd) {
    var r = await NB.api('/api/snippets/' + id + '/overnemen', { method: 'POST', body: { vermijd: vermijd || [] } });
    var inhoud = r.inhoud;
    if (!inhoud.beeld && r.beeld_data) {
      try {
        var blob = await (await fetch(r.beeld_data)).blob();
        var jpg = await NB.naarMailbeeld(new File([blob], 'bericht.webp', { type: 'image/webp' }));
        var up = await NB.upload('/api/upload', jpg);
        inhoud.beeld = { url: up.url, plaats: 'tekst', na_alinea: 0, vulling: 'heel' };
      } catch (err) { NB.toast('Het beeld van het bericht kon niet omgezet worden; kies er zelf een.', 'warning'); }
    }
    return inhoud;
  };

  NB.changes['bericht-kies'] = async function (el) {
    var id = el.value;
    if (!id) return;
    var heeftTekst = String(lees('content.title') || lees('content.text') || '').trim();
    if (heeftTekst && Number(lees('content.snippet_id')) !== Number(id)) {
      var ja = await NB.bevestig({ titel: 'Ander bericht?', tekst: 'Titel, tekst, link en beeld worden vervangen door die van het gekozen bericht.', knop: 'Vervangen', soort: 'primary' });
      if (!ja) { el.value = lees('content.snippet_id') || ''; return; }
    }
    el.disabled = true;
    try {
      var inhoud = await NB.berichtInhoud(id, labelsInEditie());
      ['snippet_id', 'tag', 'title', 'text', 'quote', 'source', 'link_url', 'link_label', 'beeld', 'beeld_versie', 'door'].forEach(function (k) { zet('content.' + k, inhoud[k]); });
      if (!lees('content.vorm')) zet('content.vorm', volgendeVorm());
      zet('content.image_url', '');
      gewijzigd();
      render();
      NB.toast('Ingevuld uit Nieuws & updates.');
    } catch (err) { NB.fout(err); el.disabled = false; }
  };

  /** Kort nieuws: welke berichten (2 of 3). De vorm staat bij Opmaak. */
  function kortNieuwsKeuze() {
    if (NB.state.berichtenFout) return berichtenFout();
    setTimeout(snijNieuwsBeelden, 0);
    var boot = NB.state.boot;
    var max = boot.nieuws_max || 3;
    var items = lees('content.items') || [];
    var lijst = NB.state.berichten || [];
    var mag = s().can_edit;
    var gekozen = items.map(function (n) { return Number(n.snippet_id); });
    var beeldKnop = function (i) {
      var n = items[i];
      if (!n || !mag) return '';
      var t = n.beeld_thingie ? (NB.state.tekeningen || []).find(function (x) { return x.name === n.beeld_thingie; }) : null;
      var src = t ? t.svg : (n.beeld_url || '');
      return '<button type="button" class="btn btn-sm btn-ghost px-1 gap-1" data-action="nieuws-beeld" data-i="' + i + '" title="' + (src ? 'Beeld aanpassen' : 'Geen foto bij dit bericht: kies een tekening of beeld (komt ook op het bericht zelf)') + '">'
        + (src ? '<img src="' + e(src) + '" alt="" class="w-9 h-6 rounded object-cover border border-base-content/10">' : '<span class="w-9 h-6 rounded border-2 border-dashed border-warning/70 flex items-center justify-center text-warning text-xs">+</span>') + '</button>';
    };
    var keuze = function (i) {
      var huidig = items[i] ? Number(items[i].snippet_id) : 0;
      return '<div class="flex gap-2 items-center">' + beeldKnop(i) + '<select class="select select-bordered select-sm flex-1 min-w-0" data-change="nieuws-kies" data-i="' + i + '"' + (mag ? '' : ' disabled') + '>'
        + '<option value="">' + (lijst.length ? 'Kies een bericht…' : 'Geen gepubliceerde berichten gevonden') + '</option>'
        + lijst.map(function (b) {
          var al = b.id !== huidig && gekozen.indexOf(b.id) >= 0;
          return '<option value="' + b.id + '"' + (b.id === huidig ? ' selected' : '') + (al ? ' disabled' : '') + '>' + e(b.title) + '</option>';
        }).join('') + '</select>'
        + (mag && items[i] ? '<button class="btn btn-sm btn-ghost px-2" data-action="nieuws-weg" data-i="' + i + '" aria-label="Weghalen"><i data-lucide="x" class="w-4 h-4"></i></button>' : '') + '</div>';
    };
    var rijen = [];
    for (var i = 0; i < Math.min(max, items.length + 1); i++) rijen.push(keuze(i));
    return '<div class="flex flex-col gap-2"><span class="label-text text-xs">Berichten uit Nieuws &amp; updates (twee of drie)</span>' + rijen.join('')
      + (items.some(function (n) { return !n.beeld_url && !n.beeld_thingie; }) ? '<p class="text-[11px] opacity-60">Een bericht zonder foto (oranje vakje): kies er een tekening of beeld voor. Dat komt ook op het bericht zelf in Nieuws &amp; updates.</p>' : '')
      + '</div>' + berichtBron();
  }

  /**
   * Een beeld bij EEN kaartje van Kort nieuws: een tekening (gecentreerd op
   * een tint) of een foto (vult het vak). Het gaat ook naar het bericht in
   * Nieuws & updates, zodat de site hetzelfde beeld toont.
   */
  NB.actions['nieuws-beeld'] = function (el) {
    var i = Number(el.dataset.i);
    var n = (lees('content.items') || [])[i];
    if (!n) return;
    var huidig = n.beeld_thingie ? { thingie: n.beeld_thingie, plaats: 'tekst', vulling: 'heel' } : n.beeld_url ? { url: n.beeld_url, plaats: 'tekst', vulling: 'heel' } : null;
    NB.beeld.open({
      beeld: huidig,
      vast: 'nieuws',
      opslaan: async function (b) {
        var items = (lees('content.items') || []).slice();
        if (!items[i]) return;
        if (!b) { items[i] = Object.assign({}, items[i], { beeld_thingie: '', beeld_url: '' }); }
        else if (b.thingie) { items[i] = Object.assign({}, items[i], { beeld_thingie: b.thingie, beeld_url: '' }); }
        else { items[i] = Object.assign({}, items[i], { beeld_thingie: '', beeld_url: b.vulling === 'vullen' && b.uitsnede ? b.uitsnede : b.url }); }
        zet('content.items', items);
        gewijzigd();
        render();
        if (b && items[i].snippet_id) NB.beeldNaarBericht(items[i].snippet_id, b);
      },
    });
  };

  /** Hetzelfde beeld ook op het bericht in Nieuws & updates (een tekening als PNG). Faalt zacht. */
  NB.beeldNaarBericht = async function (snippetId, b) {
    try {
      var adres;
      if (b.thingie) {
        await NB.zorgVoorPng(b.thingie);
        var t = (NB.state.tekeningen || []).find(function (x) { return x.name === b.thingie; });
        var origin = (NB.state.boot && NB.state.boot.asset_origin) || '';
        adres = t && t.png ? origin + t.png : '';
      } else {
        adres = b.vulling === 'vullen' && b.uitsnede ? b.uitsnede : b.url;
      }
      if (!adres) return;
      var r = await NB.api('/api/snippets/' + snippetId + '/beeld', { method: 'POST', body: { url: adres } });
      NB.toast(r.gelukt ? 'Het beeld staat nu ook op het bericht in Nieuws & updates.' : 'Het beeld staat in de brief, maar kon niet op het bericht gezet worden.', r.gelukt ? 'success' : 'warning');
    } catch (err) { NB.toast('Het beeld staat in de brief, maar niet op het bericht: ' + err.message, 'warning'); }
  };

  function nieuwsVormKeuze() {
    var vormen = (NB.state.boot && NB.state.boot.nieuws_vormen) || [];
    if (!vormen.length) return '';
    return '<div><span class="label-text text-xs">Vorm van kort nieuws</span><div class="mt-1">' + keuzeKnoppen(vormen, lees('content.vorm') || 'tekst', 'nieuws-vorm', 'vorm', s().can_edit) + '</div></div>';
  }

  NB.actions['nieuws-vorm'] = function (el) { zet('content.vorm', el.dataset.vorm); gewijzigd(); render(); };

  NB.changes['nieuws-kies'] = async function (el) {
    var i = Number(el.dataset.i);
    var id = el.value;
    var items = (lees('content.items') || []).slice();
    if (!id) { items.splice(i, 1); zet('content.items', items); gewijzigd(); render(); return; }
    el.disabled = true;
    try {
      var kaart = await NB.api('/api/snippets/' + id + '/kort', { method: 'POST' });
      items[i] = kaart;
      zet('content.items', items);
      gewijzigd();
      render();
      snijNieuwsBeelden();
    } catch (err) { NB.fout(err); el.disabled = false; }
  };

  /**
   * Elke foto in Kort nieuws krijgt een bijgesneden kopie op 16:9 (het kader
   * "nieuws"), zodat elk kaartje even hoog is en de titels op één lijn staan.
   * Een mailprogramma kan niet zelf bijsnijden, dus het scherm doet het (canvas,
   * zoals in het beeldvenster). Loopt stil op de achtergrond; één keer per beeld.
   */
  var gesneden = {};
  async function snijNieuwsBeelden() {
    if (!s() || !s().can_edit || c().kind !== 'news' || !NB.beeld || !NB.beeld.snij) return;
    var items = lees('content.items') || [];
    for (var i = 0; i < items.length; i++) {
      var n = items[i];
      if (!n || !n.beeld_url || n.beeld_thingie) continue;
      if (n.beeld_uitsnede && n.beeld_versie_uitsnede === String(n.beeld_versie || '')) continue;
      var sleutel = n.beeld_url + '|' + (n.beeld_versie || '');
      if (gesneden[sleutel]) continue;
      gesneden[sleutel] = true;
      try {
        var url = await NB.beeld.snij({ url: n.beeld_url, plaats: 'nieuws', vulling: 'vullen', focus: { x: 0.5, y: 0.5 } }, 16 / 9);
        var lijst = (lees('content.items') || []).slice();
        var j = lijst.findIndex(function (x) { return x && x.beeld_url === n.beeld_url; });
        if (j < 0) continue;
        lijst[j] = Object.assign({}, lijst[j], { beeld_uitsnede: url, beeld_versie_uitsnede: String(n.beeld_versie || '') });
        zet('content.items', lijst);
        gewijzigd();
      } catch (err) {
        console.warn('[nieuwsbrieven] uitsnede voor kort nieuws mislukt:', err && err.message);
      }
    }
  }

  NB.actions['nieuws-weg'] = function (el) {
    var items = lees('content.items') || [];
    items.splice(Number(el.dataset.i), 1);
    gewijzigd(); render();
  };

  // ─── Vraag aan de lezer: EEN blok, drie soorten ───────────────────────────

  function zelfdeOpties(a, b) {
    var l = function (x) { return (x || []).map(function (o) { return String(o.label || '').trim().toLowerCase(); }).join('|'); };
    return l(a) === l(b);
  }

  /**
   * Een andere soort vraag. De antwoorden die nog de standaard waren, worden
   * de standaard van de nieuwe soort; eigen antwoorden blijven staan. Zo ook
   * het labeltje boven het blok: enkel als niemand het wijzigde.
   */
  NB.wisselVraagSoort = function (kind) {
    var cc = c();
    if (!cc || cc.kind === kind || !s() || !s().can_edit) return;
    var soorten = NB.state.boot.vraag_soorten || [];
    var oud = soorten.find(function (v) { return v.kind === cc.kind; });
    var nieuw = soorten.find(function (v) { return v.kind === kind; });
    if (!nieuw) return;
    var std = NB.state.boot.default_options || {};
    var huidige = (cc.content && cc.content.options) || [];
    if (!huidige.length || zelfdeOpties(huidige, std[cc.kind])) zet('content.options', JSON.parse(JSON.stringify(std[kind] || [])));
    if (!String(cc.title || '').trim() || (oud && cc.title === oud.titel)) cc.title = nieuw.titel;
    cc.kind = kind;
    gewijzigd();
    render();
  };

  NB.vraagOptieBij = function () {
    var lijst = (lees('content.options') || []).slice();
    if (lijst.length >= 6) return;
    // Meteen een eigen waarde: anders telt de knop in het voorbeeld niet mee
    // tot de server er een gaf.
    lijst.push({ value: 'optie-' + Date.now().toString(36), label: 'Nieuw antwoord' });
    zet('content.options', lijst);
    gewijzigd();
    render();
  };

  NB.vraagOptieWeg = function (i) {
    var lijst = (lees('content.options') || []).slice();
    if (lijst.length <= 2 || !lijst[i]) return;
    lijst.splice(i, 1);
    zet('content.options', lijst);
    gewijzigd();
    render();
  };

  /** Hoe opvallend de vraag staat (klein tot groot) en in welke kleur: opmaak, voor de hoofdredactie. */
  function vraagOpmaak() {
    var boot = NB.state.boot;
    var std = (boot.vraag_standaard || {})[c().kind] || {};
    var stijl = lees('content.stijl') || std.stijl;
    var kleur = lees('content.kleur') || std.kleur;
    var hex = (boot.vraag_oude_kleuren || {})[kleur] || kleur;
    var stijlen = (boot.vraag_stijlen || []).map(function (x) { return { key: x.key, label: x.label, uitleg: x.uitleg }; });
    return '<div><span class="label-text text-xs">Opbouw van de vraag</span><div class="mt-1">' + keuzeKnoppen(stijlen, stijl, 'vraag-stijl-zet', 'stijl', true) + '</div></div>'
      + '<div class="flex items-center gap-3"><span class="label-text text-xs">Kleur</span><button type="button" class="btn btn-sm btn-ghost gap-2 px-2" data-action="vraag-kleur-kies">' + NB.kleurBol(hex) + '<span>' + e(String(hex || '').toUpperCase()) + '</span></button></div>';
  }

  /** Stijl en kleur gaan via hun eigen route (enkel hoofdredactie) en meteen in het concept, anders bewaart de volgende keer de oude waarde. */
  async function zetVraagOpmaak(wat) {
    try {
      var bij = await NB.api('/api/contributions/' + s().item.id + '/vraagstijl', { method: 'POST', body: wat });
      s().item.content = bij.content;
      if (wat.stijl !== undefined) zet('content.stijl', bij.content.stijl);
      if (wat.kleur !== undefined) zet('content.kleur', bij.content.kleur);
      if (NB.vernieuwBrief) NB.vernieuwBrief();
      render();
    } catch (err) { NB.fout(err); }
  }
  NB.actions['vraag-stijl-zet'] = function (el) { return zetVraagOpmaak({ stijl: el.dataset.stijl }); };
  NB.actions['vraag-kleur-kies'] = function (el) {
    var r = el.getBoundingClientRect();
    NB.kleur.open({
      x: r.left, y: r.bottom, huidige: lees('content.kleur'),
      opKies: function (hex) { zetVraagOpmaak({ kleur: hex || '' }); },
    });
  };

  // ─── Opmaak van elk blok (hoofdredactie): achtergrond, inhoudstafel ──────

  NB.actions['achtergrond-kies'] = function (el) {
    var r = el.getBoundingClientRect();
    NB.kleur.open({
      x: r.left, y: r.bottom, huidige: lees('content.achtergrond'),
      opKies: async function (kleur) {
        try {
          var bij = await NB.api('/api/contributions/' + s().item.id + '/achtergrond', { method: 'POST', body: { kleur: kleur } });
          s().item.content = bij.content;
          zet('content.achtergrond', bij.content.achtergrond || undefined);
          if (NB.vernieuwBrief) NB.vernieuwBrief();
          render();
        } catch (err) { NB.fout(err); }
      },
    });
  };

  NB.actions['toc-zet'] = async function (el) {
    try {
      var aan = el.dataset.aan === '1';
      var bij = await NB.api('/api/contributions/' + s().item.id + '/in-toc', { method: 'POST', body: { in_toc: aan } });
      s().item.content = bij.content;
      zet('content.in_toc', aan);
      if (NB.vernieuwBrief) NB.vernieuwBrief();
      render();
    } catch (err) { NB.fout(err); }
  };

  function opmaakKaart() {
    if (!editor() || !s().edition || !actiefEditie()) return '';
    var kind = c().kind;
    var delen = [];
    if (NB.isVraag(kind)) delen.push(vraagOpmaak());
    if (kind === 'snippet' && lees('content.snippet_id')) delen.push(vormKeuze());
    if (kind === 'news') delen.push(nieuwsVormKeuze());
    if (kind === 'feature') delen.push(featureVormKeuze());
    var bg = lees('content.achtergrond');
    delen.push('<div class="flex items-center gap-3"><span class="label-text text-xs">Achtergrond van het blok</span><button type="button" class="btn btn-sm btn-ghost gap-2 px-2" data-action="achtergrond-kies">' + NB.kleurBol(bg) + '<span>' + (bg ? e(String(bg).toUpperCase()) : 'Standaard') + '</span></button></div>');
    if (kind !== 'toc' && kind !== 'intro') {
      var inToc = NB.inToc(s().item, c().content);
      delen.push('<label class="label cursor-pointer justify-start gap-3 py-1"><input type="checkbox" class="checkbox checkbox-sm" data-action="toc-zet" data-aan="' + (inToc ? '0' : '1') + '"' + (inToc ? ' checked' : '') + '><span class="label-text">In de inhoudstafel</span></label>');
    }
    return '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-4 gap-3"><h3 class="font-semibold text-sm flex items-center gap-2"><i data-lucide="layout-template" class="w-4 h-4"></i> Opmaak</h3>' + delen.join('') + '</div></div>';
  }

  // ─── Beeld (gedeeld venster, newsletters-beeld.js) ─────────────────────────

  var MET_EIGEN_BEELD = { intro: 1, article: 1, video: 1, link: 1, linkedin: 1, image: 1, snippet: 1, feature: 1 };
  NB.kanBeeld = function (kind) { return Boolean(MET_EIGEN_BEELD[kind]); };
  // Geen AI op een productfeature: die tekst is feitelijk en komt uit de bibliotheek.
  NB.kanAI = function (kind) { return !NB.isAuto(kind) && ['news', 'link', 'linkedin', 'image', 'snippet', 'heading', 'feature'].indexOf(kind) < 0; };

  NB.openBeeld = function () {
    var cc = c();
    if (!cc || !s().can_edit) return;
    var kind = cc.kind;
    var vast = kind === 'image' ? 'vol' : kind === 'video' ? 'video' : (kind === 'link' || kind === 'linkedin') ? 'link' : null;
    var fotoVeld = kind === 'video' ? 'thumbnail_url' : 'image_url';
    NB.beeld.open({
      beeld: NB.beeldVan(cc.content, fotoVeld, vast || 'rechts'),
      plaatsen: !vast,
      vast: vast,
      opslaan: function (b) {
        if (!vast) {
          NB.stukjeZet('content.thingie', '', { stil: true });
          NB.stukjeZet('content.image_url', '', { stil: true });
        } else {
          NB.stukjeZet('content.' + fotoVeld, '', { stil: true });
        }
        NB.stukjeZet('content.beeld', b);
        // Een bericht uit Nieuws & updates zonder foto: het beeld ook op het bericht zetten.
        if (kind === 'snippet' && b && cc.content.snippet_id && !cc.content.beeld_versie) NB.beeldNaarBericht(cc.content.snippet_id, b);
      },
    });
  };

  function beeldRij(label) {
    var b = NB.beeldVan(c().content, c().kind === 'video' ? 'thumbnail_url' : 'image_url', 'tekst');
    var t = b && b.thingie ? (NB.state.tekeningen || []).find(function (x) { return x.name === b.thingie; }) : null;
    var src = !b ? '' : b.thingie ? (t ? t.svg : '') : (b.vulling === 'vullen' && b.uitsnede ? b.uitsnede : b.url);
    return '<div class="flex flex-col gap-1"><span class="label-text text-xs">' + e(label) + '</span><div class="flex items-center gap-3">'
      + (src ? '<img src="' + e(src) + '" alt="" class="w-20 h-14 rounded-lg border border-base-content/10 ' + (b.thingie ? 'object-contain' : 'object-cover') + '">'
        : '<div class="w-20 h-14 rounded-lg border-2 border-dashed border-base-content/20 flex items-center justify-center text-xl opacity-50">+</div>')
      + (s().can_edit ? '<button class="btn btn-sm" data-action="beeld-open">' + (b ? 'Aanpassen' : 'Beeld kiezen') + '</button>' : '')
      + '</div></div>';
  }
  NB.actions['beeld-open'] = function () { NB.openBeeld(); };

  // ─── Titel: niveau (H1, H2, H3) en een tekening als icoon ──────────────────

  function niveauKeuze() {
    var niveaus = (NB.state.boot && NB.state.boot.titel_niveaus) || [];
    var nu = lees('content.niveau') || 'h1';
    return '<div><span class="label-text text-xs">Grootte</span><div class="join mt-1">' + niveaus.map(function (n) {
      return '<button type="button" class="btn btn-sm join-item' + (n.key === nu ? ' btn-primary' : '') + '" data-action="niveau-zet" data-niveau="' + e(n.key) + '" title="' + e(n.uitleg) + '"' + (s().can_edit ? '' : ' disabled') + '>' + e(n.label) + '</button>';
    }).join('') + '</div></div>';
  }

  function icoonRij() {
    var naam = lees('content.icoon');
    var t = naam ? (NB.state.tekeningen || []).find(function (x) { return x.name === naam; }) : null;
    return '<div class="flex flex-col gap-1"><span class="label-text text-xs">Tekening voor de titel</span><div class="flex items-center gap-3">'
      + (t ? '<img src="' + e(t.svg) + '" alt="" class="w-12 h-12 rounded-lg border border-base-content/10 object-contain">' : '<div class="w-12 h-12 rounded-lg border-2 border-dashed border-base-content/20 flex items-center justify-center text-xl opacity-50">+</div>')
      + (s().can_edit ? '<button class="btn btn-sm" data-action="icoon-open">' + (t ? 'Andere' : 'Kiezen') + '</button>' : '')
      + (t && s().can_edit ? '<button class="btn btn-sm btn-ghost" data-action="icoon-weg">Weg</button>' : '')
      + '</div></div>';
  }

  NB.zetNiveau = function (niveau) {
    if (!c() || !s().can_edit) return;
    zet('content.niveau', niveau);
    gewijzigd();
    render();
  };
  NB.actions['niveau-zet'] = function (el) { NB.zetNiveau(el.dataset.niveau); };

  NB.openIcoon = async function () {
    if (!c() || !s().can_edit) return;
    var bak = document.getElementById('icoonLijst');
    bak.innerHTML = '<div class="col-span-full flex justify-center py-6"><span class="loading loading-spinner"></span></div>';
    NB.dialoog('dlgIcoon').showModal();
    var lijst = await NB.laadTekeningen();
    var nu = lees('content.icoon');
    bak.innerHTML = lijst.length ? lijst.map(function (t) {
      return '<button type="button" class="rounded-xl border p-2 hover:border-primary ' + (t.name === nu ? 'border-primary bg-primary/10' : 'border-base-content/10') + '" data-action="icoon-kies" data-naam="' + e(t.name) + '" title="' + e(t.label) + '"><img src="' + e(t.svg) + '" alt="' + e(t.label) + '" class="w-full aspect-square object-contain"></button>';
    }).join('') : '<p class="col-span-full text-sm opacity-60">Geen tekeningen gevonden in Assetbeheer.</p>';
  };
  NB.actions['icoon-open'] = function () { return NB.openIcoon(); };
  NB.actions['icoon-kies'] = function (el) {
    var naam = el.dataset.naam;
    NB.zorgVoorPng(naam).catch(function (err) { NB.toast('PNG van de tekening maken mislukt: ' + err.message, 'warning'); });
    zet('content.icoon', naam);
    NB.dialoog('dlgIcoon').close();
    gewijzigd();
    render();
  };
  NB.actions['icoon-weg'] = function () {
    zet('content.icoon', '');
    var dlg = NB.dialoog('dlgIcoon');
    if (dlg.open) dlg.close();
    gewijzigd();
    render();
  };

  // ─── Video: dezelfde Vimeo-kiezer als bij de events ───────────────────────

  NB.openVideo = async function () {
    if (!c() || !s().can_edit) return;
    document.getElementById('videoLink').value = lees('content.video_url') || '';
    document.getElementById('videoZoek').value = '';
    NB.dialoog('dlgVideo').showModal();
    await laadVideos('');
  };
  NB.actions['video-open'] = function () { return NB.openVideo(); };
  NB.actions['video-zoek'] = function () { return laadVideos(document.getElementById('videoZoek').value); };

  async function laadVideos(zoek) {
    var bak = document.getElementById('videoLijst');
    bak.innerHTML = '<p class="text-sm opacity-60 col-span-full">Laden…</p>';
    try {
      var data = await NB.api('/api/vimeo/videos?q=' + encodeURIComponent(zoek || ''));
      if (!data.configured) {
        bak.innerHTML = '<div class="col-span-full alert alert-info text-sm"><span>De Vimeo-lijst staat uit (geen VIMEO_ACCESS_TOKEN in de Worker). Een link plakken werkt wel.</span></div>';
        return;
      }
      if (data.status === 'unauthorized' || data.status === 'error') {
        bak.innerHTML = '<div class="col-span-full alert alert-warning text-sm"><span>' + e(data.error || 'Vimeo is niet bereikbaar.') + '</span></div>';
        return;
      }
      if (!data.videos.length) { bak.innerHTML = '<p class="text-sm opacity-60 col-span-full">Niets gevonden.</p>'; return; }
      bak.innerHTML = data.videos.map(function (v) {
        var min = Math.floor((v.duration_seconds || 0) / 60);
        var sec = String((v.duration_seconds || 0) % 60).padStart(2, '0');
        var prive = v.privacy && v.privacy !== 'anybody' ? '<span class="badge badge-warning badge-xs mt-1">niet openbaar</span>' : '';
        return '<button class="group flex flex-col items-stretch justify-start text-left w-full" data-action="video-kies" data-id="' + e(v.id) + '">'
          + '<img src="' + e(v.thumbnail_url) + '" alt="" class="rounded w-full aspect-video object-cover bg-base-300 group-hover:ring-2 ring-primary">'
          + '<span class="text-xs mt-1 line-clamp-2 min-h-[2.5em] leading-snug">' + e(v.title) + '</span>'
          + '<span class="text-xs opacity-50">' + min + ':' + sec + '</span>' + (prive ? '<span>' + prive + '</span>' : '') + '</button>';
      }).join('');
    } catch (err) { bak.innerHTML = '<p class="text-sm text-error col-span-full">' + e(err.message) + '</p>'; }
  }

  async function zetVideo(body) {
    var v = await NB.api('/api/video', { method: 'POST', body: body });
    zet('content.video_url', v.url);
    zet('content.thumbnail_url', v.thumbnail_url);
    // Het stilstaand beeld komt van de video; een eigen beeld van vroeger valt weg.
    zet('content.beeld', null);
    NB.dialoog('dlgVideo').close();
    gewijzigd();
    render();
    NB.toast('Video gekozen: ' + v.title);
  }
  NB.actions['video-kies'] = function (el) { return zetVideo({ vimeo_id: el.dataset.id }); };
  NB.actions['video-link'] = function () {
    var adres = document.getElementById('videoLink').value.trim();
    if (!adres) { NB.toast('Plak eerst een link.', 'warning'); return; }
    return zetVideo({ url: adres });
  };

  // ─── Schrijf met AI ───────────────────────────────────────────────────────

  NB.openAI = function () {
    var cc = c();
    if (!cc || !s().can_edit) return;
    document.getElementById('dlgAIInhoud').innerHTML = '<h3 class="font-bold text-lg mb-1 flex items-center gap-2"><i data-lucide="sparkles" class="w-5 h-5 text-primary"></i> Schrijf met AI</h3>'
      + '<p class="text-sm opacity-70 mb-3">Zet in steekwoorden wat je kwijt wil. Je krijgt een voorstel; jij kiest of je het overneemt.</p>'
      + '<textarea class="textarea textarea-bordered w-full" rows="5" data-veld="raw_notes" placeholder="Bv. nieuwe vormgeving, zelfde info, elke maand, veel leesplezier">' + e(cc.raw_notes || '') + '</textarea>'
      + '<div class="flex flex-wrap gap-2 mt-3"><button class="btn btn-sm btn-primary" data-action="ai" data-ai="write"><i data-lucide="sparkles" class="w-4 h-4"></i> Schrijf het voor me</button>'
      + '<button class="btn btn-sm btn-ghost" data-action="ai" data-ai="shorter">Korter</button><button class="btn btn-sm btn-ghost" data-action="ai" data-ai="warmer">Warmer</button><button class="btn btn-sm btn-ghost" data-action="ai" data-ai="spelling">Spelling nakijken</button></div>'
      + '<div id="stVoorstel" class="mt-3"></div>'
      + '<div class="modal-action mt-3"><button class="btn btn-ghost btn-sm" data-action="sluit-dialoog" data-dialoog="dlgAI">Sluiten</button></div>';
    NB.ikons();
    NB.dialoog('dlgAI').showModal();
  };

  NB.actions['ai'] = async function (el) {
    var bak = document.getElementById('stVoorstel');
    bak.innerHTML = '<span class="loading loading-dots loading-sm"></span>';
    try {
      var v = await NB.api('/api/contributions/' + s().item.id + '/ai', {
        method: 'POST', body: { action: el.dataset.ai, kind: c().kind, title: c().title, content: c().content, notes: c().raw_notes },
      });
      NB.state.aiVoorstel = v;
      var kern = v.question !== undefined
        ? '<div class="font-semibold">' + e(v.question) + '</div><div class="text-sm">' + e(v.intro) + '</div><div class="flex flex-wrap gap-1 mt-1">' + (v.options || []).map(function (o) { return '<span class="badge">' + e(o) + '</span>'; }).join('') + '</div>'
        : v.quote !== undefined ? '<div class="italic">' + e(v.quote) + '</div>'
          : '<div class="font-semibold">' + e(v.title) + '</div><div class="text-sm whitespace-pre-line mt-1">' + e(v.text) + '</div>';
      bak.innerHTML = '<div class="bg-success/10 border border-success/30 rounded-xl p-4"><div class="text-xs font-bold uppercase tracking-wide opacity-70 mb-2">Voorstel</div>' + kern
        + '<div class="flex gap-2 mt-3"><button class="btn btn-sm btn-success" data-action="ai-overnemen">Overnemen</button><button class="btn btn-sm btn-ghost" data-action="ai" data-ai="' + e(el.dataset.ai) + '">Nog een voorstel</button></div></div>';
    } catch (err) {
      bak.innerHTML = '';
      NB.fout(err);
    }
  };

  NB.actions['ai-overnemen'] = function () {
    var v = NB.state.aiVoorstel;
    if (!v) return;
    if (v.question !== undefined) {
      zet('content.question', v.question);
      zet('content.intro', v.intro);
      if ((v.options || []).length >= 2) {
        var oud = lees('content.options') || [];
        zet('content.options', v.options.map(function (label, i) {
          // De waarde van een bestaande knop blijft staan; enkel het opschrift wijzigt.
          return oud[i] ? { value: oud[i].value, label: label } : { label: label };
        }));
      }
    } else if (v.quote !== undefined) {
      zet('content.quote', v.quote);
    } else {
      zet('content.title', v.title);
      zet('content.text', v.text);
    }
    NB.state.aiVoorstel = null;
    var dlg = document.getElementById('dlgAI');
    if (dlg && dlg.open) dlg.close();
    gewijzigd(); render();
  };

  // ─── Instellingen per soort (wat de lezer niet ziet) ──────────────────────

  function eventsVeld() {
    var events = NB.state.stukjeEvents || [];
    var uit = (lees('content.exclude_ids') || []).map(Number);
    return '<div><span class="label-text text-xs">Events in deze editie (uit Eventbeheer, vanaf de verzenddag)</span>'
      + (events.length ? events.map(function (ev) {
        var aan = uit.indexOf(Number(ev.id)) < 0;
        return '<label class="label cursor-pointer justify-start gap-3 py-1"><input type="checkbox" class="checkbox checkbox-sm" data-action="event-toggle" data-id="' + ev.id + '"' + (aan ? ' checked' : '') + '>'
          + '<span class="label-text text-sm">' + e(NB.datum(ev.starts_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) + ' · ' + e(ev.title) + '</span></label>';
      }).join('') : '<p class="text-sm opacity-60 mt-1">Geen gepubliceerde events in die periode. Dan valt de agenda weg uit de mail.</p>')
      + '</div>';
  }

  function instellingen(kind) {
    switch (kind) {
      case 'intro':
        return uitleg('Titel en tekst typ je <strong>in de brief</strong>. Boven het blok: Schrijf met AI en Tekening of foto.') + ondertekenaarKeuze();
      case 'heading':
        return uitleg('Typ de titel <strong>in de brief</strong>. Ze komt als kopje in de inhoudstafel.')
          + niveauKeuze() + icoonRij();
      case 'article':
        return uitleg('Label, titel en tekst typ je <strong>in de brief</strong>. Boven het blok: Schrijf met AI en Tekening of foto.')
          + '<div class="grid grid-cols-2 gap-2">' + veld('Link (optioneel)', 'content.link_url', { hint: 'https://' }) + veld('Tekst van de link', 'content.link_label', { hint: 'Lees verder' }) + '</div>';
      case 'snippet':
        return berichtKeuze() + (lees('content.snippet_id')
          ? labelVeld() + doorRegel()
            + (!lees('content.beeld_versie') ? uitleg('Dit bericht heeft geen foto in Nieuws &amp; updates. Kies er met <strong>+ Beeld</strong> boven het blok een tekening of beeld voor: dat komt ook op het bericht zelf.') : '')
            + berichtBron()
          : '');
      case 'video':
        return uitleg('In de brief staat enkel het stilstaand beeld; klikken opent de video. Een titel of tekst erbij? Zet er een tekstblok naast.')
          + '<div class="flex items-center gap-2">' + (s().can_edit ? '<button class="btn btn-sm btn-primary" data-action="video-open"><i data-lucide="circle-play" class="w-4 h-4"></i> ' + (lees('content.video_url') ? 'Andere video' : 'Video kiezen') + '</button>' : '')
          + (lees('content.video_url') ? '<a class="link text-xs truncate" href="' + e(lees('content.video_url')) + '" target="_blank" rel="noopener">' + e(lees('content.video_url')) + '</a>' : '') + '</div>'
          + (lees('content.video_url') ? beeldRij('Stilstaand beeld (komt van de video; kies er zelf een om het te vervangen)') : '');
      case 'link':
      case 'linkedin':
        return '<div class="flex gap-2 items-end">' + veld('Link', 'content.url', { hint: 'https://' }) + (s().can_edit ? '<button class="btn btn-sm" data-action="link-ophalen">Ophalen</button>' : '') + '</div>'
          + uitleg('Titel en tekst typ je <strong>in de brief</strong>; "Ophalen" vult ze vooraf in.')
          + beeldRij('Beeld')
          + (kind === 'linkedin' ? veld('Van wie is de post?', 'content.author_name') : veld('Naam van de site', 'content.site_name'));
      case 'image':
        return uitleg('Klik <strong>in de brief</strong> op het beeld om het te kiezen; het bijschrift typ je eronder.')
          + veld('Link bij een klik (optioneel)', 'content.link_url', { hint: 'https://' });
      case 'quote':
        return uitleg('Het citaat, wie het zei en de functie typ je <strong>in de brief</strong>.');
      case 'statement':
      case 'question':
      case 'poll':
        return uitleg('Kies boven het blok de <strong>soort vraag</strong>; vraag en antwoorden typ je <strong>in de brief</strong>. Een antwoord weg? Het kruisje ernaast.')
          + vinkje('Vraag na de klik om een korte toelichting', 'content.ask_comment') + vinkje('Toon de tussenstand na het antwoorden', 'content.show_results')
          + '<p class="text-[11px] opacity-60">Antwoorden worden hier geteld en bewaard. Wat er in Odoo mee gebeurt, staat in Koppelingen onder "Nieuwsbrief-antwoorden".</p>';
      case 'events':
        return uitleg('Het labeltje (bv. "Schrijf je in") en de kop typ je <strong>in de brief</strong>. Voor elke volgende editie pas je de naam van de rubriek aan in de instellingen van de reeks.') + eventsVeld();
      case 'news':
        return uitleg('De kop typ je <strong>in de brief</strong>.') + kortNieuwsKeuze();
      case 'feature':
        return featureVelden();
      case 'toc':
        return '<p class="text-sm opacity-70">De inhoudstafel maakt zichzelf uit de titels van de andere blokken.</p>';
      case 'closing':
        return uitleg('Titel, tekst en knoptekst typ je <strong>in de brief</strong>. De gezichten van wie meeschreef komen er vanzelf bij.')
          + veld('Zin bij de gezichten', 'content.together_label', { hint: 'Deze editie maakten we samen:' })
          + veld('Link van de knop', 'content.button_url', { hint: 'https://' });
      default:
        return '';
    }
  }

  /** Blokken waarvan het labeltje NIET in de brief typbaar is: dan hier. */
  var NAAM_HIER = { video: 1, link: 1, linkedin: 1, snippet: 1, news: 1, toc: 1, image: 1 };

  function soortKeuze() {
    var kind = c().kind;
    if (NB.isAuto(kind) || !s().can_edit) return '';
    var kinds = NB.state.boot.kinds;
    var keuzes = Object.keys(kinds).filter(function (k) { return !kinds[k].auto && k !== 'news' && !kinds[k].interactive; });
    if (NB.isVraag(kind)) keuzes.unshift(kind);
    return '<div class="flex flex-wrap gap-1">' + keuzes.map(function (k) {
      return '<button class="btn btn-xs ' + (k === kind ? 'btn-primary' : 'btn-ghost border border-base-content/10') + '" data-action="kies-soort" data-kind="' + k + '">' + e(kinds[k].label) + '</button>';
    }).join('') + '</div>';
  }

  function actiefEditie() {
    var ed = s().edition;
    return Boolean(ed && ['collecting', 'review'].indexOf(ed.status) >= 0);
  }

  function statusKnoppen() {
    var st = s();
    var stand = st.item.status;
    var auto = NB.isAuto(st.item.kind);
    var k = [];
    if (!actiefEditie() || auto) return k;
    if (st.can_edit && (stand === 'open' || stand === 'draft')) {
      k.push('<button class="btn btn-primary btn-sm flex-1" data-action="zet-status" data-status="submitted"><i data-lucide="send-horizontal" class="w-4 h-4"></i> Inleveren</button>');
    }
    if (editor() && stand === 'submitted') {
      k.push('<button class="btn btn-success btn-sm flex-1" data-action="zet-status" data-status="approved"><i data-lucide="badge-check" class="w-4 h-4"></i> Bevestigen</button>');
      k.push('<button class="btn btn-ghost btn-sm" data-action="zet-status" data-status="draft">Terug naar de schrijver</button>');
    }
    if (editor() && stand === 'draft') k.push('<button class="btn btn-success btn-outline btn-sm" data-action="zet-status" data-status="approved">Meteen bevestigen</button>');
    if (st.can_edit && stand === 'approved') k.push('<button class="btn btn-ghost btn-sm" data-action="zet-status" data-status="draft">Terug naar concept</button>');
    return k;
  }

  function opmerkingen() {
    var st = s();
    var n = st.comments.length;
    return '<details class="collapse collapse-arrow bg-base-100 border border-base-content/10"' + (n ? ' open' : '') + '><summary class="collapse-title font-semibold text-sm min-h-0 py-3">Opmerkingen' + (n ? ' (' + n + ')' : '') + '</summary><div class="collapse-content flex flex-col gap-3">'
      + st.comments.map(function (m) {
        return '<div class="flex gap-2">' + NB.gezicht(m.user_name) + '<div class="bg-base-200 rounded-xl px-3 py-2 text-sm flex-1"><strong>' + e(NB.voornaam(m.user_name)) + '</strong> <span class="opacity-50 text-xs">' + e(NB.datum(m.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) + '</span><div class="whitespace-pre-line">' + e(m.body) + '</div></div></div>';
      }).join('')
      + '<textarea id="stOpmerking" class="textarea textarea-bordered textarea-sm" rows="2" placeholder="Vraag of reageer…"></textarea>'
      + '<button class="btn btn-sm self-end" data-action="plaats-opmerking">Plaatsen</button></div></details>';
  }

  function render() {
    var bak = document.getElementById('nbPaneel');
    if (!bak || !s()) return;
    var st = s();
    var it = st.item;
    var ed = st.edition;
    var kind = c().kind;
    var auto = NB.isAuto(kind);
    var mijn = it.owner_user_id === NB.state.boot.me.id;
    var wie = it.owner_name ? (mijn ? 'Voor jou' : 'Van ' + it.owner_name) : 'Nog aan niemand toegewezen';
    var tegen = actiefEditie() && !auto && (it.status === 'open' || it.status === 'draft')
      ? '<div class="text-xs opacity-70">Inleverdatum ' + e(NB.datum(ed.deadline_at, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })) + ' · ' + e(NB.tellerTekst(ed.deadline_at)) + '</div>' : '';
    var stand = auto ? 'Vult zichzelf' : ((NB.STATUS[it.status] || {}).zin || '');
    var hint = st.hint ? '<div class="flex gap-2 text-xs bg-primary/5 border border-primary/20 rounded-xl p-2.5"><i data-lucide="lightbulb" class="w-4 h-4 shrink-0 mt-0.5 text-primary"></i><span>' + e(st.hint) + '</span></div>' : '';
    var knoppen = st.can_edit || editor() ? statusKnoppen() : [];
    var naam = NAAM_HIER[kind] && !auto
      ? '<input class="input input-ghost input-sm text-base font-bold px-1 w-full" data-veld="title" value="' + e(c().title) + '" placeholder="' + e(NB.soort(kind)) + '" aria-label="Naam boven het blok" title="Het labeltje boven het blok in de mail"' + (st.can_edit ? '' : ' disabled') + '>'
      : '<div class="text-base font-bold px-1 truncate">' + e(NB.blokNaam(Object.assign({}, it, { title: c().title, content: c().content }))) + '</div>';
    var beheer = editor() && actiefEditie()
      ? '<details class="collapse collapse-arrow bg-base-100 border border-base-content/10"><summary class="collapse-title font-semibold text-sm min-h-0 py-3">Hoofdredactie</summary><div class="collapse-content flex flex-col gap-3">'
        + (auto ? '<p class="text-sm opacity-70">Dit blok vult zichzelf.</p>' : '<label class="form-control"><span class="label-text text-xs mb-1">Wie schrijft het?</span><select class="select select-bordered select-sm" data-change="eigenaar" data-id="' + e(it.id) + '">' + NB.gebruikersOpties(it.owner_user_id, true) + '</select></label>')
        + (auto ? '' : '<div><span class="label-text text-xs">Soort blok</span><div class="mt-1">' + soortKeuze() + '</div></div>')
        + '</div></details>'
      : '';

    bak.innerHTML = '<div class="flex flex-col gap-3 nb-regie-klein">'
      + '<div class="card bg-base-100 border border-primary/40"><div class="card-body gap-3">'
      + '<div class="flex items-center gap-2"><button class="btn btn-ghost btn-sm px-2" data-action="paneel-sluit"><i data-lucide="arrow-left" class="w-4 h-4"></i> Editie</button>'
      + '<span id="stBewaard" class="text-xs opacity-60 ml-auto">' + (st.can_edit ? 'Bewaart vanzelf' : 'Alleen lezen') + '</span></div>'
      + '<div>' + naam
      + '<div class="flex flex-wrap items-center gap-2 text-sm mt-1 px-1"><span id="stStatus">' + (auto ? '<span class="badge badge-sm badge-ghost">Automatisch</span>' : NB.statusBadge(it.status)) + '</span><span class="opacity-70 text-xs">' + e(stand) + '</span></div>'
      + '<div class="text-xs opacity-70 px-1 mt-1">' + e(wie) + '</div>' + (tegen ? '<div class="px-1">' + tegen + '</div>' : '') + '</div>'
      + hint
      + '<div class="flex flex-col gap-3">' + instellingen(kind) + '</div>'
      + '</div></div>'
      + (knoppen.length ? '<div class="sticky bottom-0 z-10 bg-base-100 border border-base-content/10 rounded-xl p-2 flex flex-wrap gap-2 shadow-sm">' + knoppen.join('') + '</div>' : '')
      + opmaakKaart() + beheer + opmerkingen()
      + '</div>';
    NB.ikons();
  }

  function zetStukje(d) {
    NB.state.stukje = d;
    NB.state.vuil = false;
    NB.state.concept = {
      kind: d.item.kind, title: d.item.title, content: JSON.parse(JSON.stringify(d.item.content || {})),
      raw_notes: d.item.raw_notes || '', series_ids: (d.item.series_ids || []).slice(),
    };
    // Een inleiding heeft geen rubrieknaam (er staat geen label boven in de
    // mail). Een blok dat er een werd, draagt nog de oude naam: rechtzetten.
    if (d.item.kind === 'intro' && d.item.title !== NB.soort('intro') && d.can_edit) {
      NB.state.concept.title = NB.soort('intro');
      NB.state.vuil = true;
      setTimeout(bewaar, 0);
    }
  }

  function laadExtra(d) {
    var wacht = [NB.laadTekeningen()];
    if (d.item.kind === 'snippet' || d.item.kind === 'news') wacht.push(NB.laadBerichten());
    if (d.item.kind === 'heading') wacht.push(NB.laadTekeningen());
    if (d.item.kind === 'events' && d.edition) {
      wacht.push(NB.api('/api/editions/' + d.edition.id + '/suggestions').then(function (r) { NB.state.stukjeEvents = r.events || []; }).catch(function () { NB.state.stukjeEvents = []; }));
    }
    return Promise.all(wacht);
  }

  /** Een stukje opent altijd op de redactietafel, naast de brief. */
  NB.views.stukje = async function (params) {
    var d = await NB.api('/api/contributions/' + params.id);
    if (d.edition && NB.views.editie) { await NB.views.editie({ id: d.edition.id, stukje: d }); return; }
    // Een idee in de voorraad: geen brief, enkel het ideevenster op het overzicht.
    document.body.classList.remove('nb-werk');
    document.getElementById('nbBanner').classList.remove('hidden');
    await NB.views.overzicht();
    NB.actions['open-idee']({ dataset: { id: d.item.id } });
  };

  NB.stukjeInPaneel = async function (d) {
    zetStukje(d);
    await laadExtra(d);
    render();
  };

  // ─── Invoer en acties ─────────────────────────────────────────────────────

  NB.inputs.veld = function (el) {
    var pad = el.dataset.veld;
    var waarde = el.type === 'checkbox' ? el.checked : el.value;
    // Een lijstveld (bv. de USP's): één regel = één punt.
    if (el.dataset.lijst) waarde = String(waarde).split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    zet(pad, waarde);
    // Notities voor de AI staan niet in de mail: de brief hoeft niet opnieuw.
    if (pad === 'raw_notes') { gewijzigdStil(); return; }
    gewijzigd();
  };

  NB.actions['kies-soort'] = function (el) {
    var nieuw = el.dataset.kind;
    var oud = c();
    if (nieuw === oud.kind) return;
    var behoud = { title: oud.content.title, text: oud.content.text };
    oud.kind = nieuw;
    if (nieuw === 'intro') oud.title = NB.soort('intro');
    if (NB.isVraag(nieuw)) {
      oud.content = { question: oud.content.question || behoud.title || '', intro: oud.content.intro || '', options: oud.content.options || [], ask_comment: true, show_results: true };
    } else if (nieuw === 'quote') {
      oud.content = { quote: oud.content.quote || behoud.text || '' };
    } else {
      oud.content = Object.assign({}, { title: behoud.title || oud.content.question || '', text: behoud.text || oud.content.intro || '' });
    }
    gewijzigd();
    render();
  };

  NB.actions['event-toggle'] = function (el) {
    var uit = (lees('content.exclude_ids') || []).map(Number);
    var id = Number(el.dataset.id);
    uit = el.checked ? uit.filter(function (x) { return x !== id; }) : uit.concat([id]);
    zet('content.exclude_ids', uit);
    gewijzigd();
  };

  NB.actions['link-ophalen'] = async function (el) {
    var adres = lees('content.url');
    if (!adres) { NB.toast('Plak eerst een link.', 'warning'); return; }
    el.disabled = true;
    try {
      var v = await NB.api('/api/link-preview', { method: 'POST', body: { url: adres } });
      zet('content.url', v.url);
      if (v.title) zet('content.title', v.title);
      if (v.text) zet('content.text', v.text);
      // Een nieuwe link = een nieuw beeld: het oude (bijgesneden) beeld valt weg.
      if (v.image_url) { zet('content.image_url', v.image_url); zet('content.beeld', null); }
      if (v.site_name) zet('content.site_name', v.site_name);
      if (v.author_name) zet('content.author_name', v.author_name);
      gewijzigd(); render();
    } catch (err) { NB.fout(err); }
    el.disabled = false;
  };

  NB.actions['zet-status'] = async function (el) {
    await bewaar();
    try {
      var bij = await NB.api('/api/contributions/' + s().item.id + '/status', { method: 'POST', body: { status: el.dataset.status } });
      s().item = Object.assign({}, s().item, bij);
      NB.toast(el.dataset.status === 'submitted' ? 'Ingeleverd. Dank je!' : el.dataset.status === 'approved' ? 'Bevestigd.' : 'Terug naar concept.');
      if (NB.stukjeBijgewerkt) NB.stukjeBijgewerkt(s().item);
      if (NB.vernieuwStand) NB.vernieuwStand();
      render();
    } catch (err) { NB.fout(err); }
  };

  NB.actions['plaats-opmerking'] = async function () {
    var veldEl = document.getElementById('stOpmerking');
    var tekst = veldEl.value.trim();
    if (!tekst) return;
    try {
      var r = await NB.api('/api/contributions/' + s().item.id + '/comments', { method: 'POST', body: { body: tekst } });
      s().comments.push(r);
      await bewaar();
      render();
    } catch (err) { NB.fout(err); }
  };
})();
