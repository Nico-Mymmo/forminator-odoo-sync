/**
 * Export Registry
 * 
 * Strategy pattern for export format registration.
 * Allows adding new export formats without modifying existing code.
 * 
 * RULES:
 * - NO switch statements on format
 * - NO hardcoded format logic
 * - Extensible via registration
 * - Each exporter is isolated
 */

/**
 * @typedef {Object} ExporterInterface
 * @property {string} format - Format identifier (e.g., 'json', 'csv')
 * @property {string} mimeType - MIME type for HTTP response
 * @property {string} fileExtension - File extension (e.g., '.json', '.csv')
 * @property {Function} export - Export function: (exportResult: ExportResult) => string | Buffer
 */

class ExportRegistry {
  constructor() {
    /** @type {Map<string, ExporterInterface>} */
    this.exporters = new Map();
  }

  /**
   * Register an exporter.
   * 
   * @param {string} format - Format identifier (lowercase, e.g., 'json', 'csv')
   * @param {ExporterInterface} exporter - Exporter implementation
   * @throws {Error} If exporter invalid or format already registered
   */
  register(format, exporter) {
    if (!format || typeof format !== 'string') {
      throw new Error('Format must be a non-empty string');
    }

    const normalizedFormat = format.toLowerCase();

    if (this.exporters.has(normalizedFormat)) {
      throw new Error(`Exporter for format '${normalizedFormat}' already registered`);
    }

    // Validate exporter interface
    this.validateExporter(exporter, normalizedFormat);

    this.exporters.set(normalizedFormat, exporter);
  }

  /**
   * Get exporter for format.
   * 
   * @param {string} format - Format identifier
   * @returns {ExporterInterface}
   * @throws {Error} If format not registered
   */
  get(format) {
    if (!format || typeof format !== 'string') {
      throw new Error('Format must be a non-empty string');
    }

    const normalizedFormat = format.toLowerCase();

    if (!this.exporters.has(normalizedFormat)) {
      throw new Error(`No exporter registered for format '${normalizedFormat}'`);
    }

    return this.exporters.get(normalizedFormat);
  }

  /**
   * Check if format is supported.
   * 
   * @param {string} format - Format identifier
   * @returns {boolean}
   */
  supports(format) {
    if (!format || typeof format !== 'string') {
      return false;
    }

    return this.exporters.has(format.toLowerCase());
  }

  /**
   * List all supported formats.
   * 
   * @returns {string[]} - Array of format identifiers
   */
  listFormats() {
    return Array.from(this.exporters.keys());
  }

  /**
   * Export using registered exporter.
   * 
   * @param {string} format - Format identifier
   * @param {Object} exportResult - ExportResult from normalizer
   * @returns {string | Buffer} - Exported content
   * @throws {Error} If format not supported or export fails
   */
  export(format, exportResult) {
    const exporter = this.get(format);

    try {
      return exporter.export(exportResult);
    } catch (error) {
      throw new Error(`Export to ${format} failed: ${error.message}`);
    }
  }

  /**
   * Get MIME type for format.
   * 
   * @param {string} format - Format identifier
   * @returns {string} - MIME type
   * @throws {Error} If format not supported
   */
  getMimeType(format) {
    const exporter = this.get(format);
    return exporter.mimeType;
  }

  /**
   * Get file extension for format.
   * 
   * @param {string} format - Format identifier
   * @returns {string} - File extension (with leading dot)
   * @throws {Error} If format not supported
   */
  getFileExtension(format) {
    const exporter = this.get(format);
    return exporter.fileExtension;
  }

  /**
   * Validate exporter implements required interface.
   * 
   * @param {Object} exporter - Exporter to validate
   * @param {string} format - Format identifier (for error messages)
   * @throws {Error} If exporter invalid
   * @private
   */
  validateExporter(exporter, format) {
    if (!exporter || typeof exporter !== 'object') {
      throw new Error(`Exporter for '${format}' must be an object`);
    }

    if (!exporter.format || typeof exporter.format !== 'string') {
      throw new Error(`Exporter for '${format}' missing 'format' property (string)`);
    }

    if (!exporter.mimeType || typeof exporter.mimeType !== 'string') {
      throw new Error(`Exporter for '${format}' missing 'mimeType' property (string)`);
    }

    if (!exporter.fileExtension || typeof exporter.fileExtension !== 'string') {
      throw new Error(`Exporter for '${format}' missing 'fileExtension' property (string)`);
    }

    if (!exporter.export || typeof exporter.export !== 'function') {
      throw new Error(`Exporter for '${format}' missing 'export' method (function)`);
    }

    // Verify format property matches registration
    if (exporter.format.toLowerCase() !== format.toLowerCase()) {
      throw new Error(
        `Exporter format property '${exporter.format}' does not match registration format '${format}'`
      );
    }
  }

  /**
   * Clear all registered exporters.
   * Useful for testing.
   */
  clear() {
    this.exporters.clear();
  }
}

// Singleton instance
const exportRegistry = new ExportRegistry();

export default exportRegistry;
