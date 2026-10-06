/**
 * Koppelingen — het formulier tekenen voor het voorbeeld in de bouwer.
 *
 * DIT IS DE TWEEDE RENDERER. De echte is
 * wp-plugin/mymmo-forms/templates/partials/field.php; die maakt wat een
 * bezoeker krijgt. Deze maakt hetzelfde in JavaScript, omdat de bouwer een
 * voorbeeld nodig heeft dat je kan aanklikken en waarin je kan typen.
 *
 * Twee renderers is een risico -- ze lopen uit elkaar -- en dat wordt hier op
 * drie manieren ingeperkt:
 *
 *   1. Beide gebruiken dezelfde CSS: public/mymmo-forms.css is de enige bron,
 *      de plugin krijgt er bij het bouwen van de zip een kopie van. Het
 *      voorbeeld staat daarom in een iframe met precies die stylesheet -- geen
 *      Tailwind of daisyUI van het beheerscherm die erdoorheen lekt.
 *   2. Beide leiden hun gedrag af van FIELD_TYPES in forms/schema.js.
 *   3. tests/form-preview-parity-test.mjs rendert dezelfde velden met PHP en
 *      met dit bestand en vergelijkt de structuur (elementsoort en klassen).
 *      Wijk je hier af van field.php, dan wordt die test rood.
 *
 * Voeg je een veldtype toe, dan hoort het op BEIDE plekken een tak te krijgen.
 */

