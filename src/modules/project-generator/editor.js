/**
 * Project Generator - Blueprint Editor (Server-side)
 * 
 * Server-side functions for blueprint data management.
 * Client-side editor logic is in /public/project-generator-client.js
 * 
 * SCOPE:
 * - Generate UUIDs
 * - Provide empty blueprint template
 * 
 * NO:
 * - State management (client-side)
 * - UI rendering (client-side)
 * - Validation (separate module)
 */

/**
 * Generate a UUID v4 (client-compatible format)
 * 
 * @returns {string} UUID string
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Get empty blueprint template
 * 
 * @returns {Object} Empty blueprint structure
 */
export function getEmptyBlueprint() {
  return {
    stages: [],
    milestones: [],
    tasks: [],
    dependencies: []
  };
}

/**
 * Create a default stage
 * 
 * @param {string} name - Stage name
 * @param {number} sequence - Stage order
 * @returns {Object} Stage object
 */
export function createStage(name, sequence) {
  return {
    id: generateUUID(),
    name: name,
    sequence: sequence
  };
}

/**
 * Create a default milestone
 * 
 * @param {string} name - Milestone name
 * @returns {Object} Milestone object
 */
export function createMilestone(name) {
  return {
    id: generateUUID(),
    name: name
  };
}

/**
 * Create a default task
 * 
 * @param {string} name - Task name
 * @param {string|null} milestoneId - Milestone ID or null
 * @param {string|null} parentId - Parent task ID or null
 * @returns {Object} Task object
 */
export function createTask(name, milestoneId = null, parentId = null) {
  return {
    id: generateUUID(),
    name: name,
    milestone_id: milestoneId,
    parent_id: parentId
  };
}

/**
 * Create a dependency
 * 
 * @param {string} taskId - Task ID
 * @param {string} dependsOnTaskId - Dependency target task ID
 * @returns {Object} Dependency object
 */
export function createDependency(taskId, dependsOnTaskId) {
  return {
    task_id: taskId,
    depends_on_task_id: dependsOnTaskId
  };
}

/**
 * Get default blueprint with sample data
 * Useful for new templates
 * 
 * @returns {Object} Blueprint with sample stages and structure
 */
export function getDefaultBlueprint() {
  return {
    stages: [
      createStage('To Do', 1),
      createStage('In Progress', 2),
      createStage('Done', 3)
    ],
    milestones: [],
    tasks: [],
    dependencies: []
  };
}
