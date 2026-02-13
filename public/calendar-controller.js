/**
 * CALENDAR CONTROLLER - Event Operations Frontend
 * 
 * Responsibilities:
 * - Initialize FullCalendar (month view only)
 * - Transform webinars into calendar events
 * - Apply styling via eventDidMount
 * - Handle event clicks (update state only)
 * 
 * Does NOT:
 * - Render detail panel
 * - Handle publish logic
 * - Manipulate DOM outside calendar container
 * 
 * Part of: ADDENDUM D - Calendar Workspace & Editorial Layer
 * Frontend Refactor Architecture
 */

import { 
  appState, 
  setCurrentEvent, 
  setCalendarInstance,
  getCalendarInstance,
  getSnapshot,
  getRegistrationCount 
} from './state-store.js';

/**
 * Normalize Odoo datetime to ISO 8601 format
 * 
 * Odoo datetime fields return: "2026-06-18 09:00:00" (space separator, no Z)
 * Need: "2026-06-18T09:00:00Z" for proper UTC parsing
 * 
 * @param {string} odooDatetime - Raw datetime from Odoo API
 * @returns {string|null} ISO 8601 datetime string or null if invalid
 */
function normalizeOdooDatetime(odooDatetime) {
  if (!odooDatetime || typeof odooDatetime !== 'string') {
    return null;
  }

  let isoString = odooDatetime.trim();

  // Convert Odoo format (space separator) to ISO 8601 (T separator + Z suffix)
  if (isoString.includes(' ') && !isoString.includes('T')) {
    isoString = isoString.replace(' ', 'T') + 'Z';
  }

  // Validate by attempting to parse
  const date = new Date(isoString);
  if (isNaN(date.getTime())) {
    return null;
  }

  return isoString;
}

/**
 * Initialize FullCalendar
 * Month view only
 */
export function initializeCalendar() {
  const calendarEl = document.getElementById('fullcalendar');
  if (!calendarEl) {
    console.error('[CalendarController] Calendar element not found');
    return;
  }

  // Destroy existing instance if present
  const existingInstance = getCalendarInstance();
  if (existingInstance) {
    existingInstance.destroy();
  }

  // Transform data
  const events = transformToCalendarEvents();

  // Initialize FullCalendar (month view only)
  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    headerToolbar: {
      left: 'title',
      center: '',
      right: 'today prev,next'
    },
    events: events,
    eventClick: handleEventClick,
    eventDidMount: styleCalendarEvent,
    height: 'auto',
    firstDay: 1, // Monday
    locale: 'nl',
    buttonText: {
      today: 'Vandaag'
    }
  });

  calendar.render();
  setCalendarInstance(calendar);
}

/**
 * Refresh calendar with current state
 */
export function refreshCalendar() {
  const calendar = getCalendarInstance();
  if (!calendar) return;

  const events = transformToCalendarEvents();
  calendar.removeAllEvents();
  calendar.addEventSource(events);
}

/**
 * Transform webinars to FullCalendar events
 */
function transformToCalendarEvents() {
  const events = appState.webinars.map(webinar => {
    // Normalize Odoo datetime to ISO 8601
    const startISO = normalizeOdooDatetime(webinar.x_studio_event_datetime);
    
    // Debug logging (temporary)
    if (!startISO) {
      console.warn('[CalendarController] Invalid datetime for webinar:', webinar.id, 'Raw:', webinar.x_studio_event_datetime);
    }

    const snapshot = getSnapshot(webinar.id);
    const regCount = getRegistrationCount(webinar.id);
    const state = computeState(webinar, snapshot);
    const colors = getStatusColors(state);

    return {
      id: webinar.id,
      title: webinar.x_name || 'Untitled Event',
      start: startISO,
      end: calculateEndTime(startISO, webinar.x_studio_event_duration_minutes),
      backgroundColor: colors.bg,
      borderColor: colors.accent,
      textColor: colors.text,
      extendedProps: {
        webinar,
        snapshot,
        state,
        regCount,
        colors
      }
    };
  });

  // Filter out events without valid start date
  const validEvents = events.filter(e => e && e.start);
  
  console.log(`[CalendarController] Transformed ${validEvents.length}/${events.length} events`);
  
  return validEvents;
}

