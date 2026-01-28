/**
 * Project Generator - Blueprint Validation
 * 
 * Validates blueprint_data structure according to canonical schema.
 * 
 * RULES (NON-NEGOTIABLE):
 * - Subtasks are optional (tasks can exist standalone)
 * - Subtasks are tasks with parent_id !== null
 * - Dependencies cannot form cycles
 * - Dependencies cannot reference self
 * - Parent tasks must exist before subtasks reference them
 * - IDs are UUIDs
 * 
 * Returns:
 * {
 *   valid: boolean,
 *   errors: Array<string>,    // Block save
 *   warnings: Array<string>   // Show but allow save
 * }
 */

/**
 * Validate complete blueprint structure
 * 
 * @param {Object} blueprint - Blueprint data object
 * @returns {Object} Validation result with errors and warnings
 */
export function validateBlueprint(blueprint) {
  const result = {
    valid: true,
    errors: [],
    warnings: []
  };
  
  // Basic structure check
  if (!blueprint || typeof blueprint !== 'object') {
    result.errors.push('Blueprint must be an object');
    result.valid = false;
    return result;
  }
  
  const stages = blueprint.stages || [];
  const milestones = blueprint.milestones || [];
  const tasks = blueprint.tasks || [];
  const dependencies = blueprint.dependencies || [];
  
  // Validate stages
  validateStages(stages, result);
  
  // Validate milestones
  validateMilestones(milestones, result);
  
  // Validate tasks
  validateTasks(tasks, result);
  
  // Validate dependencies
  validateDependencies(dependencies, tasks, result);
  
  // Cross-entity validation
  validateTaskSubtasks(tasks, result);
  validateMilestoneUsage(milestones, tasks, result);
  validateStageUsage(stages, tasks, result);
  
  // Set overall validity
  result.valid = result.errors.length === 0;
  
  return result;
}

/**
 * Validate stages array
 */
function validateStages(stages, result) {
  if (!Array.isArray(stages)) {
    result.errors.push('Stages must be an array');
    return;
  }
  
  const seenIds = new Set();
  const seenSequences = new Set();
  
  stages.forEach((stage, index) => {
    if (!stage.id) {
      result.errors.push(`Stage at index ${index} missing id`);
    } else if (seenIds.has(stage.id)) {
      result.errors.push(`Duplicate stage id: ${stage.id}`);
    } else {
      seenIds.add(stage.id);
    }
    
    if (!stage.name || stage.name.trim().length === 0) {
      result.errors.push(`Stage at index ${index} missing name`);
    }
    
    if (typeof stage.sequence !== 'number') {
      result.errors.push(`Stage "${stage.name || index}" missing sequence`);
    } else if (seenSequences.has(stage.sequence)) {
      result.errors.push(`Duplicate stage sequence: ${stage.sequence}`);
    } else {
      seenSequences.add(stage.sequence);
    }
  });
}

/**
 * Validate milestones array
 */
function validateMilestones(milestones, result) {
  if (!Array.isArray(milestones)) {
    result.errors.push('Milestones must be an array');
    return;
  }
  
  const seenIds = new Set();
  
  milestones.forEach((milestone, index) => {
    if (!milestone.id) {
      result.errors.push(`Milestone at index ${index} missing id`);
    } else if (seenIds.has(milestone.id)) {
      result.errors.push(`Duplicate milestone id: ${milestone.id}`);
    } else {
      seenIds.add(milestone.id);
    }
    
    if (!milestone.name || milestone.name.trim().length === 0) {
      result.errors.push(`Milestone at index ${index} missing name`);
    }
  });
}

/**
 * Validate tasks array
 */
function validateTasks(tasks, result) {
  if (!Array.isArray(tasks)) {
    result.errors.push('Tasks must be an array');
    return;
  }
  
  const seenIds = new Set();
  
  tasks.forEach((task, index) => {
    if (!task.id) {
      result.errors.push(`Task at index ${index} missing id`);
    } else if (seenIds.has(task.id)) {
      result.errors.push(`Duplicate task id: ${task.id}`);
    } else {
      seenIds.add(task.id);
    }
    
    if (!task.name || task.name.trim().length === 0) {
      result.errors.push(`Task at index ${index} missing name`);
    }
    
    // Validate parent_id reference exists (if not null)
    if (task.parent_id !== null && task.parent_id !== undefined) {
      const parentExists = tasks.some(t => t.id === task.parent_id);
      if (!parentExists) {
        result.errors.push(`Task "${task.name || index}" has non-existent parent: ${task.parent_id}`);
      }
    }
  });
}

