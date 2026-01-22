/**
 * XLSX Exporter
 * 
 * Excel export of ExportResult with proper HTML handling.
 * 
 * RULES:
 * - One row per record
 * - HTML content preserved as-is (Excel will handle rendering)
 * - Proper escaping for special characters
 * - Metadata NOT included in file (provided separately)
 * 
 * Purpose: Suitable for Excel with rich text support.
 */

/**
 * XLSX exporter implementation.
 * 
 * @type {Object}
 * @property {string} format - Format identifier
 * @property {string} mimeType - MIME type
 * @property {string} fileExtension - File extension
 * @property {Function} export - Export function
 */
const xlsxExporter = {
  format: 'xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  fileExtension: '.xlsx',

  /**
   * Export ExportResult to XLSX.
   * 
   * Uses minimal XML generation - no external dependencies.
   * Creates a simple XLSX file structure.
   * 
   * @param {Object} exportResult - ExportResult from normalizer
   * @returns {Uint8Array} - XLSX binary data
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

    // Build sheet data
    const sheetData = [];
    
    // Header row
    const headers = exportResult.fields.map(field => field.label || field.key);
    sheetData.push(headers);
    
    // Data rows
    for (const row of exportResult.rows) {
      const values = exportResult.fields.map(field => {
        const value = row[field.key];
        return value !== null && value !== undefined ? value : '';
      });
      sheetData.push(values);
    }

    // Generate XLSX using minimal structure
    return generateXLSX(sheetData, 'Data');
  },
};

/**
 * Generate XLSX file from 2D array.
 * 
 * Creates minimal valid XLSX structure:
 * - [Content_Types].xml
 * - _rels/.rels
 * - xl/workbook.xml
 * - xl/_rels/workbook.xml.rels
 * - xl/worksheets/sheet1.xml
 * 
 * @param {Array<Array<any>>} data - 2D array of cell values
 * @param {string} sheetName - Sheet name
 * @returns {Uint8Array} - XLSX binary data
 */
function generateXLSX(data, sheetName) {
  // Convert data to worksheet XML
  const sheetXML = generateSheetXML(data);
  
  // Build XLSX file structure
  const files = {
    '[Content_Types].xml': contentTypesXML,
    '_rels/.rels': relsXML,
    'xl/workbook.xml': workbookXML(sheetName),
    'xl/_rels/workbook.xml.rels': workbookRelsXML,
    'xl/worksheets/sheet1.xml': sheetXML
  };
  
  // Create ZIP archive
  return createZIP(files);
}

/**
 * Generate worksheet XML from data array.
 * 
 * @param {Array<Array<any>>} data - 2D array
 * @returns {string} - Worksheet XML
 */
function generateSheetXML(data) {
  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  xml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\n';
  xml += '<sheetData>\n';
  
  for (let r = 0; r < data.length; r++) {
    xml += `<row r="${r + 1}">\n`;
    const row = data[r];
    
    for (let c = 0; c < row.length; c++) {
      const cellRef = columnToLetter(c) + (r + 1);
      const value = row[c];
      
      // Determine cell type and value
      if (typeof value === 'number' && !isNaN(value)) {
        // Numeric cell
        xml += `<c r="${cellRef}"><v>${value}</v></c>\n`;
      } else {
        // String cell (with inline string for HTML support)
        const escapedValue = escapeXML(String(value));
        xml += `<c r="${cellRef}" t="inlineStr"><is><t>${escapedValue}</t></is></c>\n`;
      }
    }
    
    xml += '</row>\n';
  }
  
  xml += '</sheetData>\n';
  xml += '</worksheet>';
  
  return xml;
}

/**
 * Convert column index to Excel letter (0 = A, 25 = Z, 26 = AA, etc.)
 * 
 * @param {number} col - Column index (0-based)
 * @returns {string} - Column letter
 */
function columnToLetter(col) {
  let letter = '';
  while (col >= 0) {
    letter = String.fromCharCode((col % 26) + 65) + letter;
    col = Math.floor(col / 26) - 1;
  }
  return letter;
}

/**
 * Escape XML special characters.
 * 
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
function escapeXML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Static XML templates
const contentTypesXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

const relsXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const workbookXML = (sheetName) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
<sheet name="${escapeXML(sheetName)}" sheetId="1" r:id="rId1"/>
</sheets>
</workbook>`;

const workbookRelsXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

/**
 * Create ZIP archive from file map.
 * 
 * Minimal ZIP implementation for XLSX generation.
 * 
 * @param {Object<string, string>} files - Map of filename to content
 * @returns {Uint8Array} - ZIP binary data
 */
function createZIP(files) {
  const encoder = new TextEncoder();
  const fileEntries = [];
  const centralDirectory = [];
  let offset = 0;
  
  // Process each file
  for (const [filename, content] of Object.entries(files)) {
    const fileData = encoder.encode(content);
    const crc32 = calculateCRC32(fileData);
    
    // Local file header
    const header = createLocalFileHeader(filename, fileData.length, crc32);
    fileEntries.push(header);
    fileEntries.push(fileData);
    
    // Central directory entry
    const cdEntry = createCentralDirectoryEntry(filename, fileData.length, crc32, offset);
    centralDirectory.push(cdEntry);
    
    offset += header.length + fileData.length;
  }
  
  // End of central directory
  const cdSize = centralDirectory.reduce((sum, entry) => sum + entry.length, 0);
  const eocd = createEndOfCentralDirectory(centralDirectory.length, cdSize, offset);
  
  // Combine all parts
  const totalSize = offset + cdSize + eocd.length;
  const result = new Uint8Array(totalSize);
  
  let pos = 0;
  for (const entry of fileEntries) {
    result.set(entry, pos);
    pos += entry.length;
  }
  for (const entry of centralDirectory) {
    result.set(entry, pos);
    pos += entry.length;
  }
  result.set(eocd, pos);
  
  return result;
}

/**
 * Create local file header for ZIP.
 */
function createLocalFileHeader(filename, size, crc32) {
  const encoder = new TextEncoder();
  const filenameBytes = encoder.encode(filename);
  const header = new Uint8Array(30 + filenameBytes.length);
  const view = new DataView(header.buffer);
  
  view.setUint32(0, 0x04034b50, true); // Signature
  view.setUint16(4, 20, true);         // Version needed
  view.setUint16(6, 0, true);          // Flags
  view.setUint16(8, 0, true);          // Compression (none)
  view.setUint16(10, 0, true);         // Mod time
  view.setUint16(12, 0, true);         // Mod date
  view.setUint32(14, crc32, true);     // CRC32
  view.setUint32(18, size, true);      // Compressed size
  view.setUint32(22, size, true);      // Uncompressed size
  view.setUint16(26, filenameBytes.length, true); // Filename length
  view.setUint16(28, 0, true);         // Extra field length
  
  header.set(filenameBytes, 30);
  
  return header;
}

/**
 * Create central directory entry for ZIP.
 */
function createCentralDirectoryEntry(filename, size, crc32, offset) {
  const encoder = new TextEncoder();
  const filenameBytes = encoder.encode(filename);
  const entry = new Uint8Array(46 + filenameBytes.length);
  const view = new DataView(entry.buffer);
  
  view.setUint32(0, 0x02014b50, true); // Signature
  view.setUint16(4, 20, true);         // Version made by
  view.setUint16(6, 20, true);         // Version needed
  view.setUint16(8, 0, true);          // Flags
  view.setUint16(10, 0, true);         // Compression
  view.setUint16(12, 0, true);         // Mod time
  view.setUint16(14, 0, true);         // Mod date
  view.setUint32(16, crc32, true);     // CRC32
  view.setUint32(20, size, true);      // Compressed size
  view.setUint32(24, size, true);      // Uncompressed size
  view.setUint16(28, filenameBytes.length, true); // Filename length
  view.setUint16(30, 0, true);         // Extra field length
  view.setUint16(32, 0, true);         // Comment length
  view.setUint16(34, 0, true);         // Disk number
  view.setUint16(36, 0, true);         // Internal attributes
  view.setUint32(38, 0, true);         // External attributes
  view.setUint32(42, offset, true);    // Local header offset
  
  entry.set(filenameBytes, 46);
  
  return entry;
}

/**
 * Create end of central directory record for ZIP.
 */
function createEndOfCentralDirectory(numEntries, cdSize, cdOffset) {
  const eocd = new Uint8Array(22);
  const view = new DataView(eocd.buffer);
  
  view.setUint32(0, 0x06054b50, true); // Signature
  view.setUint16(4, 0, true);          // Disk number
  view.setUint16(6, 0, true);          // CD start disk
  view.setUint16(8, numEntries, true); // CD entries on disk
  view.setUint16(10, numEntries, true);// Total CD entries
  view.setUint32(12, cdSize, true);    // CD size
  view.setUint32(16, cdOffset, true);  // CD offset
  view.setUint16(20, 0, true);         // Comment length
  
  return eocd;
}

/**
 * Calculate CRC32 checksum.
 */
function calculateCRC32(data) {
  let crc = 0xFFFFFFFF;
  
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
    }
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

export default xlsxExporter;
