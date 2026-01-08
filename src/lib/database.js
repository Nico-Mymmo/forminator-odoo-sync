/**
 * Database Layer - Supabase Client
 * 
 * Centralized database access for all form mapping operations.
 * Replaces the inconsistent KV storage with a reliable PostgreSQL backend.
 * 
 * @module lib/database
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Initialize Supabase client
 * Uses service role key for server-side operations (bypasses RLS)
 * 
 * @param {Object} env - Environment variables from Cloudflare Workers
 * @returns {Object} Supabase client instance
 */
export function getSupabaseClient(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  
  return createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false, // Workers zijn stateless
        autoRefreshToken: false
      }
    }
  );
}

/**
 * Form Mappings Repository
 * 
 * Provides CRUD operations for form_mappings table with:
 * - Optimistic locking via version field
 * - Automatic history tracking via triggers
 * - Soft delete support
 * - Transaction safety
 */
export class FormMappingsRepository {
  constructor(supabase) {
    this.supabase = supabase;
  }
  
  /**
   * Get all active form mappings
   * 
   * @returns {Promise<Object>} All active mappings keyed by form_id
   */
  async getAllMappings() {
    const { data, error } = await this.supabase
      .from('form_mappings')
      .select('*')
      .is('deleted_at', null)
      .order('name');
    
    if (error) {
      throw new Error(`Failed to fetch mappings: ${error.message}`);
    }
    
    // Transform to legacy format: { "formId": { ...mapping } }
    const mappings = {};
    for (const row of data || []) {
      mappings[row.form_id] = {
        name: row.name,
        field_mapping: row.field_mapping,
        value_mapping: row.value_mapping,
        workflow: row.workflow,
        html_card: row.html_card,
        _metadata: {
          id: row.id,
          version: row.version,
          created_at: row.created_at,
          updated_at: row.updated_at,
          created_by: row.created_by,
          updated_by: row.updated_by
        }
      };
    }
    
    return mappings;
  }
  
