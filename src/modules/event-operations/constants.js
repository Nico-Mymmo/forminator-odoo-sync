/**
 * Event Operations Constants
 * 
 * Centralized configuration - NO string literals in business logic
 */

// WordPress Meta Keys
export const WP_META_KEYS = {
  ODOO_WEBINAR_ID: 'odoo_webinar_id',
  SYNC_STATUS: 'sync_status',
  LAST_SYNC: 'last_sync_timestamp'
};

// URL Query Parameters
export const QUERY_PARAMS = {
  WEBINAR_ID: 'owid'  // Short form for odoo_webinar_id
};

// Sync Status Enum
export const SYNC_STATUS = {
  NOT_PUBLISHED: 'not_published',
  PUBLISHED: 'published',
  OUT_OF_SYNC: 'out_of_sync',
  ARCHIVED: 'archived',
  DELETED: 'deleted'
};

// Odoo Model
export const ODOO_MODEL = {
  WEBINAR: 'x_webinar',
  REGISTRATION: 'x_webinarregistrations'
};

// Odoo Fields
export const ODOO_FIELDS = {
  ID: 'id',
  NAME: 'x_name',
  DATE: 'x_studio_date',
  START_TIME: 'x_studio_starting_time',
  INFO: 'x_studio_webinar_info',
  STAGE: 'x_studio_stage_id',
  ACTIVE: 'x_active'
};

// WordPress Endpoints
export const WP_ENDPOINTS = {
  TRIBE_EVENTS: '/wp-json/tribe/events/v1/events',
  WP_EVENTS: '/wp-json/wp/v2/tribe_events'
};

// Worker Routes
export const ROUTES = {
  ROOT: '/',
  API_ODOO_WEBINARS: '/api/odoo-webinars',
  API_WP_EVENTS: '/api/wp-events',
  API_SNAPSHOTS: '/api/snapshots',
  API_PUBLISH: '/api/publish',
  API_SYNC: '/api/sync',
  API_DISCREPANCIES: '/api/discrepancies',
  API_ARCHIVE: '/api/archive'
};

// Timezone
export const TIMEZONE = 'Europe/Brussels';

// Default Duration (minutes)
export const DEFAULT_DURATION_MINUTES = 60;

// Logging Prefix
export const LOG_PREFIX = '[Event Operations]';

// Emoji Indicators
export const EMOJI = {
  EVENT: '🎫',
  SUCCESS: '✅',
  ERROR: '❌',
  PUBLISH: '📤',
  SYNC: '🔄',
  DISCREPANCY: '⚠️',
  ARCHIVE: '📦'
};
