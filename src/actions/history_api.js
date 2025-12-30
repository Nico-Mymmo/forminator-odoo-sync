// History API - Get ALL request history across all forms
export async function handleHistoryGetAll({ request, env, ctx }) {
    try {
        // Always use PRODUCTION KV for history (where real requests are logged)
        const kvNamespace = env.MAPPINGS_KV_PROD || env.MAPPINGS_KV;
        console.log('📚 [handleHistoryGetAll] Using KV namespace:', kvNamespace ? 'exists' : 'MISSING');
        console.log('📚 [handleHistoryGetAll] MAPPINGS_KV_PROD:', env.MAPPINGS_KV_PROD ? 'exists' : 'MISSING');
        console.log('📚 [handleHistoryGetAll] MAPPINGS_KV:', env.MAPPINGS_KV ? 'exists' : 'MISSING');
        
        // List all keys in KV that end with _history
        const listResult = await kvNamespace.list({ prefix: '' });
        console.log('📚 [handleHistoryGetAll] Found', listResult.keys.length, 'total keys in KV');
        const allHistory = [];
        
        // Collect history from all forms
        for (const key of listResult.keys) {
            if (key.name.endsWith('_history')) {
                console.log('📚 [handleHistoryGetAll] Found history key:', key.name);
                const formId = key.name.replace('_history', '');
                const historyData = await kvNamespace.get(key.name, { type: 'json' });
                
                if (historyData && Array.isArray(historyData)) {
                    console.log('📚 [handleHistoryGetAll] Form', formId, 'has', historyData.length, 'entries');
                    // Add formId to each entry
                    historyData.forEach(entry => {
                        allHistory.push({
                            ...entry,
                            formId
                        });
                    });
                }
            }
        }
        
        console.log('📚 [handleHistoryGetAll] Total history entries:', allHistory.length);
        
        // Sort by timestamp descending (newest first)
        allHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Limit to last 200 entries to avoid huge responses
        const limited = allHistory.slice(0, 200);
        
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

// History API - Get request history for a form
export async function handleHistoryGet({ request, env, ctx, formId }) {
    try {
        // Always use PRODUCTION KV for history (where real requests are logged)
        const kvNamespace = env.MAPPINGS_KV_PROD || env.MAPPINGS_KV;
        
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

// Log a request to history
export async function logRequest(env, formId, data) {
    try {
        // ALWAYS write to PRODUCTION KV for history (same as reading)
        const kvNamespace = env.MAPPINGS_KV_PROD || env.MAPPINGS_KV;
        const historyKey = `${formId}_history`;
        console.log('🔑 [logRequest] Attempting to save history with key:', historyKey);
        console.log('🔑 [logRequest] Using KV namespace:', kvNamespace ? 'PROD' : 'FALLBACK');
        
        // Get existing history
        let history = await kvNamespace.get(historyKey, { type: 'json' }) || [];
        console.log('📖 [logRequest] Existing history entries:', history.length);
        
        // Add new entry
        const entry = {
            timestamp: new Date().toISOString(),
            ...data
        };
        
        history.unshift(entry); // Add to beginning
        
        // Keep only last 1000 entries to prevent unlimited growth
        if (history.length > 1000) {
            history = history.slice(0, 1000);
        }
        
        console.log('💾 [logRequest] Attempting KV PUT with', history.length, 'entries');
        
        // Save back to KV
        await kvNamespace.put(historyKey, JSON.stringify(history));
        
        console.log('✅ [logRequest] Successfully saved to KV:', formId, entry.status);
        
        // Verify write
        const verification = await kvNamespace.get(historyKey);
        console.log('🔍 [logRequest] Verification read:', verification ? `${verification.length} bytes` : 'NULL');
    } catch (error) {
        console.error('❌ [logRequest] Failed to log request to history:', error);
        console.error('❌ [logRequest] Error stack:', error.stack);
        // Don't throw - logging failure shouldn't break the main flow
    }
}
