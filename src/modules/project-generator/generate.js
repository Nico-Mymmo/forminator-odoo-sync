/**
 * Project Generator - Generation Orchestrator
 * 
 * Orchestrates project generation from blueprint to Odoo.
 * Sequential, fail-fast execution.
 * 
 * FLOW:
 * 1. Re-validate blueprint
 * 2. Build canonical generation model
 * 3. Create project
 * 4. Create stages
 * 5. Create milestones
 * 5.5. Create tags (Addendum F)
 * 6. Create tasks (parents first)
 * 7. Create dependencies (fail-soft)
 * 
 * NO rollback on failure.
 * User must manually delete partial projects in Odoo.
 */

import { validateBlueprint } from './validation.js';
import { getBlueprintData } from './library.js';
import { 
  createProject, 
  createStage, 
  createMilestone,
  getOrCreateTag,
  createTask, 
  addTaskDependencies 
} from './odoo-creator.js';

/**
 * Add workdays to a date (skip weekends)
 * Addendum G: Workday calculation for task timing
 * 
 * @param {Date|string} startDate - Starting date (Date object or ISO string)
 * @param {number} days - Number of workdays to add
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
function addWorkdays(startDate, days) {
  const date = typeof startDate === 'string' ? new Date(startDate) : new Date(startDate);
  let remaining = days;
  
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const dayOfWeek = date.getDay();
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      remaining--;
    }
  }
  
  // Return ISO date string (YYYY-MM-DD)
  return date.toISOString().split('T')[0];
}

/**
 * Generate Odoo project from template blueprint
 * 
 * @param {Object} env - Cloudflare env
 * @param {string} templateId - Template UUID
 * @param {string} templateName - Template name
 * @param {string|null} projectStartDate - Project start date (ISO YYYY-MM-DD) - Addendum G
 * @param {Object|null} overrideModel - Optional generation model override (Addendum C)
 * @returns {Promise<Object>} Generation result
 */
