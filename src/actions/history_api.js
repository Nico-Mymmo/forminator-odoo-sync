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
        const transformed = result.data.map(entry => {
            const workflowResults = entry.metadata?.workflow_results;
            const odooError = entry.metadata?.odoo_error;
            
            // Convert workflowResults object to array format if needed
            let formattedWorkflowResults = null;
            if (workflowResults && typeof workflowResults === 'object') {
                if (Array.isArray(workflowResults)) {
                    formattedWorkflowResults = workflowResults;
                } else {
                    // Convert object {stepName: {...}} to array format
                    formattedWorkflowResults = Object.entries(workflowResults).map(([stepName, stepData]) => ({
                        step: stepName,
                        ...stepData
                    }));
                }
            }
            
            return {
                timestamp: entry.submitted_at,
                formId: entry.form_id,
                status: entry.status,
                requestData: entry.submission_data,
                normalized: entry.processed_data,
                workflowResults: formattedWorkflowResults,
                error: entry.error_message,
                errorType: entry.metadata?.error_type,
                stackTrace: entry.metadata?.stack_trace,
                workflowDetails: entry.metadata?.workflow_details,
                odooError: odooError,
                invalidField: odooError?.invalidField,
                hint: odooError?.hint,
                recordId: entry.odoo_record_id,
                model: entry.odoo_model,
                duration: entry.processing_time_ms,
                // Extract additional useful info from workflowResults for display
                odooResponse: formattedWorkflowResults ? {
                    steps: formattedWorkflowResults.map(step => ({
                        step: step.step,
                        model: step.model,
                        status: step.isNew ? 'created' : (step.isUpdated ? 'updated' : 'existing'),
                        recordId: step.id || step.recordId
                    }))
                } : null
            };
        });
        
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
        
        // Extract odoo error with additional fields
        const odooError = data.odooError ? {
            ...data.odooError,
            invalidField: data.invalidField,
            hint: data.hint
        } : null;
        
        await db.submissions.logSubmission(formId, data.requestData || {}, {
            normalized_data: data.normalized || data.normalizedData || null,
            status: data.status || 'pending',
            error_message: data.error || null,
            odoo_record_id: data.recordId || null,
            odoo_model: data.model || null,
            processed_at: data.status === 'success' ? new Date().toISOString() : null,
            duration_ms: data.duration || null,
            metadata: {
                workflow_results: data.workflowResults || null,
                error_type: data.errorType || null,
                stack_trace: data.stackTrace || null,
                workflow_details: data.workflowDetails || null,
                odoo_error: odooError
            }
        });
        
        console.log('✅ [logRequest] Logged submission to Supabase:', formId, data.status);
    } catch (error) {
        console.error('❌ [logRequest] Failed to log submission:', error);
        // Don't throw - logging failure shouldn't break the main flow
    }
}
