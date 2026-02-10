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

import { create, write, searchRead, batchCreate } from '../../lib/odoo.js';

/**
 * Get active internal Odoo users
 * 
 * @param {Object} env - Cloudflare env
 * @returns {Promise<Array>} Array of user objects with {id, name, login}
 */
export async function getActiveUsers(env) {
  const users = await searchRead(env, {
    model: 'res.users',
    domain: [
      ['active', '=', true],
      ['share', '=', false]  // Internal users only (not portal/public users)
    ],
    fields: ['id', 'name', 'login'],
    order: 'name asc'
  });
  
  return users;
}

/**
 * Create Odoo project
 * 
 * @param {Object} env - Cloudflare env
 * @param {Object} data - Project data
 * @param {string} data.name - Project name
 * @param {string} [data.description] - Project description
 * @param {number} [data.user_id] - Project responsible (Addendum J)
 * @returns {Promise<number>} Odoo project ID
 */
export async function createProject(env, data) {
  const values = {
    name: data.name
  };
  
  if (data.description) {
    values.description = data.description;
  }
  
  // Project dates
  if (data.date_start) {
    values.date_start = data.date_start;  // Start date
  }
  
  if (data.date) {
    values.date = data.date;  // End date (calculated from max task deadline)
  }
  
  // Addendum J: Set project responsible
  if (data.user_id) {
    values.user_id = data.user_id;
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
  
  // Addendum O: Map stage semantics to Odoo custom fields
  if (data.is_done_stage) {
    values.x_is_done_stage = true;
  }
  if (data.is_approved_stage) {
    values.x_is_approved_stage = true;
  }
  if (data.is_cancelled_stage) {
    values.x_is_cancelled_stage = true;
  }
  // Addendum P: Backlog stage support
  if (data.is_backlog_stage) {
    values.x_is_backlog_stage = true;
  }
  
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
 * Create project milestone
 * 
 * @param {Object} env - Cloudflare env
 * @param {Object} data - Milestone data
 * @param {string} data.name - Milestone name
 * @param {number} data.project_id - Project ID
 * @returns {Promise<number>} Odoo milestone ID
 */
export async function createMilestone(env, data) {
  const milestoneId = await create(env, {
    model: 'project.milestone',
    values: {
      name: data.name,
      project_id: data.project_id
    }
  });
  
  return milestoneId;
}

/**
 * Get or create project tag (Addendum F)
 * Tags are GLOBAL in Odoo (no project_id field)
 * 
 * Checks if tag with same name exists first to avoid unique constraint violation.
 * Tags have unique constraint on name in Odoo.
 * 
 * @param {Object} env - Cloudflare env
 * @param {Object} data - Tag data
 * @param {string} data.name - Tag name
 * @returns {Promise<number>} Odoo tag ID (existing or newly created)
 */
export async function getOrCreateTag(env, data) {
  // Search for existing tag with same name
  const existingTags = await searchRead(env, {
    model: 'project.tags',
    domain: [['name', '=', data.name]],
    fields: ['id'],
    limit: 1
  });
  
  if (existingTags && existingTags.length > 0) {
    console.log(`[Odoo Creator] Tag "${data.name}" already exists (ID: ${existingTags[0].id})`);
    return existingTags[0].id;
  }
  
  // Create new tag if not found
  const tagId = await create(env, {
    model: 'project.tags',
    values: {
      name: data.name
    }
  });
  
  console.log(`[Odoo Creator] Tag "${data.name}" created (ID: ${tagId})`);
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
 * @param {number} [data.milestone_id] - Milestone ID
 * @param {number} [data.color] - Odoo color integer (1-11)
 * @param {Array<number>} [data.tag_ids] - Array of tag IDs
 * @param {Array<number>} [data.user_ids] - Array of user IDs (Addendum J)
 * @param {string} [data.planned_date_begin] - Start date (ISO format)
 * @param {string} [data.date_deadline] - Deadline date (ISO format)
 * @param {number} [data.allocated_hours] - Estimated hours
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
  
  if (data.milestone_id) {
    values.milestone_id = data.milestone_id;
  }
  
  // Addendum F: Color support
  if (data.color !== null && data.color !== undefined) {
    values.color = data.color;
  }
  
  // Addendum F: Tags support
  if (data.tag_ids && data.tag_ids.length > 0) {
    values.tag_ids = data.tag_ids.map(id => [4, id]);  // [(4, id)] = link existing
  }
  
  // Addendum J/P: User assignment support
  // ALWAYS set user_ids explicitly to prevent Odoo from auto-assigning creator
  if (data.user_ids && data.user_ids.length > 0) {
    values.user_ids = data.user_ids.map(id => [4, id]);  // [(4, id)] = link existing
  } else {
    values.user_ids = [[6, 0, []]];  // [(6, 0, [])] = replace all with empty list
  }
  
  // Addendum G: Timing support
  if (data.planned_date_begin) {
    values.planned_date_begin = data.planned_date_begin;
  }
  if (data.date_deadline) {
    values.date_deadline = data.date_deadline;
  }
  if (data.allocated_hours !== null && data.allocated_hours !== undefined) {
    values.allocated_hours = data.allocated_hours;
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

/**
 * ADDENDUM L: Batch create tasks
 * 
 * Creates multiple tasks in a single Odoo API call.
 * Returns array of task IDs in same order as input.
 * 
 * IMPORTANT: All tasks must be at same nesting level (all parents or all children).
 * Do NOT mix parent tasks with subtasks in same batch - parent_id references won't exist yet.
 * 
 * @param {Object} env - Cloudflare env
 * @param {Array<Object>} tasksData - Array of task data objects (same format as createTask)
 * @returns {Promise<Array<number>>} Array of created task IDs
 */
export async function batchCreateTasks(env, tasksData) {
  if (!Array.isArray(tasksData) || tasksData.length === 0) {
    return [];
  }
  
  // Build values array (same logic as createTask but for multiple tasks)
  const valuesArray = tasksData.map(data => {
    const values = {
      name: data.name,
      project_id: data.project_id
    };
    
    if (data.stage_id) values.stage_id = data.stage_id;
    if (data.parent_id) values.parent_id = data.parent_id;
    if (data.milestone_id) values.milestone_id = data.milestone_id;
    if (data.color !== null && data.color !== undefined) values.color = data.color;
    if (data.tag_ids && data.tag_ids.length > 0) {
      values.tag_ids = data.tag_ids.map(id => [4, id]);
    }
    // Addendum J/P: Always set user_ids explicitly (same as createTask)
    if (data.user_ids && data.user_ids.length > 0) {
      values.user_ids = data.user_ids.map(id => [4, id]);
    } else {
      values.user_ids = [[6, 0, []]];  // Prevent Odoo auto-assignment
    }
    if (data.planned_date_begin) values.planned_date_begin = data.planned_date_begin;
    if (data.date_deadline) values.date_deadline = data.date_deadline;
    if (data.allocated_hours !== null && data.allocated_hours !== undefined) {
      values.allocated_hours = data.allocated_hours;
    }
    
    // ADDENDUM M2: Persist logical order sequence (CRITICAL FIX)
    if (data.sequence !== null && data.sequence !== undefined) {
      values.sequence = data.sequence;
    }
    
    // Addendum B: Hide subtasks from Kanban
    values.display_in_project = data.parent_id ? false : true;
    
    return values;
  });
  
  // FORENSIC LOG: Odoo RPC payload verification (ADDENDUM M2 debugging)
  valuesArray.forEach((values, index) => {
    console.log(JSON.stringify({
      forensic: 'ODOO_PAYLOAD',
      index: index,
      name: values.name,
      sequence: values.sequence ?? 'MISSING',
      milestone_id: values.milestone_id ?? null,
      parent_id: values.parent_id ?? null,
      stage_id: values.stage_id ?? null
    }));
  });
  
  const taskIds = await batchCreate(env, {
    model: 'project.task',
    valuesArray: valuesArray
  });
  
  // FORENSIC LOG: Returned IDs from Odoo (ADDENDUM M2 debugging)
  console.log(JSON.stringify({
    forensic: 'ODOO_RESPONSE',
    task_count: taskIds.length,
    ids: taskIds
  }));
  
  return taskIds;
}

/**
 * ADDENDUM L: Batch create milestones
 * 
 * @param {Object} env - Cloudflare env
 * @param {Array<Object>} milestonesData - Array of milestone data objects
 * @returns {Promise<Array<number>>} Array of created milestone IDs
 */
export async function batchCreateMilestones(env, milestonesData) {
  if (!Array.isArray(milestonesData) || milestonesData.length === 0) {
    return [];
  }
  
  const valuesArray = milestonesData.map(data => ({
    name: data.name,
    project_id: data.project_id
  }));
  
  const milestoneIds = await batchCreate(env, {
    model: 'project.milestone',
    valuesArray: valuesArray
  });
  
  return milestoneIds;
}

