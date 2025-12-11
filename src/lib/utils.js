// Utility functions

export function stripHtml(html) {
  if (!html || typeof html !== "string") return html;
  return html.replace(/<[^>]*>?/gm, "").replace(/\s+/g, " ").trim();
}

export function m2oId(val) {
  if (!val) return null;
  if (Array.isArray(val)) return val[0] ?? null;
  if (typeof val === "number") return val;
  return null;
}

/**
 * Convert UTC Date to local timezone (Belgium/Netherlands = UTC+1/UTC+2)
 * Returns formatted string: "YYYY-MM-DD HH:MM:SS"
 */
export function toLocalTimestamp(date = new Date()) {
  // Belgium/Netherlands timezone (Europe/Brussels)
  const localDate = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Brussels' }));
  
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  const hours = String(localDate.getHours()).padStart(2, '0');
  const minutes = String(localDate.getMinutes()).padStart(2, '0');
  const seconds = String(localDate.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Convert UTC timestamp string to local timezone
 * @param {string} utcTimestamp - UTC timestamp in format "YYYY-MM-DD HH:MM:SS"
 * @returns {string} Local timestamp in same format
 */
export function utcToLocalTimestamp(utcTimestamp) {
  if (!utcTimestamp) return utcTimestamp;
  
  // Parse UTC timestamp as UTC
  const utcDate = new Date(utcTimestamp + ' UTC');
  
  // Convert to local timezone
  return toLocalTimestamp(utcDate);
}

/**
 * Convert local timestamp string to UTC timezone
 * @param {string} localTimestamp - Local timestamp in format "YYYY-MM-DD HH:MM:SS" (Europe/Brussels)
 * @returns {string} UTC timestamp in same format
 */
export function localToUtcTimestamp(localTimestamp) {
  if (!localTimestamp) return localTimestamp;
  
  // Parse timestamp components
  const [datePart, timePart] = localTimestamp.split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds] = timePart.split(':').map(Number);
  
  // Create date string for Belgium timezone (ISO format with timezone offset)
  // Belgium is UTC+1 in winter, UTC+2 in summer (DST)
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  // Create a Date object interpreting this as Europe/Brussels time
  // Then get its UTC representation
  const tempDate = new Date(dateStr);
  const belgiumDate = new Date(tempDate.toLocaleString('en-US', { timeZone: 'Europe/Brussels' }));
  
  // The actual date in Belgium time
  const actualLocal = new Date(year, month - 1, day, hours, minutes, seconds);
  
  // Calculate the offset (how many hours Belgium is ahead of UTC)
  const now = new Date();
  const winterOffset = 1; // UTC+1
  const summerOffset = 2; // UTC+2
  
  // Simple DST check: last Sunday of March to last Sunday of October
  const isDST = (month > 3 && month < 10) || 
                (month === 3 && day >= 25) || 
                (month === 10 && day < 25);
  
  const offsetHours = isDST ? summerOffset : winterOffset;
  
  // Subtract offset to get UTC
  const utcDate = new Date(actualLocal.getTime() - (offsetHours * 3600000));
  
  const y = utcDate.getFullYear();
  const m = String(utcDate.getMonth() + 1).padStart(2, '0');
  const d = String(utcDate.getDate()).padStart(2, '0');
  const h = String(utcDate.getHours()).padStart(2, '0');
  const min = String(utcDate.getMinutes()).padStart(2, '0');
  const sec = String(utcDate.getSeconds()).padStart(2, '0');
  
  return `${y}-${m}-${d} ${h}:${min}:${sec}`;
}
