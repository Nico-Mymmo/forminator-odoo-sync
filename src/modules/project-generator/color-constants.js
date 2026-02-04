/**
 * Odoo Color System - Centralized Mapping
 * 
 * Odoo uses integer colors 0-11 for project.task.color field.
 * This module provides consistent color mapping across:
 * - UI color pickers (Tailwind CSS classes)
 * - Display lists (hex codes for inline styles)
 * - Task list badges (DaisyUI badge classes)
 * 
 * SOURCE OF TRUTH: Official Odoo color integers as used in Odoo's codebase
 */

/**
 * Odoo color integer to hex code mapping
 * Used for: milestone/stakeholder color dots, task color indicators
 */
export const ODOO_COLORS_HEX = {
  0: '#E5E7EB',  // Gray-200 - No color
  1: '#EF4444',  // Red-500 - Red
  2: '#F97316',  // Orange-500 - Orange  
  3: '#EAB308',  // Yellow-500 - Yellow
  4: '#3B82F6',  // Blue-500 - Blue
  5: '#EC4899',  // Pink-500 - Pink
  6: '#22C55E',  // Green-500 - Green
  7: '#A855F7',  // Purple-500 - Purple
  8: '#6B7280',  // Gray-500 - Gray
  9: '#8B5CF6',  // Violet-500 - Violet
  10: '#06B6D4', // Cyan-500 - Cyan
  11: '#4F46E5'  // Indigo-600 - Indigo
};

/**
 * Odoo color integer to Tailwind CSS class mapping
 * Used for: UI color picker buttons
 */
export const ODOO_COLORS_TAILWIND = {
  0: 'bg-gray-200',
  1: 'bg-red-500',
  2: 'bg-orange-500',
  3: 'bg-yellow-500',
  4: 'bg-blue-500',
  5: 'bg-pink-500',
  6: 'bg-green-500',
  7: 'bg-purple-500',
  8: 'bg-gray-500',
  9: 'bg-violet-500',
  10: 'bg-cyan-500',
  11: 'bg-indigo-600'
};

/**
 * Odoo color integer to DaisyUI badge class mapping
 * Used for: milestone/stakeholder badges in task list
 */
export const ODOO_COLORS_BADGES = {
  0: 'badge-ghost',
  1: 'badge-error',      // Red
  2: 'badge-warning',    // Orange
  3: 'badge-warning',    // Yellow (DaisyUI doesn't have separate yellow)
  4: 'badge-info',       // Blue
  5: 'badge-secondary',  // Pink
  6: 'badge-success',    // Green
  7: 'badge-secondary',  // Purple (DaisyUI doesn't have purple badge)
  8: 'badge-neutral',    // Gray
  9: 'badge-secondary',  // Violet (DaisyUI doesn't have violet badge)
  10: 'badge-info',      // Cyan (closest to info)
  11: 'badge-primary'    // Indigo
};

/**
 * Color names for tooltips/labels
 */
export const ODOO_COLOR_NAMES = {
  0: 'No color',
  1: 'Red',
  2: 'Orange',
  3: 'Yellow',
  4: 'Blue',
  5: 'Pink',
  6: 'Green',
  7: 'Purple',
  8: 'Gray',
  9: 'Violet',
  10: 'Cyan',
  11: 'Indigo'
};
