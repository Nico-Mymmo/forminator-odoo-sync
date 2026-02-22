/**
 * Mail Signature Designer - Signature Compiler
 *
 * Pure function: takes config + userData → { html, warnings }
 *
 * Rules:
 * - Table-based layout, inline styles only
 * - Outlook compatible
 * - No external CSS, no base64 images, no DOM parsing
 * - Max width 600px
 * - Font: Arial, Helvetica, sans-serif
 * - Conditional rows removed when data/toggle is absent
 * - No empty <br> tags
 * - Unknown placeholders → warnings array
 * - Push continues despite warnings
 *
 * Event Amplifier mode:
 * - If eventPromoEnabled + eventTitle: render event banner block at bottom
 * - Else if showBanner + bannerImageUrl: render fallback banner
 */

const KNOWN_PLACEHOLDERS = ['fullName', 'roleTitle', 'email', 'phone', 'photoUrl', 'brandName', 'websiteUrl'];
const PLACEHOLDER_RE = /{{(\w+)}}/g;

/**
 * Blend a hex colour toward white.
 * @param {string} hex  - e.g. '#2563eb'
 * @param {number} t    - 0 = original, 1 = white
 * @returns {string}
 */
function lightenHex(hex, t = 0.8) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lr = Math.round(r + (255 - r) * t).toString(16).padStart(2, '0');
  const lg = Math.round(g + (255 - g) * t).toString(16).padStart(2, '0');
  const lb = Math.round(b + (255 - b) * t).toString(16).padStart(2, '0');
  return `#${lr}${lg}${lb}`;
}

/**
 * Resolve all placeholders in a string.
 * Collects unresolved placeholders as warnings.
 *
 * @param {string} str
 * @param {Object} data - key/value map
 * @param {string[]} warnings - mutable array to push to
 * @returns {string}
 */
function resolvePlaceholders(str, data, warnings) {
  return str.replace(PLACEHOLDER_RE, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(data, key) && data[key]) {
      return data[key];
    }
    if (!KNOWN_PLACEHOLDERS.includes(key)) {
      warnings.push(`Unknown placeholder: {{${key}}}`);
    }
    return '';
  });
}

/**
 * Compile a signature HTML string.
 *
 * @param {Object} config - Signature config from signature_config.config
 * @param {Object} userData - { fullName, roleTitle, email, phone, photoUrl }
 * @returns {{ html: string, warnings: string[] }}
 */
