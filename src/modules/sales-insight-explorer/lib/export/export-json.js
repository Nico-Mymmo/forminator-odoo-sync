/**
 * JSON Exporter
 * 
 * Lossless JSON export of ExportResult.
 * Primary export format - preserves ALL data and metadata.
 * 
 * RULES:
 * - NO data loss
 * - NO filtering
 * - NO transformation
 * - NO interpretation
 * - Exact representation of ExportResult
 * 
 * Purpose: Suitable for direct consumption by external tools (ChatGPT, scripts, analysis tools).
 */

/**
 * JSON exporter implementation.
 * 
 * @type {Object}
 * @property {string} format - Format identifier
 * @property {string} mimeType - MIME type
 * @property {string} fileExtension - File extension
 * @property {Function} export - Export function
 */
const jsonExporter = {
  format: 'json',
  mimeType: 'application/json',
  fileExtension: '.json',

  /**
   * Export ExportResult to JSON.
   * 
   * @param {Object} exportResult - ExportResult from normalizer
   * @returns {string} - JSON string
   * @throws {Error} If exportResult invalid
   */
  export(exportResult) {
    if (!exportResult) {
      throw new Error('ExportResult is required');
    }

    if (!exportResult.meta) {
      throw new Error('ExportResult missing meta');
    }

    if (!exportResult.fields) {
      throw new Error('ExportResult missing fields');
    }

    if (!exportResult.rows) {
      throw new Error('ExportResult missing rows');
    }

    // Lossless JSON serialization
    // Use null, 2 for human-readable formatting (makes it usable for ChatGPT)
    return JSON.stringify(exportResult, null, 2);
  },
};

export default jsonExporter;
