/**
 * Mail Signature Designer - UI
 *
 * Server-side HTML skeleton ONLY.
 * ALL dynamic client logic is in /mail-signature-designer-client.js
 *
 * Rule: zero backticks inside <script> blocks — this file is a server-side
 * template literal and nested backticks cause build errors.
 */

import { navbar } from '../../lib/components/navbar.js';

export function mailSignatureDesignerUI(user) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Signature Designer</title>

  <!-- Theme init (single quotes only — NO backticks) -->
  <script>
    (function initThemeEarly() {
      try {
        var localTheme = localStorage.getItem('selectedTheme');
        var cookieMatch = document.cookie.match(/(?:^|; )selectedTheme=([^;]+)/);
        var cookieTheme = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
        var theme = localTheme || cookieTheme || 'light';
        document.documentElement.setAttribute('data-theme', theme);
      } catch (_) {
        document.documentElement.setAttribute('data-theme', 'light');
      }
    })();
  </script>

  <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.min.css" rel="stylesheet" type="text/css" />

  <!-- Suppress Tailwind CDN warning (single quotes only — NO backticks) -->
  <script>
    (function suppressTailwindCdnWarning() {
      var _warn = console.warn;
      console.warn = function() {
        if (arguments[0] && typeof arguments[0] === 'string' &&
            arguments[0].indexOf('cdn.tailwindcss.com should not be used in production') !== -1) return;
        return _warn.apply(console, arguments);
      };
    })();
  </script>

  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>

  <style>
    #preview-frame { border: none; width: 100%; min-height: 280px; background: #fff; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .log-row-fail { background-color: oklch(var(--er) / 0.08); }
    .conditional-field { display: none; }
    .conditional-field.visible { display: block; }
  </style>
