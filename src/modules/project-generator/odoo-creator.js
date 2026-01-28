/**
 * Project Generator - Odoo Creator
 * 
 * Low-level Odoo API calls for project generation.
 * NO business logic, NO blueprint knowledge.
 * Each function = one Odoo operation.
 * 
 * RULES:
 * - One function per Odoo entity type
 * - No error handling (caller handles)
 * - No retry logic
 * - No logging beyond what odoo.js does
 * - Return Odoo IDs directly
 */

import { create, write } from '../../lib/odoo.js';

/**
 * Create Odoo project
 * 
 * @param {Object} env - Cloudflare env
 * @param {Object} data - Project data
 * @param {string} data.name - Project name
 * @param {string} [data.description] - Project description
 * @returns {Promise<number>} Odoo project ID
 */
export async function createProject(env, data) {
  const values = {
    name: data.name
  };
  
  if (data.description) {
    values.description = data.description;
  }
  
  const projectId = await create(env, {
    model: 'project.project',
    values: values
  });
  
  return projectId;
}

/**
 * Create project stage (task type)
 * 
 * @param {Object} env - Cloudflare env
 * @param {Object} data - Stage data
 * @param {string} data.name - Stage name
 * @param {number} data.sequence - Stage order
 * @param {number} data.project_id - Project ID
 * @returns {Promise<number>} Odoo stage ID
 */
export async function createStage(env, data) {
  const values = {
    name: data.name,
    sequence: data.sequence
  };
  
  const stageId = await create(env, {
    model: 'project.task.type',
    values: values
  });
  
  // Link stage to project via many2many
  if (data.project_id) {
    await write(env, {
      model: 'project.task.type',
      ids: [stageId],
      values: {
        project_ids: [[4, data.project_id]]  // [(4, id)] = link existing
      }
    });
  }
  
  return stageId;
}

/**
 * Create project tag (for milestones)
 * 
 * @param {Object} env - Cloudflare env
 * @param {string} name - Tag name
 * @returns {Promise<number>} Odoo tag ID
 */
export async function createTag(env, name) {
  const tagId = await create(env, {
    model: 'project.tags',
    values: {
      name: name
    }
  });
  
  return tagId;
}

/**
 * Create task
 * 
 * @param {Object} env - Cloudflare env
 * @param {Object} data - Task data
 * @param {string} data.name - Task name
 * @param {number} data.project_id - Project ID
 * @param {number} [data.stage_id] - Stage ID
 * @param {number} [data.parent_id] - Parent task ID (for subtasks)
 * @param {Array<number>} [data.tag_ids] - Tag IDs
 * @returns {Promise<number>} Odoo task ID
 */
export async function createTask(env, data) {
  const values = {
    name: data.name,
    project_id: data.project_id
  };
  
  if (data.stage_id) {
    values.stage_id = data.stage_id;
  }
  
  if (data.parent_id) {
    values.parent_id = data.parent_id;
  }
  
  if (data.tag_ids && data.tag_ids.length > 0) {
    values.tag_ids = [[6, 0, data.tag_ids]];  // [(6, 0, ids)] = replace with
  }
  
  // Addendum B: Hide subtasks from Kanban (Odoo-conform behavior)
  // Main tasks: visible in project Kanban
  // Subtasks: only visible via parent task
  values.display_in_project = data.parent_id ? false : true;
  
  const taskId = await create(env, {
    model: 'project.task',
    values: values
  });
  
  return taskId;
}

/**
 * Add dependencies to task
 * 
 * @param {Object} env - Cloudflare env
 * @param {number} taskId - Task ID
 * @param {Array<number>} dependsOnIds - Array of task IDs this task depends on
 * @returns {Promise<void>}
 */
export async function addTaskDependencies(env, taskId, dependsOnIds) {
  if (!dependsOnIds || dependsOnIds.length === 0) {
    return;
  }
  
  await write(env, {
    model: 'project.task',
    ids: [taskId],
    values: {
      depend_on_ids: [[6, 0, dependsOnIds]]  // [(6, 0, ids)] = replace with
    }
  });
}
