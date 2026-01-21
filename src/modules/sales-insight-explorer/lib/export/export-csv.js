/**
 * CSV Exporter
 * 
 * Flat CSV export of ExportResult.
 * Secondary format - human-readable, spreadsheet-compatible.
 * 
 * RULES:
 * - One row per record
 * - Normalized keys as headers
 * - NO nested structures (already flattened in ExportResult)
 * - Proper CSV escaping (quotes, newlines, commas)
 * - Metadata NOT included in CSV (provided separately)
 * 
 * Purpose: Suitable for Excel, Google Sheets, data analysis tools.
 */

/**
 * CSV exporter implementation.
 * 
 * @type {Object}
 * @property {string} format - Format identifier
 * @property {string} mimeType - MIME type
 * @property {string} fileExtension - File extension
 * @property {Function} export - Export function
 */
const csvExporter = {
  format: 'csv',
  mimeType: 'text/csv',
  fileExtension: '.csv',

  /**
   * Export ExportResult to CSV.
   * 
   * @param {Object} exportResult - ExportResult from normalizer
   * @returns {string} - CSV string
   * @throws {Error} If exportResult invalid
   */
  export(exportResult) {
    if (!exportResult) {
      throw new Error('ExportResult is required');
    }

    if (!exportResult.fields || exportResult.fields.length === 0) {
      throw new Error('ExportResult must have at least one field');
    }

    if (!exportResult.rows) {
      throw new Error('ExportResult missing rows');
    }

    const lines = [];

    // Build header row (use field keys)
    const headers = exportResult.fields.map(field => field.key);
    lines.push(formatCSVRow(headers));

    // Build data rows
    for (const row of exportResult.rows) {
      const values = exportResult.fields.map(field => {
        const value = row[field.key];
        return value !== null && value !== undefined ? value : '';
      });
      lines.push(formatCSVRow(values));
    }

    return lines.join('\n');
  },
};

/**
 * Format a CSV row with proper escaping.
 * 
 * @param {Array<any>} values - Row values
 * @returns {string} - CSV row
 */
function formatCSVRow(values) {
  return values.map(value => formatCSVValue(value)).join(',');
}

/**
 * Format a single CSV value with proper escaping.
 * 
 * Rules:
 * - Wrap in quotes if contains: comma, quote, newline, or carriage return
 * - Escape quotes by doubling them
 * - Convert null/undefined to empty string
 * - Convert objects/arrays to JSON
 * 
 * @param {any} value - Value to format
 * @returns {string} - Formatted value
 */
function formatCSVValue(value) {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return '';
  }

  // Handle objects/arrays (serialize to JSON)
  if (typeof value === 'object') {
    value = JSON.stringify(value);
  }

  // Convert to string
  let str = String(value);

  // Check if needs quoting
  const needsQuotes = /[",\n\r]/.test(str);

  if (needsQuotes) {
    // Escape quotes by doubling them
    str = str.replace(/"/g, '""');
    return `"${str}"`;
  }

  return str;
}

export default csvExporter;
