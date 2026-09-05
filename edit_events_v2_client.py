path = "public/events-v2-client.js"

data = open(path, 'rb').read()
assert data.count(b'\r') == 0
content = data.decode('utf-8')

# 1) click-acties: dialoog openen/sluiten + kleur opslaan.
old1 = """      case 'public-close': el('publicDialog').close(); break;
      case 'reload':"""
new1 = """      case 'public-close': el('publicDialog').close(); break;
      case 'open-type-colors': openTypeColorsDialog(); break;
      case 'type-colors-close': el('typeColorsDialog').close(); break;
      case 'save-type-color':
        saveTypeColor(Number(trigger.getAttribute('data-type-id')), trigger);
        break;
      case 'reload':"""
assert content.count(old1) == 1
content = content.replace(old1, new1)

# 2) change-acties: swatch en hex-veld blijven met elkaar in sync (puur
# client-side, nog niet bewaard -- dat doet pas de "Opslaan"-knop).
old2 = """    if (action === 'hero-upload') {
      var file = trigger.files && trigger.files[0];
      if (file) uploadHero(Number(trigger.getAttribute('data-event-id')), file);
    }
  });"""
new2 = """    if (action === 'hero-upload') {
      var file = trigger.files && trigger.files[0];
      if (file) uploadHero(Number(trigger.getAttribute('data-event-id')), file);
      return;
    }

    if (action === 'type-color-swatch-change') {
      var hexInput = trigger.closest('[data-type-row]').querySelector('[data-action="type-color-hex-change"]');
      if (hexInput) hexInput.value = trigger.value;
      return;
    }

    if (action === 'type-color-hex-change') {
      var val = trigger.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        var swatch = trigger.closest('[data-type-row]').querySelector('[data-action="type-color-swatch-change"]');
        if (swatch) swatch.value = val;
      }
    }
  });"""
assert content.count(old2) == 1
content = content.replace(old2, new2)

# 3) de dialoog zelf: lijst opbouwen uit state.types (al met .color sinds
# de Worker-kant x_studio_type_color_hex meegeeft), en per rij bewaren.
old3 = """  /**
   * Opent "nieuw event". Vanaf een klik op een lege kalenderdag komt die
   * datum al ingevuld mee (industry-standard: klik op een lege cel = nieuw
   * item op die dag), vanaf de knop begint het leeg.
   */
  function openCreateDialog(dateStr) {"""
new3 = """  /** Zelfde standaardkleur als EVENT_TYPE_FALLBACK_COLOR in constants.js. */
  var TYPE_COLOR_FALLBACK = '#475569';

  function openTypeColorsDialog() {
    renderTypeColorsList();
    el('typeColorsDialog').showModal();
  }

  function renderTypeColorsList() {
    el('typeColorsList').innerHTML = state.types.map(function (type) {
      var hex = type.color || TYPE_COLOR_FALLBACK;
      return '<div class="flex items-center gap-2" data-type-row="' + type.id + '">' +
        '<span class="flex-1 text-sm">' + esc(type.name) + '</span>' +
        '<input type="color" class="w-8 h-8 p-0 border-0 rounded cursor-pointer" value="' + hex + '"' +
          ' data-action="type-color-swatch-change" data-type-id="' + type.id + '">' +
        '<input type="text" class="input input-bordered input-xs w-24 font-mono" value="' + esc(hex) + '"' +
          ' data-action="type-color-hex-change" data-type-id="' + type.id + '">' +
        '<button class="btn btn-xs btn-primary" data-action="save-type-color" data-type-id="' + type.id + '">' +
          'Opslaan</button>' +
      '</div>';
    }).join('');
  }

  /**
   * Schrijft naar Odoo (x_studio_type_color_hex) via PATCH
   * /event-types/:id -- zie setEventTypeColor() in de Worker. Geen
   * autosave op elke swatch/hex-wijziging met opzet: dat zou bij het
   * verslepen van de kleurenkiezer tientallen schrijfacties naar Odoo
   * sturen voor één bedoelde wijziging.
   */
  async function saveTypeColor(typeId, trigger) {
    var row = trigger.closest('[data-type-row]');
    var hexInput = row.querySelector('[data-action="type-color-hex-change"]');
    var color = (hexInput.value || '').trim();

    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      toast('Ongeldige hex-kleur, bv. #0D9488', 'error');
      return;
    }

    trigger.disabled = true;
    try {
      var result = await api('/event-types/' + typeId, { method: 'PATCH', body: { color: color } });
      state.types = result.payload.data || state.types;
      toast('Kleur bewaard', 'success');
    } catch (error) {
      toast('Kleur bewaren mislukt: ' + error.message, 'error');
    } finally {
      trigger.disabled = false;
    }
  }

  /**
   * Opent "nieuw event". Vanaf een klik op een lege kalenderdag komt die
   * datum al ingevuld mee (industry-standard: klik op een lege cel = nieuw
   * item op die dag), vanaf de knop begint het leeg.
   */
  function openCreateDialog(dateStr) {"""
assert content.count(old3) == 1
content = content.replace(old3, new3)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)

nb = open(path, 'rb').read()
assert nb.count(b'\r') == 0
t = nb.decode('utf-8')
print("OK lines", nb.count(b'\n'), "brace", t.count('{'), t.count('}'), "paren", t.count('('), t.count(')'))
