import { navbar } from '../../lib/components/navbar.js';
import { forminatorSyncV2ClientScript } from './public/client.js';

export function forminatorSyncV2UI(user) {
  return `<!DOCTYPE html>
<html lang="nl" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Forminator Sync V2</title>
  <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-base-200">
  ${navbar(user)}

  <div class="container mx-auto px-6 py-8" style="padding-top: 64px; max-width: 1280px;">
    <div class="mb-6">
      <h1 class="text-3xl font-bold">Forminator Sync V2</h1>
      <p class="text-base-content/70">MVP configuratie: Herkenning → Herkende gegevens → Schrijf naar Odoo</p>
    </div>

    <div id="statusAlert" class="alert alert-info mb-4" style="display: none;"></div>

    <!-- WordPress Discovery block -->
    <div class="card bg-base-100 shadow mb-6">
      <div class="card-body">
        <h2 class="card-title">0) WordPress connectie &amp; formulieren</h2>
        <p class="text-sm text-base-content/70">Kies een WordPress site en laad de beschikbare Forminator-formulieren live op.</p>

        <div class="flex flex-wrap gap-3 items-end mt-3">
          <label class="form-control flex-1 min-w-[200px]">
            <span class="label-text">WordPress site</span>
            <select id="wpConnectionSelect" class="select select-bordered">
              <option value="">— selecteer site —</option>
            </select>
          </label>
          <button id="loadFormsBtn" class="btn btn-secondary" type="button">Formulieren ophalen</button>
        </div>

        <div id="formDiscoveryResult" class="mt-4" style="display:none;"></div>

        <div class="divider"></div>
        <h3 class="font-semibold text-sm">WordPress connecties beheren</h3>
        <div id="connectionList" class="mb-3"></div>
        <form id="addConnectionForm" class="flex flex-wrap gap-3 items-end">
          <label class="form-control flex-1 min-w-[140px]">
            <span class="label-text">Naam</span>
            <input name="name" class="input input-bordered input-sm" placeholder="Site A" required />
          </label>
          <label class="form-control flex-1 min-w-[200px]">
            <span class="label-text">Base URL</span>
            <input name="base_url" class="input input-bordered input-sm" placeholder="https://mijnsite.nl" required />
          </label>
          <label class="form-control flex-1 min-w-[200px]">
            <span class="label-text">WordPress API Secret</span>
            <input name="auth_token" class="input input-bordered input-sm" type="password" placeholder="X-OPENVME-SECRET waarde" required />
          </label>
          <button class="btn btn-primary btn-sm" type="submit">Toevoegen</button>
        </form>
      </div>
    </div>

    <!-- Cloudflare Secrets multi-site block -->
    <div class="card bg-base-100 shadow mb-6">
      <div class="card-body">
        <h2 class="card-title">0b) Formulieren ophalen via Cloudflare Secrets</h2>
        <p class="text-sm text-base-content/70">
          Sites geconfigureerd als <code>WORDPRESS_URL_SITE_1</code> / <code>WP_API_TOKEN_SITE_1</code> Cloudflare secrets.
          Credentials worden nooit opgeslagen in de database — de Worker doet runtime Basic Auth encoding.
        </p>

        <div class="flex flex-wrap gap-3 items-end mt-3">
          <label class="form-control flex-1 min-w-[200px]">
            <span class="label-text">WordPress Site</span>
            <select id="siteEnvSelect" class="select select-bordered">
              <option value="">— sites laden... —</option>
            </select>
          </label>
          <button id="loadSiteFormsBtn" class="btn btn-secondary" type="button">Formulieren ophalen</button>
        </div>

        <div id="siteFormDiscoveryResult" class="mt-4" style="display:none;"></div>
      </div>
    </div>

    <div class="card bg-base-100 shadow mb-6">
      <div class="card-body">
        <h2 class="card-title">Bestaande integraties</h2>
        <div class="overflow-x-auto">
          <table class="table table-zebra">
            <thead>
              <tr>
                <th>Actie</th>
                <th>Naam</th>
                <th>Formulier</th>
                <th>Odoo verbinding</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="integrationList"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <h2 class="card-title">1) Basisinstellingen</h2>
          <form id="integrationForm" class="space-y-3">
            <label class="form-control">
              <span class="label-text">Integratienaam *</span>
              <input name="name" class="input input-bordered" required />
            </label>
            <label class="form-control">
              <span class="label-text">Formulier ID *</span>
              <input name="forminator_form_id" class="input input-bordered" required />
            </label>
            <label class="form-control">
              <span class="label-text">Odoo verbinding ID *</span>
              <input name="odoo_connection_id" class="input input-bordered" required />
            </label>
            <button class="btn btn-primary" type="submit">Integratie aanmaken</button>
          </form>

          <div class="divider"></div>

          <div class="flex items-center justify-between">
            <div>
              <p class="font-semibold">Actief zetten</p>
              <p class="text-sm text-base-content/70">Alleen mogelijk na geslaagde test in blok 5</p>
            </div>
            <input id="integrationActive" type="checkbox" class="toggle toggle-success" />
          </div>

          <p class="text-sm text-base-content/60">Geselecteerd: <span id="selectedIntegrationLabel">Geen integratie geselecteerd</span></p>
        </div>
      </div>

      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <h2 class="card-title">2) Herkenning</h2>
          <form id="resolverForm" class="space-y-3">
            <label class="form-control">
              <span class="label-text">Type *</span>
              <select id="resolverType" name="resolver_type" class="select select-bordered"></select>
            </label>
            <label class="form-control">
              <span class="label-text">Formulier-veld *</span>
              <input name="input_source_field" class="input input-bordered" placeholder="email" required />
            </label>
            <label id="createIfMissingWrapper" class="label cursor-pointer justify-start gap-3">
              <input id="resolverCreateIfMissing" name="create_if_missing" type="checkbox" class="checkbox" />
              <span class="label-text">Nieuw contact maken als niet gevonden</span>
            </label>
            <label class="form-control">
              <span class="label-text">Opslaan als</span>
              <input id="resolverOutputKey" name="output_context_key" class="input input-bordered" readonly />
            </label>
            <input type="hidden" name="order_index" value="0" />
            <button class="btn btn-primary" type="submit">Herkenning toevoegen</button>
          </form>

          <div class="overflow-x-auto mt-4">
            <table class="table table-sm">
              <thead>
                <tr><th>Type</th><th>Veld</th><th>Aanmaken</th><th>Output</th><th>Volgorde</th><th>Actie</th></tr>
              </thead>
              <tbody id="resolverRows"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <h2 class="card-title">3) Schrijf naar Odoo</h2>
          <form id="targetForm" class="space-y-3">
            <label class="form-control">
              <span class="label-text">Doelmodel *</span>
              <select id="targetModel" name="odoo_model" class="select select-bordered"></select>
            </label>
            <p id="targetIdentifierInfo" class="text-sm text-base-content/70"></p>
            <input id="targetIdentifierType" name="identifier_type" type="hidden" />
            <label class="form-control">
              <span class="label-text">Updatebeleid *</span>
              <select id="targetPolicy" name="update_policy" class="select select-bordered"></select>
            </label>
            <input type="hidden" name="order_index" value="0" />
            <button class="btn btn-primary" type="submit">Doel toevoegen</button>
          </form>

          <div class="overflow-x-auto mt-4">
            <table class="table table-sm">
              <thead>
                <tr><th>Model</th><th>Recordherkenning</th><th>Beleid</th><th>Volgorde</th><th>Mappings</th><th>Actie</th></tr>
              </thead>
              <tbody id="targetRows"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card bg-base-100 shadow">
        <div class="card-body">
          <h2 class="card-title">4) Veldkoppelingen</h2>
          <form id="mappingForm" class="space-y-3">
            <label class="form-control">
              <span class="label-text">Target *</span>
              <select id="mappingTargetId" name="target_id" class="select select-bordered"></select>
            </label>
            <label class="form-control">
              <span class="label-text">Odoo veld *</span>
              <input name="odoo_field" class="input input-bordered" placeholder="email_from" required />
            </label>
            <label class="form-control">
              <span class="label-text">Odoo veld type</span>
              <select id="mappingOdooFieldType" name="odoo_field_type" class="select select-bordered select-sm">
                <option value="text">Tekst (directe waarde)</option>
                <option value="selection">Selection (vaste keuzes)</option>
                <option value="many2many">Many2many (meerdere keuzes)</option>
              </select>
            </label>
            <label class="form-control">
              <span class="label-text">Bron *</span>
              <select id="mappingSourceType" name="source_type" class="select select-bordered"></select>
            </label>
            <label class="form-control">
              <span class="label-text">Bronwaarde *</span>
              <input name="source_value" class="input input-bordered" placeholder="email" required />
            </label>

            <!-- Choice picker: zichtbaar wanneer Odoo veld type = selection/many2many
                 én er een form preview is geladen met choice-velden -->
            <div id="choicePickerSection" style="display:none;" class="rounded-box border border-base-300 bg-base-200 p-3">
              <p class="text-xs font-semibold text-base-content/70 mb-2">
                Klik op een Forminator-waarde om source_value in te vullen:
              </p>
              <div id="choicePickerGrid"></div>
              <p class="text-xs text-base-content/40 mt-2 italic">
                Open een formulier-preview (blok 0/0b) om keuzes te laden.
              </p>
            </div>
            <label class="label cursor-pointer justify-start gap-3">
              <input name="is_required" type="checkbox" class="checkbox" />
              <span class="label-text">Verplicht veld</span>
            </label>
            <input type="hidden" name="order_index" value="0" />
            <button class="btn btn-primary" type="submit">Veldkoppeling toevoegen</button>
          </form>

          <div class="overflow-x-auto mt-4">
            <table class="table table-sm">
              <thead>
                <tr><th>Odoo veld</th><th>Bron</th><th>Waarde</th><th>Verplicht</th><th>Volgorde</th><th>Actie</th></tr>
              </thead>
              <tbody id="mappingRows"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card bg-base-100 shadow lg:col-span-2">
        <div class="card-body">
          <h2 class="card-title">5) Test en geschiedenis</h2>
          <p class="text-sm text-base-content/70">Teststatus, webhookgeschiedenis en replay-actie (alleen toegelaten statussen).</p>
          <form id="testForm" class="mt-2">
            <button class="btn btn-secondary" type="submit">Test uitvoeren</button>
          </form>
          <p id="testInfo" class="text-sm mt-2">Geen test uitgevoerd.</p>

          <div class="overflow-x-auto mt-4">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Submission</th>
                  <th>Status</th>
                  <th>Retry count</th>
                  <th>Next retry</th>
                  <th>Replay van</th>
                  <th>Laatste replay</th>
                  <th>Aangemaakt</th>
                  <th>Actie</th>
                </tr>
              </thead>
              <tbody id="submissionRows"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>${forminatorSyncV2ClientScript}</script>

  <!-- Form preview modal -->
  <dialog id="formPreviewModal" class="modal">
    <div class="modal-box w-11/12 max-w-3xl">
      <form method="dialog"><button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button></form>
      <h3 id="formPreviewTitle" class="font-bold text-lg mb-4">Formulier velden</h3>
      <div id="formPreviewBody"></div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>
</body>
</html>`;
}
