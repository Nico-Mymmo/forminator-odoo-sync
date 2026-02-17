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
    eventContent: renderEventContent,
    displayEventTime: false,
    height: 640,
    fixedWeekCount: true,
    dayMaxEvents: 2,
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
    const statusColors = getStatusColors(state);
    const eventTypeColors = getEventTypeColors(webinar);

    return {
      id: webinar.id,
      title: webinar.x_name || 'Untitled Event',
      start: startISO,
      end: calculateEndTime(startISO, webinar.x_studio_event_duration_minutes),
      backgroundColor: eventTypeColors.bg,
      borderColor: 'transparent',
      textColor: eventTypeColors.text,
      extendedProps: {
        webinar,
        snapshot,
        state,
        regCount,
        statusColors,
        eventTypeColors
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
  if (wpTitle && webinar.x_name && decodeEntities(webinar.x_name) !== decodeEntities(wpTitle)) return true;

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
 * Get event type colors using DaisyUI CSS variables
 * Card color is determined by the calendar_color configured in mappings
 * Falls back to 'neutral' if no mapping exists
 */
function getEventTypeColors(webinar) {
  // Extract Odoo event type ID from many2one field
  const eventTypeId = (Array.isArray(webinar?.x_webinar_event_type_id) && webinar.x_webinar_event_type_id.length > 0)
    ? webinar.x_webinar_event_type_id[0]
    : null;

  // Look up mapping to get configured color
  let colorToken = 'neutral';
  if (eventTypeId && appState.mappings) {
    const mapping = appState.mappings.find(m => m.odoo_event_type_id === eventTypeId);
    if (mapping?.calendar_color) {
      colorToken = mapping.calendar_color;
    }
  }

  return resolveColorToken(colorToken);
}

/**
 * Resolve a color token (e.g. 'primary', 'info-soft') to DaisyUI CSS values
 */
function resolveColorToken(token) {
  const isSoft = token.endsWith('-soft');
  const baseToken = isSoft ? token.replace('-soft', '') : token;

  const cssVarMap = {
    'primary':   '--p',
    'secondary': '--s',
    'accent':    '--a',
    'info':      '--in',
    'success':   '--su',
    'warning':   '--wa',
    'neutral':   '--n',
  };

  const cssVar = cssVarMap[baseToken] || '--n';
  const opacity = isSoft ? 0.08 : 0.15;

  return {
    bg: `oklch(var(${cssVar}) / ${opacity})`,
    text: 'oklch(var(--bc))'
  };
}

/**
 * Get status colors using DaisyUI CSS variables
 * Used only for status dot indicator
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
      bg: 'oklch(var(--er) / 0.15)',    // error
      accent: 'oklch(var(--er))',
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
 * Render custom event content via eventContent hook
 */
function renderEventContent(arg) {
  const { webinar, regCount, state } = arg.event.extendedProps;

  // Event type name
  let eventType = '';
  if (Array.isArray(webinar?.x_webinar_event_type_id) && webinar.x_webinar_event_type_id.length > 1) {
    eventType = webinar.x_webinar_event_type_id[1];
  }

  // Format time in Brussels timezone
  let timeStr = '';
  if (arg.event.start) {
    try {
      timeStr = arg.event.start.toLocaleTimeString('nl-BE', {
        timeZone: 'Europe/Brussels',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      timeStr = '';
    }
  }

  const regLabel = regCount > 0 ? `${regCount}` : '';

  const html = `
    <div class="fc-event-card">
      <span class="status-dot"></span>
      <div class="event-type-label">${escapeHtml(eventType || 'Event')}</div>
      <div class="event-detail-row">
        ${timeStr ? `<span class="event-time">${timeStr}</span>` : '<span></span>'}
        ${regLabel ? `<span class="event-reg"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>${regLabel}</span>` : ''}
      </div>
    </div>
  `;

  return { html };
}

/**
 * Decode HTML entities for comparison (e.g. &#038; → &)
 */
function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Escape HTML for safe rendering
 */
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Style calendar event via eventDidMount hook
 */
function styleCalendarEvent(info) {
  const { eventTypeColors, statusColors } = info.event.extendedProps;

  const el = info.el;
  if (eventTypeColors) {
    el.style.setProperty('--event-bg', eventTypeColors.bg);
    el.style.setProperty('--event-text', eventTypeColors.text);
  }
  if (statusColors) {
    el.style.setProperty('--status-dot', statusColors.accent);
  }
  
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