/**
 * Validate dependencies array
 */
function validateDependencies(dependencies, tasks, result) {
  if (!Array.isArray(dependencies)) {
    result.errors.push('Dependencies must be an array');
    return;
  }
  
  const taskIds = new Set(tasks.map(t => t.id));
  const dependencyGraph = new Map(); // task_id -> [depends_on_task_ids]
  
  dependencies.forEach((dep, index) => {
    if (!dep.task_id) {
      result.errors.push(`Dependency at index ${index} missing task_id`);
      return;
    }
    
    if (!dep.depends_on_task_id) {
      result.errors.push(`Dependency at index ${index} missing depends_on_task_id`);
      return;
    }
    
    // Check if tasks exist
    if (!taskIds.has(dep.task_id)) {
      result.errors.push(`Dependency references non-existent task: ${dep.task_id}`);
    }
    
    if (!taskIds.has(dep.depends_on_task_id)) {
      result.errors.push(`Dependency references non-existent dependency target: ${dep.depends_on_task_id}`);
    }
    
    // Check self-reference
    if (dep.task_id === dep.depends_on_task_id) {
      result.errors.push(`Task cannot depend on itself: ${dep.task_id}`);
    }
    
    // Build graph for cycle detection
    if (!dependencyGraph.has(dep.task_id)) {
      dependencyGraph.set(dep.task_id, []);
    }
    dependencyGraph.get(dep.task_id).push(dep.depends_on_task_id);
  });
  
  // Detect circular dependencies
  detectCycles(dependencyGraph, result);
}

/**
 * Detect circular dependencies using DFS
 */
function detectCycles(graph, result) {
  const visited = new Set();
  const recursionStack = new Set();
  const cycleFound = { value: false };
  
  function dfs(node, path) {
    if (cycleFound.value) return;
    
    visited.add(node);
    recursionStack.add(node);
    path.push(node);
    
    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, path);
      } else if (recursionStack.has(neighbor)) {
        // Cycle detected
        const cycleStart = path.indexOf(neighbor);
        const cycle = path.slice(cycleStart).concat(neighbor);
        result.errors.push(`Circular dependency detected: ${cycle.join(' → ')}`);
        cycleFound.value = true;
        return;
      }
    }
    
    path.pop();
    recursionStack.delete(node);
  }
  
  // Check all nodes
  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }
}

/**
 * Validate task-subtask relationships
 * NOTE: Subtasks are optional (Addendum A - 2026-01-28)
 * Tasks can exist standalone without subtasks
 */
function validateTaskSubtasks(tasks, result) {
  // No validation needed - subtasks are optional
  // This function remains for future validation if needed
}

/**
 * Warn if milestones have no tasks assigned
 */
function validateMilestoneUsage(milestones, tasks, result) {
  milestones.forEach(milestone => {
    const hasTasksAssigned = tasks.some(t => t.milestone_id === milestone.id);
    if (!hasTasksAssigned) {
      result.warnings.push(`Milestone "${milestone.name}" has no tasks assigned`);
    }
  });
}

/**
 * Warn if stages have no tasks
 * NOTE: stages are not directly linked to tasks in the canonical schema,
 * so this is informational only
 */
function validateStageUsage(stages, tasks, result) {
  // Stages don't have direct task assignment in canonical schema
  // This is a placeholder for future extension if needed
  if (stages.length > 0 && tasks.length === 0) {
    result.warnings.push('Stages defined but no tasks exist');
  }
}

/**
 * Warn if tasks have no milestone assigned
 */
export function warnUnassignedTasks(tasks, result) {
  const unassignedTasks = tasks.filter(t => !t.milestone_id && !t.parent_id);
  if (unassignedTasks.length > 0) {
    unassignedTasks.forEach(task => {
      result.warnings.push(`Task "${task.name}" has no milestone assigned`);
    });
  }
}
