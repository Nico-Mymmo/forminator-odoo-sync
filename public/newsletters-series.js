/**
 * Nieuwsbrieven -- instellingen van een reeks (hoofdredactie): doelgroep,
 * afzender, ritme, chatkanaal, koppeling voor de antwoorden en de vaste
 * rubrieken met hun eigenaar. In gewone taal: de Odoo-lijsten, het
 * chatkanaal en de hoofdredactie kies je uit een lijst, je typt geen
 * nummers of namen over.
 */
(function () {
  'use strict';
  var NB = window.NB;
  var e = NB.esc;

  function invoer(label, naam, waarde, opties) {
    opties = opties || {};
    var veld = opties.rijen
      ? '<textarea class="textarea textarea-bordered textarea-sm" rows="' + opties.rijen + '" data-reeks="' + naam + '">' + e(waarde) + '</textarea>'
      : '<input class="input input-bordered input-sm" type="' + (opties.type || 'text') + '" data-reeks="' + naam + '" value="' + e(waarde) + '"' + (opties.min !== undefined ? ' min="' + opties.min + '" max="' + opties.max + '"' : '') + '>';
    return '<label class="form-control"><span class="label-text mb-1">' + e(label) + '</span>' + veld
      + (opties.uitleg ? '<span class="label-text-alt opacity-60 mt-1">' + e(opties.uitleg) + '</span>' : '') + '</label>';
  }

  function vinkjes(naam, lijst, gekozen, leegTekst) {
    if (!lijst.length) return '<p class="text-sm opacity-60">' + e(leegTekst) + '</p>';
    return '<div class="flex flex-col gap-1">' + lijst.map(function (x) {
      return '<label class="label cursor-pointer justify-start gap-3 py-1"><input type="checkbox" class="checkbox checkbox-sm" data-change="' + naam + '" value="' + e(x.id) + '"' + (gekozen.indexOf(x.id) >= 0 ? ' checked' : '') + '><span class="label-text">' + e(x.label) + '</span></label>';
    }).join('') + '</div>';
  }

  function rubriekRij(r, i, aantal) {
    var kinds = NB.state.boot.kinds;
    return '<div class="border border-base-content/10 rounded-xl p-3 grid gap-2 md:grid-cols-[1fr_180px_180px_auto] items-end">'
      + '<label class="form-control"><span class="label-text text-xs">Naam</span><input class="input input-bordered input-sm" data-rubriek="' + i + '" data-sleutel="title" value="' + e(r.title) + '"></label>'
      + '<label class="form-control"><span class="label-text text-xs">Soort</span><select class="select select-bordered select-sm" data-rubriek="' + i + '" data-sleutel="kind">'
      + Object.keys(kinds).map(function (k) { return '<option value="' + k + '"' + (k === r.kind ? ' selected' : '') + '>' + e(kinds[k].label) + '</option>'; }).join('') + '</select></label>'
      + '<label class="form-control"><span class="label-text text-xs">Wie schrijft het</span><select class="select select-bordered select-sm" data-rubriek="' + i + '" data-sleutel="owner_user_id">' + NB.gebruikersOpties(r.owner_user_id, true) + '</select></label>'
      + '<div class="flex gap-1">'
      + '<button class="btn btn-sm btn-ghost" data-action="rubriek-schuif" data-i="' + i + '" data-richting="-1" aria-label="Omhoog"' + (i === 0 ? ' disabled' : '') + '><i data-lucide="arrow-up" class="w-4 h-4"></i></button>'
      + '<button class="btn btn-sm btn-ghost" data-action="rubriek-schuif" data-i="' + i + '" data-richting="1" aria-label="Omlaag"' + (i === aantal - 1 ? ' disabled' : '') + '><i data-lucide="arrow-down" class="w-4 h-4"></i></button>'
      + '<button class="btn btn-sm btn-ghost" data-action="rubriek-weg" data-i="' + i + '" aria-label="Weg"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div>'
      + '<label class="form-control md:col-span-4"><span class="label-text text-xs">Wat hoort erin (staat bij de opdracht, en stuurt de AI)</span><input class="input input-bordered input-sm" data-rubriek="' + i + '" data-sleutel="hint" value="' + e(r.hint || '') + '"></label>'
      + '</div>';
  }

  function kaart(titel, inhoud, uitleg) {
    return '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-5 gap-3"><div><h2 class="font-semibold">' + e(titel) + '</h2>'
      + (uitleg ? '<p class="text-sm opacity-70">' + e(uitleg) + '</p>' : '') + '</div>' + inhoud + '</div></div>';
  }

  function render() {
    var s = NB.state.reeks;
    var koppelingen = NB.state.koppelingen || [];
    var lijsten = NB.state.lijsten;
    var kanalen = NB.state.kanalen;
    var users = NB.state.boot.users || [];
    var isAdmin = NB.state.boot.me.role === 'admin';
    var app = document.getElementById('app');

    var lijstenHtml = lijsten === null
      ? invoer('Odoo-lijsten (nummers, met komma)', 'odoo_list_ids', (s.odoo_list_ids || []).join(', '), { uitleg: 'De lijsten konden niet uit Odoo gelezen worden; typ de nummers.' })
      : vinkjes('reeks-lijst', (lijsten || []).map(function (l) { return { id: l.id, label: l.name + (l.contacts !== null && l.contacts !== undefined ? ' (' + l.contacts + ' contacten)' : '') }; }), (s.odoo_list_ids || []).map(Number), 'Geen lijsten gevonden in Odoo.');
    var kanaalHtml = '<label class="form-control"><span class="label-text mb-1">Chatkanaal voor meldingen</span><select class="select select-bordered select-sm" data-reeks="chat_channel">'
      + '<option value="">Geen meldingen</option>'
      + (kanalen || []).map(function (k) { return '<option value="' + e(k.name) + '"' + (k.name === s.chat_channel ? ' selected' : '') + '>' + e(k.name) + '</option>'; }).join('')
      + (s.chat_channel && !(kanalen || []).some(function (k) { return k.name === s.chat_channel; }) ? '<option value="' + e(s.chat_channel) + '" selected>' + e(s.chat_channel) + ' (onbekend kanaal)</option>' : '')
      + '</select><span class="label-text-alt opacity-60 mt-1">Herinneringen 3 en 1 dag voor de inleverdatum, en bij elk ingeleverd stukje. Kanalen beheer je in Mini-apps.</span></label>';
    var redactieHtml = isAdmin
      ? vinkjes('reeks-redactie', users.map(function (u) { return { id: u.id, label: u.name }; }), s.editor_user_ids || [], 'Geen gebruikers.')
      : '<p class="text-sm opacity-70">' + ((s.editor_user_ids || []).length ? e((s.editor_user_ids || []).map(function (id) { var u = users.find(function (x) { return x.id === id; }); return u ? u.name : null; }).filter(Boolean).join(', ')) : 'Enkel beheerders en marketing.') + ' <span class="opacity-60">Een beheerder kan dit wijzigen.</span></p>';

    app.innerHTML = '<div class="text-sm opacity-70 mb-1"><a class="hover:underline" href="#/">Nieuwsbrieven</a> / Instellingen</div>'
      + '<h1 class="text-2xl font-bold mb-4">' + e(s.name) + '</h1>'
      + '<div class="grid gap-5 lg:grid-cols-2">'
      + kaart('Wie en waarom', invoer('Naam', 'name', s.name) + invoer('Waarvoor dient ze', 'description', s.description, { rijen: 2 })
        + invoer('Doelgroep (stuurt de AI)', 'audience', s.audience, { rijen: 3 }) + invoer('Toon (stuurt de AI)', 'tone', s.tone, { rijen: 2 }))
      + kaart('Ontvangers en afzender',
        '<div><span class="label-text">Naar welke Odoo-lijsten gaat ze?</span><div class="mt-1">' + lijstenHtml + '</div><span class="label-text-alt opacity-60">Enkel bij een echte verzending. In de teststand gaat alles naar de testadressen.</span></div>'
        + '<div class="grid sm:grid-cols-2 gap-3">' + invoer('Naam afzender', 'from_name', s.from_name) + invoer('Adres afzender', 'from_email', s.from_email) + '</div>'
        + invoer('Antwoorden op de mail gaan naar', 'reply_to', s.reply_to)
        + '<div class="grid sm:grid-cols-2 gap-3">' + invoer('Logo (adres van het beeld)', 'logo_url', s.logo_url, { uitleg: 'Leeg = het logo van het merk.' }) + invoer('Achtergrondtint', 'tint', s.tint || '#f0f9ff', { type: 'color' }) + '</div>')
      + kaart('Ritme', '<label class="form-control"><span class="label-text mb-1">Hoe vaak</span><select class="select select-bordered select-sm" data-reeks="cadence"><option value="monthly"' + (s.cadence === 'monthly' ? ' selected' : '') + '>Elke maand, vanzelf</option><option value="none"' + (s.cadence === 'none' ? ' selected' : '') + '>Enkel met de hand (losse mailing)</option></select></label>'
        + '<div class="grid sm:grid-cols-2 gap-3">' + invoer('Verzenddag (dag van de maand)', 'send_day', s.send_day, { type: 'number', min: 1, max: 28 }) + invoer('Uur', 'send_hour', s.send_hour, { type: 'number', min: 6, max: 20 })
        + invoer('Inleverdatum, werkdagen vóór de verzenddag', 'deadline_workdays', s.deadline_workdays, { type: 'number', min: 1, max: 10 }) + invoer('Editie aanmaken, dagen vooraf', 'create_days_ahead', s.create_days_ahead, { type: 'number', min: 7, max: 90 }) + '</div>'
        + '<p class="text-xs opacity-60">Een verzenddag in het weekend schuift naar de maandag. De inleverdatum valt om 17:00.</p>',
        'Elke editie maakt zichzelf aan, met een opdracht per rubriek.')
      + kaart('Samenwerken', kanaalHtml
        + '<div><span class="label-text">Hoofdredactie (naast beheerders en marketing)</span><div class="mt-1">' + redactieHtml + '</div></div>'
        + '<label class="form-control"><span class="label-text mb-1">Koppeling voor de antwoorden op vragen</span><select class="select select-bordered select-sm" data-reeks="answers_integration_id"><option value="">Vanzelf (één koppeling per nieuwsbrief, in Koppelingen onder "Nieuwsbrief-antwoorden")</option>'
        + koppelingen.map(function (k) { return '<option value="' + e(k.id) + '"' + (k.id === s.answers_integration_id ? ' selected' : '') + '>' + e(k.name) + (k.is_active ? '' : ' (uit)') + '</option>'; }).join('')
        + '</select><span class="label-text-alt opacity-60 mt-1">Een koppeling die uit staat, bewaart de antwoorden zonder iets in Odoo te doen.</span></label>'
        + '<label class="label cursor-pointer justify-start gap-3"><input type="checkbox" class="checkbox checkbox-sm" data-reeks="is_active"' + (s.is_active ? ' checked' : '') + '><span class="label-text">Actief</span></label>')
      + '</div>'
      + '<div class="card bg-base-100 border border-base-content/10 mt-5"><div class="card-body p-5 gap-3">'
      + '<div class="flex items-center justify-between"><h2 class="font-semibold">Vaste rubrieken</h2><button class="btn btn-sm btn-ghost" data-action="rubriek-bij"><i data-lucide="plus" class="w-4 h-4"></i> Rubriek</button></div>'
      + '<p class="text-sm opacity-70">Elke nieuwe editie krijgt deze rubrieken, in deze volgorde, met een opdracht bij wie ze schrijft. Een bestaande editie verandert niet mee. <strong>Zonder rubrieken</strong> start elke mailing van dit soort blanco: je bouwt ze zelf op met blokken.</p>'
      + s.sections.map(function (r, i) { return rubriekRij(r, i, s.sections.length); }).join('')
      + '</div></div>'
      + '<div class="flex justify-end mt-5"><button class="btn btn-primary btn-sm" data-action="bewaar-reeks">Bewaren</button></div>';
    NB.ikons();
  }

  NB.views.reeks = async function (params) {
    var r = await Promise.all([
      NB.api('/api/series/' + params.id),
      NB.api('/api/integrations').catch(function () { return []; }),
      NB.api('/api/mailing-lists').catch(function () { return null; }),
      NB.api('/api/chat-channels').catch(function () { return []; }),
    ]);
    NB.state.reeks = JSON.parse(JSON.stringify(r[0]));
    NB.state.reeks.sections = NB.state.reeks.sections || [];
    NB.state.koppelingen = r[1];
    NB.state.lijsten = r[2];
    NB.state.kanalen = r[3];
    render();
  };

  NB.inputs.reeks = function (el) {
    var s = NB.state.reeks;
    var naam = el.dataset.reeks;
    if (el.type === 'checkbox') s[naam] = el.checked;
    else if (naam === 'odoo_list_ids') s[naam] = el.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    else s[naam] = el.value;
  };

  NB.changes['reeks-lijst'] = function (el) {
    var s = NB.state.reeks;
    var id = Number(el.value);
    var lijst = (s.odoo_list_ids || []).map(Number).filter(function (x) { return x !== id; });
    if (el.checked) lijst.push(id);
    s.odoo_list_ids = lijst;
  };

  NB.changes['reeks-redactie'] = function (el) {
    var s = NB.state.reeks;
    var lijst = (s.editor_user_ids || []).filter(function (x) { return x !== el.value; });
    if (el.checked) lijst.push(el.value);
    s.editor_user_ids = lijst;
  };

  NB.inputs.rubriek = function (el) {
    var r = NB.state.reeks.sections[Number(el.dataset.rubriek)];
    if (r) r[el.dataset.sleutel] = el.value || (el.dataset.sleutel === 'owner_user_id' ? null : '');
  };

  NB.actions['rubriek-bij'] = function () {
    NB.state.reeks.sections.push({ key: '', title: 'Nieuwe rubriek', kind: 'article', owner_user_id: null, hint: '' });
    render();
  };

  NB.actions['rubriek-weg'] = function (el) {
    NB.state.reeks.sections.splice(Number(el.dataset.i), 1);
    render();
  };

  NB.actions['rubriek-schuif'] = function (el) {
    var lijst = NB.state.reeks.sections;
    var i = Number(el.dataset.i);
    var j = i + Number(el.dataset.richting);
    if (j < 0 || j >= lijst.length) return;
    lijst.splice(j, 0, lijst.splice(i, 1)[0]);
    render();
  };

  NB.actions['bewaar-reeks'] = async function () {
    var s = NB.state.reeks;
    try {
      var body = {
        name: s.name, description: s.description, audience: s.audience, tone: s.tone,
        from_name: s.from_name, from_email: s.from_email, reply_to: s.reply_to, odoo_list_ids: s.odoo_list_ids,
        logo_url: s.logo_url, tint: s.tint, cadence: s.cadence, send_day: s.send_day, send_hour: s.send_hour,
        deadline_workdays: s.deadline_workdays, create_days_ahead: s.create_days_ahead, chat_channel: s.chat_channel,
        answers_integration_id: s.answers_integration_id || null, is_active: s.is_active, sections: s.sections,
      };
      if (NB.state.boot.me.role === 'admin') body.editor_user_ids = s.editor_user_ids || [];
      var bij = await NB.api('/api/series/' + s.id, { method: 'PUT', body: body });
      NB.state.reeks = bij;
      NB.state.reeks.sections = NB.state.reeks.sections || [];
      var i = NB.state.boot.series.findIndex(function (x) { return x.id === bij.id; });
      if (i >= 0) NB.state.boot.series[i] = Object.assign({}, NB.state.boot.series[i], bij);
      NB.toast('Reeks bewaard.');
      render();
    } catch (err) { NB.fout(err); }
  };
})();