export function compileSignature(config, userData) {
  const warnings = [];

  // Backwards compat: primaryColor was the old key, brandColor is the new one
  const resolvedBrandColor = config.brandColor || config.primaryColor || '#2563eb';

  const {
    brandName = 'OpenVME',
    websiteUrl = 'https://openvme.be',
    showDisclaimer = false,
    disclaimerText = '',
    // Event promo
    eventPromoEnabled = false,
    eventEyebrow = 'Schrijf je in',
    eventTitle = '',
    eventDate = '',
    eventImageUrl = '',
    eventRegUrl = '',
    // Fallback banner
    showBanner = false,
    bannerImageUrl = '',
    bannerLinkUrl = ''
  } = config;

  const brandColor = resolvedBrandColor;

  const data = {
    fullName: userData.fullName || '',
    roleTitle: userData.roleTitle || '',
    email: userData.email || '',
    phone: userData.phone || '',
    photoUrl: userData.photoUrl || ''
  };

  const fontStack = 'Arial, Helvetica, sans-serif';
  const baseColor    = '#222222';
  const mutedColor   = '#666666';
  const dividerColor = lightenHex(brandColor, 0.65);  // soft tint for the vertical rule
  const calloutBg    = lightenHex(brandColor, 0.90);  // very pale fill for event callout

  // ── PHOTO CELL (left) ────────────────────────────────────────────────────────
  const photoCell = data.photoUrl
    ? `<td style="width:88px;vertical-align:top;text-align:center;padding:0 8px 0 0;">
        <img src="${data.photoUrl}"
             width="72" height="72"
             alt=""
             style="border-radius:50%;width:72px;height:72px;object-fit:cover;display:block;margin:0 auto;" />
      </td>`
    : '';

  // ── VERTICAL DIVIDER (only when photo present) ─────────────────────────────────────
  const dividerCell = data.photoUrl
    ? `<td style="width:1px;background-color:${dividerColor};padding:2px 0;font-size:0;line-height:0;">&nbsp;</td>`
    : '';

  // ── TEXT CELL (right) ────────────────────────────────────────────────────────
  const nameBlock = data.fullName
    ? `<div style="font-family:${fontStack};font-size:16px;font-weight:bold;color:${baseColor};line-height:1.3;">${data.fullName}</div>`
    : '';

  const roleBlock = data.roleTitle
    ? `<div style="font-family:${fontStack};font-size:13px;color:${mutedColor};margin-top:2px;">${data.roleTitle}</div>`
    : '';

  const brandBlock = brandName
    ? `<div style="font-family:${fontStack};font-size:13px;color:${brandColor};margin-top:2px;font-weight:600;">${brandName}</div>`
    : '';

  const contactLines = [];
  if (data.phone) {
    contactLines.push(
      `<div style="font-family:${fontStack};font-size:13px;color:${baseColor};">${data.phone}</div>`
    );
  }
  if (data.email) {
    contactLines.push(
      `<div style="font-family:${fontStack};font-size:13px;"><a href="mailto:${data.email}" style="color:${brandColor};text-decoration:none;">${data.email}</a></div>`
    );
  }
  if (websiteUrl) {
    const label = websiteUrl.replace(/^https?:\/\//, '');
    contactLines.push(
      `<div style="font-family:${fontStack};font-size:13px;"><a href="${websiteUrl}" style="color:${brandColor};text-decoration:none;">${label}</a></div>`
    );
  }

  const contactBlock = contactLines.length
    ? `<div style="margin-top:8px;">${contactLines.join('')}</div>`
    : '';

  const textCell = `<td style="vertical-align:top;${data.photoUrl ? 'padding-left:16px;' : ''}padding-right:16px;">
    ${nameBlock}${roleBlock}${brandBlock}${contactBlock}
  </td>`;

  // ── EVENT PROMO CALLOUT ───────────────────────────────────────────────────────
  let eventRow = '';

  if (eventPromoEnabled && eventTitle) {
    const imgBlock = eventImageUrl
      ? `<a href="${eventRegUrl || '#'}" style="display:block;margin-bottom:10px;">
          <img src="${eventImageUrl}" alt="${eventTitle}" width="536"
               style="display:block;width:100%;max-width:536px;border:0;border-radius:5px;" />
        </a>`
      : '';

    const eyebrowLine = eventEyebrow
      ? `<div style="font-family:${fontStack};font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${brandColor};margin-bottom:5px;">${eventEyebrow}</div>`
      : '';

    const titleLine = `<div style="font-family:${fontStack};font-size:14px;font-weight:700;color:${baseColor};line-height:1.4;">${eventTitle}</div>`;

    const dateLine = eventDate
      ? `<div style="font-family:${fontStack};font-size:12px;color:${mutedColor};margin-top:3px;">${eventDate}</div>`
      : '';

    const ctaLine = eventRegUrl
      ? `<div style="margin-top:8px;">
          <a href="${eventRegUrl}"
             style="font-family:${fontStack};font-size:12px;font-weight:700;color:#ffffff;text-decoration:none;background-color:${brandColor};padding:5px 14px;border-radius:4px;display:inline-block;">
            Schrijf je in &#8594;
          </a>
        </div>`
      : '';

    // Callout: left edge at divider, text inside aligns with name/contact text above
    const calloutCell = data.photoUrl
      ? `<td></td><td colspan="2" style="padding-top:16px;padding-right:16px;">`
      : `<td style="padding-top:16px;padding-right:16px;">`;
    eventRow = `<tr>
      ${calloutCell}
        <table cellpadding="0" cellspacing="0" border="0"
               style="width:100%;border-collapse:separate;border-spacing:0;background-color:${calloutBg};border-radius:8px;border:1px solid ${dividerColor};">
          <tr>
            <td style="padding:14px 16px;">
              ${eyebrowLine}${imgBlock}${titleLine}${dateLine}${ctaLine}
            </td>
          </tr>
        </table>
      </td>
    </tr>`;

  } else if (showBanner && bannerImageUrl) {
    const bannerImg = `<img src="${bannerImageUrl}" alt="" width="600"
      style="display:block;max-width:600px;width:100%;border:0;" />`;
    eventRow = `<tr>
      <td colspan="3" style="padding-top:12px;">
        ${bannerLinkUrl
          ? `<a href="${bannerLinkUrl}" style="display:block;">${bannerImg}</a>`
          : bannerImg}
      </td>
    </tr>`;
  }

  // ── DISCLAIMER ────────────────────────────────────────────────────────────────
  let disclaimerRow = '';
  if (showDisclaimer && disclaimerText) {
    const resolved = resolvePlaceholders(disclaimerText, data, warnings);
    const disclaimerCells = data.photoUrl
      ? `<td></td><td></td><td style="padding-top:10px;padding-left:16px;padding-right:16px;font-family:${fontStack};font-size:11px;color:${mutedColor};">`
      : `<td colspan="3" style="padding-top:10px;padding-right:16px;font-family:${fontStack};font-size:11px;color:${mutedColor};">`;
    disclaimerRow = `<tr>
      ${disclaimerCells}
        ${resolved}
      </td>
    </tr>`;
  }

  // ── ASSEMBLE ──────────────────────────────────────────────────────────────────
  const greeting = `<div style="font-family:${fontStack};font-size:14px;color:${baseColor};margin-bottom:16px;">Met vriendelijke groet,<br>&nbsp;</div>`;

  const html = (`${greeting}<table cellpadding="0" cellspacing="0" border="0"
  style="max-width:600px;width:100%;border-collapse:collapse;font-family:${fontStack};">
  <tr>
    ${photoCell}
    ${dividerCell}
    ${textCell}
  </tr>
  ${eventRow}
  ${disclaimerRow}
</table>`).replace(/\n\s*\n/g, '\n').trim();

  return { html, warnings };
}
