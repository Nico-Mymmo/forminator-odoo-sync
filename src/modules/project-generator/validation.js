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
  const tags = blueprint.tags || [];
  const stakeholders = blueprint.stakeholders || []; // Addendum J
  const tasks = blueprint.tasks || [];
  const dependencies = blueprint.dependencies || [];
  
  // Validate stages
  validateStages(stages, result);
  
  // Validate milestones
  validateMilestones(milestones, result);
  
  // Validate milestone timings (Addendum H)
  validateMilestoneTimings(milestones, result);
  
  // Validate tags (Addendum F)
  validateTags(tags, result);
  
  // Validate stakeholders (Addendum J)
  validateStakeholders(stakeholders, result);
  
  // Validate tasks
  validateTasks(tasks, result);
  
  // Validate task colors (Addendum F)
  validateTaskColors(tasks, result);
  
  // Validate task tag references (Addendum F)
  validateTaskTagReferences(tasks, tags, result);
  
  // Validate task stakeholder references (Addendum J)
  validateTaskStakeholderReferences(tasks, stakeholders, result);
  
  // Validate task timings (Addendum G)
  validateTaskTimings(tasks, result);
  
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
  let doneStageCount = 0;
  let cancelledStageCount = 0;
  
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
    
    // Addendum O: Stage semantics validation
    if (stage.is_done_stage) doneStageCount++;
    if (stage.is_cancelled_stage) cancelledStageCount++;
  });
  
  // Addendum O: Enforce exactly one Done and one Cancelled stage
  if (doneStageCount === 0) {
    result.errors.push('Blueprint must have exactly one Done stage. Mark one stage as Done in the stage editor.');
  } else if (doneStageCount > 1) {
    result.errors.push('Blueprint has multiple Done stages. Only one stage can be marked as Done.');
  }
  
  if (cancelledStageCount === 0) {
    result.errors.push('Blueprint must have exactly one Cancelled stage. Mark one stage as Cancelled in the stage editor.');
  } else if (cancelledStageCount > 1) {
    result.errors.push('Blueprint has multiple Cancelled stages. Only one stage can be marked as Cancelled.');
  }
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
 * Validate milestone timing fields (Addendum H)
 * All timing fields are optional, but must be valid when present
 */
function validateMilestoneTimings(milestones, result) {
  milestones.forEach((milestone, index) => {
    const milestoneName = milestone.name || `index ${index}`;
    
    // Validate deadline_offset_days
    if (milestone.deadline_offset_days !== null && milestone.deadline_offset_days !== undefined) {
      if (typeof milestone.deadline_offset_days !== 'number') {
        result.errors.push(`Milestone "${milestoneName}" has non-numeric deadline_offset_days: ${milestone.deadline_offset_days}`);
      } else if (!Number.isInteger(milestone.deadline_offset_days)) {
        result.errors.push(`Milestone "${milestoneName}" deadline_offset_days must be integer, got: ${milestone.deadline_offset_days}`);
      } else if (milestone.deadline_offset_days < 0) {
        result.errors.push(`Milestone "${milestoneName}" deadline_offset_days cannot be negative: ${milestone.deadline_offset_days}`);
      }
    }
    
    // Validate duration_days
    if (milestone.duration_days !== null && milestone.duration_days !== undefined) {
      if (typeof milestone.duration_days !== 'number') {
        result.errors.push(`Milestone "${milestoneName}" has non-numeric duration_days: ${milestone.duration_days}`);
      } else if (!Number.isInteger(milestone.duration_days)) {
        result.errors.push(`Milestone "${milestoneName}" duration_days must be integer, got: ${milestone.duration_days}`);
      } else if (milestone.duration_days < 0) {
        result.errors.push(`Milestone "${milestoneName}" duration_days cannot be negative: ${milestone.duration_days}`);
      } else if (milestone.duration_days > 0 && !milestone.deadline_offset_days) {
        result.warnings.push(`Milestone "${milestoneName}" has duration but no deadline (start date cannot be calculated)`);
      }
    }
  });
}

/**
 * Validate tags array (Addendum F)
 */
function validateTags(tags, result) {
  if (!Array.isArray(tags)) {
    result.errors.push('Tags must be an array');
    return;
  }
  
  const seenIds = new Set();
  
  tags.forEach((tag, index) => {
    if (!tag.id) {
      result.errors.push(`Tag at index ${index} missing id`);
    } else if (seenIds.has(tag.id)) {
      result.errors.push(`Duplicate tag id: ${tag.id}`);
    } else {
      seenIds.add(tag.id);
    }
    
    if (!tag.name || tag.name.trim().length === 0) {
      result.errors.push(`Tag at index ${index} missing name`);
    }
  });
}

/**
 * Validate stakeholders array (Addendum J)
 */
