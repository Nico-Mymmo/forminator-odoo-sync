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
  batchCreateMilestones,
  getOrCreateTag,
  batchCreateTasks, 
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
 * ADDENDUM M2: Compute task orderings (logical and execution)
 * 
 * NORMATIVE ORDERING CONTRACT:
 * 1. Milestones are execution boundaries (dominant key)
 * 2. Parent-before-child is secondary (within milestone only)
 * 3. Task sequence is tertiary (within milestone + parent scope)
 * 4. Execution order reverses milestone/task sequence, NOT parent-child
 * 
 * @param {Object} generationModel - Generation model with tasks and milestones
 * @returns {Object} { logicalTasks, executionTasks }
 */
function computeTaskOrders(generationModel) {
  // Build milestone sequence map
  const milestoneSequenceMap = new Map();
  if (generationModel.milestones && Array.isArray(generationModel.milestones)) {
    generationModel.milestones.forEach(m => {
      milestoneSequenceMap.set(m.blueprint_id, m.sequence || 0);
    });
  }
  
  // Helper: Get milestone sequence (orphans = 999999 for logical, -999999 for execution)
  const getMilestoneSeq = (task, isExecution = false) => {
    if (!task.milestone_blueprint_id) {
      return isExecution ? -999999 : 999999; // Orphans last in logical, first in execution
    }
    return milestoneSequenceMap.get(task.milestone_blueprint_id) || 0;
  };
  
  // LOGICAL ORDER (ASC): Milestone ASC → Parent first → Task ASC
  const logicalTasks = [...generationModel.tasks].sort((a, b) => {
    // 1. Milestone sequence (ASC, orphans last)
    const aMilestoneSeq = getMilestoneSeq(a, false);
    const bMilestoneSeq = getMilestoneSeq(b, false);
    
    if (aMilestoneSeq !== bMilestoneSeq) {
      return aMilestoneSeq - bMilestoneSeq; // ASC
    }
    
    // 2. Parent before child (within same milestone)
    const aIsParent = !a.parent_blueprint_id;
    const bIsParent = !b.parent_blueprint_id;
    
    if (aIsParent !== bIsParent) {
      return aIsParent ? -1 : 1; // Parents first
    }
    
    // 3. Parent scope boundary: subtasks of different parents MUST NOT be compared
    if (!aIsParent && !bIsParent) {
      if (a.parent_blueprint_id !== b.parent_blueprint_id) {
        return 0; // Preserve stable order, do not reorder
      }
    }
    
    // 4. Task sequence (ASC, within same parent scope only)
    const aSeq = a.sequence || 0;
    const bSeq = b.sequence || 0;
    return aSeq - bSeq; // ASC
  });
  
  // EXECUTION ORDER (DESC): Milestone DESC → Parent first → Task DESC
  const executionTasks = [...generationModel.tasks].sort((a, b) => {
    // 1. Milestone sequence (DESC, orphans first)
    const aMilestoneSeq = getMilestoneSeq(a, true);
    const bMilestoneSeq = getMilestoneSeq(b, true);
    
    if (aMilestoneSeq !== bMilestoneSeq) {
      return bMilestoneSeq - aMilestoneSeq; // DESC
    }
    
    // 2. Parent before child (NOT reversed - safety constraint)
    const aIsParent = !a.parent_blueprint_id;
    const bIsParent = !b.parent_blueprint_id;
    
    if (aIsParent !== bIsParent) {
      return aIsParent ? -1 : 1; // Parents first (NOT reversed)
    }
    
    // 3. Parent scope boundary: subtasks of different parents MUST NOT be compared
    if (!aIsParent && !bIsParent) {
      if (a.parent_blueprint_id !== b.parent_blueprint_id) {
        return 0; // Preserve stable order, do not reorder
      }
    }
    
    // 4. Task sequence (DESC, within same parent scope only)
    const aSeq = a.sequence || 0;
    const bSeq = b.sequence || 0;
    return bSeq - aSeq; // DESC
  });
  
  return { logicalTasks, executionTasks };
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
  // ADDENDUM L: Execution timeout guard
  const WORKER_TIMEOUT_MS = 30000; // Cloudflare Worker CPU limit
  const SAFETY_MARGIN_MS = 5000;   // Abort before hitting the limit
  const MAX_EXECUTION_MS = WORKER_TIMEOUT_MS - SAFETY_MARGIN_MS; // 25 seconds
  
  const startTime = Date.now();
  
  // Helper to check if we're nearing timeout
  const checkTimeout = () => {
    const elapsed = Date.now() - startTime;
    if (elapsed > MAX_EXECUTION_MS) {
      const error = new Error(`Generation aborted: execution time limit exceeded (${elapsed}ms)`);
      error.name = 'AbortError';
      throw error;
    }
  };
  
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
    checkTimeout(); // ADDENDUM L: Check before expensive operation
    
    const blueprintData = await getBlueprintData(env, templateId);
    const validation = validateBlueprint(blueprintData);
    
    if (!validation.valid) {
      throw new Error('Blueprint validation failed: ' + validation.errors.join(', '));
    }
    
    // STEP 2: Build canonical generation model (or use override)
    result.step = '2-build-model';
    console.log('[Generator] Step 2: Building generation model');
    checkTimeout(); // ADDENDUM L
    
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
    checkTimeout(); // ADDENDUM L
    
    const projectName = generationModel.project.name;
    const projectId = await createProject(env, {
      name: projectName,
      description: generationModel.project.description,
      date_start: generationModel.project.date_start,
      date: generationModel.project.date,
      user_id: generationModel.project.user_id  // Addendum J: project responsible
    });
    
    result.odoo_project_id = projectId;
    
    // Build Odoo project URL
    const odooUrl = env.ODOO_URL || 'https://mymmo.odoo.com';
    result.odoo_project_url = `${odooUrl}/web#id=${projectId}&model=project.project&view_type=form`;
    
    console.log('[Generator] Project created:', projectId);
    
    // STEP 4: Create stages
    result.step = '4-create-stages';
    console.log('[Generator] Step 4: Creating stages');
    checkTimeout(); // ADDENDUM L
    
    for (const stage of generationModel.stages) {
      const stageId = await createStage(env, {
        name: stage.name,
        sequence: stage.sequence,
        project_id: projectId
      });
      
      result.odoo_mappings.stages[stage.blueprint_id] = stageId;
      console.log(`[Generator] Stage created: ${stage.name} (${stageId})`);
    }
    
    // STEP 5: Create milestones (ADDENDUM L: batch creation)
    result.step = '5-create-milestones';
    console.log('[Generator] Step 5: Creating milestones (batch)');
    checkTimeout(); // ADDENDUM L
    
    if (generationModel.milestones.length > 0) {
      const milestonesData = generationModel.milestones.map(milestone => ({
        name: milestone.name,
        project_id: projectId
      }));
      
      const milestoneIds = await batchCreateMilestones(env, milestonesData);
      
      // Map blueprint IDs to Odoo IDs (preserve order)
      generationModel.milestones.forEach((milestone, index) => {
        result.odoo_mappings.milestones[milestone.blueprint_id] = milestoneIds[index];
        console.log(`[Generator] Milestone created: ${milestone.name} (${milestoneIds[index]})`);
      });
    }
    
    // STEP 5.5: Create tags (Addendum F + ADDENDUM L: cache during generation)
    // NOTE: Tags are GLOBAL in Odoo (no project_id)
    result.step = '5.5-create-tags';
    console.log('[Generator] Step 5.5: Creating or finding tags (with caching)');
    checkTimeout(); // ADDENDUM L
    result.odoo_mappings.tags = {};
    
    // ADDENDUM L: Cache tag searches to avoid redundant Odoo calls
    const tagCache = new Map(); // tag name → tag ID
    
    for (const tag of generationModel.tags) {
      let tagId;
      
      // Check cache first
      if (tagCache.has(tag.name)) {
        tagId = tagCache.get(tag.name);
        console.log(`[Generator] Tag "${tag.name}" found in cache (ID: ${tagId})`);
      } else {
        // Cache miss - fetch from Odoo
        tagId = await getOrCreateTag(env, {
          name: tag.name
        });
        tagCache.set(tag.name, tagId);
      }
      
      result.odoo_mappings.tags[tag.blueprint_id] = tagId;
    }
    
    // STEP 6: Create tasks (ADDENDUM M2: linear execution order)
    result.step = '6-create-tasks';
    console.log('[Generator] Step 6: Creating tasks (linear execution preserving DESC order)');
    checkTimeout(); // ADDENDUM L
    
    // Get first stage ID as default
    const defaultStageId = Object.values(result.odoo_mappings.stages)[0] || null;
    
    // ADDENDUM M2: Compute canonical task orderings
    const { logicalTasks, executionTasks } = computeTaskOrders(generationModel);
    
    // ADDENDUM M2: Freeze semantic ordering to prevent regression
    // CRITICAL: logicalTasks is the ONLY semantic source of truth
    // Any use of executionTasks outside STEP 6 task creation is a critical bug
    Object.freeze(logicalTasks);
    
    // ADDENDUM M2: Validate milestone dominance invariant
    // Ensures tasks from lower milestone sequence never appear after higher milestone sequence
    const validateMilestoneDominance = (tasks, label) => {
      let lastMilestoneSeq = -Infinity;
      for (const task of tasks) {
        const currentMilestoneSeq = task.milestone_blueprint_id 
          ? (generationModel.milestones.find(m => m.blueprint_id === task.milestone_blueprint_id)?.sequence || 0)
          : 999999; // Orphans last
        
        if (currentMilestoneSeq < lastMilestoneSeq) {
          throw new Error(`[Generator] Milestone dominance violated in ${label}: task "${task.name}" (M-seq ${currentMilestoneSeq}) appears after M-seq ${lastMilestoneSeq}`);
        }
        lastMilestoneSeq = currentMilestoneSeq;
      }
    };
    
    validateMilestoneDominance(logicalTasks, 'logicalTasks');
    console.log('[Generator] Milestone dominance validated for logical order');
    
    // ADDENDUM M2: Build task sequence map from logical order
    // This maps blueprint_id → sequence number for Odoo persistence
    // CRITICAL: Logical order (ASC) determines UI display via task.sequence field
    // Execution order (DESC) only affects API call order, NOT sequence values
    const taskSequenceMap = new Map();
    logicalTasks.forEach((task, index) => {
      taskSequenceMap.set(task.blueprint_id, index * 10); // 0, 10, 20, 30...
    });
    console.log(`[Generator] Task sequence map built from ${logicalTasks.length} tasks`);
    
    // ADDENDUM M2: Log execution order for verification
    console.log('[Generator] Execution order (ADDENDUM M2: DESC for Odoo UI correctness):');
    executionTasks.forEach((task, index) => {
      console.log(`  ${index + 1}. ${task.name}${task.parent_blueprint_id ? ' (subtask)' : ''}`);
    });
    
    // Helper function to build task data
    const buildTaskData = (task) => {
      const taskData = {
        name: task.name,
        project_id: projectId,
        stage_id: defaultStageId,
        sequence: taskSequenceMap.get(task.blueprint_id) ?? 0  // ADDENDUM M2: Persist logical order
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
      
      // Add user assignments if exist (Addendum J)
      if (task.user_ids && task.user_ids.length > 0) {
        taskData.user_ids = task.user_ids;
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
      
      return taskData;
    };
    
    // ADDENDUM M2: Linear execution with deferred subtasks
    // Process tasks in exact execution order, deferring subtasks whose parents don't exist yet
    const createdBlueprintIds = new Set();
    let pendingTasks = [...executionTasks];
    let passCount = 0;
    const maxPasses = 100; // Safety limit for infinite loop detection
    
    while (pendingTasks.length > 0) {
      passCount++;
      if (passCount > maxPasses) {
        throw new Error('[Generator] Infinite loop detected in task creation - possible circular parent-child relationship');
      }
      
      checkTimeout(); // ADDENDUM L: Check before each pass
      
      const deferredTasks = [];
      const tasksToCreateThisPass = [];
      
      // ADDENDUM M2: Partition tasks into ready vs deferred (preserving order)
      for (const task of pendingTasks) {
        if (task.parent_blueprint_id && !createdBlueprintIds.has(task.parent_blueprint_id)) {
          // Subtask whose parent hasn't been created yet - defer
          deferredTasks.push(task);
        } else {
          // Parent task OR subtask whose parent exists - ready to create
          tasksToCreateThisPass.push(task);
        }
      }
      
      // ADDENDUM M2: Safety check - ensure progress
      if (tasksToCreateThisPass.length === 0) {
        const orphanedSubtasks = deferredTasks.map(t => t.name).join(', ');
        throw new Error(`[Generator] Unresolvable parent-child ordering. Orphaned subtasks: ${orphanedSubtasks}`);
      }
      
      // ADDENDUM M2: Create all ready tasks (in order, respecting generation_order)
      console.log(`[Generator] Pass ${passCount}: Creating ${tasksToCreateThisPass.length} tasks`);
      
      for (const task of tasksToCreateThisPass) {
        const taskData = buildTaskData(task);
        
        // FORENSIC LOG: Task creation payload (ADDENDUM M2 debugging)
        const milestoneSeq = task.milestone_blueprint_id 
          ? (generationModel.milestones.find(m => m.blueprint_id === task.milestone_blueprint_id)?.sequence ?? 'UNDEFINED')
          : null;
        console.log(JSON.stringify({
          forensic: 'TASK_CREATE',
          blueprint_id: task.blueprint_id,
          name: task.name,
          sequence: taskData.sequence,
          milestone_id: task.milestone_blueprint_id,
          milestone_seq: milestoneSeq,
          parent_id: task.parent_blueprint_id,
          task_seq_blueprint: task.sequence
        }));
        
        const taskIds = await batchCreateTasks(env, [taskData]);
        const odooTaskId = taskIds[0];
        
        result.odoo_mappings.tasks[task.blueprint_id] = odooTaskId;
        createdBlueprintIds.add(task.blueprint_id);
        
        console.log(`[Generator] Task created: ${task.name} (ID: ${odooTaskId})`);
      }
      
      // ADDENDUM M2: Continue with deferred tasks
      pendingTasks = deferredTasks;
    }
    
    // STEP 7: Create dependencies (fail-soft)
    result.step = '7-create-dependencies';
    console.log('[Generator] Step 7: Creating dependencies (semantic logical order)');
    checkTimeout(); // ADDENDUM L
    
    // ADDENDUM M2: CRITICAL GUARD - Dependencies MUST use logical order
    // Execution order has ZERO semantic meaning and MUST NEVER be used here
    // This guard prevents catastrophic regression where execution order leaks into semantic steps
    if (!Object.isFrozen(logicalTasks)) {
      throw new Error('[Generator] CRITICAL: logicalTasks must be frozen before STEP 7');
    }
    
    // Validate that we're iterating over the correct (logical) ordering
    const iterationSource = logicalTasks; // Explicit: only logicalTasks allowed
    if (iterationSource === executionTasks) {
      throw new Error('[Generator] CRITICAL BUG: STEP 7 cannot use executionTasks - semantic violation');
    }
    
    let dependencySuccessCount = 0;
    let dependencyFailCount = 0;
    
    // CRITICAL: Use logicalTasks (ASC) for semantic dependency resolution
    // Execution order is ONLY for task creation, NEVER for dependencies
    for (const task of iterationSource) {
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
 * Addendum J: Maps stakeholders to Odoo users
 * 
 * @param {Object} blueprint - Validated blueprint
 * @param {string} templateName - Template name for project naming
 * @param {string} projectStartDate - Project start date (ISO YYYY-MM-DD) - Addendum G
 * @param {Object} stakeholderMapping - Stakeholder to user mapping - Addendum J
 * @returns {Object} Generation model
 */
export function buildGenerationModel(blueprint, templateName, projectStartDate = null, stakeholderMapping = null) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const projectName = `${templateName} (${timestamp})`;
  
  const model = {
    project: {
      name: projectName,
      description: blueprint.description || null,  // Template description
      project_start_date: projectStartDate,  // Addendum G: for date calculations
      date_start: null,  // Will be set to projectStartDate (Odoo field)
      date: null,  // Will be calculated from max task deadline (Odoo end date)
      user_id: stakeholderMapping?.project_responsible || null  // Addendum J: project responsible
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
        name: milestone.name,
        sequence: milestone.sequence || 0  // CRITICAL FIX: Preserve milestone ordering
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
          
          // J6: Subtasks inherit stakeholders from parent (Addendum J)
          if (parentBlueprint.stakeholder_ids && parentBlueprint.stakeholder_ids.length > 0) {
            task.stakeholder_ids = [...parentBlueprint.stakeholder_ids];
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
      
      // J3: Map stakeholder_ids to user_ids (Addendum J)
      let user_ids = [];
      if (stakeholderMapping && task.stakeholder_ids && task.stakeholder_ids.length > 0) {
        task.stakeholder_ids.forEach(stakeholderId => {
          const mappedUsers = stakeholderMapping.stakeholders[stakeholderId];
          if (mappedUsers && Array.isArray(mappedUsers)) {
            user_ids.push(...mappedUsers);
          }
        });
        // Remove duplicates
        user_ids = [...new Set(user_ids)];
      }
      
      // ADDENDUM M: Get milestone name for preview display
      let milestone_name = null;
      if (task.milestone_id) {
        const milestone = blueprint.milestones.find(m => m.id === task.milestone_id);
        if (milestone) {
          milestone_name = milestone.name;
        }
      }
      
      taskMap.set(task.id, {
        blueprint_id: task.id,
        name: task.name,
        sequence: task.sequence || 0,  // Store for logical ordering
        milestone_blueprint_id: task.milestone_id || null,
        milestone_name: milestone_name,  // ADDENDUM M: for preview display
        parent_blueprint_id: task.parent_id,
        color: task.color || null,
        tag_blueprint_ids: task.tag_ids || [],
        stakeholder_blueprint_ids: task.stakeholder_ids || [],  // Addendum J: for tracking
        user_ids: user_ids,  // Addendum J: mapped user IDs
        planned_date_begin: planned_date_begin,       // Addendum G+H: absolute start date (inherited or explicit)
        date_deadline: date_deadline,                  // Addendum G+H: absolute deadline (inherited or explicit)
        planned_hours: planned_hours,                  // Addendum G+H: estimated hours (inherited or explicit)
        dependencies: []
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
    
    // Convert taskMap to array
    model.tasks = Array.from(taskMap.values());
  }
  
  // Calculate project date_start and date (end date)
  if (projectStartDate) {
    model.project.date_start = projectStartDate;
    
    // Calculate max deadline from all tasks as project end date
    let maxDeadline = null;
    model.tasks.forEach(task => {
      if (task.date_deadline) {
        if (!maxDeadline || task.date_deadline > maxDeadline) {
          maxDeadline = task.date_deadline;
        }
      }
    });
    
    if (maxDeadline) {
      model.project.date = maxDeadline;
    }
  }
  
  return model;
}