(function () {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * De plaatsaanduiding voor lege tekst.
   *
   * ALS ATTRIBUUT, niet als tekstknoop. Een <span class="om-leeg">Label</span>
   * in een contenteditable is ECHTE tekst: klik je erin en typ je, dan typ je
   * ertussen en krijg je "latbel". De CSS toont de aanduiding met
   * [data-om-leeg]:empty::before, waardoor het element echt leeg is en typen
   * gewoon begint.
   */
  function leegAttr(leegTekst) {
    return ' data-om-leeg="' + esc(leegTekst) + '"';
  }

  /**
   * De plaatsaanduiding, met de ORIGINELE tekst als die er is.
   *
   * Bij het vertalen zet de bouwer `_leegLabel` op het veld: de tekst in de
   * basistaal. Dan zie je grijs staan wát je moet vertalen, in plaats van het
   * woord "Label". Zonder vertaling valt hij terug op de gewone aanduiding.
   */
  function leegOf(eigen, standaard) {
    var tekst = (eigen == null ? '' : String(eigen)).trim();
    return leegAttr(tekst !== '' ? tekst : standaard);
  }

  /** De inhoud zelf: gewoon de waarde; leeg blijft leeg. */
  function tekst(waarde) {
    return esc(String(waarde == null ? '' : waarde).trim());
  }

  var TYPES_MET_INVOERVAK = ['text', 'email', 'tel', 'number', 'date'];

  /**
   * Eén veld tekenen. Volgt field.php: dezelfde elementen, dezelfde klassen.
   *
   * @param {object} veld
   * @param {number} index
   * @param {boolean} bewerkbaar  markers en plaatsaanduidingen voor de bouwer
   */
  function renderVeld(veld, index, bewerkbaar) {
    var type = veld.field_type || 'text';
    var key = veld.field_key || '';
    var breed = veld.width === 'half' ? 'mymmo-form-field--half' : 'mymmo-form-field--full';

    var wikkelStart = bewerkbaar
      ? '<div class="mymmo-form-field ' + breed + ' mymmo-form-field--' + esc(type) +
        '" data-om-field="' + index + '">' +
        '<div class="om-greep" title="Versleep om te verplaatsen"></div>'
      : '<div class="mymmo-form-field ' + breed + ' mymmo-form-field--' + esc(type) + '">';

    // ── Opmaakblokken ────────────────────────────────────────────────────────
    if (type === 'heading') {
      return '<div class="mymmo-form-field mymmo-form-field--full mymmo-form-field--heading"' +
        (bewerkbaar ? ' data-om-field="' + index + '"><div class="om-greep"></div>' : '>') +
        '<h3 class="mymmo-form-heading"' + (bewerkbaar ? ' data-om-edit="label" contenteditable="true"' + leegOf(veld._leegLabel, 'Tussentitel') : '') + '>' +
        tekst(veld.label) +
        '</h3></div>';
    }

    if (type === 'paragraph') {
      return '<div class="mymmo-form-field mymmo-form-field--full mymmo-form-field--paragraph"' +
        (bewerkbaar ? ' data-om-field="' + index + '"><div class="om-greep"></div>' : '>') +
        '<div class="mymmo-form-paragraph"><p' + (bewerkbaar ? ' data-om-edit="label" contenteditable="true"' + leegOf(veld._leegLabel, 'Tekstblok — leg hier iets uit') : '') + '>' +
        tekst(veld.label) +
        '</p></div></div>';
    }

    // ── Verborgen veld ───────────────────────────────────────────────────────
    // Op de site is dit een <input type="hidden"> en dus onzichtbaar. In de
    // bouwer moet je het wél kunnen zien en selecteren, anders kan je het niet
    // meer weghalen. Vandaar een expliciet blokje, alleen bij bewerkbaar.
    var prefillAttr = veld.prefill_param
      ? ' data-mymmo-prefill-param="' + esc(veld.prefill_param) + '"'
      : '';

    if (type === 'hidden') {
      if (!bewerkbaar) {
        return '<input type="hidden" name="' + esc(key) + '" value="' + esc(veld.default_value) + '"' + prefillAttr + '>';
      }
      return wikkelStart +
        '<div class="om-verborgen">' +
        '<span class="om-verborgen-label">Verborgen veld</span>' +
        '<code>' + esc(key || 'veldnaam') + '</code>' +
        '<span class="om-verborgen-waarde">' + esc(veld.default_value || '(leeg)') + '</span>' +
        '</div></div>';
    }

    var verplichtSter = veld.is_required
      ? ' <span class="mymmo-form-req" aria-hidden="true">*</span>'
      : '';
    var labelHtml = bewerkbaar
      ? '<span data-om-edit="label" contenteditable="true"' + leegOf(veld._leegLabel, 'Label') + '>' + tekst(veld.label) + '</span>' + verplichtSter
      : esc(veld.label) + verplichtSter;

    var hulpHtml = '';
    if (bewerkbaar || (veld.help_text && String(veld.help_text).trim() !== '')) {
      hulpHtml = '<p class="mymmo-form-help"' +
        (bewerkbaar ? ' data-om-edit="help_text" contenteditable="true"' + leegOf(veld._leegHelp, 'Hulptekst (optioneel)') : '') + '>' +
        tekst(veld.help_text) +
        '</p>';
    }

    var binnen = '';

    // ── Eén vinkje ───────────────────────────────────────────────────────────
    if (type === 'checkbox') {
      // Geen sterretje bij een vinkje (zoals field.php): op de site is de
      // knop grijs zolang het niet aangevinkt is.
      binnen =
        '<div class="mymmo-form-check">' +
        '<input type="checkbox"' + (veld.default_value === 'ja' || veld.default_value === '1' ? ' checked' : '') + ' disabled>' +
        '<label>' + labelHtml.replace(verplichtSter, '') + '</label>' +
        '</div>';

    // ── Keuzegroepen ─────────────────────────────────────────────────────────
    } else if (type === 'radio' || type === 'checkbox_group') {
      var soort = type === 'radio' ? 'radio' : 'checkbox';
      var opties = (veld.options || []);
      var optiesHtml = opties.length
        ? opties.map(function (optie, oIndex) {
            return '<div class="mymmo-form-check">' +
              '<input type="' + soort + '" disabled>' +
              '<label' + (bewerkbaar ? ' data-om-edit="option:' + oIndex + '" contenteditable="true"' + leegOf(veld._leegOptions && veld._leegOptions[oIndex], 'Keuze') : '') + '>' +
              tekst(optie.label || optie.value) +
              '</label></div>';
          }).join('')
        : '<p class="om-leeg om-geen-opties">Nog geen keuzes — voeg er rechts een toe</p>';

      binnen =
        '<fieldset class="mymmo-form-group">' +
        '<legend class="mymmo-form-label">' + labelHtml + '</legend>' +
        optiesHtml +
        '</fieldset>';

    // ── Alles met een label boven het invoervak ──────────────────────────────
    } else {
      var invoer;
      var plaats = bewerkbaar
        ? (veld.placeholder || '')
        : (veld.placeholder || '');

      if (type === 'textarea') {
        invoer = '<textarea class="mymmo-form-input" rows="5" placeholder="' + esc(plaats) + '"' + prefillAttr + ' disabled></textarea>';
      } else if (type === 'select') {
        var eerste = plaats !== '' ? plaats : 'Maak een keuze';
        var opts = (veld.options || []).map(function (o) {
          return '<option>' + esc(o.label || o.value) + '</option>';
        }).join('');
        invoer = '<select class="mymmo-form-input"' + prefillAttr + ' disabled><option>' + esc(eerste) + '</option>' + opts + '</select>';
      } else if (type === 'postcode') {
        // Zoals field.php: een tekstvak, geen type=number (een postcode is geen
        // getal -- een NL-postcode heeft letters, en "0612" mag geen 612 worden).
        invoer = '<input type="text" class="mymmo-form-input" value="' + esc(veld.default_value) +
          '" placeholder="' + esc(plaats) + '" autocomplete="postal-code"' + prefillAttr + ' disabled>';
      } else if (type === 'city') {
        // Het tekstvak plus de (verborgen) keuzelijst die het script op de site
        // aanzet als een postcode meerdere plaatsen heeft. Ook hier, omdat de
        // pariteitstest de elementen van beide renderers vergelijkt.
        invoer = '<input type="text" class="mymmo-form-input" value="' + esc(veld.default_value) +
          '" placeholder="' + esc(plaats) + '" autocomplete="address-level2"' + prefillAttr + ' disabled>' +
          '<select class="mymmo-form-input" hidden disabled></select>';
      } else {
        var htmlType = TYPES_MET_INVOERVAK.indexOf(type) !== -1 ? type : 'text';
        invoer = '<input type="' + esc(htmlType) + '" class="mymmo-form-input" value="' +
          esc(veld.default_value) + '" placeholder="' + esc(plaats) + '"' + prefillAttr + ' disabled>';
      }

      binnen = '<label class="mymmo-form-label' + (veld.label_hidden ? ' mymmo-form-label--verborgen' : '') + '">' + labelHtml + '</label>' + invoer;
    }

    // De lege foutplaatshouder staat ook in field.php, met hetzelfde id-patroon
    // en dezelfde klasse. Hij hoort hier niet thuis omdat het voorbeeld ooit een
    // fout zou tonen -- er wordt in de bouwer niets ingevuld -- maar omdat de
    // twee renderers vormgelijk moeten blijven. De pariteitstest vergelijkt
    // elementsoorten en klassen, en die hoort rood te worden als er aan één
    // kant iets bijkomt.
    var foutHtml = '<p class="mymmo-form-error" role="alert" hidden></p>';

    return wikkelStart + binnen + hulpHtml + foutHtml + '</div>';
  }

  // Spiegelt submitLayoutVoor-regel in forms/schema.js (SUBMIT_LAYOUTS,
  // KNOP_NAAST_TYPES) en mymmo_forms_knop_naast_index() in helpers.php.
  var KNOP_NAAST_TYPES = ['text', 'email', 'tel', 'postcode', 'city', 'number', 'date', 'select'];
  var KNOP_NAAST = { '1:1': '1-1', '2:1': '2-1', '3:1': '3-1' };

  /** Het laatste eenregelige veld: daar komt de knop naast. -1 = knop onder de velden. */
  function knopNaastIndex(form, fields) {
    if (!KNOP_NAAST[form && form.submit_layout]) return -1;
    for (var i = (fields || []).length - 1; i >= 0; i -= 1) {
      if (KNOP_NAAST_TYPES.indexOf(fields[i].field_type || 'text') !== -1) return i;
    }
    return -1;
  }

  /**
   * Het hele formulier.
   *
   * @param {object} form
   * @param {Array}  fields
   * @param {object} opts  { editable: boolean }
   */
  function renderFormPreview(form, fields, opts) {
    var bewerkbaar = !!(opts && opts.editable);

    var titel = '';
    if (bewerkbaar || (form.name && String(form.name).trim() !== '')) {
      titel = '<h2 class="mymmo-form-title"' +
        (bewerkbaar ? ' data-om-edit="form:name" contenteditable="true"' + leegOf(form._leegName, 'Naam van het formulier') : '') + '>' +
        tekst(form.name) +
        '</h2>';
    }

    var intro = '';
    if (bewerkbaar || (form.description && String(form.description).trim() !== '')) {
      intro = '<p class="mymmo-form-intro"' +
        (bewerkbaar ? ' data-om-edit="form:description" contenteditable="true"' + leegOf(form._leegDescription, 'Introtekst (optioneel)') : '') + '>' +
        tekst(form.description) +
        '</p>';
    }

    var naast = knopNaastIndex(form, fields);
    var verhouding = naast >= 0 ? KNOP_NAAST[form.submit_layout] : '';

    var acties = '';
    var velden = (fields || []).map(function (veld, index) {
      var html = renderVeld(veld, index, bewerkbaar);
      if (index === naast) {
        html = html.replace('class="mymmo-form-field ',
          'class="mymmo-form-field mymmo-form-field--naast-knop mymmo-form-field--naast-knop-' + verhouding + ' ');
        // De knoprij meteen ACHTER dit veld, zodat ze er de rij mee deelt.
        html += '%%KNOPRIJ%%';
      }
      return html;
    }).join('');

    if (bewerkbaar && (!fields || fields.length === 0)) {
      velden = '<div class="om-leeg-formulier">Nog geen velden — kies er hiernaast een uit</div>';
    }

    // In de bouwer een <span> met dezelfde klasse, geen <button>: in een
    // bewerkbare knop maakt de browser van de spatiebalk een KLIK, en dan kan je
    // geen spatie typen. De stijl hangt aan de klasse, dus hij ziet er gelijk uit.
    var knop = bewerkbaar
      ? '<span class="mymmo-form-submit" data-om-edit="form:submit_label" contenteditable="true"' +
        leegOf(form._leegSubmit, 'Versturen') + '>' + tekst(form.submit_label) + '</span>'
      : '<button type="button" class="mymmo-form-submit">' + tekst(form.submit_label) + '</button>';

    // Naast het laatste veld: de knoprij staat IN het raster, als buur van dat
    // veld. Zo deelt ze er de rij mee, zonder dat het veld in een eigen wikkel
    // moet (de bouwer sleept velden als kinderen van het raster).
    acties = naast >= 0
      ? '<div class="mymmo-form-actions mymmo-form-actions--naast mymmo-form-actions--naast-' + verhouding +
        (fields[naast].label_hidden ? ' mymmo-form-actions--zonder-label' : '') + '">' + knop + '</div>'
      : '<div class="mymmo-form-actions">' + knop + '</div>';
    if (naast >= 0) velden = velden.replace('%%KNOPRIJ%%', function () { return acties; });

    return '<div class="mymmo-form-wrap">' +
      titel + intro +
      '<div class="mymmo-form-grid"' + (bewerkbaar ? ' data-om-grid' : '') + '>' + velden + '</div>' +
      (naast >= 0 ? '' : acties) +
      '</div>';
  }

  Object.assign(window.FSV2 || (window.FSV2 = {}), {
    renderFormPreview: renderFormPreview,
    renderFormPreviewField: renderVeld,
  });
}());