function validateStakeholders(stakeholders, result) {
  if (!Array.isArray(stakeholders)) {
    result.errors.push('Stakeholders must be an array');
    return;
  }
  
  const seenIds = new Set();
  const seenNames = new Set();
  
  stakeholders.forEach((stakeholder, index) => {
    if (!stakeholder.id) {
      result.errors.push(`Stakeholder at index ${index} missing id`);
    } else if (seenIds.has(stakeholder.id)) {
      result.errors.push(`Duplicate stakeholder id: ${stakeholder.id}`);
    } else {
      seenIds.add(stakeholder.id);
    }
    
    if (!stakeholder.name || stakeholder.name.trim().length === 0) {
      result.errors.push(`Stakeholder at index ${index} missing name`);
    } else {
      const lowerName = stakeholder.name.trim().toLowerCase();
      if (seenNames.has(lowerName)) {
        result.warnings.push(`Duplicate stakeholder name: ${stakeholder.name}`);
      } else {
        seenNames.add(lowerName);
      }
    }
    
    // Description is optional, no validation needed
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

/**
 * Validate task color values (Addendum F)
 * Odoo uses integer colors 1-11 (0 = no color)
 */
function validateTaskColors(tasks, result) {
  tasks.forEach((task, index) => {
    if (task.color !== null && task.color !== undefined) {
      if (typeof task.color !== 'number') {
        result.errors.push(`Task "${task.name || index}" has non-numeric color: ${task.color}`);
      } else if (!Number.isInteger(task.color)) {
        result.errors.push(`Task "${task.name || index}" color must be integer, got: ${task.color}`);
      } else if (task.color < 0 || task.color > 11) {
        result.errors.push(`Task "${task.name || index}" color out of range (0-11): ${task.color}`);
      }
    }
  });
}

/**
 * Validate task tag references (Addendum F)
 */
function validateTaskTagReferences(tasks, tags, result) {
  const tagIds = new Set(tags.map(t => t.id));
  
  tasks.forEach((task, index) => {
    if (task.tag_ids && Array.isArray(task.tag_ids)) {
      task.tag_ids.forEach(tagId => {
        if (!tagIds.has(tagId)) {
          result.errors.push(`Task "${task.name || index}" references non-existent tag: ${tagId}`);
        }
      });
    }
  });
}

/**
 * Validate task stakeholder references (Addendum J)
 */
function validateTaskStakeholderReferences(tasks, stakeholders, result) {
  const stakeholderIds = new Set(stakeholders.map(s => s.id));
  
  tasks.forEach((task, index) => {
    if (task.stakeholder_ids && Array.isArray(task.stakeholder_ids)) {
      task.stakeholder_ids.forEach(stakeholderId => {
        if (!stakeholderIds.has(stakeholderId)) {
          result.errors.push(`Task "${task.name || index}" references non-existent stakeholder: ${stakeholderId}`);
        }
      });
    }
  });
}

/**
 * Validate task timing fields (Addendum G)
 * All timing fields are optional, but must be valid when present
 */
function validateTaskTimings(tasks, result) {
  tasks.forEach((task, index) => {
    const taskName = task.name || `index ${index}`;
    
    // Validate deadline_offset_days
    if (task.deadline_offset_days !== null && task.deadline_offset_days !== undefined) {
      if (typeof task.deadline_offset_days !== 'number') {
        result.errors.push(`Task "${taskName}" has non-numeric deadline_offset_days: ${task.deadline_offset_days}`);
      } else if (!Number.isInteger(task.deadline_offset_days)) {
        result.errors.push(`Task "${taskName}" deadline_offset_days must be integer, got: ${task.deadline_offset_days}`);
      } else if (task.deadline_offset_days < 0) {
        result.errors.push(`Task "${taskName}" deadline_offset_days cannot be negative: ${task.deadline_offset_days}`);
      }
    }
    
    // Validate duration_days
    if (task.duration_days !== null && task.duration_days !== undefined) {
      if (typeof task.duration_days !== 'number') {
        result.errors.push(`Task "${taskName}" has non-numeric duration_days: ${task.duration_days}`);
      } else if (!Number.isInteger(task.duration_days)) {
        result.errors.push(`Task "${taskName}" duration_days must be integer, got: ${task.duration_days}`);
      } else if (task.duration_days < 0) {
        result.errors.push(`Task "${taskName}" duration_days cannot be negative: ${task.duration_days}`);
      } else if (task.duration_days > 0 && !task.deadline_offset_days) {
        result.warnings.push(`Task "${taskName}" has duration but no deadline (start date cannot be calculated)`);
      }
    }
    
    // Validate planned_hours
    if (task.planned_hours !== null && task.planned_hours !== undefined) {
      if (typeof task.planned_hours !== 'number') {
        result.errors.push(`Task "${taskName}" has non-numeric planned_hours: ${task.planned_hours}`);
      } else if (task.planned_hours < 0) {
        result.errors.push(`Task "${taskName}" planned_hours cannot be negative: ${task.planned_hours}`);
      }
    }
  });
}
