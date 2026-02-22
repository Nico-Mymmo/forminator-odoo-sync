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
  const baseColor = '#222222';
  const mutedColor = '#666666';

  // ── HEADER ROW ──────────────────────────────────────────────────────────────
  const photoCell = (data.photoUrl)
    ? `<td style="width:72px;vertical-align:top;padding-left:16px;">
        <img src="${data.photoUrl}"
             width="60" height="60"
             alt=""
             style="border-radius:50%;width:60px;height:60px;object-fit:cover;display:block;" />
      </td>`
    : '';

  const nameBlock = data.fullName
    ? `<div style="font-family:${fontStack};font-size:16px;font-weight:bold;color:${baseColor};line-height:1.3;">${data.fullName}</div>`
    : '';

  const roleBlock = data.roleTitle
    ? `<div style="font-family:${fontStack};font-size:13px;color:${mutedColor};margin-top:2px;">${data.roleTitle}</div>`
    : '';

  const brandBlock = brandName
    ? `<div style="font-family:${fontStack};font-size:13px;color:${brandColor};margin-top:2px;font-weight:600;">${brandName}</div>`
    : '';

  const nameCell = `<td style="vertical-align:top;">
    ${nameBlock}${roleBlock}${brandBlock}
  </td>`;

  // ── SPACER ───────────────────────────────────────────────────────────────────
  const spacer = `<tr><td colspan="2" style="height:10px;line-height:10px;font-size:10px;">&nbsp;</td></tr>`;

  // ── CONTACT ROW ──────────────────────────────────────────────────────────────
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
    const websiteLabel = websiteUrl.replace(/^https?:\/\//, '');
    contactLines.push(
      `<div style="font-family:${fontStack};font-size:13px;"><a href="${websiteUrl}" style="color:${brandColor};text-decoration:none;">${websiteLabel}</a></div>`
    );
  }

  const contactRow = contactLines.length
    ? `<tr><td colspan="2">${contactLines.join('')}</td></tr>`
    : '';

  // ── BANNER / EVENT PROMO ─────────────────────────────────────────────────────
  let bannerRow = '';

  if (eventPromoEnabled && eventTitle) {
    const imgTag = eventImageUrl
      ? `<a href="${eventRegUrl || '#'}" style="display:block;"><img src="${eventImageUrl}" alt="${eventTitle}" width="600" style="display:block;max-width:600px;width:100%;border:0;" /></a>`
      : '';
    const titleBlock = `<div style="font-family:${fontStack};font-size:14px;font-weight:600;color:${baseColor};margin-top:8px;">${eventTitle}</div>`;
    const dateBlock = eventDate
      ? `<div style="font-family:${fontStack};font-size:12px;color:${mutedColor};margin-top:3px;">${eventDate}</div>`
      : '';
    const regBlock = eventRegUrl
      ? `<div style="margin-top:5px;"><a href="${eventRegUrl}" style="font-family:${fontStack};font-size:12px;color:${brandColor};text-decoration:none;">Schrijf je in &#8594;</a></div>`
      : '';
    bannerRow = `<tr>
      <td colspan="2" style="padding-top:12px;">
        ${imgTag}
        ${titleBlock}
        ${dateBlock}
        ${regBlock}
      </td>
    </tr>`;
  } else if (showBanner && bannerImageUrl) {
    const bannerImg = `<img src="${bannerImageUrl}" alt="" width="600" style="display:block;max-width:600px;width:100%;border:0;" />`;
    bannerRow = `<tr>
      <td colspan="2" style="padding-top:12px;">
        ${bannerLinkUrl
          ? `<a href="${bannerLinkUrl}" style="display:block;">${bannerImg}</a>`
          : bannerImg}
      </td>
    </tr>`;
  }

  // ── DISCLAIMER ────────────────────────────────────────────────────────────────
  let disclaimerRow = '';
  if (showDisclaimer && disclaimerText) {
    const resolvedDisclaimer = resolvePlaceholders(disclaimerText, data, warnings);
    disclaimerRow = `<tr>
      <td colspan="2" style="padding-top:10px;font-family:${fontStack};font-size:11px;color:${mutedColor};">
        ${resolvedDisclaimer}
      </td>
    </tr>`;
  }

  // ── ASSEMBLE ──────────────────────────────────────────────────────────────────
  const html = `<table cellpadding="0" cellspacing="0" border="0"
  style="max-width:600px;width:100%;border-collapse:collapse;font-family:${fontStack};">
  <tr>
    ${nameCell}
    ${photoCell}
  </tr>
  ${spacer}
  ${contactRow}
  ${bannerRow}
  ${disclaimerRow}
</table>`.replace(/\n\s*\n/g, '\n').trim();

  return { html, warnings };
}
