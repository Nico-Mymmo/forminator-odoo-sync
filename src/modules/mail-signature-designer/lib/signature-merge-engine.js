/**
 * Mail Signature Designer – Signature Merge Engine
 *
 * Implements the three-layer merge strategy that resolves what gets
 * compiled and pushed to Gmail for each individual user.
 *
 * ─── Layer hierarchy (highest priority first) ────────────────────────────────
 *
 *  1. USER layer  (user_signature_settings row)
 *     – Per-user overrides: name, job title, phone
 *     – Visibility toggles: show_email, show_phone
 *     – Personal disclaimer
 *     – Personal LinkedIn promo
 *
 *  2. MARKETING layer  (marketing_signature_settings singleton)
 *     – Branding: brandColor, brandName, websiteUrl
 *     – Active event promotion
 *     – Fallback banner
 *     – Default disclaimer (used when user has none)
 *
 *  3. ODOO layer  (hr.employee record)
 *     – Canonical name, job title, phone fetched live from Odoo
 *
 *  4. GOOGLE DIRECTORY layer  (directory-client.js)
 *     – Profile photo (always sourced from Google)
 *     – Email address (always authoritative from Google / target email)
 *
 * ─── Merge rules ──────────────────────────────────────────────────────────────
 *
 *  • User explicit overrides win always.
 *  • Visibility toggles from user layer reduce what is shown (never expand).
 *  • If user has no override → fallback to Odoo.
 *  • If Odoo has no value  → fallback to directory user (for name/photo).
 *  • Marketing layer provides branding and events – these are never overridable
 *    by individual users (by design: consistent brand identity).
 *  • Events are always a separate injectable section at the bottom.
 *  • Disclaimer: user text wins; if absent, marketing default is used.
 *  • LinkedIn promo is per-user only (marketing does not own LinkedIn content).
 *
 * ─── Output ──────────────────────────────────────────────────────────────────
 *
 *  mergeSignatureLayers() returns the merged { config, userData } tuple that
 *  can be passed directly to compileSignature(config, userData).
 *
 *  The function is pure and deterministic: given identical inputs it always
 *  produces identical output. All async data fetching must happen before
 *  calling this function.
 */

/**
 * Merge three signature data layers into a single compilable pair.
 *
 * @param {Object|null} userSettings      - Row from user_signature_settings (or null)
 * @param {Object}      marketingConfig   - config JSONB from marketing_signature_settings
 * @param {Object}      odooEmployee      - hr.employee record from Odoo (may be empty {})
 * @param {Object}      directoryUser     - User object from Google Directory (may be empty {})
 * @param {string}      targetEmail       - The Google Workspace email being pushed to
 *
 * @returns {{ config: Object, userData: Object, mergedBy: Object }}
 *   config   – Complete config object ready for compileSignature()
 *   userData – Complete userData object ready for compileSignature()
 *   mergedBy – Audit map: each field annotated with its winning layer
 *              (for debugging / admin visibility, not rendered)
 */
