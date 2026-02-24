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
  TAGS: 'x_webinar_tag',
  EVENT_TYPE: 'x_webinar_event_type',
  LEAD: 'crm.lead',
  LEAD_STAGE: 'crm.stage',
  PARTNER: 'res.partner'
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
  EVENT_TYPE_ID: 'x_webinar_event_type_id',
  TAG_IDS: 'x_studio_tag_ids',
  // Recap fields
  VIDEO_URL: 'x_studio_vimeo_url',
  THUMBNAIL_URL: 'x_studio_vimeo_thumbnail_url',
  FOLLOWUP_HTML: 'x_studio_followup_html',
  RECAP_MAIL_SENT: 'x_studio_recap_mail_sent',
  // Registration fields
  LINKED_WEBINAR: 'x_studio_linked_webinar',
  REGISTERED_BY: 'x_studio_registered_by',
  QUESTIONS: 'x_studio_webinar_questions',
  ATTENDED: 'x_studio_webinar_attended',
  ATTENDANCE_UPDATED_AT: 'x_studio_attendance_updated_at',
  ATTENDANCE_UPDATED_BY: 'x_studio_attendance_updated_by',
  ATTENDANCE_UPDATE_ORIGIN: 'x_studio_attendance_update_origin'
};

// WordPress Endpoints
export const WP_ENDPOINTS = {
  TRIBE_EVENTS: '/wp-json/tribe/events/v1/events',
  WP_EVENTS: '/wp-json/wp/v2/tribe_events',
  WP_EVENT_CATEGORIES: '/wp-json/wp/v2/tribe_events_cat',
  WP_TAGS: '/wp-json/wp/v2/tags'
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
  API_EVENT_TYPE_TAG_MAPPINGS: '/api/event-type-tag-mappings',
  API_ODOO_EVENT_TYPES: '/api/odoo-event-types',
  API_WP_EVENT_CATEGORIES: '/api/wp-event-categories',
  // Recap routes
  API_WEBINAR_RECAP: '/api/webinar/:id/recap',
  API_WEBINAR_VIDEO_URL: '/api/webinar/:id/video-url',
  API_WEBINAR_THUMBNAIL: '/api/webinar/:id/thumbnail',
  API_WEBINAR_RECAP_HTML: '/api/webinar/:id/recap-html',
  API_WEBINAR_SEND_RECAP: '/api/webinar/:id/send-recap'
};

/**
 * Base URL for public asset serving.
 * Override via env.BASE_ASSET_URL in wrangler.jsonc for custom domains.
 */
export const BASE_ASSET_URL = 'https://forminator-sync.openvme-odoo.workers.dev';

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
