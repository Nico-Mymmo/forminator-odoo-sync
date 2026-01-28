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
 * 5. Create tags (milestones)
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
  createTag, 
  createTask, 
  addTaskDependencies 
} from './odoo-creator.js';

/**
 * Generate Odoo project from template blueprint
 * 
 * @param {Object} env - Cloudflare env
 * @param {string} templateId - Template UUID
 * @param {string} templateName - Template name
 * @returns {Promise<Object>} Generation result
 */
export async function generateProject(env, templateId, templateName) {
  const result = {
    success: false,
    step: null,
    odoo_project_id: null,
    odoo_project_url: null,
    error: null,
    odoo_mappings: {
      stages: {},
      tags: {},
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
    
    // STEP 2: Build canonical generation model
    result.step = '2-build-model';
    console.log('[Generator] Step 2: Building generation model');
    
    const generationModel = buildGenerationModel(blueprintData, templateName);
    
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
    
    // STEP 5: Create tags for milestones
    result.step = '5-create-tags';
    console.log('[Generator] Step 5: Creating milestone tags');
    
    const uniqueMilestones = [...new Set(
      generationModel.tasks
        .map(t => t.milestone_name)
        .filter(m => m !== null)
    )];
    
    for (const milestoneName of uniqueMilestones) {
      try {
        const tagId = await createTag(env, milestoneName);
        result.odoo_mappings.tags[milestoneName] = tagId;
        console.log(`[Generator] Tag created: ${milestoneName} (${tagId})`);
      } catch (err) {
        // Tags are optional, continue on failure
        console.warn(`[Generator] Tag creation failed for "${milestoneName}":`, err.message);
      }
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
      
      // Add milestone tag if exists
      if (task.milestone_name && result.odoo_mappings.tags[task.milestone_name]) {
        taskData.tag_ids = [result.odoo_mappings.tags[task.milestone_name]];
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
function buildGenerationModel(blueprint, templateName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const projectName = `${templateName} (${timestamp})`;
  
  const model = {
    project: {
      name: projectName,
      description: null
    },
    stages: [],
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
  
  // Build tasks with generation order
  if (blueprint.tasks && Array.isArray(blueprint.tasks)) {
    const taskMap = new Map();
    
    // First pass: create task entries
    blueprint.tasks.forEach(task => {
      const milestone = blueprint.milestones?.find(m => m.id === task.milestone_id);
      
      taskMap.set(task.id, {
        blueprint_id: task.id,
        name: task.name,
        milestone_name: milestone ? milestone.name : null,
        parent_blueprint_id: task.parent_id,
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
