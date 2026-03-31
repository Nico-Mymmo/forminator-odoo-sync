/**
 * Claude Integration Module
 *
 * Provides short-lived token-gated context access for Claude AI.
 *
 * route: '/api/claude' means getModuleByRoute() matches any request whose
 * pathname starts with '/api/claude', including all API and the settings UI.
 *
 * @module modules/claude-integration
 */

import { routes } from './routes.js';

export default {
  code:        'claude_integration',
  name:        'Claude Integrations',
  description: 'Short-lived token gateway for Claude AI context access',
  route:       '/api/claude',
  icon:        'bot',
  isActive:    true,
  requiresAuth: false,

  routes
};