export async function generateProject(env, templateId, templateName, projectStartDate = null, overrideModel = null) {
  const result = {
    success: false,
    step: null,
    odoo_project_id: null,
    odoo_project_url: null,
    generation_model: null, // Added for lifecycle tracking
    error: null,
    odoo_mappings: {
      stages: {},
      milestones: {},
      tasks: {}
    }
  };
  
  try {
    // STEP 1: Re-validate blueprint
    result.step = '1-validate';
    console.log('[Generator] Step 1: Validating blueprint');
    
    const blueprintData = await getBlueprintData(env, templateId);
    const validation = validateBlueprint(blueprintData);
    
    if (!validation.valid) {
      throw new Error('Blueprint validation failed: ' + validation.errors.join(', '));
    }
    
    // STEP 2: Build canonical generation model (or use override)
    result.step = '2-build-model';
    console.log('[Generator] Step 2: Building generation model');
    
    let generationModel;
    if (overrideModel) {
      console.log('[Generator] Using override model (Addendum C)');
      generationModel = overrideModel;
    } else {
      generationModel = buildGenerationModel(blueprintData, templateName, projectStartDate);
    }
    result.generation_model = generationModel; // Store for lifecycle tracking
    
    // STEP 3: Create project
    result.step = '3-create-project';
    console.log('[Generator] Step 3: Creating project');
    
    const projectName = generationModel.project.name;
    const projectId = await createProject(env, {
      name: projectName,
      description: generationModel.project.description
    });
    
    result.odoo_project_id = projectId;
    
    // Build Odoo project URL
    const odooUrl = env.ODOO_URL || 'https://mymmo.odoo.com';
    result.odoo_project_url = `${odooUrl}/web#id=${projectId}&model=project.project&view_type=form`;
    
    console.log('[Generator] Project created:', projectId);
    
    // STEP 4: Create stages
    result.step = '4-create-stages';
    console.log('[Generator] Step 4: Creating stages');
    
    for (const stage of generationModel.stages) {
      const stageId = await createStage(env, {
        name: stage.name,
        sequence: stage.sequence,
        project_id: projectId
      });
      
      result.odoo_mappings.stages[stage.blueprint_id] = stageId;
      console.log(`[Generator] Stage created: ${stage.name} (${stageId})`);
    }
    
    // STEP 5: Create milestones
    result.step = '5-create-milestones';
    console.log('[Generator] Step 5: Creating milestones');
    
    for (const milestone of generationModel.milestones) {
      const milestoneId = await createMilestone(env, {
        name: milestone.name,
        project_id: projectId
      });
      
      result.odoo_mappings.milestones[milestone.blueprint_id] = milestoneId;
      console.log(`[Generator] Milestone created: ${milestone.name} (${milestoneId})`);
    }
    
    // STEP 5.5: Create tags (Addendum F)
    // NOTE: Tags are GLOBAL in Odoo (no project_id)
    result.step = '5.5-create-tags';
    console.log('[Generator] Step 5.5: Creating or finding tags');
    result.odoo_mappings.tags = {};
    
    for (const tag of generationModel.tags) {
      const tagId = await getOrCreateTag(env, {
        name: tag.name
      });
      
      result.odoo_mappings.tags[tag.blueprint_id] = tagId;
    }
    
    // STEP 6: Create tasks (ordered)
    result.step = '6-create-tasks';
    console.log('[Generator] Step 6: Creating tasks');
    
    // Get first stage ID as default
    const defaultStageId = Object.values(result.odoo_mappings.stages)[0] || null;
    
    // Sort tasks by generation order (parents before children)
    const sortedTasks = [...generationModel.tasks].sort((a, b) => 
      a.generation_order - b.generation_order
    );
    
    for (const task of sortedTasks) {
      const taskData = {
        name: task.name,
        project_id: projectId,
        stage_id: defaultStageId
      };
      
      // Add parent_id if subtask
      if (task.parent_blueprint_id) {
        const parentOdooId = result.odoo_mappings.tasks[task.parent_blueprint_id];
        if (!parentOdooId) {
          throw new Error(`Parent task not found for subtask: ${task.name}`);
        }
        taskData.parent_id = parentOdooId;
      }
      
      // Add milestone if exists
      if (task.milestone_blueprint_id) {
        const milestoneOdooId = result.odoo_mappings.milestones[task.milestone_blueprint_id];
        if (milestoneOdooId) {
          taskData.milestone_id = milestoneOdooId;
        }
      }
      
      // Add color if exists (Addendum F)
      if (task.color !== null && task.color !== undefined) {
        taskData.color = task.color;
      }
      
      // Add tags if exist (Addendum F)
      if (task.tag_blueprint_ids && task.tag_blueprint_ids.length > 0) {
        taskData.tag_ids = task.tag_blueprint_ids.map(blueprintId => 
          result.odoo_mappings.tags[blueprintId]
        ).filter(id => id !== undefined);
      }
      
      // Add timing if exists (Addendum G)
      if (task.planned_date_begin) {
        taskData.planned_date_begin = task.planned_date_begin;
      }
      if (task.date_deadline) {
        taskData.date_deadline = task.date_deadline;
      }
      if (task.planned_hours !== null && task.planned_hours !== undefined) {
        taskData.allocated_hours = task.planned_hours;
      }
      
      const taskId = await createTask(env, taskData);
      result.odoo_mappings.tasks[task.blueprint_id] = taskId;
      
      const taskType = task.parent_blueprint_id ? 'Subtask' : 'Task';
      console.log(`[Generator] ${taskType} created: ${task.name} (${taskId})`);
    }
    
    // STEP 7: Create dependencies (fail-soft)
    result.step = '7-create-dependencies';
    console.log('[Generator] Step 7: Creating dependencies');
    
    let dependencySuccessCount = 0;
    let dependencyFailCount = 0;
    
    for (const task of sortedTasks) {
      if (task.dependencies && task.dependencies.length > 0) {
        try {
          const taskOdooId = result.odoo_mappings.tasks[task.blueprint_id];
          const dependsOnOdooIds = task.dependencies
            .map(depId => result.odoo_mappings.tasks[depId])
            .filter(id => id !== undefined);
          
          if (dependsOnOdooIds.length > 0) {
            await addTaskDependencies(env, taskOdooId, dependsOnOdooIds);
            dependencySuccessCount++;
            console.log(`[Generator] Dependencies added for: ${task.name}`);
          }
        } catch (err) {
          // Dependencies are optional, log but continue
          dependencyFailCount++;
          console.warn(`[Generator] Dependency creation failed for "${task.name}":`, err.message);
        }
      }
    }
    
    console.log(`[Generator] Dependencies: ${dependencySuccessCount} created, ${dependencyFailCount} failed`);
    
    // STEP 8: Finalize
    result.step = 'complete';
    result.success = true;
    console.log('[Generator] Generation complete');
    
    return result;
    
  } catch (err) {
    result.error = err.message;
    console.error(`[Generator] Generation failed at step ${result.step}:`, err);
    return result;
  }
}

