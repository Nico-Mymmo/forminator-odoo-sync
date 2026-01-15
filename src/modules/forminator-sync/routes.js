/**
 * Forminator Sync Module - Route Handlers
 */

import { getMappings, getMapping, saveMapping, deleteMapping, importMappings, getMappingHistory, restoreMappingFromHistory } from '../../actions/mappings_api.js';
import { handleHistoryGet, handleHistoryGetAll } from '../../actions/history_api.js';
import { testConnection } from '../../actions/test_connection.js';
import { receiveForminator } from '../../actions/receive_forminator.js';

/**
 * Helper to add CORS headers
 */
function addCorsHeaders(response) {
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Access-Control-Allow-Origin', '*');
  newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

// ===== Mappings API =====

export async function handleGetMappings(context) {
  console.log('🔍 [handleGetMappings] context.user:', context.user);
  const response = await getMappings(context);
  return addCorsHeaders(response);
}

export async function handleGetMapping(context) {
  const url = new URL(context.request.url);
  const id = url.pathname.split('/').pop();
  const response = await getMapping({ ...context, params: { id } });
  return addCorsHeaders(response);
}

export async function handleSaveMapping(context) {
  const response = await saveMapping(context);
  return addCorsHeaders(response);
}

export async function handleDeleteMapping(context) {
  const url = new URL(context.request.url);
  const id = url.pathname.split('/').pop();
  const response = await deleteMapping({ ...context, params: { id } });
  return addCorsHeaders(response);
}

export async function handleImportMappings(context) {
  const response = await importMappings(context);
  return addCorsHeaders(response);
}

// ===== History API =====

export async function handleGetAllHistory(context) {
  const response = await handleHistoryGetAll(context);
  return addCorsHeaders(response);
}

export async function handleGetHistory(context) {
  const url = new URL(context.request.url);
  const id = url.pathname.split('/').pop();
  const response = await handleHistoryGet({ ...context, params: { id } });
  return addCorsHeaders(response);
}

export async function handleRestoreHistory(context) {
  const url = new URL(context.request.url);
  const id = url.pathname.split('/').filter(p => p).pop();
  const response = await restoreMappingFromHistory({ ...context, params: { historyId: id } });
  return addCorsHeaders(response);
}

// ===== Actions =====

export async function handleTestConnection(context) {
  const response = await testConnection(context);
  return addCorsHeaders(response);
}

export async function handleReceiveForminator(context) {
  const response = await receiveForminator(context);
  return addCorsHeaders(response);
}
