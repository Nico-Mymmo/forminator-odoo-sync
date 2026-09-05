path = "public/events-v2.html"

data = open(path, 'rb').read()
assert data.count(b'\r') == 0
content = data.decode('utf-8')

# 1) toolbar-knop: opent de nieuwe "Typekleuren"-instellingen (vlak vóór
# "Nieuw event", als een instelling naast de events zelf).
old1 = """        <button class="btn btn-sm btn-ghost btn-square" data-action="reload" title="Verversen">
          <i data-lucide="refresh-cw" class="w-4 h-4"></i>
        </button>
        <button class="btn btn-sm btn-primary gap-1" data-action="new-event">
          <i data-lucide="plus" class="w-4 h-4"></i> Nieuw event
        </button>"""
new1 = """        <button class="btn btn-sm btn-ghost btn-square" data-action="reload" title="Verversen">
          <i data-lucide="refresh-cw" class="w-4 h-4"></i>
        </button>
        <button class="btn btn-sm btn-ghost btn-square" data-action="open-type-colors" title="Typekleuren">
          <i data-lucide="palette" class="w-4 h-4"></i>
        </button>
        <button class="btn btn-sm btn-primary gap-1" data-action="new-event">
          <i data-lucide="plus" class="w-4 h-4"></i> Nieuw event
        </button>"""
assert content.count(old1) == 1
content = content.replace(old1, new1)

# 2) dialoog: rijen worden client-side gevuld door renderTypeColorsDialog()
# in events-v2-client.js -- hier enkel de lege container + het sluitknopje.
old2 = """  <div id="toastContainer" class="toast toast-top toast-end z-50"></div>"""
new2 = """  <!-- Kleur per event type: schrijft naar x_studio_type_color_hex in Odoo
       (Studio-veld). Geen eigen kleurentabel -- Odoo blijft de enige
       database, zie setEventTypeColor() in de Worker. -->
  <dialog id="typeColorsDialog" class="modal">
    <div class="modal-box max-w-md">
      <h3 class="font-semibold text-lg mb-1">Typekleuren</h3>
      <p class="text-sm opacity-70 mb-4">
        Deze kleur gebruikt de website (bv. het badge op de kaartenrij van de aankondiging-widget).
      </p>
      <div id="typeColorsList" class="flex flex-col gap-2"></div>
      <div class="modal-action">
        <button class="btn btn-sm" data-action="type-colors-close">Sluiten</button>
      </div>
    </div>
  </dialog>

  <div id="toastContainer" class="toast toast-top toast-end z-50"></div>"""
assert content.count(old2) == 1
content = content.replace(old2, new2)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)

nb = open(path, 'rb').read()
assert nb.count(b'\r') == 0
t = nb.decode('utf-8')
print("OK lines", nb.count(b'\n'))
