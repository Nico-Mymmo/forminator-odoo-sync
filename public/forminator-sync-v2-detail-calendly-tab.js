/**
 * Koppelingen — Calendly's vaste eerste stap, als kaart IN het tabblad
 * "Koppeling" (niet als eigen tabblad -- zie geschiedenis onderaan).
 *
 * Odoo-kant (bron van waarheid): src/modules/forminator-sync-v2/calendly/
 * system-step.js#ensureCalendlySystemSteps(). Die maakt/houdt DRIE dingen
 * bij, niet twee:
 *   1. Een RESOLVER (fs_v2_resolvers, resolver_type 'partner_by_email',
 *      create_if_missing: true) -- zoekt het contact op e-mail op, en maakt
 *      het aan als het nog niet bestaat. Bestaat het al, dan wordt het
 *      bestaande contact gebruikt. Dit was in de UI ONZICHTBAAR (de
 *      Koppeling-tab rendert enkel `targets`, nooit `resolvers`), vandaar de
 *      expliciete checklist hieronder -- niet een prozazin die je makkelijk
 *      overleest.
 *   2. De HOST-zoekstap (fs_v2_targets, label calendly_host, operation_type
 *      'search') op hr.employee.
 *   3. De MEETING-upsertstap (fs_v2_targets, label calendly_meeting) naar
 *      x_calendlymeeting.
 * Stap 2 en 3 zijn `is_system: true` targets en komen dus WEL uit de normale
 * targets-lijst; stapEenKaart() in dit bestand vervangt hun individuele
 * kaarten in forminator-sync-v2-detail-mapping-tab.js door één samengevoegde,
 * niet-bewerkbare kaart met daarin het enige dat je wél kan instellen: welk
 * Calendly-eventtype deze koppeling opvangt en als welk type het in Odoo
 * terechtkomt.
 *
 * GESCHIEDENIS: tot 2026-09 stond dit als apart tabblad "Calendly", met
 * daarin ook het volledige Calendly-verbindingsbeheer (aanmelden/verversen/
 * afmelden). Op feedback dat (a) de verbinding module-breed is en dus maar
 * één keer thuishoort (nu in Instellingen → Verbindingen, zie
 * forminator-sync-v2-calendly-connection.js) en (b) deze eventtype-keuze
 * gewoon de configuratie van de vaste eerste pijplijnstap IS, is het aparte
 * tabblad hier verdwenen en zijn "Formulier" (bouwt een OM-formulier -- niet
 * van toepassing op een Calendly-bron) en "Calendly" allebei weg; enkel deze
 * kaart in "Koppeling" blijft over.
 *
 * Alle HTML met ES6 template literals, geen string-concatenatie -- de
 * coderegel van deze module (forminator-sync-v2-detail-mapping-tab.js zelf
 * is hierop een bestaande, oudere uitzondering; dit bestand niet).
 */

