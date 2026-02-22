/**
 * Mail Signature Designer - UI  (Event Amplifier)
 *
 * Server-side HTML skeleton ONLY.
 * ALL dynamic client logic is in /mail-signature-designer-client.js
 *
 * Rules:
 *  - Exact one return `...` template literal
 *  - Zero backticks inside any <script> block
 *  - No inline business JS
 *  - ${navbar(user)} injected
 *  - ${JSON.stringify(...)} for minimal server→client state only
 */

import { navbar } from '../../lib/components/navbar.js';

export function mailSignatureDesignerUI(user) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Signature Designer</title>

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

  <script>
    (function suppressTailwindCdnWarning() {
      var _w = console.warn;
      console.warn = function() {
        if (arguments[0] && typeof arguments[0] === 'string' &&
            arguments[0].indexOf('cdn.tailwindcss.com should not be used in production') !== -1) return;
        return _w.apply(console, arguments);
      };
    })();
  </script>

  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>

  <style>
    .tab-content            { display: none; }
    .tab-content.active     { display: block; }
    .cond-field             { display: none; }
    .cond-field.visible     { display: block; }
    .log-row-fail           { background-color: oklch(var(--er) / 0.08); }
    #preview-wrap           { background: #f3f4f6; padding: 16px; border-radius: 8px; }
    #preview-canvas         { background: #fff; max-width: 600px; margin: 0 auto;
                              border-radius: 4px; overflow: hidden; }
    #preview-frame          { border: none; width: 100%; min-height: 60px; display: block; }
    #preview-frame.narrow   { max-width: 360px; }
    details summary         { cursor: pointer; user-select: none; }
    details summary::-webkit-details-marker { display: none; }
    details[open] .summary-chevron { transform: rotate(90deg); }
    .summary-chevron        { transition: transform 0.15s; }
  </style>
