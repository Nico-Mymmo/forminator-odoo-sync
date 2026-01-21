/**
 * Test Odoo Connection
 * Quick test to verify Odoo API credentials work
 */

import 'dotenv/config';

const DB_NAME = process.env.DB_NAME;
const UID = parseInt(process.env.UID);
const API_KEY = process.env.API_KEY;

console.log('Testing Odoo connection...');
console.log('DB:', DB_NAME);
console.log('UID:', UID);
console.log('API_KEY:', API_KEY ? `${API_KEY.substring(0, 10)}...` : 'NOT SET');

async function testOdooConnection() {
  try {
    // Test 1: Check version
    const versionUrl = `https://${DB_NAME}.odoo.com/web/webclient/version_info`;
    console.log('\n1. Testing version endpoint...');
    const versionResp = await fetch(versionUrl);
    const versionData = await versionResp.json();
    console.log('✓ Version:', versionData.result?.server_version || 'unknown');
    
    // Test 2: Authenticate and call simple method
    console.log('\n2. Testing authentication...');
    const rpcUrl = `https://${DB_NAME}.odoo.com/jsonrpc`;
    
    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          DB_NAME,
          UID,
          API_KEY,
          'res.partner',
          'search',
          [[]],
          { limit: 1 }
        ]
      },
      id: Date.now()
    };
    
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    
    if (data.error) {
      console.error('✗ Authentication failed:', data.error.data.message);
      return false;
    }
    
    console.log('✓ Authentication successful!');
    console.log('✓ Found', data.result?.length || 0, 'partner records');
    
    // Test 3: Try fields_get on crm.lead
    console.log('\n3. Testing fields_get on crm.lead...');
    const fieldsPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [
          DB_NAME,
          UID,
          API_KEY,
          'crm.lead',
          'fields_get',
          [],
          { attributes: ['string', 'type', 'help', 'required', 'readonly'] }
        ]
      },
      id: Date.now()
    };
    
    const fieldsResp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fieldsPayload)
    });
    
    const fieldsData = await fieldsResp.json();
    
    if (fieldsData.error) {
      console.error('✗ fields_get failed:', fieldsData.error.data.message);
      return false;
    }
    
    const fieldCount = Object.keys(fieldsData.result || {}).length;
    console.log('✓ Retrieved', fieldCount, 'fields from crm.lead');
    
    if (fieldCount > 0) {
      const sampleFields = Object.keys(fieldsData.result).slice(0, 5);
      console.log('  Sample fields:', sampleFields.join(', '));
    }
    
    console.log('\n✅ All tests passed! Odoo connection is working.');
    return true;
    
  } catch (error) {
    console.error('\n❌ Connection test failed:', error.message);
    return false;
  }
}

testOdooConnection();