(function () {
  'use strict';

  var esc = function (v) { return window.FSV2.esc(v); };
  function S() { return window.FSV2.S; }

  // Gevuld door laadCalendlyStapData(); leeg tot de koppeling geopend wordt.
  var eventTypes = null;
  var odooEventTypes = null;
  var koppelingConfig = null;
  var bezig = false;
  // Afspraaklinks op het eventtype van deze koppeling (module booking-links).
  // null = nog niet geladen of niet op te halen.
  var boekingsLinks = null;

  function isCalendly() {
    var i = S().detail && S().detail.integration;
    return !!(i && i.source_type === 'calendly');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LADEN
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Wordt aangeroepen vanuit openDetail() (forminator-sync-v2-detail-lifecycle.js)
   * zodra een Calendly-koppeling opent -- niet lazy achter een tabklik, want de
   * kaart hoort meteen in de Koppeling-tab te staan, die niet lazy is.
   */
  async function laadCalendlyStapData(integrationId, opnieuw) {
    if (koppelingConfig && !opnieuw) return;

    await window.FSV2.laadCalendlyConnectie(!!opnieuw);
    var status = window.FSV2.huidigeCalendlyConnectieStatus();

    if (status && status.token_configured) {
      try {
        var etRes = await window.FSV2.api('/calendly/event-types');
        eventTypes = etRes.data || [];
      } catch (err) {
        eventTypes = null;
      }
    }

    try {
      var oRes = await window.FSV2.api('/calendly/odoo-event-types');
      odooEventTypes = oRes.data || [];
    } catch (err) {
      odooEventTypes = null;
    }

    try {
      var cRes = await window.FSV2.api('/integrations/' + integrationId + '/calendly');
      koppelingConfig = cRes.data || null;
    } catch (err) {
      koppelingConfig = null;
    }

    await laadAfspraaklinks(integrationId);
  }

  async function laadAfspraaklinks(integrationId) {
    try {
      var lRes = await window.FSV2.api('/integrations/' + integrationId + '/calendly/booking-links');
      boekingsLinks = lRes.data || null;
    } catch (err) {
      boekingsLinks = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEKENEN — één kaart, ingevoegd door renderDetailMappings()
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * De eventtypes in groepen, want een platte lijst van dertig regels waarin
   * "Kennismaking" drie keer voorkomt is niet te gebruiken.
   *
   * De volgorde is die van de vraag die je stelt bij het instellen: eerst het
   * gedeelde spul (round robin en collectief -- daar hangt een POEL van mensen
   * aan en dat is precies wat je wil zien), dan de team-eventtypes, dan per
   * collega zijn eigen types.
   */
  function groepeerEventTypes(types) {
    var poel = { round_robin: [], collective: [] };
    var team = [];
    var perPersoon = {};

    (types || []).forEach(function (t) {
      if (t.pooling_type === 'round_robin' || t.pooling_type === 'collective') {
        poel[t.pooling_type].push(t);
      } else if (t.owner_type === 'Team') {
        team.push(t);
      } else {
        var sleutel = t.owner_name || '(onbekende eigenaar)';
        (perPersoon[sleutel] = perPersoon[sleutel] || []).push(t);
      }
    });

    var groepen = [];
    if (poel.round_robin.length) groepen.push({ label: 'Round robin — beurtrol over meerdere hosts', items: poel.round_robin });
    if (poel.collective.length)  groepen.push({ label: 'Collectief — alle hosts samen aanwezig',      items: poel.collective });
    if (team.length)             groepen.push({ label: 'Team',                                        items: team });

    Object.keys(perPersoon).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (naam) {
      groepen.push({ label: 'Persoonlijk — ' + naam, items: perPersoon[naam] });
    });

    groepen.forEach(function (g) {
      g.items.sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
    });
    return groepen;
  }

  function optieHtml(t, huidig) {
    var achtervoegsels = [];
    if (t.duration) achtervoegsels.push(t.duration + ' min');
    if (t.hosts && t.hosts.length > 1) achtervoegsels.push(t.hosts.length + ' hosts');
    if (!t.active) achtervoegsels.push('niet actief');
    if (t.secret) achtervoegsels.push('privé');
    var staart = achtervoegsels.length ? ' — ' + achtervoegsels.join(' · ') : '';

    return `<option value="${esc(t.uri)}" ${t.uri === huidig ? 'selected' : ''}
                    data-name="${esc(t.name)}"
                    data-pooling="${esc(t.pooling_type || '')}"
                    data-locale="${esc(t.locale || '')}"
                    data-url="${esc(t.scheduling_url || '')}"
                    data-duration="${esc(t.duration || '')}">${esc(t.name)}${esc(staart)}</option>`;
  }

  var POOLING_LABELS = {
    round_robin: 'Round robin — om beurten één host',
    collective:  'Collectief — alle hosts tegelijk',
  };

  /**
   * Het kadertje onder de keuzelijst: wie zit erin, van wie is het, waar staat
   * het. Bij een round robin is dat de eigenlijke vraag -- "welke collega's
   * kunnen hierop geboekt worden" -- en die stond nergens op het scherm.
   */
  function eventTypeInfoHtml(uri) {
    if (!uri) {
      return `<p class="text-xs text-base-content/50">Vangnet: elke boeking waarvoor geen andere koppeling een eventtype claimt, komt hier binnen.</p>`;
    }
    var t = (eventTypes || []).find(function (e) { return e.uri === uri; });
    if (!t) return '';

    var regels = [];
    if (t.pooling_type) regels.push(POOLING_LABELS[t.pooling_type] || t.pooling_type);
    if (t.owner_name)   regels.push((t.owner_type === 'Team' ? 'Team: ' : 'Eigenaar: ') + t.owner_name);
    if (t.locale)       regels.push('Taal: ' + t.locale);

    // De hostlijst is AFGELEID (zie verzamelEventTypes in calendly/client.js):
    // Calendly heeft geen endpoint dat de hosts van een eventtype teruggeeft.
    // Dat hoort er expliciet bij te staan -- anders leest een lege lijst als
    // "er zijn geen hosts" terwijl het "wij konden het niet opvragen" betekent.
    var hostHtml = (t.hosts && t.hosts.length)
      ? `<div class="flex flex-wrap gap-1 mt-1.5">` +
          t.hosts.map(function (h) {
            return `<span class="badge badge-ghost badge-sm gap-1" title="${esc(h.email || '')}">
              <i data-lucide="user" class="w-3 h-3"></i>${esc(h.name || h.email || '?')}</span>`;
          }).join('') +
        `</div>`
      : `<p class="text-xs text-base-content/40 italic mt-1.5">Geen hosts gevonden — het token kan de ledenlijst van de organisatie niet opvragen (<code>organizations:read</code> + org-adminrechten).</p>`;

    return `
      <div class="rounded-lg border border-base-200 bg-base-200/30 px-3 py-2">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-base-content/70">
          ${regels.map(function (r) { return `<span>${esc(r)}</span>`; }).join('')}
          ${t.scheduling_url ? `<a class="link link-primary" href="${esc(t.scheduling_url)}" target="_blank" rel="noopener">Boekingspagina</a>` : ''}
        </div>
        ${t.scheduling_url ? `<p class="text-xs text-base-content/50 mt-1.5">
          Na het opslaan staat deze afspraak in de keuzelijst “link naar de agenda”
          van de shortcode-bouwer in WordPress — dan hoeft niemand de link nog over te typen.
        </p>` : ''}
        <div class="text-xs text-base-content/50 mt-1.5">Hosts <span class="opacity-60">(afgeleid uit wie dit eventtype kan inplannen — Calendly geeft geen hostlijst)</span></div>
        ${hostHtml}
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AFSPRAAKLINKS — een link naar ONZE site die dit eventtype opent
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Wie hoort bij dit eventtype? De eigenaar, anders de eerste host -- enkel
   * als VOORSTEL in de keuzelijst. Calendly en Odoo delen geen id, dus dit gaat
   * op naam; klopt het niet, dan kies je gewoon iemand anders.
   */
  function voorgesteldeEigenaar(users) {
    var uri = (koppelingConfig && koppelingConfig.event_type_uri) || '';
    var t = (eventTypes || []).find(function (e) { return e.uri === uri; });
    if (!t) return null;
    var namen = [t.owner_name].concat((t.hosts || []).map(function (h) { return h.name; }))
      .map(function (n) { return String(n || '').trim().toLowerCase(); }).filter(Boolean);
    for (var i = 0; i < namen.length; i += 1) {
      var naam = namen[i];
      var hit = users.find(function (u) { return String(u.name || '').trim().toLowerCase() === naam; });
      if (hit) return hit.id;
    }
    return null;
  }

  function afspraaklinksHtml() {
    var d = boekingsLinks;
    if (d === null) {
      return `<p class="text-xs text-base-content/50">De afspraaklinks zijn niet op te halen.</p>`;
    }
    if (!d.scheduling_url) {
      return `<p class="text-xs text-base-content/50">Kies hierboven een eventtype en sla op; daarna kan je hier een link maken die deze agenda op onze website opent.</p>`;
    }

    var lijst = (d.links || []).map(function (l) {
      // Eén link werkt op ELKE site (de sleutel wordt bij de OM opgezocht);
      // per site een eigen adres om te kopiëren. "In mails" is de site die
      // {{afspraak.*}} in een koppeling gebruikt.
      var adressen = l.public_urls || [];
      var adresHtml = adressen.length
        ? adressen.map(function (a) {
            return `
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="text-xs font-mono text-base-content/60 truncate" title="${esc(a.url)}">${esc(a.url)}</span>
                ${a.in_mail ? '<span class="badge badge-info badge-xs shrink-0">in mails</span>' : ''}
                <button type="button" class="btn btn-xs btn-ghost shrink-0" data-action="calendly-link-copy" data-url="${esc(a.url)}" title="Kopiëren"><i data-lucide="copy" class="w-3 h-3"></i></button>
                <a class="btn btn-xs btn-ghost shrink-0" href="${esc(a.url)}" target="_blank" rel="noopener" title="Openen"><i data-lucide="external-link" class="w-3 h-3"></i></a>
                ${adressen.length > 1 && !a.in_mail ? `<button type="button" class="btn btn-xs btn-ghost shrink-0" data-action="calendly-link-mailsite" data-link-id="${esc(l.id)}" data-site="${esc(a.site)}" title="Deze site gebruiken in mails">in mails zetten</button>` : ''}
              </div>`;
          }).join('')
        : `<div class="text-xs text-warning">geen website ingesteld</div>`;
      return `
        <div class="flex flex-wrap items-start gap-2 py-1.5 border-b border-base-200 last:border-0 ${l.is_active ? '' : 'opacity-60'}">
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium">${esc(l.odoo_user_name || '?')}
              <span class="badge badge-ghost badge-xs">${esc(l.kind)}</span>
              ${l.is_default ? '<span class="badge badge-primary badge-xs">standaard</span>' : ''}
              ${l.is_active ? '' : '<span class="badge badge-warning badge-xs">gepauzeerd</span>'}
            </div>
            ${adresHtml}
          </div>
          <a class="btn btn-xs btn-ghost" href="/afspraaklinks?link=${encodeURIComponent(l.id)}" target="_blank" rel="noopener"
             title="Bewerken: titel, subtekst, vinkjes en foto in het venster op de website">
            <i data-lucide="pencil" class="w-3 h-3"></i></a>
          <button type="button" class="btn btn-xs btn-ghost" data-action="calendly-link-toggle" data-link-id="${esc(l.id)}" data-active="${l.is_active ? '1' : '0'}"
                  title="${l.is_active ? 'Pauzeren: de link opent dan de algemene agenda' : 'Weer activeren'}">
            <i data-lucide="${l.is_active ? 'pause' : 'play'}" class="w-3 h-3"></i></button>
          <button type="button" class="btn btn-xs btn-ghost text-error" data-action="calendly-link-delete" data-link-id="${esc(l.id)}" title="Verwijderen">
            <i data-lucide="trash-2" class="w-3 h-3"></i></button>
        </div>`;
    }).join('');

    var users = d.odoo_users;
    var formulier;
    if (!users) {
      formulier = `<p class="text-xs text-warning">De Odoo-gebruikers zijn niet op te halen, dus er kan nu geen link aangemaakt worden.</p>`;
    } else {
      var voorstel = voorgesteldeEigenaar(users);
      var sites = d.sites || [];
      formulier = `
        <div class="grid sm:grid-cols-4 gap-2 items-end mt-2">
          <label class="form-control sm:col-span-2">
            <span class="label py-0.5"><span class="label-text text-xs">Voor wie</span></span>
            <select id="calendlyLinkOwner" class="select select-bordered select-sm">
              <option value="">Kies een collega…</option>
              ${users.map(function (u) {
                return `<option value="${esc(String(u.id))}" ${u.id === voorstel ? 'selected' : ''}>${esc(u.name)}</option>`;
              }).join('')}
            </select>
          </label>
          <label class="form-control">
            <span class="label py-0.5"><span class="label-text text-xs">Soort</span></span>
            <input id="calendlyLinkKind" class="input input-bordered input-sm" list="calendlyLinkKinds" value="standaard">
            <datalist id="calendlyLinkKinds">
              <option value="standaard"></option><option value="demo"></option>
              <option value="kennismaking"></option><option value="opvolging"></option>
            </datalist>
          </label>
          <label class="form-control">
            <span class="label py-0.5"><span class="label-text text-xs">Sleutel <span class="opacity-60">(leeg = automatisch)</span></span></span>
            <input id="calendlyLinkSlug" class="input input-bordered input-sm" placeholder="rob-demo">
          </label>
          <label class="form-control sm:col-span-2">
            <span class="label py-0.5"><span class="label-text text-xs">Titel van het tabblad <span class="opacity-60">(leeg = die van de website)</span></span></span>
            <input id="calendlyLinkTabTitle" class="input input-bordered input-sm" placeholder="Plan een gesprek met Rob">
          </label>
          ${sites.length > 1 ? `<label class="form-control">
            <span class="label py-0.5"><span class="label-text text-xs">Website in mails <span class="opacity-60">(werkt op alle)</span></span></span>
            <select id="calendlyLinkSite" class="select select-bordered select-sm">
              ${sites.map(function (st) { return `<option value="${esc(st.key)}">${esc(st.origin.replace(/^https:\/\//, ''))}</option>`; }).join('')}
            </select>
          </label>` : ''}
          <label class="label cursor-pointer justify-start gap-2">
            <input type="checkbox" id="calendlyLinkDefault" class="checkbox checkbox-xs">
            <span class="label-text text-xs">Standaardlink van die persoon</span>
          </label>
        </div>
        <div class="mt-2">
          <button type="button" class="btn btn-sm btn-outline" data-action="calendly-link-create">
            <i data-lucide="link" class="w-4 h-4"></i> Link genereren
          </button>
        </div>`;
    }

    var poelWaarschuwing = (d.pooling_type === 'round_robin' || d.pooling_type === 'collective')
      ? `<p class="text-xs text-warning mt-1">Dit is een ${d.pooling_type === 'round_robin' ? 'round-robin' : 'collectief'} eventtype: wie via deze link boekt, komt niet noodzakelijk bij de gekozen persoon terecht. Voor een persoonlijke link kies je een eigen eventtype van die collega.</p>`
      : '';

    return `
      <div class="text-xs text-base-content/60 mb-1">
        Een link naar onze website die het venster meteen op “Plan een gesprek” opent, met deze agenda.
        In een mail- of notitiestap zet <code>{{afspraak.&lt;stap&gt;.&lt;soort&gt;}}</code> automatisch de link van de eigenaar van de lead.
      </div>
      ${poelWaarschuwing}
      ${lijst ? `<div class="mt-2">${lijst}</div>` : `<p class="text-xs text-base-content/40 italic mt-2">Nog geen afspraaklinks op dit eventtype.</p>`}
      ${formulier}`;
  }

  function hertekenAfspraaklinks() {
    var doel = document.getElementById('calendlyBookingLinks');
    if (!doel) return;
    doel.innerHTML = afspraaklinksHtml();
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: doel });
  }

  /** De keuzelijst is gewijzigd: alleen het infokadertje hertekenen. */
  function handleCalendlyEventTypeChanged(sel) {
    var doel = document.getElementById('calendlyEventTypeInfo');
    if (!doel || !sel) return;
    doel.innerHTML = eventTypeInfoHtml(sel.value || '');
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: doel });
  }

  function renderCalendlyStapKaart() {
    if (!isCalendly()) return '';

    if (koppelingConfig === null && eventTypes === null && odooEventTypes === null) {
      return `<div class="card bg-base-100 border border-base-200 shadow-sm"><div class="card-body p-5">
        <span class="loading loading-spinner loading-sm"></span>
      </div></div>`;
    }

    var huidig = (koppelingConfig && koppelingConfig.event_type_uri) || '';
    var huidigOdoo = (koppelingConfig && koppelingConfig.odoo_event_type_id) || '';
    var status = window.FSV2.huidigeCalendlyConnectieStatus();

    var keuzeHtml;
    if (!status || !status.token_configured) {
      keuzeHtml = `<p class="text-sm text-base-content/50">Nog geen Calendly-verbinding. Stel die eerst in bij <a class="link" data-action="goto-connections">Instellingen → Verbindingen</a>.</p>`;
    } else if (eventTypes === null) {
      keuzeHtml = `<p class="text-sm text-base-content/50">De eventtypes zijn niet op te halen. Controleer de verbinding bij Instellingen.</p>`;
    } else if (!eventTypes.length) {
      keuzeHtml = `<p class="text-sm text-base-content/50">Dit Calendly-account heeft nog geen eventtypes.</p>`;
    } else {
      keuzeHtml = `
        <select id="calendlyEventType" class="select select-bordered select-sm w-full max-w-xl"
                data-change-action="calendly-event-type">
          <option value="">Vangnet — alles waarvoor geen eigen koppeling bestaat</option>
          ${groepeerEventTypes(eventTypes).map(function (groep) {
            return `<optgroup label="${esc(groep.label)}">` +
              groep.items.map(function (t) { return optieHtml(t, huidig); }).join('') +
            `</optgroup>`;
          }).join('')}
        </select>
        <div id="calendlyEventTypeInfo" class="mt-2">${eventTypeInfoHtml(huidig)}</div>`;
    }

    var odooHtml = odooEventTypes === null
      ? `<p class="text-sm text-base-content/50">De Odoo-types zijn niet op te halen.</p>`
      : `<select id="calendlyOdooEventType" class="select select-bordered select-sm w-full max-w-xs">
           <option value="">— geen —</option>
           ${odooEventTypes.map(function (t) {
             return `<option value="${esc(String(t.id))}" ${String(t.id) === String(huidigOdoo) ? 'selected' : ''}>${esc(t.name)}</option>`;
           }).join('')}
         </select>`;

    return `
      <div class="card bg-base-100 border border-base-200 shadow-sm">
        <div class="card-body p-0">
          <div class="px-5 py-4">
            <div class="flex items-start gap-3 mb-4">
              <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-neutral text-neutral-content shrink-0">
                <i data-lucide="lock" class="w-4 h-4"></i>
              </span>
              <div class="min-w-0">
                <div class="font-bold text-base leading-snug">Vaste stap — Calendly</div>
                <p class="text-xs text-base-content/50 mt-0.5">Niet instelbaar; extra stappen hieronder wel.</p>
              </div>
            </div>

            <ul class="text-sm space-y-1.5 mb-4">
              <li class="flex gap-2">
                <i data-lucide="check" class="w-4 h-4 text-success shrink-0 mt-0.5"></i>
                <span><strong>Contact opzoeken op e-mailadres.</strong> Bestaat het al, dan wordt dat
                bestaande contact gebruikt. Bestaat het nog niet, dan wordt het aangemaakt — dat is
                juist de boeking waar het om gaat.</span>
              </li>
              <li class="flex gap-2">
                <i data-lucide="check" class="w-4 h-4 text-success shrink-0 mt-0.5"></i>
                <span><strong>Host opzoeken bij de medewerkers</strong> op het werk-e-mailadres. Niet
                gevonden? Dan gaat de afspraak gewoon door zonder host.</span>
              </li>
              <li class="flex gap-2">
                <i data-lucide="check" class="w-4 h-4 text-success shrink-0 mt-0.5"></i>
                <span><strong>Afspraak wegschrijven naar <code class="text-xs">x_calendlymeeting</code></strong> —
                aanmaken, verplaatsen en annuleren komen hier alle drie binnen.</span>
              </li>
            </ul>

            <label class="form-control mb-3">
              <span class="label label-text text-xs">Calendly-eventtype</span>
              ${keuzeHtml}
              <span class="label"><span class="label-text-alt text-base-content/50">
                Eén eventtype hoort bij één koppeling. Laat je dit op “vangnet” staan, dan komt alles
                hier terecht waarvoor geen andere koppeling bestaat.
              </span></span>
            </label>

            <label class="form-control mb-4">
              <span class="label label-text text-xs">Type in Odoo <span class="text-base-content/50">— vult 📋 Type op de meeting</span></span>
              ${odooHtml}
              <span class="label"><span class="label-text-alt text-base-content/50">
                Odoo-automatisering 12 maakt enkel een lead aan bij het type <strong>Demo</strong>.
                Staat dit op “Anders”, dan gebeurt er in Odoo niets extra.
              </span></span>
            </label>

            <div class="flex flex-wrap items-center gap-2">
              <button type="button" class="btn btn-primary btn-sm" data-action="calendly-save-integration">
                <i data-lucide="save" class="w-4 h-4"></i> Opslaan
              </button>
              <button type="button" class="btn btn-ghost btn-xs" data-action="calendly-rebuild"
                      title="Bouwt de vaste stap opnieuw op in Odoo. Nodig als iemand de resolver, de zoekstap of de upsert per ongeluk aanpaste of verwijderde.">
                <i data-lucide="wrench" class="w-3.5 h-3.5"></i> Vaste stap herbouwen
              </button>
            </div>

            <div class="rounded-lg border border-base-200 px-3 py-3 mt-4">
              <div class="text-sm font-semibold mb-1 flex items-center gap-1.5">
                <i data-lucide="calendar-clock" class="w-4 h-4"></i>Afspraaklinks
              </div>
              <div id="calendlyBookingLinks">${afspraaklinksHtml()}</div>
            </div>

            <div class="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 mt-4">
              <div class="text-xs font-semibold mb-1 flex items-center gap-1.5">
                <i data-lucide="git-branch" class="w-3.5 h-3.5"></i>Verplaatsen en annuleren zijn eigen flows
              </div>
              <p class="text-xs text-base-content/60">
                Een verplaatsing is bij Calendly geen wijziging: de oude afspraak wordt geannuleerd en er komt een
                nieuwe bij. De vaste stap hierboven vangt dat op. Bij je <strong>eigen</strong> stappen staat
                daarvoor <em>“Gedrag per fase”</em> in het gedragsblok — één stap, per fase een ander gedrag.
                Zet een stap die een lead of notitie aanmaakt bij <strong>Nieuw</strong> op aanmaken en bij de rest
                op alleen zoeken of niets doen; anders komt er bij elke verplaatsing en annulatie een tweede bij.
              </p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIES
  // ═══════════════════════════════════════════════════════════════════════════

  async function handleCalendlyAction(action, btn) {
    if (bezig) return;

    // Verbinding-brede acties (subscribe/unsubscribe/ververs de verbinding
    // zelf) horen bij de gedeelde module -- hier enkel doorsturen.
    if (action === 'calendly-subscribe' || action === 'calendly-unsubscribe' || action === 'calendly-conn-refresh') {
      await window.FSV2.handleCalendlyConnectionAction(action, btn);
      return;
    }

    if (action === 'calendly-save-integration') {
      var sel = document.getElementById('calendlyEventType');
      var odooSel = document.getElementById('calendlyOdooEventType');
      var gekozen = sel ? sel.options[sel.selectedIndex] : null;

      await metKnop(btn, 'Opslaan…', async function () {
        await window.FSV2.api('/integrations/' + S().activeId + '/calendly', {
          method: 'PUT',
          body: JSON.stringify({
            event_type_uri: sel ? sel.value : '',
            event_type_name: gekozen ? (gekozen.dataset.name || '') : '',
            pooling_type: gekozen ? (gekozen.dataset.pooling || '') : '',
            locale: gekozen ? (gekozen.dataset.locale || '') : '',
            // De boekingspagina wordt hier BEWAARD, niet enkel getoond: ze
            // voedt de keuzelijst "gekende afspraken" in de WordPress-plugin,
            // en die mag niet afhangen van een live Calendly-bevraging.
            scheduling_url: gekozen ? (gekozen.dataset.url || '') : '',
            duration: gekozen ? (gekozen.dataset.duration || '') : '',
            odoo_event_type_id: odooSel ? odooSel.value : '',
          }),
        });
        window.FSV2.showAlert('Opgeslagen.', 'success');
        // De koppeling opnieuw openen: de vaste stap is net herbouwd en die
        // hoort meteen op het tabblad Koppeling te staan.
        await window.FSV2.openDetail(S().activeId);
      });
      return;
    }

    if (action === 'calendly-link-copy') {
      try {
        await navigator.clipboard.writeText(btn.dataset.url || '');
        window.FSV2.showAlert('Link gekopieerd.', 'success');
      } catch (err) {
        window.FSV2.showAlert('Kopiëren lukte niet.', 'error');
      }
      return;
    }

    if (action === 'calendly-link-create') {
      var waarde = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
      var standaard = document.getElementById('calendlyLinkDefault');
      if (!waarde('calendlyLinkOwner')) {
        window.FSV2.showAlert('Kies voor wie de afspraaklink is.', 'error');
        return;
      }
      await metKnop(btn, 'Aanmaken…', async function () {
        var res = await window.FSV2.api('/integrations/' + S().activeId + '/calendly/booking-links', {
          method: 'POST',
          body: JSON.stringify({
            odoo_user_id: Number(waarde('calendlyLinkOwner')),
            kind: waarde('calendlyLinkKind') || 'standaard',
            slug: waarde('calendlyLinkSlug'),
            tab_title: waarde('calendlyLinkTabTitle'),
            site: waarde('calendlyLinkSite'),
            is_default: !!(standaard && standaard.checked),
          }),
        });
        await laadAfspraaklinks(S().activeId);
        hertekenAfspraaklinks();
        var url = res && res.data && res.data.public_url;
        if (url && navigator.clipboard) {
          try { await navigator.clipboard.writeText(url); } catch (_) { /* niet erg */ }
          window.FSV2.showAlert('Afspraaklink gemaakt en gekopieerd: ' + url, 'success');
        } else {
          window.FSV2.showAlert('Afspraaklink gemaakt.', 'success');
        }
      });
      return;
    }

    if (action === 'calendly-link-mailsite') {
      await metKnop(btn, '…', async function () {
        await window.FSV2.api('/calendly/booking-links/' + encodeURIComponent(btn.dataset.linkId), {
          method: 'PUT',
          body: JSON.stringify({ site: btn.dataset.site }),
        });
        await laadAfspraaklinks(S().activeId);
        hertekenAfspraaklinks();
      });
      return;
    }

    if (action === 'calendly-link-toggle' || action === 'calendly-link-delete') {
      var linkId = btn.dataset.linkId;
      if (action === 'calendly-link-delete'
          && !window.confirm('Deze afspraaklink verwijderen?\n\nLinks die al verstuurd zijn, openen daarna de algemene agenda. Tijdelijk uitzetten kan met pauzeren.')) {
        return;
      }
      await metKnop(btn, '…', async function () {
        if (action === 'calendly-link-delete') {
          await window.FSV2.api('/calendly/booking-links/' + encodeURIComponent(linkId), { method: 'DELETE' });
        } else {
          await window.FSV2.api('/calendly/booking-links/' + encodeURIComponent(linkId), {
            method: 'PUT',
            body: JSON.stringify({ is_active: btn.dataset.active !== '1' }),
          });
        }
        await laadAfspraaklinks(S().activeId);
        hertekenAfspraaklinks();
      });
      return;
    }

    if (action === 'calendly-rebuild') {
      await metKnop(btn, 'Bezig…', async function () {
        await window.FSV2.api('/integrations/' + S().activeId + '/calendly/rebuild', { method: 'POST' });
        window.FSV2.showAlert('Vaste stap opnieuw opgebouwd.', 'success');
        await window.FSV2.openDetail(S().activeId);
      });
      return;
    }
  }

  async function metKnop(btn, tekst, fn) {
    bezig = true;
    var origineel = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = tekst; }
    try {
      await fn();
    } catch (err) {
      window.FSV2.showAlert(err.message, 'error');
    } finally {
      bezig = false;
      if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = origineel; }
    }
  }

  /** Bij het openen van een andere koppeling alles vergeten. */
  function resetCalendlyTab() {
    eventTypes = null;
    odooEventTypes = null;
    koppelingConfig = null;
    boekingsLinks = null;
  }

  Object.assign(window.FSV2, {
    handleCalendlyEventTypeChanged: handleCalendlyEventTypeChanged,
    laadCalendlyStapData: laadCalendlyStapData,
    renderCalendlyStapKaart: renderCalendlyStapKaart,
    handleCalendlyAction: handleCalendlyAction,
    resetCalendlyTab: resetCalendlyTab,
  });
}());