</head>
<body class="bg-base-200">
  ${navbar(user)}

  <!-- Server → client state injection (JSON.stringify = plain string, no backticks) -->
  <script>
    window.__SIG_STATE__ = ${JSON.stringify({ actorEmail: user?.email || '' })};
  </script>

  <div style="padding-top: 48px;">
    <div class="container mx-auto px-6 py-8 max-w-7xl">

      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-4xl font-bold mb-2">Signature Designer</h1>
        <p class="text-base-content/60">Ontwerp en push e-mailhandtekeningen voor Google Workspace</p>
      </div>

      <!-- Tabs -->
      <div role="tablist" class="tabs tabs-lifted mb-6">
        <button role="tab" class="tab tab-active" data-tab="builder" onclick="switchTab('builder', this)">
          <i data-lucide="pencil" class="w-4 h-4 mr-2"></i> Builder
        </button>
        <button role="tab" class="tab" data-tab="push" onclick="switchTab('push', this)">
          <i data-lucide="send" class="w-4 h-4 mr-2"></i> Push
        </button>
        <button role="tab" class="tab" data-tab="logs" onclick="switchTab('logs', this)">
          <i data-lucide="list" class="w-4 h-4 mr-2"></i> Logs
        </button>
      </div>

      <!-- ─── TAB: Builder ─────────────────────────────────────────────── -->
      <div id="tab-builder" class="tab-content active">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <!-- Left: Config form -->
          <div class="card bg-base-100 shadow">
            <div class="card-body">
              <div class="flex items-center justify-between mb-1">
                <h2 class="card-title text-base">Configuratie</h2>
                <span id="save-status" class="text-xs text-base-content/40">–</span>
              </div>
              <form id="config-form" class="space-y-4">

                <!-- Branding -->
                <div class="divider text-xs">Branding</div>
                <label class="form-control">
                  <div class="label"><span class="label-text">Merknaam</span></div>
                  <input type="text" name="brandName" placeholder="OpenVME" class="input input-bordered input-sm" />
                </label>
                <label class="form-control">
                  <div class="label"><span class="label-text">Website URL</span></div>
                  <input type="url" name="websiteUrl" placeholder="https://openvme.be" class="input input-bordered input-sm" />
                </label>
                <label class="form-control">
                  <div class="label"><span class="label-text">Primaire kleur</span></div>
                  <div class="flex items-center gap-2">
                    <input type="color" name="brandColor" value="#2563eb"
                           class="w-10 h-8 rounded border border-base-300 cursor-pointer p-0.5" />
                    <input type="text" id="brand-color-text" placeholder="#2563eb"
                           class="input input-bordered input-sm w-28"
                           pattern="^#[0-9a-fA-F]{6}$" />
                  </div>
                </label>

                <!-- Photo -->
                <div class="divider text-xs">Foto</div>
                <label class="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" name="showPhoto" class="checkbox checkbox-sm" />
                  <span class="label-text">Profielfoto tonen</span>
                </label>
                <p class="text-xs text-base-content/50 -mt-2">
                  Vereist een publieke HTTPS-URL in het profiel. data: URLs werken enkel in preview.
                </p>

                <!-- CTA button -->
                <div class="divider text-xs">CTA Knop</div>
                <label class="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" name="showCTA" class="checkbox checkbox-sm"
                         onchange="toggleConditional('cta-fields', this.checked)" />
                  <span class="label-text">CTA knop tonen</span>
                </label>
                <div id="cta-fields" class="conditional-field space-y-3 pl-2 border-l-2 border-base-300">
                  <label class="form-control">
                    <div class="label"><span class="label-text">CTA tekst</span></div>
                    <input type="text" name="ctaText" placeholder="Bekijk onze diensten"
                           class="input input-bordered input-sm" />
                  </label>
                  <label class="form-control">
                    <div class="label"><span class="label-text">CTA URL</span></div>
                    <input type="url" name="ctaUrl" placeholder="https://openvme.be"
                           class="input input-bordered input-sm" />
                  </label>
                </div>

                <!-- Banner -->
                <div class="divider text-xs">Banner</div>
                <label class="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" name="showBanner" class="checkbox checkbox-sm"
                         onchange="toggleConditional('banner-fields', this.checked)" />
                  <span class="label-text">Banner tonen</span>
                </label>
                <div id="banner-fields" class="conditional-field space-y-3 pl-2 border-l-2 border-base-300">
                  <label class="form-control">
                    <div class="label"><span class="label-text">Banner afbeelding URL</span></div>
                    <input type="url" name="bannerImageUrl" placeholder="https://…/banner.png"
                           class="input input-bordered input-sm" />
                  </label>
                  <label class="form-control">
                    <div class="label"><span class="label-text">Banner link URL (optioneel)</span></div>
                    <input type="url" name="bannerLinkUrl" placeholder="https://openvme.be"
                           class="input input-bordered input-sm" />
                  </label>
                </div>

                <!-- Disclaimer -->
                <div class="divider text-xs">Disclaimer</div>
                <label class="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" name="showDisclaimer" class="checkbox checkbox-sm"
                         onchange="toggleConditional('disclaimer-fields', this.checked)" />
                  <span class="label-text">Disclaimer tonen</span>
                </label>
                <div id="disclaimer-fields" class="conditional-field space-y-3 pl-2 border-l-2 border-base-300">
                  <label class="form-control">
                    <div class="label"><span class="label-text">Disclaimer tekst</span></div>
                    <textarea name="disclaimerText" rows="3"
                              placeholder="Dit bericht is vertrouwelijk…"
                              class="textarea textarea-bordered textarea-sm"></textarea>
                  </label>
                </div>

                <div class="flex gap-2 pt-2">
                  <button type="button" onclick="saveConfig()" class="btn btn-primary btn-sm">Opslaan</button>
                </div>
              </form>
            </div>
          </div>

          <!-- Right: Preview -->
          <div class="card bg-base-100 shadow">
            <div class="card-body gap-4">
              <h2 class="card-title text-base">Live preview</h2>

              <!-- Employee dropdown -->
              <div class="form-control">
                <div class="label"><span class="label-text text-xs font-medium">Medewerker uit Odoo</span></div>
                <div class="flex gap-2">
                  <select id="prev-employee-select" class="select select-bordered select-xs flex-1"
                          onchange="onEmployeeSelect(this)">
                    <option value="">— Laad medewerkers… —</option>
                  </select>
                  <button onclick="loadEmployees()" class="btn btn-ghost btn-xs" title="Vernieuwen">
                    <i data-lucide="refresh-cw" class="w-3 h-3"></i>
                  </button>
                </div>
              </div>

              <div class="divider text-xs my-1">of vul handmatig in</div>

              <!-- Sample user fields -->
              <div class="grid grid-cols-2 gap-2">
                <label class="form-control col-span-2">
                  <div class="label"><span class="label-text text-xs">Naam</span></div>
                  <input type="text" id="prev-fullName" value="Jan De Vries"
                         class="input input-bordered input-xs" />
                </label>
                <label class="form-control">
                  <div class="label"><span class="label-text text-xs">Rol</span></div>
                  <input type="text" id="prev-roleTitle" value="Syndicus"
                         class="input input-bordered input-xs" />
                </label>
                <label class="form-control">
                  <div class="label"><span class="label-text text-xs">E-mail</span></div>
                  <input type="email" id="prev-email" value="jan@mymmo.com"
                         class="input input-bordered input-xs" />
                </label>
                <label class="form-control">
                  <div class="label"><span class="label-text text-xs">Telefoon</span></div>
                  <input type="text" id="prev-phone" value=""
                         class="input input-bordered input-xs" />
                </label>
                <label class="form-control">
                  <div class="label"><span class="label-text text-xs">Foto URL</span></div>
                  <input type="url" id="prev-photoUrl" value="" placeholder="https://…"
                         class="input input-bordered input-xs" />
                </label>
              </div>

              <!-- Warnings -->
              <div id="preview-warnings" class="hidden">
                <div class="alert alert-warning text-xs py-2">
                  <i data-lucide="alert-triangle" class="w-4 h-4"></i>
                  <ul id="preview-warnings-list" class="list-disc pl-4"></ul>
                </div>
              </div>

              <!-- HTML iframe preview -->
              <div class="border border-base-300 rounded-lg overflow-hidden bg-white">
                <iframe id="preview-frame" title="Signature preview"></iframe>
              </div>
            </div>
          </div>

        </div>
      </div><!-- /tab-builder -->

      <!-- ─── TAB: Push ──────────────────────────────────────────────── -->
      <div id="tab-push" class="tab-content">
        <div class="card bg-base-100 shadow max-w-3xl">
          <div class="card-body gap-4">
            <h2 class="card-title text-base">Signature pushen</h2>
            <p class="text-sm text-base-content/60">
              Selecteer één of meerdere gebruikers. De handtekening wordt opgesteld op basis van de
              opgeslagen configuratie. Naam, foto en functie worden live opgehaald via de
              Directory- en Odoo-API.
            </p>

            <!-- Search -->
            <div class="flex gap-2">
              <input type="text" id="push-search"
                     placeholder="Zoek op naam of e-mailadres…"
                     class="input input-bordered input-sm flex-1"
                     onkeydown="if(event.key==='Enter') searchUsers()" />
              <button onclick="searchUsers()" class="btn btn-outline btn-sm">Zoeken</button>
              <button onclick="loadAllUsers()" class="btn btn-ghost btn-sm">Alle laden</button>
            </div>

            <!-- User list -->
            <div id="push-user-list"
                 class="overflow-y-auto max-h-72 border border-base-300 rounded-lg hidden">
              <table class="table table-xs w-full">
                <thead>
                  <tr>
                    <th>
                      <input type="checkbox" id="push-select-all"
                             class="checkbox checkbox-xs"
                             onchange="toggleSelectAll(this)" />
                    </th>
                    <th>Naam</th>
                    <th>E-mail</th>
                  </tr>
                </thead>
                <tbody id="push-user-tbody"></tbody>
              </table>
            </div>

            <!-- Selected count + push button -->
            <div class="flex items-center gap-3">
              <button id="push-btn" onclick="pushSelected()"
                      class="btn btn-primary btn-sm" disabled>
                <i data-lucide="send" class="w-4 h-4 mr-2"></i>
                Pushen
              </button>
              <span id="push-selected-count" class="text-sm text-base-content/50">
                Niets geselecteerd
              </span>
            </div>

            <!-- Push result -->
            <div id="push-result" class="hidden"></div>
          </div>
        </div>
      </div><!-- /tab-push -->

      <!-- ─── TAB: Logs ──────────────────────────────────────────────── -->
      <div id="tab-logs" class="tab-content">
        <div class="card bg-base-100 shadow">
          <div class="card-body gap-4">
            <div class="flex items-center justify-between">
              <h2 class="card-title text-base">Push logs</h2>
              <button onclick="loadLogs()" class="btn btn-outline btn-sm">
                <i data-lucide="refresh-cw" class="w-4 h-4 mr-1"></i> Vernieuwen
              </button>
            </div>
            <div class="overflow-x-auto">
              <table class="table table-xs w-full">
                <thead>
                  <tr>
                    <th>Tijdstip</th>
                    <th>Actor</th>
                    <th>Doelgebruiker</th>
                    <th>Status</th>
                    <th>Gewijzigd</th>
                    <th>Fout / Info</th>
                  </tr>
                </thead>
                <tbody id="logs-tbody">
                  <tr>
                    <td colspan="6" class="text-center text-base-content/40 py-4">
                      Logs laden…
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div><!-- /tab-logs -->

    </div><!-- /container -->
  </div><!-- /padding-top -->

  <script src="/mail-signature-designer-client.js"></script>
</body>
</html>`;
}
