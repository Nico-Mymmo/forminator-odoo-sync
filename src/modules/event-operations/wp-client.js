/**
 * WordPress Client Wrapper
 * 
 * Two-step publication flow (Tribe + Core endpoints)
 */

import { WP_ENDPOINTS } from './constants.js';

/**
 * Get all WordPress events
 * 
 * @param {Object} env
 * @returns {Promise<Array>}
 */
export async function getWordPressEvents(env) {
  const response = await fetch(
    `${env.WORDPRESS_URL}${WP_ENDPOINTS.TRIBE_EVENTS}?per_page=100`,
    {
      headers: {
        'Authorization': `Bearer ${env.WP_API_TOKEN}`
      }
    }
  );
  
  if (!response.ok) {
    throw new Error(`WordPress API error: ${response.status}`);
  }
  
  return await response.json();
}