  /**
   * Get a single form mapping by form_id
   * 
   * @param {string} formId - The form identifier
   * @returns {Promise<Object|null>} Form mapping or null if not found
   */
  async getMapping(formId) {
    const { data, error } = await this.supabase
      .from('form_mappings')
      .select('*')
      .eq('form_id', formId)
      .is('deleted_at', null)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') { // Not found
        return null;
      }
      throw new Error(`Failed to fetch mapping ${formId}: ${error.message}`);
    }
    
    return {
      name: data.name,
      field_mapping: data.field_mapping,
      value_mapping: data.value_mapping,
      workflow: data.workflow,
      html_card: data.html_card,
      _metadata: {
        id: data.id,
        version: data.version,
        created_at: data.created_at,
        updated_at: data.updated_at,
        created_by: data.created_by,
        updated_by: data.updated_by
      }
    };
  }
  
  /**
   * Create a new form mapping
   * 
   * @param {string} formId - The form identifier
   * @param {Object} mapping - The mapping configuration
   * @param {string} [userId] - User who created the mapping
   * @returns {Promise<Object>} Created mapping with metadata
   */
  async createMapping(formId, mapping, userId = null) {
    const { data, error } = await this.supabase
      .from('form_mappings')
      .insert({
        form_id: formId,
        name: mapping.name || `Form ${formId}`,
        field_mapping: mapping.field_mapping || {},
        value_mapping: mapping.value_mapping || {},
        workflow: mapping.workflow || [],
        html_card: mapping.html_card || null,
        created_by: userId,
        updated_by: userId
      })
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') { // Unique violation
        throw new Error(`Form mapping ${formId} already exists`);
      }
      throw new Error(`Failed to create mapping ${formId}: ${error.message}`);
    }
    
    return {
      name: data.name,
      field_mapping: data.field_mapping,
      value_mapping: data.value_mapping,
      workflow: data.workflow,
      html_card: data.html_card,
      _metadata: {
        id: data.id,
        version: data.version,
        created_at: data.created_at,
        updated_at: data.updated_at,
        created_by: data.created_by,
        updated_by: data.updated_by
      }
    };
  }
  
  /**
   * Update an existing form mapping with optimistic locking
   * 
   * @param {string} formId - The form identifier
   * @param {Object} mapping - Updated mapping configuration
   * @param {number} [expectedVersion] - Expected version for optimistic locking
   * @param {string} [userId] - User who updated the mapping
   * @returns {Promise<Object>} Updated mapping with metadata
   * @throws {ConflictError} If version mismatch occurs
   */
  async updateMapping(formId, mapping, expectedVersion = null, userId = null) {
    // Start a transaction-like query
    const { data: existing, error: fetchError } = await this.supabase
      .from('form_mappings')
      .select('id, version')
      .eq('form_id', formId)
      .is('deleted_at', null)
      .single();
    
    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        throw new Error(`Form mapping ${formId} not found`);
      }
      throw new Error(`Failed to fetch mapping ${formId}: ${fetchError.message}`);
    }
    
    // Optimistic locking check
    if (expectedVersion !== null && existing.version !== expectedVersion) {
      const err = new Error(
        `Version conflict: expected ${expectedVersion}, but current version is ${existing.version}. ` +
        `The mapping was modified by another user.`
      );
      err.code = 'VERSION_CONFLICT';
      err.currentVersion = existing.version;
      throw err;
    }
    
    // Update with version check (trigger will auto-increment version)
    const updateData = {
      updated_by: userId
    };
    
    if (mapping.name !== undefined) updateData.name = mapping.name;
    if (mapping.field_mapping !== undefined) updateData.field_mapping = mapping.field_mapping;
    if (mapping.value_mapping !== undefined) updateData.value_mapping = mapping.value_mapping;
    if (mapping.workflow !== undefined) updateData.workflow = mapping.workflow;
    if (mapping.html_card !== undefined) updateData.html_card = mapping.html_card;
    
    const { data, error } = await this.supabase
      .from('form_mappings')
      .update(updateData)
      .eq('id', existing.id)
      .eq('version', existing.version) // Ensure version hasn't changed
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to update mapping ${formId}: ${error.message}`);
    }
    
    if (!data) {
      // Version changed between fetch and update
      const err = new Error(
        `Version conflict during update. The mapping was modified by another user.`
      );
      err.code = 'VERSION_CONFLICT';
      throw err;
    }
    
    return {
      name: data.name,
      field_mapping: data.field_mapping,
      value_mapping: data.value_mapping,
      workflow: data.workflow,
      html_card: data.html_card,
      _metadata: {
        id: data.id,
        version: data.version,
        created_at: data.created_at,
        updated_at: data.updated_at,
        created_by: data.created_by,
        updated_by: data.updated_by
      }
    };
  }
  
  /**
   * Soft delete a form mapping
   * 
   * @param {string} formId - The form identifier
   * @param {string} [userId] - User who deleted the mapping
   * @returns {Promise<boolean>} True if deleted successfully
   */
  async deleteMapping(formId, userId = null) {
    const { error } = await this.supabase
      .from('form_mappings')
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: userId
      })
      .eq('form_id', formId)
      .is('deleted_at', null);
    
    if (error) {
      throw new Error(`Failed to delete mapping ${formId}: ${error.message}`);
    }
    
    return true;
  }
  
  /**
   * Get history for a form mapping
   * 
   * @param {string} formId - The form identifier
   * @param {number} [limit=50] - Maximum number of history records to return
   * @returns {Promise<Array>} History records ordered by most recent first
   */
  async getHistory(formId, limit = 50) {
    const { data, error } = await this.supabase
      .from('form_mapping_history')
      .select('*')
      .eq('form_id', formId)
      .order('changed_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      throw new Error(`Failed to fetch history for ${formId}: ${error.message}`);
    }
    
    return data || [];
  }
  
  /**
   * Restore a form mapping to a previous version
   * 
   * @param {string} formId - The form identifier
   * @param {string} historyId - The history record ID to restore
   * @param {string} [userId] - User who performed the restore
   * @returns {Promise<Object>} Restored mapping
   */
  async restoreFromHistory(formId, historyId, userId = null) {
    // Get the history record
    const { data: historyRecord, error: historyError } = await this.supabase
      .from('form_mapping_history')
      .select('snapshot')
      .eq('id', historyId)
      .eq('form_id', formId)
      .single();
    
    if (historyError) {
      throw new Error(`Failed to fetch history record ${historyId}: ${historyError.message}`);
    }
    
    const snapshot = historyRecord.snapshot;
    
    // Update the current mapping with the snapshot data
    return await this.updateMapping(
      formId,
      {
        name: snapshot.name,
        field_mapping: snapshot.field_mapping,
        value_mapping: snapshot.value_mapping,
        workflow: snapshot.workflow,
        html_card: snapshot.html_card
      },
      null, // Skip version check for restore
      userId
    );
  }
}

/**
 * Form Submissions Log Repository
 * 
 * Tracks all form submissions for monitoring and debugging
 */
export class SubmissionsLogRepository {
  constructor(supabase) {
    this.supabase = supabase;
  }
  
  /**
   * Log a form submission
   * 
   * @param {string} formId - The form identifier
   * @param {Object} requestData - Original request data from Forminator
   * @param {Object} options - Additional logging options
   * @returns {Promise<string>} The submission log ID
   */
  async logSubmission(formId, requestData, options = {}) {
    const { data, error } = await this.supabase
      .from('form_submissions_log')
      .insert({
        form_id: formId,
        request_data: requestData,
        normalized_data: options.normalized_data || null,
        status: options.status || 'pending',
        response_data: options.response_data || null,
        error_message: options.error_message || null,
        error_stack: options.error_stack || null,
        workflow_steps: options.workflow_steps || null,
        odoo_records: options.odoo_records || null,
        processed_at: options.processed_at || null,
        duration_ms: options.duration_ms || null
      })
      .select('id')
      .single();
    
    if (error) {
      throw new Error(`Failed to log submission: ${error.message}`);
    }
    
    return data.id;
  }
  
  /**
   * Update a submission log after processing
   * 
   * @param {string} submissionId - The submission log ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<boolean>} True if updated successfully
   */
  async updateSubmission(submissionId, updates) {
    const { error } = await this.supabase
      .from('form_submissions_log')
      .update({
        ...updates,
        processed_at: updates.processed_at || new Date().toISOString()
      })
      .eq('id', submissionId);
    
    if (error) {
      throw new Error(`Failed to update submission log: ${error.message}`);
    }
    
    return true;
  }
  
  /**
   * Get recent submissions for a form
   * 
   * @param {string} formId - The form identifier
   * @param {number} [limit=100] - Maximum number of submissions to return
   * @returns {Promise<Array>} Submission records ordered by most recent first
   */
  async getRecentSubmissions(formId, limit = 100) {
    const { data, error } = await this.supabase
      .from('form_submissions_log')
      .select('*')
      .eq('form_id', formId)
      .order('submitted_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      throw new Error(`Failed to fetch submissions for ${formId}: ${error.message}`);
    }
    
    return data || [];
  }
  
  /**
   * Get all submissions (with pagination)
   * 
   * @param {Object} options - Query options
   * @param {number} [options.page=1] - Page number (1-indexed)
   * @param {number} [options.pageSize=50] - Items per page
   * @param {string} [options.status] - Filter by status
   * @returns {Promise<Object>} Paginated submissions with metadata
   */
  async getAllSubmissions({ page = 1, pageSize = 50, status = null } = {}) {
    let query = this.supabase
      .from('form_submissions_log')
      .select('*', { count: 'exact' })
      .order('submitted_at', { ascending: false });
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    
    const { data, error, count } = await query.range(from, to);
    
    if (error) {
      throw new Error(`Failed to fetch submissions: ${error.message}`);
    }
    
    return {
      data: data || [],
      pagination: {
        page,
        pageSize,
        total: count,
        totalPages: Math.ceil(count / pageSize)
      }
    };
  }
}

/**
 * Database Manager - Main entry point
 * 
 * Provides access to all repositories
 */
export class Database {
  constructor(env) {
    this.supabase = getSupabaseClient(env);
    this.formMappings = new FormMappingsRepository(this.supabase);
    this.submissions = new SubmissionsLogRepository(this.supabase);
  }
  
  /**
   * Health check - verifies database connectivity
   * 
   * @returns {Promise<boolean>} True if database is accessible
   */
  async healthCheck() {
    try {
      const { error } = await this.supabase
        .from('form_mappings')
        .select('id')
        .limit(1);
      
      return !error;
    } catch (err) {
      console.error('Database health check failed:', err);
      return false;
    }
  }
}