export function mergeSignatureLayers(
  userSettings,
  marketingConfig,
  odooEmployee,
  directoryUser,
  targetEmail
) {
  const u  = userSettings  || {};
  const m  = marketingConfig || {};
  const o  = odooEmployee  || {};
  const d  = directoryUser || {};

  // ── Audit trail (which layer provided each value) ──────────────────────────
  const mergedBy = {};

  /**
   * Resolve a value from layers, record which layer won.
   * Returns the first non-null, non-undefined, non-empty-string value.
   *
   * @param {string}   field   - Human-readable field name (for audit)
   * @param {Array}    layers  - [{ layer, value }] in priority order
   */
  function resolve(field, layers) {
    for (const { layer, value } of layers) {
      if (value !== null && value !== undefined && value !== '') {
        mergedBy[field] = layer;
        return value;
      }
    }
    mergedBy[field] = 'default';
    return '';
  }

  /**
   * Resolve a boolean toggle.
   * null/undefined → defaultValue; explicit true/false wins.
   */
  function resolveToggle(field, userValue, defaultValue = true) {
    if (userValue === null || userValue === undefined) {
      mergedBy[field] = 'default';
      return defaultValue;
    }
    mergedBy[field] = 'user';
    return !!userValue;
  }

  // ── userData ────────────────────────────────────────────────────────────────

  const showName      = resolveToggle('showName',      u.show_name,       true);
  const showRoleTitle = resolveToggle('showRoleTitle',  u.show_role_title, true);
  const showEmail     = resolveToggle('showEmail',      u.show_email,      true);
  const showPhone     = resolveToggle('showPhone',      u.show_phone,      true);
  const showPhoto     = resolveToggle('showPhoto',      u.show_photo,      true);
  const showGreeting  = resolveToggle('showGreeting',   u.show_greeting,  true);
  const showCompany   = resolveToggle('showCompany',    u.show_company,   true);
  // Per-event opt-out: hidden only when the user explicitly hid this specific event ID.
  // When marketing activates a new event (different ID), the stored hidden_event_id
  // no longer matches and the event block is shown again automatically.
  // NOTE: hidden_event_id is a TEXT column but m.eventId is a number from JSONB — normalise
  // both to strings before comparing to avoid a type mismatch with strict equality.
  const showEventPromo = !(u.hidden_event_id && m.eventId &&
    String(u.hidden_event_id) === String(m.eventId));

  const fullName = resolve('fullName', [
    { layer: 'user',      value: u.full_name_override },
    { layer: 'odoo',      value: o.name },
    { layer: 'directory', value: d.fullName }
  ]);

  const roleTitle = resolve('roleTitle', [
    { layer: 'user', value: u.role_title_override },
    { layer: 'odoo', value: o.job_title },
    { layer: 'directory', value: d.jobTitle }
  ]);

  const phone = resolve('phone', [
    { layer: 'user', value: u.phone_override },
    { layer: 'odoo', value: o.mobile_phone }
  ]);

  // Per-user greeting text (default: 'Met vriendelijke groet,')
  const greetingText = u.greeting_text || 'Met vriendelijke groet,';

  // Per-user company name: user override → marketing brandName → 'OpenVME'
  const company = showCompany
    ? (u.company_override || m.brandName || 'OpenVME')
    : '';

  // Email is always the authoritative target email; toggle controls visibility
  const email = showEmail ? targetEmail : '';

  // Photo always comes from Google Directory (most up-to-date, matches Google Meet etc.)
  const photoUrl = resolve('photoUrl', [
    { layer: 'directory', value: d.photoUrl }
  ]);

  const userData = {
    fullName:     showName      ? fullName  : '',
    roleTitle:    showRoleTitle ? roleTitle : '',
    email,
    phone:        showPhone ? phone : '',
    photoUrl:     showPhoto ? photoUrl : '',
    greetingText: showGreeting ? greetingText : '',
    showGreeting,
    company
  };

  // ── Disclaimer ──────────────────────────────────────────────────────────────
  // User disclaimer text wins; fallback to marketing default.
  // showDisclaimer: user toggle wins; if user has no setting, use marketing.

  let showDisclaimer = false;
  let disclaimerText = '';

  if (u.show_disclaimer === true && u.disclaimer_text) {
    // User has an explicit personal disclaimer
    showDisclaimer = true;
    disclaimerText = u.disclaimer_text;
    mergedBy['disclaimer'] = 'user';
  } else if (m.showDisclaimer && m.disclaimerText) {
    // Fall back to marketing default
    showDisclaimer = true;
    disclaimerText = m.disclaimerText;
    mergedBy['disclaimer'] = 'marketing';
  } else {
    mergedBy['disclaimer'] = 'none';
  }

  // ── LinkedIn (user-owned, marketing cannot override) ─────────────────────
  const linkedinPromoEnabled = !!(u.linkedin_promo_enabled && u.linkedin_url);
  mergedBy['linkedin'] = linkedinPromoEnabled ? 'user' : 'none';

  // ── Quote (user-owned, marketing cannot override) ─────────────────────────
  const quoteEnabled = !!(u.quote_enabled && u.quote_text);
  mergedBy['quote'] = quoteEnabled ? 'user' : 'none';

  // ── config object ──────────────────────────────────────────────────────────
  // Branding and events are always from the marketing layer.
  // The user layer does not touch these fields.

  const config = {
    // ── Branding (marketing layer only)
    brandColor:  m.brandColor  || m.primaryColor || '#2563eb',
    brandName:   m.brandName   || '',
    websiteUrl:  m.websiteUrl  || '',

    // ── Event promo (marketing layer only, gated by user opt-out)
    eventPromoEnabled: !!(m.eventPromoEnabled && m.eventTitle) && showEventPromo,
    eventId:           m.eventId           || null,
    eventTitle:        m.eventTitle        || '',
    eventDate:         m.eventDate         || '',
    eventEyebrow:      m.eventEyebrow      || 'Schrijf je in',
    eventImageUrl:        m.eventImageUrl        || '',
    eventImageMaxHeight:  m.eventImageMaxHeight  || null,
    eventRegUrl:          m.eventRegUrl          || '',

    // ── Fallback banner (marketing layer only)
    showBanner:     !!(m.showBanner && m.bannerImageUrl),
    bannerImageUrl: m.bannerImageUrl || '',
    bannerLinkUrl:  m.bannerLinkUrl  || '',

    // ── Disclaimer (resolved above – user wins over marketing)
    showDisclaimer,
    disclaimerText,

    // ── LinkedIn (user layer only)
    linkedinPromoEnabled,
    linkedinUrl:        linkedinPromoEnabled ? (u.linkedin_url        || '') : '',
    linkedinEyebrow:    u.linkedin_eyebrow   || 'Mijn laatste LinkedIn\u2011post',
    linkedinText:       u.linkedin_text      || '',
    linkedinAuthorName: u.linkedin_author_name || '',
    linkedinAuthorImg:  u.linkedin_author_img  || '',
    linkedinLikes:      u.linkedin_likes       || 0,

    // ── Quote (user layer only)
    quoteEnabled,
    quoteText:   quoteEnabled ? (u.quote_text   || '') : '',
    quoteAuthor: u.quote_author || '',
    quoteDate:   u.quote_date   || ''
  };

  return { config, userData, mergedBy };
}

/**
 * Convenience: build a preview-friendly merged result with minimum inputs.
 *
 * Used by the preview endpoint when a user previews their own signature
 * using form inputs instead of persisted DB values.
 *
 * Preview form values take the role of the "user layer" so the caller
 * can pass an arbitrary userSettings-shaped object without a DB round-trip.
 *
 * @param {Object} formUserSettings - User form values (same shape as user_signature_settings row)
 * @param {Object} marketingConfig  - config from marketing_signature_settings.config
 * @param {string} targetEmail
 * @returns {{ config: Object, userData: Object, mergedBy: Object }}
 */
export function mergeForPreview(formUserSettings, marketingConfig, targetEmail) {
  return mergeSignatureLayers(
    formUserSettings,
    marketingConfig,
    {},          // no Odoo data in preview – user supplies overrides directly
    {},          // no Directory data in preview
    targetEmail || 'preview@example.com'
  );
}
