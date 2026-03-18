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
  // Server-side role check – determines which tabs are rendered
  const isMarketingOrAdmin = user?.role === 'admin' || user?.role === 'marketing_signature';
  const isAdmin            = user?.role === 'admin';

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
    window.__SIG_STATE__ = ${JSON.stringify({
      actorEmail: user?.email || '',
      userRole:   user?.role  || 'user'
    })};
  </script>

  <div style="padding-top: 48px;">
    <div class="container mx-auto px-6 py-8 max-w-7xl">

      <!-- Header -->
      <div class="mb-5">
        <h1 class="text-4xl font-bold mb-1">Signature Designer</h1>
        <p class="text-base-content/60 text-sm">Event Amplifier &mdash; promoot events via e-mailhandtekeningen</p>
      </div>

      <!-- Tabs -->
      <div role="tablist" class="tabs tabs-boxed mb-5 w-fit">
        <button role="tab" class="tab tab-active" data-tab="my-signature" onclick="switchTab('my-signature', this)">
          <i data-lucide="user" class="w-4 h-4 mr-1"></i> Mijn handtekening
        </button>
        ${isMarketingOrAdmin ? `
        <button role="tab" class="tab" data-tab="builder" onclick="switchTab('builder', this)">
          <i data-lucide="megaphone" class="w-4 h-4 mr-1"></i> Marketing
        </button>
        <button role="tab" class="tab" data-tab="push" onclick="switchTab('push', this)">
          <i data-lucide="send" class="w-4 h-4 mr-1"></i> Push
        </button>
        <button role="tab" class="tab" data-tab="logs" onclick="switchTab('logs', this)">
          <i data-lucide="list" class="w-4 h-4 mr-1"></i> Logs
        </button>` : ''}
        ${isAdmin ? `
        <button role="tab" class="tab" data-tab="admin" onclick="switchTab('admin', this)">
          <i data-lucide="shield" class="w-4 h-4 mr-1"></i> Administratie
        </button>` : ''}
      </div>

      <!-- ─── TAB: Mijn handtekening (USER SCOPE) ────────────────────────── -->
      <div id="tab-my-signature" class="tab-content active">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">

          <!-- Left: User settings form -->
          <div class="card bg-base-100 shadow">
            <div class="card-body py-4 px-5">

              <div class="flex items-center justify-between mb-3">
                <h2 class="font-semibold text-base">Mijn handtekening</h2>
                <div class="flex items-center gap-2">
                  <span id="my-save-status-dot" class="w-2 h-2 rounded-full bg-base-300"></span>
                  <span id="my-save-status" class="text-xs text-base-content/40">&#8211;</span>
                </div>
              </div>

              <!-- ══ Variant selector bar ══ -->
              <div class="flex items-center gap-2 mb-2">
                <i data-lucide="layers" class="w-4 h-4 text-base-content/40 shrink-0"></i>
                <select id="variant-selector"
                        class="select select-bordered select-xs flex-1 min-w-0"
                        onchange="onVariantSelectorChange(this.value)">
                  <option value="">Standaard</option>
                </select>
                <button type="button" id="variant-delete-btn"
                        class="btn btn-xs btn-ghost btn-circle hidden text-error"
                        onclick="deleteCurrentVariant()" title="Variant verwijderen">
                  <i data-lucide="trash-2" class="w-3 h-3"></i>
                </button>
              </div>
              <div id="variant-mode-bar" class="hidden alert alert-info text-xs py-1.5 mb-2">
                <i data-lucide="layers" class="w-3.5 h-3.5 shrink-0"></i>
                <span id="variant-mode-label">Variant-modus &mdash; bewaar om de wijzigingen op te slaan in dit variant.</span>
              </div>

              <form id="my-settings-form" class="space-y-4">

                <!-- ══ Mijn gegevens + zichtbaarheid ══ -->
                <details open>
                  <summary class="flex items-center justify-between py-1.5 select-none">
                    <div class="flex items-center gap-2">
                      <i data-lucide="user" class="w-4 h-4 text-primary"></i>
                      <span class="text-sm font-semibold">Mijn gegevens</span>
                    </div>
                    <i data-lucide="chevron-right" class="w-4 h-4 summary-chevron text-base-content/40"></i>
                  </summary>
                  <div class="pt-3 space-y-3">
                    <p class="text-xs text-base-content/50">Odoo-waarde als placeholder. Vink het "toon"-vinkje uit om een veld te verbergen.</p>

                    <!-- Groet -->
                    <div class="flex items-end gap-2">
                      <label class="flex flex-col items-center gap-0.5 pb-1" title="Groet tonen">
                        <span class="text-xs text-base-content/40">toon</span>
                        <input type="checkbox" name="show_greeting" class="checkbox checkbox-xs checkbox-primary" checked />
                      </label>
                      <div class="flex-1">
                        <div class="label py-0.5"><span class="label-text text-xs">Groet</span></div>
                        <input type="text" name="greeting_text" id="my-greeting"
                               placeholder="Met vriendelijke groet,"
                               class="input input-bordered input-xs w-full" />
                      </div>
                    </div>

                    <!-- Naam -->
                    <div>
                      <div class="label py-0.5"><span class="label-text text-xs">Naam</span></div>
                      <input type="text" name="full_name_override" id="my-full-name"
                             placeholder="Laat leeg = Odoo naam"
                             class="input input-bordered input-xs w-full" />
                    </div>

                    <!-- Functietitel -->
                    <div>
                      <div class="label py-0.5"><span class="label-text text-xs">Functietitel</span></div>
                      <input type="text" name="role_title_override" id="my-role-title"
                             placeholder="Laat leeg = Odoo functie"
                             class="input input-bordered input-xs w-full" />
                    </div>

                    <!-- Bedrijf -->
                    <div class="flex items-end gap-2">
                      <label class="flex flex-col items-center gap-0.5 pb-1" title="Bedrijf tonen">
                        <span class="text-xs text-base-content/40">toon</span>
                        <input type="checkbox" name="show_company" class="checkbox checkbox-xs checkbox-primary" checked />
                      </label>
                      <div class="flex-1">
                        <div class="label py-0.5"><span class="label-text text-xs">Bedrijf</span></div>
                        <input type="text" name="company_override" id="my-company"
                               placeholder="OpenVME"
                               class="input input-bordered input-xs w-full" />
                      </div>
                    </div>

                    <!-- Telefoonnummer -->
                    <div class="flex items-end gap-2">
                      <label class="flex flex-col items-center gap-0.5 pb-1" title="Telefoon tonen">
                        <span class="text-xs text-base-content/40">toon</span>
                        <input type="checkbox" name="show_phone" class="checkbox checkbox-xs checkbox-primary" checked />
                      </label>
                      <div class="flex-1">
                        <div class="label py-0.5"><span class="label-text text-xs">Telefoonnummer</span></div>
                        <input type="text" name="phone_override" id="my-phone"
                               placeholder="Laat leeg = Odoo telefoon"
                               class="input input-bordered input-xs w-full" />
                      </div>
                    </div>

                    <!-- E-mailadres -->
                    <div class="flex items-end gap-2">
                      <label class="flex flex-col items-center gap-0.5 pb-1" title="E-mailadres tonen">
                        <span class="text-xs text-base-content/40">toon</span>
                        <input type="checkbox" name="show_email" id="my-show-email"
                               class="checkbox checkbox-xs checkbox-primary" checked />
                      </label>
                      <div class="flex-1">
                        <div class="label py-0.5"><span class="label-text text-xs">E-mailadres</span></div>
                        <input type="text" name="email_display_override" id="my-email-display-input"
                               placeholder="Laat leeg = eigen e-mailadres"
                               class="input input-bordered input-xs w-full" />
                        <p class="text-xs text-base-content/40 mt-0.5">Laat leeg = eigen Google-email. Voor alias-varianten: vul het alias-emailadres in.</p>
                      </div>
                    </div>

                    <!-- Website URL -->
                    <div>
                      <div class="label py-0.5"><span class="label-text text-xs">Website URL</span></div>
                      <input type="url" name="website_url_override" id="my-website-url"
                             placeholder="Laat leeg = marketing URL"
                             class="input input-bordered input-xs w-full" />
                    </div>

                    <!-- Profielfoto -->
                    <div class="pl-0.5">
                      <!-- State A: photo available – show checkbox + thumbnail -->
                      <div id="my-photo-has-photo" class="hidden flex items-center gap-2">
                        <label class="flex flex-col items-center gap-0.5" title="Foto tonen">
                          <span class="text-xs text-base-content/40">toon</span>
                          <input type="checkbox" name="show_photo" class="checkbox checkbox-xs checkbox-primary" checked />
                        </label>
                        <div class="flex items-center gap-2">
                          <img id="my-photo-thumb" src="" alt="Profielfoto"
                               class="w-8 h-8 rounded-full object-cover ring-1 ring-base-300" />
                          <span class="label-text text-xs">Profielfoto (via Google)</span>
                        </div>
                      </div>
                      <!-- State B: no photo -->
                      <div id="my-photo-no-photo" class="hidden flex items-center gap-2 text-xs text-base-content/40 italic">
                        <i data-lucide="image-off" class="w-4 h-4 shrink-0"></i>
                        Geen foto beschikbaar in Google Workspace
                      </div>
                    </div>

                  </div>
                </details>

                <div class="divider my-0"></div>

                <!-- ══ Meeting link ══ -->
                <details id="my-section-meeting">
                  <summary class="flex items-center justify-between py-1.5 select-none">
                    <div class="flex items-center gap-2">
                      <i data-lucide="calendar-clock" class="w-4 h-4 text-base-content/50"></i>
                      <span class="text-sm font-semibold">Meeting link</span>
                    </div>
                    <i data-lucide="chevron-right" class="w-4 h-4 summary-chevron text-base-content/40"></i>
                  </summary>
                  <div class="pt-3 space-y-3">
                    <p class="text-xs text-base-content/50">Voeg een klein blokje toe onder je gegevens met een link naar jouw Calendly- of Google Meet-pagina.</p>
                    <label class="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" name="meeting_link_enabled" id="my-meeting-toggle"
                             class="checkbox checkbox-sm checkbox-primary"
                             onchange="onMyMeetingToggle(this.checked)" />
                      <span class="text-sm font-medium">Meeting link tonen in handtekening</span>
                    </label>
                    <div id="my-meeting-fields" class="cond-field space-y-3">
                      <label class="form-control">
                        <div class="label py-0.5"><span class="label-text text-xs">Koptekst</span></div>
                        <input type="text" name="meeting_link_heading" id="my-meeting-heading"
                               value="Even sparren?"
                               class="input input-bordered input-xs" />
                      </label>
                      <label class="form-control">
                        <div class="label py-0.5"><span class="label-text text-xs">Subtekst</span></div>
                        <input type="text" name="meeting_link_subtext" id="my-meeting-subtext"
                               value="Boek gerust een online chat en stel je vragen."
                               class="input input-bordered input-xs" />
                      </label>
                      <label class="form-control">
                        <div class="label py-0.5"><span class="label-text text-xs">Boekings-URL (Calendly, Google Meet, ...)</span></div>
                        <input type="url" name="meeting_link_url" id="my-meeting-url"
                               placeholder="https://calendly.com/jouw-naam"
                               class="input input-bordered input-xs" />
                      </label>
                    </div>
                  </div>
                </details>

                <div class="divider my-0"></div>

                <!-- ══ Mijn LinkedIn post ══ -->
                <details id="my-section-linkedin">
                  <summary class="flex items-center justify-between py-1.5 select-none">
                    <div class="flex items-center gap-2">
                      <span style="display:inline-block;background:#0A66C2;color:#fff;font-weight:bold;font-size:9px;border-radius:3px;width:15px;height:15px;text-align:center;line-height:15px;">in</span>
                      <span class="text-sm font-semibold">Mijn LinkedIn post</span>
                    </div>
                    <i data-lucide="chevron-right" class="w-4 h-4 summary-chevron text-base-content/40"></i>
                  </summary>
                  <div class="pt-3 space-y-3">
                    <label class="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" name="linkedin_promo_enabled" id="my-linkedin-toggle"
                             class="toggle toggle-sm" style="--tglbg:#0A66C2"
                             onchange="onMyLinkedinToggle(this.checked)" />
                      <span class="text-sm font-medium">LinkedIn post tonen in handtekening</span>
                    </label>

                    <div id="my-linkedin-fields" class="cond-field space-y-3">
                      <label class="form-control">
                        <div class="label py-0.5"><span class="label-text text-xs">Titel</span></div>
                        <input type="text" name="linkedin_eyebrow" id="my-linkedin-eyebrow"
                               value="Mijn laatste LinkedIn&#x2011;post"
                               class="input input-bordered input-xs" />
                      </label>
                      <div class="label py-0.5"><span class="label-text text-xs">LinkedIn post URL</span></div>
                      <div class="flex gap-1.5">
                        <input type="url" name="linkedin_url" id="my-linkedin-url"
                               placeholder="https://linkedin.com/posts/&#8230;"
                               class="input input-bordered input-xs flex-1" />
                        <button type="button" id="my-linkedin-fetch-btn"
                                onclick="fetchMyLinkedinMeta()"
                                class="btn btn-xs btn-outline" title="Post automatisch ophalen">
                          <i data-lucide="sparkles" class="w-3 h-3"></i>
                        </button>
                      </div>
                      <div id="my-linkedin-fetch-status" class="text-xs mt-1 hidden"></div>

                      <label class="form-control">
                        <div class="label py-0.5"><span class="label-text text-xs">Oproeptekst</span></div>
                        <textarea name="linkedin_text" id="my-linkedin-text" rows="3"
                                  placeholder="Ik plaatste zojuist een artikel over&#8230;"
                                  class="textarea textarea-bordered textarea-xs leading-snug"></textarea>
                      </label>

                      <!-- Hidden scraped metadata -->
                      <input type="hidden" name="linkedin_author_name" id="my-linkedin-author-name" />
                      <input type="hidden" name="linkedin_author_img"  id="my-linkedin-author-img" />
                      <input type="hidden" name="linkedin_likes"       id="my-linkedin-likes" />
                    </div>
                  </div>
                </details>

                <div class="divider my-0"></div>

                <!-- ══ Marketing event ══ -->
                <details>
                  <summary class="flex items-center justify-between py-1.5 select-none">
                    <div class="flex items-center gap-2">
                      <i data-lucide="calendar-check" class="w-4 h-4 text-base-content/50"></i>
                      <span class="text-sm font-semibold">Marketing event</span>
                    </div>
                    <i data-lucide="chevron-right" class="w-4 h-4 summary-chevron text-base-content/40"></i>
                  </summary>
                  <div class="pt-3 space-y-2">
                    <div id="my-event-active" class="hidden">
                      <p class="text-xs text-base-content/50 mb-2">Actief event via marketing:</p>
                      <p id="my-event-title-display" class="text-xs font-medium text-base-content mb-2"></p>
                      <label class="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" name="show_event_promo" class="checkbox checkbox-sm checkbox-primary" checked />
                        <span class="text-sm font-medium">Event tonen in mijn handtekening</span>
                      </label>
                      <p class="text-xs text-base-content/40 mt-1 pl-9">Vinkje uitzetten verbergt alleen <em>dit</em> event. Bij een nieuw event wordt het automatisch weer getoond &mdash; en worden alle handtekeningen hernieuwd door marketing.</p>
                    </div>
                    <div id="my-event-none" class="hidden text-xs text-base-content/40 italic">
                      Geen actief marketing event op dit moment.
                    </div>
                  </div>
                </details>

                <div class="divider my-0"></div>

                <!-- ══ Inspirerende quote ══ -->
                <details>
                  <summary class="flex items-center justify-between py-1.5 select-none">
                    <div class="flex items-center gap-2">
                      <i data-lucide="quote" class="w-4 h-4 text-base-content/50"></i>
                      <span class="text-sm font-semibold">Inspirerende quote</span>
                    </div>
                    <i data-lucide="chevron-right" class="w-4 h-4 summary-chevron text-base-content/40"></i>
                  </summary>
                  <div class="pt-3 space-y-3">
                    <label class="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" name="quote_enabled" id="my-quote-toggle"
                             class="checkbox checkbox-sm checkbox-primary"
                             onchange="onMyQuoteToggle(this.checked)" />
                      <span class="text-sm font-medium">Quote tonen in handtekening</span>
                    </label>
                    <div id="my-quote-fields" class="cond-field space-y-3">
                      <label class="form-control">
                        <div class="label py-0.5"><span class="label-text text-xs">Quote tekst</span></div>
                        <textarea name="quote_text" rows="2"
                                  placeholder="De enige manier om goed werk te doen…"
                                  class="textarea textarea-bordered textarea-xs leading-snug"></textarea>
                      </label>
                      <label class="form-control">
                        <div class="label py-0.5"><span class="label-text text-xs">Gezegd door</span></div>
                        <input type="text" name="quote_author"
                               placeholder="Steve Jobs"
                               class="input input-bordered input-xs" />
                      </label>
                      <label class="form-control">
                        <div class="label py-0.5"><span class="label-text text-xs">Wanneer <span class="opacity-50">(optioneel)</span></span></div>
                        <input type="text" name="quote_date"
                               placeholder="2005"
                               class="input input-bordered input-xs" />
                      </label>
                    </div>
                  </div>
                </details>

                <div class="divider my-0"></div>

                <!-- ══ Persoonlijke disclaimer ══ -->
                <details>
                  <summary class="flex items-center justify-between py-1.5 select-none">
                    <div class="flex items-center gap-2">
                      <i data-lucide="info" class="w-4 h-4 text-base-content/50"></i>
                      <span class="text-sm font-semibold">Persoonlijke disclaimer</span>
                    </div>
                    <i data-lucide="chevron-right" class="w-4 h-4 summary-chevron text-base-content/40"></i>
                  </summary>
                  <div class="pt-3 space-y-2">
                    <p class="text-xs text-base-content/50">Laat leeg om de marketing-disclaimer te gebruiken.</p>
                    <label class="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" name="show_disclaimer" id="my-show-disclaimer"
                             class="checkbox checkbox-sm"
                             onchange="toggleCond('my-disclaimer-fields', this.checked)" />
                      <span class="text-sm font-medium">Disclaimer tonen</span>
                    </label>
                    <div id="my-disclaimer-fields" class="cond-field pl-7">
                      <label class="form-control">
                        <div class="label py-0.5"><span class="label-text text-xs">Disclaimer tekst</span></div>
                        <textarea name="disclaimer_text" id="my-disclaimer-text" rows="2"
                                  placeholder="Dit bericht is vertrouwelijk&#8230;"
                                  class="textarea textarea-bordered textarea-xs leading-snug"></textarea>
                      </label>
                    </div>
                  </div>
                </details>

                <div class="divider my-0"></div>

                <!-- ══ Aliassen ══ -->
                <details id="my-section-aliases" ontoggle="if(this.open) initAliasSection()">
                  <summary class="flex items-center justify-between py-1.5 select-none">
                    <div class="flex items-center gap-2">
                      <i data-lucide="at-sign" class="w-4 h-4 text-base-content/50"></i>
                      <span class="text-sm font-semibold">Aliassen</span>
                    </div>
                    <i data-lucide="chevron-right" class="w-4 h-4 summary-chevron text-base-content/40"></i>
                  </summary>
                  <div class="pt-3 space-y-3">
                    <p class="text-xs text-base-content/50">Wijs per alias in welk variant wordt gepusht.</p>
                    <div id="my-aliases-list">
                      <span class="loading loading-spinner loading-xs"></span>
                    </div>
                    <div id="my-aliases-save-row" class="hidden flex gap-2 mt-2">
                      <button type="button" class="btn btn-primary btn-xs"
                              onclick="saveAliasAssignmentsUI()">
                        <i data-lucide="save" class="w-3 h-3 mr-1"></i> Toewijzingen opslaan
                      </button>
                      <span id="my-aliases-save-status" class="text-xs self-center text-base-content/50"></span>
                    </div>
                  </div>
                </details>

                <div class="divider my-0"></div>

                <!-- Actions -->
                <div class="flex flex-wrap gap-2 pt-2">
                  <button type="button" onclick="pushSelf()"
                          class="btn btn-success btn-sm">
                    <i data-lucide="send" class="w-3.5 h-3.5 mr-1"></i> Naar mijn Gmail pushen
                  </button>
                  <div id="my-push-result" class="hidden w-full"></div>
                </div>

              </form>
            </div>
          </div>

          <!-- Right: Preview (same preview panel, shared) -->
          <div class="card bg-base-100 shadow">
            <div class="card-body py-4 px-5 gap-3">
              <div class="flex items-center justify-between">
                <h2 class="font-semibold text-base">Live preview</h2>
                <div class="flex items-center gap-2">
                  <button id="my-copy-btn"
                          onclick="copyMySignature()"
                          class="btn btn-xs btn-outline gap-1" title="Kopieer handtekening naar klembord (plakken in Gmail)">
                    <i data-lucide="clipboard-copy" class="w-3.5 h-3.5"></i>
                    Kopi&#235;ren
                  </button>
                  <div class="join">
                    <button id="my-vp-desktop" class="join-item btn btn-xs btn-active"
                            onclick="setMyViewport('desktop')" title="Desktop">
                      <i data-lucide="monitor" class="w-3.5 h-3.5"></i>
                    </button>
                    <button id="my-vp-mobile" class="join-item btn btn-xs"
                            onclick="setMyViewport('mobile')" title="Smal (360px)">
                      <i data-lucide="smartphone" class="w-3.5 h-3.5"></i>
                    </button>
                    <button id="my-vp-dark" class="join-item btn btn-xs"
                            onclick="toggleMyPreviewMode()" title="Dark/light achtergrond">
                      <i data-lucide="moon" class="w-3.5 h-3.5"></i>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Status bar -->
              <div id="my-preview-status-bar" class="flex items-center gap-2 text-xs text-base-content/40 hidden">
                <span id="my-preview-status-dot" class="w-2 h-2 rounded-full bg-base-300 flex-shrink-0"></span>
                <span id="my-preview-status-text"></span>
              </div>

              <!-- Preview canvas -->
              <div id="my-preview-wrap" style="background:#f3f4f6;padding:16px;border-radius:8px;">
                <div id="my-preview-canvas" style="background:#fff;max-width:600px;margin:0 auto;border-radius:4px;overflow:hidden;">
                  <iframe id="my-preview-frame" title="Mijn handtekening preview"
                          style="border:none;width:100%;min-height:60px;display:block;"></iframe>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div><!-- /tab-my-signature -->

      <!-- ─── TAB: Builder (MARKETING SCOPE) ──────────────────────────── -->
      <div id="tab-builder" class="tab-content">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">

          <!-- Left: Config form -->
          <div class="card bg-base-100 shadow">
            <div class="card-body py-4 px-5">

              <!-- Form header -->
              <div class="flex items-center justify-between mb-3">
                <h2 class="font-semibold text-base">Marketing instellingen</h2>
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
                      <span class="text-sm font-semibold">Event</span>
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

                      <!-- Event banner image URL + display options -->
                      <label class="form-control">
                        <div class="label py-0.5"><span class="label-text text-xs">Event afbeelding URL</span></div>
                        <input type="url" name="eventImageUrl" id="event-image-url-input"
                               placeholder="https://&#8230;/event-banner.png"
                               class="input input-bordered input-xs" />
                      </label>

                      <label class="form-control">
                        <div class="label py-0.5">
                          <span class="label-text text-xs">Max. hoogte (px)</span>
                          <span class="label-text-alt text-base-content/40 text-xs">leeg = volledige breedte</span>
                        </div>
                        <input type="number" name="eventImageMaxHeight" id="event-image-max-height"
                               placeholder="200" min="40" max="600" step="1"
                               class="input input-bordered input-xs w-36" />
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

                    <!-- When event toggle is OFF: choose fallback or nothing -->
                    <div id="fallback-banner-section" class="cond-field space-y-2">

                      <!-- "Nothing" info note (always visible in this section) -->
                      <div class="flex items-start gap-2 rounded-lg bg-base-200 px-3 py-2">
                        <i data-lucide="info" class="w-3.5 h-3.5 mt-0.5 shrink-0 text-base-content/40"></i>
                        <p class="text-xs text-base-content/50 leading-snug">
                          Event-promotie staat uit. Sla op en push naar gebruikers om het marketing-blok uit alle handtekeningen te verwijderen.<br />
                          <span class="text-base-content/40">Optioneel: vervang het door een vaste bannerafbeelding.</span>
                        </p>
                      </div>

                      <label class="flex items-start gap-3 cursor-pointer py-0.5">
                        <input type="checkbox" name="showBanner" class="checkbox checkbox-sm mt-0.5"
                               onchange="toggleCond('fallback-banner-fields', this.checked)" />
                        <div>
                          <span class="text-sm font-medium">Vervang door bannerafbeelding</span>
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

                <!-- ══ SECTIE 2: Defaults ══ -->
                <details id="section-defaults" class="mb-4 mt-1">
                  <summary class="flex items-center justify-between py-1.5 select-none">
                    <div class="flex items-center gap-2">
                      <i data-lucide="sliders-horizontal" class="w-4 h-4 text-base-content/50"></i>
                      <span class="text-sm font-semibold">Defaults</span>
                      <span class="badge badge-ghost badge-xs text-base-content/50">branding &amp; disclaimer</span>
                    </div>
                    <i data-lucide="chevron-right" class="w-4 h-4 summary-chevron text-base-content/40"></i>
                  </summary>

                  <div class="pt-3 space-y-3">

                    <label class="form-control">
                      <div class="label py-0.5"><span class="label-text text-xs">Merknaam</span></div>
                      <input type="text" name="brandName" placeholder="OpenVME"
                             class="input input-bordered input-xs" />
                    </label>

                    <label class="form-control">
                      <div class="label py-0.5"><span class="label-text text-xs">Website URL</span></div>
                      <input type="url" name="websiteUrl" placeholder="https://openvme.be"
                             class="input input-bordered input-xs" />
                    </label>

                    <div class="form-control">
                      <div class="label py-0.5"><span class="label-text text-xs">Primaire kleur</span></div>
                      <div class="flex items-center gap-2">
                        <input type="color" name="brandColor" value="#2563eb"
                               id="brand-color-picker"
                               class="w-9 h-8 rounded border border-base-300 cursor-pointer p-0.5" />
                        <input type="text" id="brand-color-text" value="#2563eb"
                               placeholder="#2563eb"
                               class="input input-bordered input-xs w-28"
                               pattern="^#[0-9a-fA-F]{6}$" />
                      </div>
                    </div>

                    <label class="flex items-start gap-3 cursor-pointer py-0.5">
                      <input type="checkbox" name="showDisclaimer" class="checkbox checkbox-sm mt-0.5"
                             onchange="toggleCond('disclaimer-fields', this.checked)" />
                      <div>
                        <span class="text-sm font-medium">Disclaimer</span>
                        <p class="text-xs text-base-content/40 leading-tight">Kleine vertrouwelijkheidstekst onderaan. Gebruikers kunnen dit overschrijven met een persoonlijke tekst.</p>
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

                <!-- Save + Push -->
                <div class="flex gap-2 pt-3 flex-wrap">
                  <button type="button" onclick="saveConfig()" class="btn btn-outline btn-sm">
                    <i data-lucide="save" class="w-3.5 h-3.5 mr-1"></i> Opslaan
                  </button>
                  <button type="button" onclick="openPushModal()" class="btn btn-secondary btn-sm">
                    <i data-lucide="users" class="w-3.5 h-3.5 mr-1"></i> Selecteer gebruikers
                  </button>
                  <button type="button" onclick="pushAllUsers()" id="push-all-btn" class="btn btn-primary btn-sm">
                    <i data-lucide="send" class="w-3.5 h-3.5 mr-1"></i> Pushen naar alle gebruikers
                  </button>
                </div>
                <div id="push-all-result" class="hidden mt-2 max-h-64 overflow-y-auto"></div>

              </form>
            </div>
          </div>

          <!-- Right: Preview (anonymous – shows marketing blocks only) -->
          <div class="card bg-base-100 shadow">
            <div class="card-body py-4 px-5 gap-3">

              <!-- Preview header -->
              <div class="flex items-center justify-between">
                <div>
                  <h2 class="font-semibold text-base">Live preview</h2>
                  <p class="text-xs text-base-content/40 mt-0.5">Gebruikersgegevens worden anoniem weergegeven — focus ligt op het marketing-blok.</p>
                </div>
                <div class="join">
                  <button id="vp-desktop" class="join-item btn btn-xs btn-active" onclick="setViewport('desktop')" title="Desktop">
                    <i data-lucide="monitor" class="w-3.5 h-3.5"></i>
                  </button>
                  <button id="vp-mobile" class="join-item btn btn-xs" onclick="setViewport('mobile')" title="Smal (360px)">
                    <i data-lucide="smartphone" class="w-3.5 h-3.5"></i>
                  </button>
                  <button id="vp-dark" class="join-item btn btn-xs" onclick="togglePreviewMode()" title="Dark/light achtergrond">
                    <i data-lucide="moon" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
              </div>

              <!-- Preview status bar -->
              <div id="preview-status-bar" class="flex items-center gap-2 text-xs text-base-content/40 hidden">
                <span id="preview-status-dot" class="w-2 h-2 rounded-full bg-base-300 flex-shrink-0"></span>
                <span id="preview-status-text"></span>
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
              Selecteer &#233;&#233;n of meerdere gebruikers. De handtekening wordt opgesteld door de
              marketinglaag, Odoo-data en eventuele persoonlijke overrides van elke gebruiker samen te
              voegen. Naam, foto en functie worden live opgehaald via de Directory- en Odoo-API.
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
                    <th>Scope</th>
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

      ${isAdmin ? `
      <!-- ─── TAB: Administratie (ADMIN ONLY) ─────────────────────────────── -->
      <div id="tab-admin" class="tab-content">
        <div class="max-w-xl">
          <div class="card bg-base-100 shadow">
            <div class="card-body py-4 px-5">
              <h2 class="font-semibold text-base mb-1">
                <i data-lucide="ban" class="w-4 h-4 inline-block mr-1 text-error"></i>
                Uitgesloten e-mailadressen
              </h2>
              <p class="text-sm text-base-content/60 mb-3">
                Deze adressen worden overgeslagen bij <strong>Push alle gebruikers</strong>
                (inclusief automatische pushes bij evenementwijzigingen) en zijn
                <strong>niet zichtbaar</strong> in de keuzelijst bij
                &ldquo;Selecteer gebruikers&rdquo;.
              </p>

              <!-- Add new email -->
              <div class="flex gap-2 mb-3">
                <input type="email" id="excluded-new-input"
                       class="input input-bordered input-sm flex-1"
                       placeholder="nieuw@bedrijf.com"
                       onkeydown="if(event.key==='Enter'){event.preventDefault();addExcludedEmail();}" />
                <button onclick="addExcludedEmail()" class="btn btn-sm btn-primary">
                  <i data-lucide="plus" class="w-3.5 h-3.5 mr-1"></i> Toevoegen
                </button>
              </div>

              <!-- Loading indicator -->
              <div id="excluded-loading" class="text-sm text-base-content/50 hidden">Laden&hellip;</div>

              <!-- Chip list -->
              <div id="excluded-chips" class="flex flex-wrap gap-2 min-h-8"></div>

              <!-- Status message -->
              <div id="excluded-status" class="text-xs mt-2 hidden"></div>
            </div>
          </div>
        </div>
      </div><!-- /tab-admin -->
      ` : ''}

    </div><!-- /container -->

  <!-- ─── MODAL: Selecteer gebruikers om naar te pushen ──────────────── -->
  <dialog id="push-select-modal" class="modal">
    <div class="modal-box max-w-2xl">
      <form method="dialog">
        <button class="btn btn-sm btn-circle btn-ghost absolute right-3 top-3">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </form>

      <h3 class="font-bold text-base mb-1">Selecteer gebruikers</h3>
      <p class="text-xs text-base-content/50 mb-3">Zoek een of meerdere medewerkers en push hun handtekening op basis van de huidige marketinginstellingen.</p>

      <!-- Search -->
      <div class="flex gap-2 mb-3">
        <input type="text" id="modal-push-search"
               placeholder="Zoek op naam of e-mailadres&#8230;"
               class="input input-bordered input-sm flex-1"
               onkeydown="if(event.key==='Enter') modalSearchUsers()" />
        <button onclick="modalSearchUsers()" class="btn btn-outline btn-sm">Zoeken</button>
        <button onclick="modalLoadAllUsers()" class="btn btn-ghost btn-sm">Alle laden</button>
      </div>

      <!-- User list -->
      <div id="modal-push-list"
           class="overflow-y-auto max-h-64 border border-base-300 rounded-lg hidden mb-3">
        <table class="table table-xs w-full">
          <thead>
            <tr>
              <th>
                <input type="checkbox" id="modal-select-all" class="checkbox checkbox-xs"
                       onchange="modalToggleAll(this)" />
              </th>
              <th>Naam</th>
              <th>E-mail</th>
            </tr>
          </thead>
          <tbody id="modal-push-tbody"></tbody>
        </table>
      </div>

      <!-- Loading placeholder -->
      <div id="modal-push-loading" class="hidden flex items-center gap-2 text-sm text-base-content/50 mb-3">
        <span class="loading loading-spinner loading-xs"></span> Laden&#8230;
      </div>

      <!-- Result -->
      <div id="modal-push-result" class="hidden mb-3"></div>

      <!-- Footer -->
      <div class="flex items-center justify-between gap-3">
        <span id="modal-push-count" class="text-sm text-base-content/50">Niets geselecteerd</span>
        <div class="flex gap-2">
          <form method="dialog"><button class="btn btn-ghost btn-sm">Annuleren</button></form>
          <button id="modal-push-btn" onclick="modalPushSelected()"
                  class="btn btn-primary btn-sm" disabled>
            <i data-lucide="send" class="w-3.5 h-3.5 mr-1"></i> Pushen
          </button>
        </div>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>sluiten</button></form>
  </dialog>
  </div><!-- /padding-top -->

  <script src="/mail-signature-designer-client.js"></script>
</body>
</html>`;
}
