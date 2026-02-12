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
  DRAFT: 'draft',
  PUBLISHED: 'published',
  OUT_OF_SYNC: 'out_of_sync',
  ARCHIVED: 'archived',
  DELETED: 'deleted'
};

// Odoo Model
export const ODOO_MODEL = {
  WEBINAR: 'x_webinar',
  REGISTRATION: 'x_webinarregistrations',
  TAGS: 'x_webinar_tag'
};

// Odoo Fields
export const ODOO_FIELDS = {
  ID: 'id',
  NAME: 'x_name',
  EVENT_DATETIME: 'x_studio_event_datetime',
  DURATION_MINUTES: 'x_studio_event_duration_minutes',
  INFO: 'x_studio_webinar_info',
  STAGE: 'x_studio_stage_id',
  ACTIVE: 'x_active',
  TAG_IDS: 'x_studio_tag_ids',
  // Registration fields
  LINKED_WEBINAR: 'x_studio_linked_webinar'
};

// WordPress Endpoints
export const WP_ENDPOINTS = {
  TRIBE_EVENTS: '/wp-json/tribe/events/v1/events',
  WP_EVENTS: '/wp-json/wp/v2/tribe_events',
  WP_EVENT_CATEGORIES: '/wp-json/wp/v2/tribe_events_cat'
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
  API_ARCHIVE: '/api/archive',
  API_TAG_MAPPINGS: '/api/tag-mappings',
  API_ODOO_TAGS: '/api/odoo-tags',
  API_WP_EVENT_CATEGORIES: '/api/wp-event-categories'
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
