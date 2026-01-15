import { Database } from '../lib/database.js';

/**
 * Get ALL submission history across all forms
 */
export async function handleHistoryGetAll({ request, env, user }) {
    // Check authentication
    if (!user) {
        return new Response(JSON.stringify({ 
            success: false, 
            error: 'Unauthorized' 
        }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    try {
        const db = new Database(env);
        const result = await db.submissions.getAllSubmissions({ pageSize: 200 });
        
        console.log('📚 [handleHistoryGetAll] Retrieved', result.data.length, 'submissions from Supabase');
        
        // Transform database format to match frontend expectations (old KV format)
        const transformed = result.data.map(entry => ({
            timestamp: entry.submitted_at,
            formId: entry.form_id,
            status: entry.status,
            requestData: entry.request_data,
            workflowResults: entry.response_data,
            error: entry.error_message,
            errorType: entry.error_stack ? 'Error' : undefined,
            workflowDetails: entry.workflow_steps,
            odooError: entry.odoo_records
        }));
        
        return new Response(JSON.stringify(transformed), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('History API error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// History API - Get request history for a form
export async function handleHistoryGet({ request, env, ctx, formId, user }) {
    // Check authentication
    if (!user) {
        return new Response(JSON.stringify({ 
            success: false, 
            error: 'Unauthorized' 
        }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    try {
        // Always use PRODUCTION KV for history (where real requests are logged)
        const kvNamespace = env.MAPPINGS_KV;
        
        // Get history from KV (stored as formId_history key)
        const historyKey = `${formId}_history`;
        const historyData = await kvNamespace.get(historyKey, { type: 'json' });
        
        if (!historyData || !Array.isArray(historyData)) {
            return new Response(JSON.stringify([]), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Sort by timestamp descending (newest first)
        historyData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Limit to last 100 entries to avoid huge responses
        const limited = historyData.slice(0, 100);
        
        return new Response(JSON.stringify(limited), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('History API error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

/**
 * Log a form submission to history in Supabase
 */
export async function logRequest(env, formId, data) {
    try {
        const db = new Database(env);
        
        await db.submissions.logSubmission(formId, data.requestData || {}, {
            status: data.status || 'unknown',
            response_data: data.workflowResults || null,
            error_message: data.error || null,
            error_stack: data.errorType || data.stackTrace || null,
            workflow_steps: data.workflowDetails || null,
            odoo_records: data.odooError || null
        });
        
        console.log('✅ [logRequest] Logged submission to Supabase:', formId, data.status);
    } catch (error) {
        console.error('❌ [logRequest] Failed to log submission:', error);
        // Don't throw - logging failure shouldn't break the main flow
    }
}
