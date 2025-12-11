/**
 * Receive Forminator form submission
 * Logs all incoming data for debugging
 */
export async function receiveForminator({ request, env, data }) {
  const timestamp = new Date().toISOString();
  
  // Log alle headers
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  
  // Compact log format
  console.log(`📝 [${timestamp}] Forminator submission received`);
  console.log(`   Headers: ${JSON.stringify(headers)}`);
  console.log(`   Data: ${JSON.stringify(data, null, 2)}`);
  
  // Return success response
  return new Response(JSON.stringify({
    success: true,
    message: "Form submission received and logged",
    timestamp: timestamp,
    data_received: Object.keys(data)
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