/**
 * Build canonical generation model from blueprint
 * 
 * @param {Object} blueprint - Blueprint data
 * @param {string} templateName - Template name
 * @returns {Object} Generation model
 */
/**
 * Build canonical generation model from blueprint
 * Maps blueprint IDs to generation-ready structure
 * 
 * Addendum H: Implements timing inheritance from milestones and parent tasks
 * 
 * @param {Object} blueprint - Validated blueprint
 * @param {string} templateName - Template name for project naming
 * @param {string} projectStartDate - Project start date (ISO YYYY-MM-DD) - Addendum G
 * @returns {Object} Generation model
 */
export function buildGenerationModel(blueprint, templateName, projectStartDate = null) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const projectName = `${templateName} (${timestamp})`;
  
  const model = {
    project: {
      name: projectName,
      description: null,
      project_start_date: projectStartDate  // Addendum G: for date calculations
    },
    stages: [],
    milestones: [],
    tags: [],
    tasks: []
  };
  
  // Copy stages
  if (blueprint.stages && Array.isArray(blueprint.stages)) {
    model.stages = blueprint.stages.map(stage => ({
      blueprint_id: stage.id,
      name: stage.name,
      sequence: stage.sequence
    }));
  }
  
  // Copy milestones with timing calculation (Addendum H)
  const milestoneTimingMap = new Map();
  if (blueprint.milestones && Array.isArray(blueprint.milestones)) {
    model.milestones = blueprint.milestones.map(milestone => {
      let milestone_start_date = null;
      let milestone_deadline = null;
      
      // Calculate milestone timing if projectStartDate exists (Addendum H)
      if (projectStartDate && milestone.deadline_offset_days) {
        milestone_deadline = addWorkdays(projectStartDate, milestone.deadline_offset_days);
        
        if (milestone.duration_days) {
          const deadlineDate = new Date(milestone_deadline);
          let remaining = milestone.duration_days;
          
          while (remaining > 0) {
            deadlineDate.setDate(deadlineDate.getDate() - 1);
            const dayOfWeek = deadlineDate.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
              remaining--;
            }
          }
          
          milestone_start_date = deadlineDate.toISOString().split('T')[0];
        }
      }
      
      // Store milestone timing for task inheritance
      milestoneTimingMap.set(milestone.id, {
        start_date: milestone_start_date,
        deadline: milestone_deadline
      });
      
      return {
        blueprint_id: milestone.id,
        name: milestone.name
      };
    });
  }
  
  // Copy tags (Addendum F)
  if (blueprint.tags && Array.isArray(blueprint.tags)) {
    model.tags = blueprint.tags.map(tag => ({
      blueprint_id: tag.id,
      name: tag.name
    }));
  }
  
  // Build tasks with generation order and inheritance (Addendum H)
  if (blueprint.tasks && Array.isArray(blueprint.tasks)) {
    const taskMap = new Map();
    
    // First pass: create task entries with timing
    blueprint.tasks.forEach(task => {
      // Start with task's own timing configuration
      let planned_date_begin = null;
      let date_deadline = null;
      let planned_hours = task.planned_hours || null;
      
      // H6: Subtask inheritance from parent (DOMINANT)
      // If this is a subtask, inherit from parent
      if (task.parent_id) {
        const parentBlueprint = blueprint.tasks.find(t => t.id === task.parent_id);
        if (parentBlueprint) {
          // Subtasks inherit milestone from parent
          task.milestone_id = parentBlueprint.milestone_id;
          
          // Subtasks inherit tags from parent
          if (parentBlueprint.tag_ids && parentBlueprint.tag_ids.length > 0) {
            task.tag_ids = [...parentBlueprint.tag_ids];
          }
          
          // Subtasks inherit timing from parent (unless task has explicit values)
          if (!task.deadline_offset_days && parentBlueprint.deadline_offset_days) {
            task.deadline_offset_days = parentBlueprint.deadline_offset_days;
          }
          if (!task.duration_days && parentBlueprint.duration_days) {
            task.duration_days = parentBlueprint.duration_days;
          }
          if (!task.planned_hours && parentBlueprint.planned_hours) {
            planned_hours = parentBlueprint.planned_hours;
          }
        }
      }
      
      // H4: Task inherits timing from milestone (if no task-specific timing)
      if (projectStartDate && task.milestone_id && !task.deadline_offset_days) {
        const milestoneTiming = milestoneTimingMap.get(task.milestone_id);
        if (milestoneTiming) {
          // Inherit milestone timing only if task has no own timing
          if (milestoneTiming.deadline) {
            date_deadline = milestoneTiming.deadline;
          }
          if (milestoneTiming.start_date) {
            planned_date_begin = milestoneTiming.start_date;
          }
        }
      }
      
      // Task's own timing takes precedence over milestone inheritance
      if (projectStartDate && task.deadline_offset_days) {
        // Calculate deadline from project start
        date_deadline = addWorkdays(projectStartDate, task.deadline_offset_days);
        
        // If duration exists, calculate start date backwards from deadline
        if (task.duration_days) {
          const deadlineDate = new Date(date_deadline);
          let remaining = task.duration_days;
          
          while (remaining > 0) {
            deadlineDate.setDate(deadlineDate.getDate() - 1);
            const dayOfWeek = deadlineDate.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
              remaining--;
            }
          }
          
          planned_date_begin = deadlineDate.toISOString().split('T')[0];
        }
      }
      
      taskMap.set(task.id, {
        blueprint_id: task.id,
        name: task.name,
        milestone_blueprint_id: task.milestone_id || null,
        parent_blueprint_id: task.parent_id,
        color: task.color || null,
        tag_blueprint_ids: task.tag_ids || [],
        planned_date_begin: planned_date_begin,       // Addendum G+H: absolute start date (inherited or explicit)
        date_deadline: date_deadline,                  // Addendum G+H: absolute deadline (inherited or explicit)
        planned_hours: planned_hours,                  // Addendum G+H: estimated hours (inherited or explicit)
        dependencies: [],
        generation_order: 0
      });
    });
    
    // Second pass: add dependencies
    if (blueprint.dependencies && Array.isArray(blueprint.dependencies)) {
      blueprint.dependencies.forEach(dep => {
        const task = taskMap.get(dep.task_id);
        if (task) {
          task.dependencies.push(dep.depends_on_task_id);
        }
      });
    }
    
    // Third pass: compute generation order (parents before children)
    let order = 1;
    
    // Parent tasks first
    taskMap.forEach(task => {
      if (!task.parent_blueprint_id) {
        task.generation_order = order++;
      }
    });
    
    // Then subtasks
    taskMap.forEach(task => {
      if (task.parent_blueprint_id) {
        task.generation_order = order++;
      }
    });
    
    model.tasks = Array.from(taskMap.values());
  }
  
  return model;
}