/**
 * Compute event state (matches backend state engine)
 */
function computeState(webinar, snapshot) {
  const isArchived = !webinar.x_active;
  if (isArchived) return 'archived';

  // Use backend-computed state if available (most reliable)
  if (snapshot?.computed_state && snapshot.computed_state !== 'not_published') {
    // Backend state engine already computed this — trust it
    // But still check for frontend-detectable discrepancies
    const hasDiscrepancy = checkDiscrepancy(webinar, snapshot);
    if (hasDiscrepancy) return 'out_of_sync';
    return snapshot.computed_state;
  }

  // Fallback: check wp_snapshot for publish status
  const wpId = snapshot?.wp_snapshot?.id;
  if (!wpId || wpId <= 0) return 'not_published';

  const hasDiscrepancy = checkDiscrepancy(webinar, snapshot);
  if (hasDiscrepancy) return 'out_of_sync';

  const wpStatus = snapshot?.wp_snapshot?.status || 'draft';
  if (wpStatus === 'publish') return 'published';
  return 'draft';
}

/**
 * Check for discrepancies between Odoo and WordPress
 */
function checkDiscrepancy(webinar, snapshot) {
  if (!snapshot || !snapshot.wp_snapshot) return false;

  const wp = snapshot.wp_snapshot;

  // Title mismatch (Tribe API title is a string, Core API wraps in { rendered })
  const wpTitle = typeof wp.title === 'object' ? wp.title?.rendered : wp.title;
  if (wpTitle && webinar.x_name && webinar.x_name !== wpTitle) return true;

  // Start datetime mismatch (compare date portion only)
  if (wp.start_date && webinar.x_studio_event_datetime) {
    const odooDate = normalizeOdooDatetime(webinar.x_studio_event_datetime)?.split('T')[0];
    const wpDate = wp.start_date.split(' ')[0].trim();
    if (odooDate && wpDate && odooDate !== wpDate) return true;
  }

  // Description comparison skipped (editorial layer manages this separately)

  return false;
}

/**
 * Get status colors using DaisyUI CSS variables
 */
function getStatusColors(state) {
  const colorMap = {
    'out_of_sync': {
      bg: 'oklch(var(--wa) / 0.15)',    // warning
      accent: 'oklch(var(--wa))',
      text: 'oklch(var(--bc))'
    },
    'published': {
      bg: 'oklch(var(--su) / 0.15)',    // success
      accent: 'oklch(var(--su))',
      text: 'oklch(var(--bc))'
    },
    'draft': {
      bg: 'oklch(var(--n) / 0.15)',     // neutral
      accent: 'oklch(var(--n))',
      text: 'oklch(var(--bc))'
    },
    'not_published': {
      bg: 'oklch(var(--in) / 0.15)',    // info
      accent: 'oklch(var(--in))',
      text: 'oklch(var(--bc))'
    },
    'archived': {
      bg: 'oklch(var(--n) / 0.08)',     // neutral muted
      accent: 'oklch(var(--n) / 0.5)',
      text: 'oklch(var(--bc) / 0.5)'
    },
    'deleted': {
      bg: 'oklch(var(--er) / 0.15)',    // error
      accent: 'oklch(var(--er))',
      text: 'oklch(var(--bc))'
    }
  };

  return colorMap[state] || colorMap['not_published'];
}

/**
 * Calculate end time from start + duration
 */
function calculateEndTime(startISO, durationMinutes) {
  if (!startISO || !durationMinutes) return startISO;
  
  const start = new Date(startISO);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  return end.toISOString();
}

/**
 * Style calendar event via eventDidMount hook
 */
function styleCalendarEvent(info) {
  const colors = info.event.extendedProps.colors;
  if (!colors) return;

  const el = info.el;
  el.style.setProperty('--event-bg', colors.bg);
  el.style.setProperty('--event-accent', colors.accent);
  el.style.setProperty('--event-text', colors.text);
  
  // Apply custom classes for DaisyUI integration
  el.classList.add('fc-event-custom');
}

/**
 * Handle event click (update state only, do not render)
 */
function handleEventClick(info) {
  info.jsEvent.preventDefault();
  
  const webinarId = parseInt(info.event.id);
  setCurrentEvent(webinarId);
}
