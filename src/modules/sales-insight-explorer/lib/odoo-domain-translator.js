/**
 * Odoo Domain Translator
 * 
 * Translates QueryDefinition filters and time_scope to Odoo domain format.
 * Handles operator mapping, conjunctions, and time-based filters.
 * 
 * SPEC COMPLIANCE:
 * - Section 7.1: QueryDefinition → Odoo Domain
 * - Zero SQL assumptions
 * - Capability-aware
 * 
 * @module modules/sales-insight-explorer/lib/odoo-domain-translator
 */

/**
 * Translate QueryDefinition to Odoo domain
 * 
 * @param {Object} query - QueryDefinition
 * @returns {Array} Odoo domain array
 */
export function translateToOdooDomain(query) {
  const domain = [];
  
  // 1. Translate filters on base model
  for (const filter of query.filters) {
    if (filter.model !== query.base_model) {
      // Skip relation filters - handled during relation traversal
      continue;
    }
    
    const condition = translateFilter(filter);
    if (condition) {
      domain.push(condition);
    }
  }
  
  // 2. Add time scope filter
  if (query.time_scope) {
    const timeConditions = translateTimeScope(query.time_scope);
    domain.push(...timeConditions);
  }
  
  // 3. Add conjunction operators if needed
  if (domain.length > 1) {
    // Prepend AND operators: '&' repeated (n-1) times
    const andOperators = '&'.repeat(domain.length - 1).split('');
    domain.unshift(...andOperators);
  }
  
  return domain;
}

/**
 * Translate single filter to Odoo condition
 * 
 * @param {Object} filter - Filter object
 * @returns {Array} Odoo condition [field, operator, value]
 */
function translateFilter(filter) {
  const odooOperator = mapOperator(filter.operator);
  const odooValue = mapValue(filter.value, filter.operator);
  
  return [filter.field, odooOperator, odooValue];
}

/**
 * Map our filter operators to Odoo operators
 * 
 * @param {string} operator - Our operator
 * @returns {string} Odoo operator
 */
function mapOperator(operator) {
  const mapping = {
    '=': '=',
    '!=': '!=',
    '>': '>',
    '>=': '>=',
    '<': '<',
    '<=': '<=',
    'like': 'like',
    'ilike': 'ilike',
    'not like': 'not like',
    'not ilike': 'not ilike',
    'in': 'in',
    'not in': 'not in',
    'is set': '!=',      // Convert to != false
    'is not set': '=',   // Convert to = false
    'between': 'between' // Special handling needed
  };
  
  return mapping[operator] || '=';
}

/**
 * Map filter value for Odoo
 * 
 * @param {*} value - Filter value
 * @param {string} operator - Filter operator
 * @returns {*} Odoo-compatible value
 */
function mapValue(value, operator) {
  // Handle existence operators
  if (operator === 'is set') {
    return false; // != false means "is set"
  }
  if (operator === 'is not set') {
    return false; // = false means "is not set"
  }
  
  // Pass through other values
  return value;
}

/**
 * Translate time scope to Odoo domain conditions
 * 
 * @param {Object} timeScope - TimeScope object
 * @returns {Array} Array of Odoo conditions
 */
function translateTimeScope(timeScope) {
  const conditions = [];
  
  if (timeScope.mode === 'absolute') {
    // Absolute date range
    if (timeScope.from) {
      conditions.push([timeScope.field, '>=', timeScope.from]);
    }
    if (timeScope.to) {
      conditions.push([timeScope.field, '<=', timeScope.to]);
    }
  } else if (timeScope.mode === 'relative') {
    // Relative period
    const dateRange = calculateRelativeDateRange(timeScope);
    
    if (dateRange.from) {
      conditions.push([timeScope.field, '>=', dateRange.from]);
    }
    if (dateRange.to) {
      conditions.push([timeScope.field, '<=', dateRange.to]);
    }
  }
  
  return conditions;
}

/**
 * Calculate date range for relative time scope
 * 
 * @param {Object} timeScope - TimeScope object
 * @returns {{from: string, to: string}} ISO date strings
 */
function calculateRelativeDateRange(timeScope) {
  const now = new Date();
  let from = null;
  let to = null;
  
  if (timeScope.period) {
    // Predefined periods
    switch (timeScope.period) {
      case 'today':
        from = getStartOfDay(now);
        to = getEndOfDay(now);
        break;
        
      case 'this_week':
        from = getStartOfWeek(now);
        to = getEndOfWeek(now);
        break;
        
      case 'this_month':
        from = getStartOfMonth(now);
        to = getEndOfMonth(now);
        break;
        
      case 'this_quarter':
        from = getStartOfQuarter(now);
        to = getEndOfQuarter(now);
        break;
        
      case 'this_year':
        from = getStartOfYear(now);
        to = getEndOfYear(now);
        break;
        
      case 'last_7_days':
        from = subtractDays(now, 7);
        to = now.toISOString();
        break;
        
      case 'last_30_days':
        from = subtractDays(now, 30);
        to = now.toISOString();
        break;
        
      case 'last_90_days':
        from = subtractDays(now, 90);
        to = now.toISOString();
        break;
        
      case 'last_year':
        from = subtractYears(now, 1);
        to = now.toISOString();
        break;
    }
  } else if (timeScope.relative_amount && timeScope.relative_unit) {
    // Custom relative period
    const direction = timeScope.relative_direction || 'past';
    const amount = timeScope.relative_amount;
    
    if (direction === 'past') {
      to = now.toISOString();
      
      switch (timeScope.relative_unit) {
        case 'days':
          from = subtractDays(now, amount);
          break;
        case 'weeks':
          from = subtractDays(now, amount * 7);
          break;
        case 'months':
          from = subtractMonths(now, amount);
          break;
        case 'years':
          from = subtractYears(now, amount);
          break;
      }
    } else {
      // future
      from = now.toISOString();
      
      switch (timeScope.relative_unit) {
        case 'days':
          to = addDays(now, amount);
          break;
        case 'weeks':
          to = addDays(now, amount * 7);
          break;
        case 'months':
          to = addMonths(now, amount);
          break;
        case 'years':
          to = addYears(now, amount);
          break;
      }
    }
  }
  
  return { from, to };
}

// Date utility functions

function getStartOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function getEndOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as first day
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function getEndOfWeek(date) {
  const d = new Date(getStartOfWeek(date));
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function getStartOfMonth(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function getEndOfMonth(date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function getStartOfQuarter(date) {
  const d = new Date(date);
  const quarter = Math.floor(d.getMonth() / 3);
  d.setMonth(quarter * 3);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function getEndOfQuarter(date) {
  const d = new Date(getStartOfQuarter(date));
  d.setMonth(d.getMonth() + 3);
  d.setDate(0);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function getStartOfYear(date) {
  const d = new Date(date);
  d.setMonth(0);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function getEndOfYear(date) {
  const d = new Date(date);
  d.setMonth(11);
  d.setDate(31);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function subtractDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function subtractMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() - months);
  return d.toISOString();
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

function subtractYears(date, years) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString();
}

function addYears(date, years) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString();
}

/**
 * Build Odoo sorting string
 * 
 * @param {Array} sortRules - Array of SortRule objects
 * @returns {string} Odoo order string (e.g., "expected_revenue desc, name asc")
 */
export function translateSorting(sortRules) {
  if (!sortRules || sortRules.length === 0) {
    return '';
  }
  
  return sortRules
    .map(rule => `${rule.field} ${rule.direction}`)
    .join(', ');
}
