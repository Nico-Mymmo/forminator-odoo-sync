/**
 * STATE STORE - Event Operations Frontend
 * 
 * Single source of truth for all frontend state.
 * All controllers must read/write through this store.
 * 
 * Part of: ADDENDUM D - Calendar Workspace & Editorial Layer
 * Frontend Refactor Architecture
 */

export const appState = {
  // Core data
  webinars: [],
  snapshots: {},
  mappings: [],
  registrations: {},
  
  // UI state
  currentEventId: null,
  currentView: 'calendar', // 'calendar' | 'table'
  currentFilter: 'all',    // 'all' | 'upcoming' | 'past' | status
  
  // Editorial layer
  editorialOverrides: {},  // { webinarId: { description: '...', updated_at: '...' } }
  
  // Calendar instance reference (managed by calendar controller)
  calendarInstance: null,
  
  // Listeners for state changes
  listeners: {
    currentEventId: [],
    webinars: [],
    editorialOverrides: []
  }
};

/**
 * Subscribe to state changes
 */
export function subscribe(key, callback) {
  if (appState.listeners[key]) {
    appState.listeners[key].push(callback);
  }
}

/**
 * Notify listeners of state change
 */
function notify(key) {
  if (appState.listeners[key]) {
    appState.listeners[key].forEach(cb => cb(appState[key]));
  }
}

/**
 * Update current event (triggers detail panel update)
 */
export function setCurrentEvent(webinarId) {
  appState.currentEventId = webinarId;
  notify('currentEventId');
}

/**
 * Update webinars (triggers calendar refresh)
 */
export function setWebinars(webinars) {
  appState.webinars = webinars;
  notify('webinars');
}

/**
 * Update snapshots
 */
export function setSnapshots(snapshots) {
  appState.snapshots = snapshots;
}

/**
 * Update mappings
 */
export function setMappings(mappings) {
  appState.mappings = mappings;
}

/**
 * Update registrations
 */
export function setRegistrations(registrations) {
  appState.registrations = registrations;
}

/**
 * Get webinar by ID
 */
export function getWebinar(webinarId) {
  return appState.webinars.find(w => w.id === webinarId);
}

/**
 * Get snapshot for webinar
 */
export function getSnapshot(webinarId) {
  return appState.snapshots[webinarId];
}

/**
 * Get registration count for webinar
 */
export function getRegistrationCount(webinarId) {
  return appState.registrations[webinarId] || 0;
}

/**
 * Check if event type has mapping
 */
export function hasEventTypeMapping(eventTypeId) {
  if (!eventTypeId || !appState.mappings) return false;
  return appState.mappings.some(m => m.odoo_event_type_id === eventTypeId);
}

/**
 * Get editorial override for webinar
 */
export function getEditorialOverride(webinarId) {
  return appState.editorialOverrides[webinarId];
}

/**
 * Set editorial override (triggers detail panel update)
 */
export function setEditorialOverride(webinarId, description) {
  appState.editorialOverrides[webinarId] = {
    description,
    updated_at: new Date().toISOString()
  };
  notify('editorialOverrides');
}

/**
 * Clear editorial override
 */
export function clearEditorialOverride(webinarId) {
  delete appState.editorialOverrides[webinarId];
  notify('editorialOverrides');
}

/**
 * Get active description (override takes precedence)
 */
export function getActiveDescription(webinarId) {
  const override = getEditorialOverride(webinarId);
  if (override) return override.description;
  
  const webinar = getWebinar(webinarId);
  return webinar?.x_studio_webinar_info || '';
}

/**
 * Set calendar instance reference
 */
export function setCalendarInstance(instance) {
  appState.calendarInstance = instance;
}

/**
 * Get calendar instance
 */
export function getCalendarInstance() {
  return appState.calendarInstance;
}
