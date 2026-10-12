/**
 * Een User-Agent leesbaar maken ("Chrome op Windows"), voor de lijsten met
 * sessies en aanmeldingen. Bewust grof: het doel is een sessie herkennen,
 * niet een toestel identificeren.
 *
 * @module lib/auth/user-agent
 */

/**
 * @param {string|null|undefined} ua
 * @returns {string}
 */
export function describeUserAgent(ua) {
  const s = String(ua || '');
  if (!s) return 'Onbekend apparaat';

  let browser = 'Browser';
  if (/Edg(A|iOS)?\//.test(s)) browser = 'Edge';
  else if (/OPR\//.test(s)) browser = 'Opera';
  else if (/Firefox\/|FxiOS\//.test(s)) browser = 'Firefox';
  else if (/Chrome\/|CriOS\//.test(s)) browser = 'Chrome';
  else if (/Safari\//.test(s)) browser = 'Safari';
  else if (/curl|python|node|axios|PostmanRuntime/i.test(s)) browser = 'Script';

  let os = '';
  if (/iPad/.test(s)) os = 'iPad';
  else if (/iPhone|iPod/.test(s)) os = 'iPhone';
  else if (/Android/.test(s)) os = 'Android';
  else if (/Windows/.test(s)) os = 'Windows';
  else if (/Mac OS X|Macintosh/.test(s)) os = 'macOS';
  else if (/CrOS/.test(s)) os = 'ChromeOS';
  else if (/Linux/.test(s)) os = 'Linux';

  return os ? `${browser} op ${os}` : browser;
}
