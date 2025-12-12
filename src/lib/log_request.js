/**
 * Generic request logger
 * Logs all incoming request details in a compact format
 * 
 * @param {Request} request - The incoming request
 * @param {Object} data - Parsed JSON body data
 * @param {string} source - Source identifier (e.g., 'forminator', 'vmecheck')
 */
export function logIncomingRequest(request, data, source = 'unknown') {
  const timestamp = new Date().toISOString();
  const url = new URL(request.url);
  
  // Collect headers (excluding sensitive ones)
  const headers = {};
  request.headers.forEach((value, key) => {
    // Don't log authorization header value
    if (key.toLowerCase() === 'authorization') {
      headers[key] = '[REDACTED]';
    } else {
      headers[key] = value;
    }
  });
  
  // Log compact format
  console.log(`📨 [${timestamp}] Incoming request from: ${source}`);
  console.log(`   Method: ${request.method}`);
  console.log(`   Path: ${url.pathname}${url.search}`);
  console.log(`   IP: ${request.headers.get('CF-Connecting-IP') || 'unknown'}`);
  console.log(`   User-Agent: ${request.headers.get('User-Agent') || 'unknown'}`);
  console.log(`   Headers: ${JSON.stringify(headers)}`);
  console.log(`   Body keys: [${Object.keys(data).join(', ')}]`);
  console.log(`   Full data: ${JSON.stringify(data, null, 2)}`);
}