</head>
<body class="bg-base-200">
  ${navbar(user)}

  <script>
    window.__SIG_STATE__ = ${JSON.stringify({ actorEmail: user?.email || '' })};
  </script>

  <div style="padding-top: 48px;">
    <div class="container mx-auto px-6 py-8 max-w-7xl">

      <!-- Header -->
      <div class="mb-5">
        <h1 class="text-4xl font-bold mb-1">Signature Designer</h1>
        <p class="text-base-content/60 text-sm">Event Amplifier &mdash; promoot events via e-mailhandtekeningen</p>
      </div>

      <!-- Tabs -->
      <div role="tablist" class="tabs tabs-lifted mb-5">
        <button role="tab" class="tab tab-active" data-tab="builder" onclick="switchTab('builder', this)">
          <i data-lucide="pencil" class="w-4 h-4 mr-1"></i> Builder
        </button>
        <button role="tab" class="tab" data-tab="push" onclick="switchTab('push', this)">
          <i data-lucide="send" class="w-4 h-4 mr-1"></i> Push
        </button>
        <button role="tab" class="tab" data-tab="logs" onclick="switchTab('logs', this)">
          <i data-lucide="list" class="w-4 h-4 mr-1"></i> Logs
        </button>
      </div>

      <!-- ─── TAB: Builder ───────────────────────────────────────────── -->
      <div id="tab-builder" class="tab-content active">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">

          <!-- Left: Config form -->
          <div class="card bg-base-100 shadow">
            <div class="card-body py-4 px-5">

              <!-- Form header -->
              <div class="flex items-center justify-between mb-3">
                <h2 class="font-semibold text-base">Configuratie</h2>
                <div class="flex items-center gap-2">
                  <span id="save-status-dot" class="w-2 h-2 rounded-full bg-base-300"></span>
                  <span id="save-status" class="text-xs text-base-content/40">&#8211;</span>
                </div>
              </div>

              <form id="config-form">

                <!-- Hidden event metadata fields (populated by JS on dropdown change) -->
                <input type="hidden" name="eventTitle" id="event-hidden-title" />
                <input type="hidden" name="eventDate"  id="event-hidden-date" />

                <!-- ══ SECTIE 1: Event Promotie ══ -->
                <details id="section-event" open class="mb-4">
                  <summary class="flex items-center justify-between py-1.5 select-none">
                    <div class="flex items-center gap-2">
                      <i data-lucide="calendar" class="w-4 h-4 text-primary"></i>
                      <span class="text-sm font-semibold">Event Promotie</span>
                      <span class="badge badge-primary badge-xs">Prioriteit</span>
                    </div>
                    <i data-lucide="chevron-right" class="w-4 h-4 summary-chevron text-base-content/40"></i>
                  </summary>

                  <div class="pt-3 space-y-3">

                    <!-- Toggle -->
                    <label class="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" name="eventPromoEnabled" id="event-promo-toggle"
                             class="toggle toggle-primary toggle-sm"
                             checked
                             onchange="onEventPromoToggle(this.checked)" />
                      <span class="text-sm font-medium">Promoot event in handtekening</span>
                    </label>

                    <!-- Event select + meta (visible when toggle on) -->
                    <div id="event-promo-fields" class="cond-field visible space-y-3">

                      <div class="form-control">
                        <div class="label py-0.5">
                          <span class="label-text text-xs font-medium">Aankomend event</span>
                          <button type="button" onclick="loadEvents()"
                                  class="label-text-alt btn btn-ghost btn-xs gap-1">
                            <i data-lucide="refresh-cw" class="w-3 h-3"></i> Vernieuwen
                          </button>
                        </div>
                        <select name="eventId" id="event-select"
                                class="select select-bordered select-sm"
                                onchange="onEventSelect(this.value)">
                          <option value="">&#8212; Laden&#8230; &#8212;</option>
                        </select>
                      </div>

                      <!-- Event metadata badge -->
                      <div id="event-meta" class="hidden rounded-lg bg-base-200 px-3 py-2.5 space-y-1">
                        <div class="flex items-start justify-between gap-2">
                          <span id="event-meta-title" class="text-sm font-semibold leading-snug"></span>
                          <span id="event-meta-badge" class="badge badge-outline badge-sm shrink-0"></span>
                        </div>
                        <span id="event-meta-date" class="text-xs text-base-content/50"></span>
                      </div>

                      <!-- Event banner image URL (manual) -->
                      <label class="form-control">
                        <div class="label py-0.5"><span class="label-text text-xs">Event afbeelding URL</span></div>
                        <input type="url" name="eventImageUrl" id="event-image-url-input"
                               placeholder="https://&#8230;/event-banner.png"
                               class="input input-bordered input-xs" />
                      </label>

                      <!-- Eyebrow label -->
                      <label class="form-control">
                        <div class="label py-0.5">
                          <span class="label-text text-xs">Eyebrow tekst</span>
                          <span class="label-text-alt text-base-content/40 text-xs">bv. &ldquo;Aankomend event&rdquo;</span>
                        </div>
                        <input type="text" name="eventEyebrow" id="event-eyebrow-input"
                               value="Schrijf je in"
                               placeholder="Kom je ook? &bull; Aankomend event &bull; Mis het niet"
                               class="input input-bordered input-xs" />
                      </label>

                      <!-- Registration URL -->
                      <label class="form-control">
                        <div class="label py-0.5"><span class="label-text text-xs">Registratie URL</span></div>
                        <input type="url" name="eventRegUrl" id="event-reg-url-input"
                               placeholder="https://openvme.be/events/&#8230;"
                               class="input input-bordered input-xs" />
                      </label>

                    </div>

                    <!-- Fallback banner (visible when toggle off) -->
                    <div id="fallback-banner-section" class="cond-field space-y-2">
                      <p class="text-xs text-base-content/40">Indien geen event geselecteerd: toon bannerafbeelding.</p>

                      <label class="flex items-start gap-3 cursor-pointer py-0.5">
                        <input type="checkbox" name="showBanner" class="checkbox checkbox-sm mt-0.5"
                               onchange="toggleCond('fallback-banner-fields', this.checked)" />
                        <div>
                          <span class="text-sm font-medium">Fallback bannerafbeelding</span>
                        </div>
                      </label>
                      <div id="fallback-banner-fields" class="cond-field pl-7 space-y-2">
                        <label class="form-control">
                          <div class="label py-0.5"><span class="label-text text-xs">Afbeelding URL</span></div>
                          <input type="url" name="bannerImageUrl" placeholder="https://&#8230;/banner.png"
                                 class="input input-bordered input-xs" />
                        </label>
                        <label class="form-control">
                          <div class="label py-0.5"><span class="label-text text-xs">Link URL (optioneel)</span></div>
                          <input type="url" name="bannerLinkUrl" placeholder="https://openvme.be"
                                 class="input input-bordered input-xs" />
                        </label>
                      </div>
                    </div>

                  </div>
                </details>

                <div class="divider my-0"></div>

                <!-- ══ SECTIE 1b: LinkedIn Post ══ -->
                <details id="section-linkedin" class="mb-4 mt-1">
                  <summary class="flex items-center justify-between py-1.5 select-none">
                    <div class="flex items-center gap-2">
                      <span style="display:inline-block;background:#0A66C2;color:#fff;font-weight:bold;font-size:9px;border-radius:3px;width:15px;height:15px;text-align:center;line-height:15px;">in</span>
                      <span class="text-sm font-semibold">LinkedIn Post</span>
                    </div>
                    <i data-lucide="chevron-right" class="w-4 h-4 summary-chevron text-base-content/40"></i>
                  </summary>

                  <div class="pt-3 space-y-3">

                    <!-- Toggle -->
                    <label class="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" name="linkedinPromoEnabled" id="linkedin-promo-toggle"
                             class="toggle toggle-sm"
                             style="--tglbg:#0A66C2"
                             onchange="onLinkedinPromoToggle(this.checked)" />
                      <span class="text-sm font-medium">Promoot LinkedIn-post in handtekening</span>
                    </label>

                    <!-- LinkedIn fields (visible when toggle on) -->
                    <div id="linkedin-promo-fields" class="cond-field space-y-3">

                      <label class="form-control">
                        <div class="label py-0.5">
                          <span class="label-text text-xs">Titel</span>
                          <span class="label-text-alt text-base-content/40 text-xs">koptekst boven de kaart</span>
                        </div>
                        <input type="text" name="linkedinEyebrow" id="linkedin-eyebrow-input"
                               value="Mijn laatste LinkedIn&#x2011;post"
                               placeholder="Mijn laatste LinkedIn&#x2011;post"
                               class="input input-bordered input-xs" />
                      </label>
                        <div class="label py-0.5"><span class="label-text text-xs">LinkedIn post URL</span></div>
                        <div class="flex gap-1.5">
                          <input type="url" name="linkedinUrl" id="linkedin-url-input"
                                 placeholder="https://linkedin.com/posts/&#8230;"
                                 class="input input-bordered input-xs flex-1" />
                          <button type="button" id="linkedin-fetch-btn"
                                  onclick="fetchLinkedinMeta()"
                                  class="btn btn-xs btn-outline" title="Post automatisch ophalen">
                            <i data-lucide="sparkles" class="w-3 h-3"></i>
                          </button>
                        </div>
                        <div id="linkedin-fetch-status" class="text-xs mt-1 hidden"></div>
                      </label>

                      <!-- Scraped post metadata badge -->
                      <div id="linkedin-meta" class="hidden rounded-lg bg-base-200 px-3 py-2.5">
                        <div class="flex items-center gap-2">
                          <img id="linkedin-meta-avatar" class="w-6 h-6 rounded-full hidden" src="" alt="" />
                          <span id="linkedin-meta-author" class="text-sm font-semibold leading-snug flex-1"></span>
                          <span id="linkedin-meta-likes" class="badge badge-outline badge-sm shrink-0 hidden"></span>
                        </div>
                      </div>

                      <label class="form-control">
                        <div class="label py-0.5">
                          <span class="label-text text-xs">Oproeptekst</span>
                          <span class="label-text-alt text-base-content/40 text-xs">zet aan tot liken &amp; reageren</span>
                        </div>
                        <textarea name="linkedinText" id="linkedin-text-input" rows="3"
                                  placeholder="Ik plaatste zojuist een artikel over &#8230; Jouw like of reactie maakt een groot verschil!"
                                  class="textarea textarea-bordered textarea-xs leading-snug"></textarea>
                      </label>

                      <!-- Hidden scraped metadata (persisted in config) -->
                      <input type="hidden" name="linkedinAuthorName" id="linkedin-hidden-author-name" />
                      <input type="hidden" name="linkedinAuthorImg"  id="linkedin-hidden-author-img" />
                      <input type="hidden" name="linkedinLikes"      id="linkedin-hidden-likes" />

                    </div>
                  </div>
                </details>

                <div class="divider my-0"></div>

                <!-- ══ SECTIE 2: Branding ══ -->
                <details id="section-branding" class="mb-4 mt-1">
                  <summary class="flex items-center justify-between py-1.5 select-none">
                    <div class="flex items-center gap-2">
                      <i data-lucide="palette" class="w-4 h-4 text-base-content/50"></i>
                      <span class="text-sm font-semibold">Branding</span>
                    </div>
                    <i data-lucide="chevron-right" class="w-4 h-4 summary-chevron text-base-content/40"></i>
                  </summary>

                  <div class="pt-3 space-y-2">

                    <label class="form-control">
                      <div class="label py-0.5"><span class="label-text text-sm">Merknaam</span></div>
                      <input type="text" name="brandName" placeholder="OpenVME"
                             class="input input-bordered input-sm" />
                    </label>

                    <label class="form-control">
                      <div class="label py-0.5"><span class="label-text text-sm">Website URL</span></div>
                      <input type="url" name="websiteUrl" placeholder="https://openvme.be"
                             class="input input-bordered input-sm" />
                    </label>

                    <div class="form-control">
                      <div class="label py-0.5"><span class="label-text text-sm">Primaire kleur</span></div>
                      <div class="flex items-center gap-2">
                        <input type="color" name="brandColor" value="#2563eb"
                               id="brand-color-picker"
                               class="w-9 h-8 rounded border border-base-300 cursor-pointer p-0.5" />
                        <input type="text" id="brand-color-text" value="#2563eb"
                               placeholder="#2563eb"
                               class="input input-bordered input-sm w-28"
                               pattern="^#[0-9a-fA-F]{6}$" />
                      </div>
                    </div>

                    <label class="flex items-start gap-3 cursor-pointer py-0.5">
                      <input type="checkbox" name="showDisclaimer" class="checkbox checkbox-sm mt-0.5"
                             onchange="toggleCond('disclaimer-fields', this.checked)" />
                      <div>
                        <span class="text-sm font-medium">Disclaimer</span>
                        <p class="text-xs text-base-content/40 leading-tight">Kleine vertrouwelijkheidstekst onderaan.</p>
                      </div>
                    </label>
                    <div id="disclaimer-fields" class="cond-field pl-7">
                      <label class="form-control">
                        <div class="label py-0.5"><span class="label-text text-xs">Disclaimer tekst</span></div>
                        <textarea name="disclaimerText" rows="2"
                                  placeholder="Dit bericht is vertrouwelijk&#8230;"
                                  class="textarea textarea-bordered textarea-xs leading-snug"></textarea>
                      </label>
                    </div>

                  </div>
                </details>

                <div class="divider my-0"></div>

                <!-- Save -->
                <div class="flex gap-2 pt-3">
                  <button type="button" onclick="saveConfig()" class="btn btn-primary btn-sm">
                    <i data-lucide="save" class="w-3.5 h-3.5 mr-1"></i> Opslaan
                  </button>
                </div>

              </form>
            </div>
          </div>

          <!-- Right: Preview -->
          <div class="card bg-base-100 shadow">
            <div class="card-body py-4 px-5 gap-3">

              <!-- Preview header + controls -->
              <div class="flex items-center justify-between">
                <h2 class="font-semibold text-base">Live preview</h2>
                <div class="join">
                  <button id="vp-desktop" class="join-item btn btn-xs btn-active" onclick="setViewport('desktop')" title="Desktop">
                    <i data-lucide="monitor" class="w-3.5 h-3.5"></i>
                  </button>
                  <button id="vp-mobile" class="join-item btn btn-xs" onclick="setViewport('mobile')" title="Smal (360px)">
                    <i data-lucide="smartphone" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
              </div>

              <!-- Employee dropdown -->
              <div class="flex gap-2 items-end">
                <div class="form-control flex-1">
                  <div class="label py-0.5"><span class="label-text text-xs font-medium">Medewerker uit Odoo</span></div>
                  <select id="prev-employee-select" class="select select-bordered select-xs"
                          onchange="onEmployeeSelect(this)">
                    <option value="">&#8212; Laad medewerkers&#8230; &#8212;</option>
                  </select>
                </div>
                <button onclick="loadEmployees()" class="btn btn-ghost btn-xs mb-0.5" title="Vernieuwen">
                  <i data-lucide="refresh-cw" class="w-3 h-3"></i>
                </button>
              </div>

              <div class="text-xs text-base-content/40 text-center -my-1">of vul handmatig in</div>

              <!-- Sample user fields -->
              <div class="grid grid-cols-2 gap-x-3 gap-y-1">
                <label class="form-control col-span-2">
                  <div class="label py-0.5"><span class="label-text text-xs">Naam</span></div>
                  <input type="text" id="prev-fullName" value="Jan De Vries"
                         class="input input-bordered input-xs" />
                </label>
                <label class="form-control">
                  <div class="label py-0.5"><span class="label-text text-xs">Rol</span></div>
                  <input type="text" id="prev-roleTitle" value="Syndicus"
                         class="input input-bordered input-xs" />
                </label>
                <label class="form-control">
                  <div class="label py-0.5"><span class="label-text text-xs">E-mail</span></div>
                  <input type="email" id="prev-email" value="jan@mymmo.com"
                         class="input input-bordered input-xs" />
                </label>
                <label class="form-control">
                  <div class="label py-0.5"><span class="label-text text-xs">Telefoon</span></div>
                  <input type="text" id="prev-phone" value=""
                         class="input input-bordered input-xs" />
                </label>
                <label class="form-control">
                  <div class="label py-0.5"><span class="label-text text-xs">Foto URL</span></div>
                  <input type="url" id="prev-photoUrl" value="" placeholder="https://&#8230;"
                         class="input input-bordered input-xs" />
                </label>
              </div>

              <!-- Preview status bar -->
              <div id="preview-status-bar" class="flex items-center gap-2 text-xs text-base-content/40 hidden">
                <span id="preview-status-dot" class="w-2 h-2 rounded-full bg-base-300 flex-shrink-0"></span>
                <span id="preview-status-text"></span>
              </div>

              <!-- data: URL warning -->
              <div id="preview-data-warning" class="hidden">
                <div class="alert alert-warning py-1.5 text-xs gap-1.5">
                  <i data-lucide="alert-triangle" class="w-3.5 h-3.5 flex-shrink-0"></i>
                  <span>Foto bevat een data: URL &#8212; werkt enkel in preview, niet bij push naar Gmail.</span>
                </div>
              </div>

              <!-- API warnings -->
              <div id="preview-warnings" class="hidden">
                <div class="alert alert-warning py-1.5 text-xs gap-1.5">
                  <i data-lucide="alert-triangle" class="w-3.5 h-3.5 flex-shrink-0"></i>
                  <ul id="preview-warnings-list" class="list-disc pl-3"></ul>
                </div>
              </div>

              <!-- Preview canvas -->
              <div id="preview-wrap">
                <div id="preview-canvas">
                  <iframe id="preview-frame" title="Signature preview"></iframe>
                </div>
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
              Selecteer &#233;&#233;n of meerdere gebruikers. De handtekening wordt opgesteld op basis van
              de opgeslagen configuratie. Naam, foto en functie worden live opgehaald via de
              Directory- en Odoo-API.
            </p>

            <div class="flex gap-2">
              <input type="text" id="push-search"
                     placeholder="Zoek op naam of e-mailadres&#8230;"
                     class="input input-bordered input-sm flex-1"
                     onkeydown="if(event.key==='Enter') searchUsers()" />
              <button onclick="searchUsers()" class="btn btn-outline btn-sm">Zoeken</button>
              <button onclick="loadAllUsers()" class="btn btn-ghost btn-sm">Alle laden</button>
            </div>

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

            <div class="flex items-center gap-3">
              <button id="push-btn" onclick="pushSelected()"
                      class="btn btn-primary btn-sm" disabled>
                <i data-lucide="send" class="w-4 h-4 mr-1"></i> Pushen
              </button>
              <span id="push-selected-count" class="text-sm text-base-content/50">
                Niets geselecteerd
              </span>
            </div>

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
                      Logs laden&#8230;
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
