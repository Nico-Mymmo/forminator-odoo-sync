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
    if (type === 'hidden') {
      if (!bewerkbaar) {
        return '<input type="hidden" name="' + esc(key) + '" value="' + esc(veld.default_value) + '">';
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
      binnen =
        '<div class="mymmo-form-check">' +
        '<input type="checkbox" disabled>' +
        '<label>' + labelHtml + '</label>' +
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
        invoer = '<textarea class="mymmo-form-input" rows="5" placeholder="' + esc(plaats) + '" disabled></textarea>';
      } else if (type === 'select') {
        var eerste = plaats !== '' ? plaats : 'Maak een keuze';
        var opts = (veld.options || []).map(function (o) {
          return '<option>' + esc(o.label || o.value) + '</option>';
        }).join('');
        invoer = '<select class="mymmo-form-input" disabled><option>' + esc(eerste) + '</option>' + opts + '</select>';
      } else {
        var htmlType = TYPES_MET_INVOERVAK.indexOf(type) !== -1 ? type : 'text';
        invoer = '<input type="' + esc(htmlType) + '" class="mymmo-form-input" value="' +
          esc(veld.default_value) + '" placeholder="' + esc(plaats) + '" disabled>';
      }

      binnen = '<label class="mymmo-form-label">' + labelHtml + '</label>' + invoer;
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

    var velden = (fields || []).map(function (veld, index) {
      return renderVeld(veld, index, bewerkbaar);
    }).join('');

    if (bewerkbaar && (!fields || fields.length === 0)) {
      velden = '<div class="om-leeg-formulier">Nog geen velden — kies er hiernaast een uit</div>';
    }

    var knop = '<button type="button" class="mymmo-form-submit"' +
      (bewerkbaar ? ' data-om-edit="form:submit_label" contenteditable="true"' + leegOf(form._leegSubmit, 'Versturen') : '') + '>' +
      tekst(form.submit_label) +
      '</button>';

    return '<div class="mymmo-form-wrap">' +
      titel + intro +
      '<div class="mymmo-form-grid"' + (bewerkbaar ? ' data-om-grid' : '') + '>' + velden + '</div>' +
      '<div class="mymmo-form-actions">' + knop + '</div>' +
      '</div>';
  }

  Object.assign(window.FSV2 || (window.FSV2 = {}), {
    renderFormPreview: renderFormPreview,
    renderFormPreviewField: renderVeld,
  });
}());
