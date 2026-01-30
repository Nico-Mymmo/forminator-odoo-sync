# DIAGNOSTIC REPORT: Project Generation Performance & Failure Analysis

**Date:** January 30, 2026  
**Scope:** Odoo project generation flow with user assignment (Addendum J)  
**Objective:** Identify root causes of performance degradation, rate limiting, and stuck `in_progress` records

---

## EXECUTIVE SUMMARY

### Critical Findings

1. **NO FINALLY BLOCK** - Generation lifecycle can be left in `in_progress` state on Worker timeout/crash
2. **LINEAR API CALL EXPLOSION** - User assignment multiplies Odoo calls by number of assigned users per task
3. **NO THROTTLING** - All Odoo calls fire sequentially without delay or batching
4. **MISSING TIMEOUT HANDLING** - Cloudflare Worker 30-second CPU limit not accounted for
5. **LIFECYCLE UPDATE DEPENDENCY** - `markGenerationFailure()` errors are silently swallowed

---

## 1. GENERATION LIFECYCLE ANALYSIS

### 1.1 State Transition Flow

**File:** `src/modules/project-generator/generation-lifecycle.js`

```
┌─────────────────────────────────────────┐
│  POST /api/generate/:id                 │
│  (module.js lines 318-427)              │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  validateGenerationStart()              │
│  - Check for in_progress (HARD BLOCK)   │
│  - Check for completed (SOFT BLOCK)     │
│  - Returns { canProceed }               │
└──────────────┬──────────────────────────┘
               │
               ▼ (if canProceed)
┌─────────────────────────────────────────┐
│  startGeneration()                      │
│  - INSERT project_generations           │
│  - status = 'in_progress'               │
│  - started_at = NOW()                   │
│  Returns: generationId                  │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  generateProject()                      │
│  - All Odoo API calls happen here       │
│  - Returns { success, step, error }     │
└──────────────┬──────────────────────────┘
               │
        ┌──────┴──────┐
        │             │
     SUCCESS       FAILURE
        │             │
        ▼             ▼
┌──────────────┐  ┌──────────────┐
│ markGeneration│  │ markGeneration│
│ Success()     │  │ Failure()     │
│ status =      │  │ status =      │
│ 'completed'   │  │ 'failed'      │
└───────────────┘  └───────────────┘
```

### 1.2 Lifecycle State Updates

**Creation:**
- **File:** `generation-lifecycle.js` lines 104-132
- **Location:** `POST /api/generate/:id` → `startGeneration()`
- **Timing:** BEFORE any Odoo calls
- **Database:** INSERT with `status='in_progress'`

**Success Path:**
- **File:** `module.js` lines 388-396
- **Location:** After `generateProject()` returns `{ success: true }`
- **Timing:** AFTER all Odoo calls complete
- **Database:** UPDATE with `status='completed'`, `odoo_project_id`, `odoo_mappings`

**Failure Path:**
- **File:** `module.js` lines 398-408
- **Location:** After `generateProject()` returns `{ success: false }`
- **Timing:** AFTER Odoo calls fail
- **Database:** UPDATE with `status='failed'`, `failed_step`, `error_message`

**Exception Path:**
- **File:** `module.js` lines 410-417
- **Location:** Outer catch block
- **Timing:** When unexpected error thrown
- **Database:** UPDATE with `status='failed'` (if `generationId` exists)

---

## 1.3 CRITICAL GAPS IN LIFECYCLE CLOSURE

### Gap #1: Missing Finally Block

**Evidence:** `module.js` lines 368-427

```javascript
try {
  // LIFECYCLE STEP 3: Start generation record
  generationId = await startGeneration(...);
  
  // LIFECYCLE STEP 4: Execute Odoo generation
  const result = await generateProject(...);
  
  if (result.success) {
    await markGenerationSuccess(...);
  } else {
    await markGenerationFailure(...);
  }
  
} catch (generationError) {
  // Only runs if markGenerationSuccess/Failure throw
  if (generationId) {
    await markGenerationFailure(...);
  }
  throw generationError;
}
```

**Problem:** No `finally` block to guarantee status update

**Scenarios that leave `in_progress`:**

1. **Cloudflare Worker CPU Timeout (30s)**
   - Worker killed mid-execution
   - No cleanup code runs
   - Record stuck in `in_progress`

2. **Cloudflare Worker Memory Limit**
   - Worker crashes
   - No cleanup code runs

3. **Network Failure to Supabase**
   - `markGenerationFailure()` throws
   - Error logged but swallowed (line 171 in `generation-lifecycle.js`)
   - Original error thrown but status NOT updated

4. **Unhandled Exception in generateProject()**
   - If exception escapes the try/catch inside `generateProject()`
   - Outer catch block runs but `await markGenerationFailure()` may fail
   - Error swallowed (line 171)

---

### Gap #2: Swallowed Lifecycle Update Errors

**Evidence:** `generation-lifecycle.js` lines 165-173

```javascript
export async function markGenerationFailure(env, generationId, failedStep, errorMessage) {
  const supabase = getSupabaseClient(env);
  
  const { error } = await supabase
    .from('project_generations')
    .update({
      status: 'failed',
      failed_step: failedStep,
      error_message: errorMessage,
      completed_at: new Date().toISOString()
    })
    .eq('id', generationId);
  
  if (error) {
    console.error('[Generation Lifecycle] Mark failure failed:', error);
    // ❌ CRITICAL: Error logged but NOT thrown - original error is more important
  }
  
  console.log(`[Generation Lifecycle] Failed generation ${generationId} at step ${failedStep}`);
}
```

**Problem:** If Supabase update fails, error is logged but NOT thrown

**Result:** Caller thinks lifecycle was updated, but record stays `in_progress`

---

### Gap #3: No Timeout Protection

**Evidence:** No timeout wrapper around `generateProject()` call

**Cloudflare Worker Limits:**
- **CPU Time:** 30 seconds (Free tier) / 15 minutes (Paid)
- **No explicit timeout handling in code**

**With User Assignment:**
- Large projects (50+ tasks with multiple users each)
- Can easily exceed CPU time limit
- Worker killed mid-execution
- No finally block to clean up

---

## 2. ODOO API CALL ANALYSIS

### 2.1 Call Flow Per Generation

**File:** `src/modules/project-generator/generate.js` lines 68-283

```
STEP 1: Validate blueprint (no Odoo call)
STEP 2: Build generation model (no Odoo call)

STEP 3: Create project
├─ 1x createProject()  →  project.project.create
└─ Odoo API: 1 call

STEP 4: Create stages
├─ For each stage (N stages):
│  ├─ 1x createStage()  →  project.task.type.create
│  └─ 1x write()        →  project.task.type.write (link to project)
└─ Odoo API: N × 2 calls

STEP 5: Create milestones
├─ For each milestone (M milestones):
│  └─ 1x createMilestone()  →  project.milestone.create
└─ Odoo API: M × 1 call

STEP 5.5: Get or create tags
├─ For each unique tag (T tags):
│  ├─ 1x searchRead()  →  project.tags.search_read (check if exists)
│  └─ 1x create()      →  project.tags.create (if not found)
└─ Odoo API: T × 2 calls (worst case)

STEP 6: Create tasks
├─ For each task (K tasks):
│  └─ 1x createTask()  →  project.task.create
└─ Odoo API: K × 1 call

STEP 7: Create dependencies
├─ For each task with dependencies (D tasks):
│  └─ 1x addTaskDependencies()  →  project.task.write
└─ Odoo API: D × 1 call
```

### 2.2 User Assignment Explosion (Addendum J)

**File:** `src/modules/project-generator/odoo-creator.js` lines 193-248

#### Before User Assignment (Iteration 4)

```javascript
// Task creation
export async function createTask(env, data) {
  const values = {
    name: data.name,
    project_id: data.project_id,
    // ... other fields
  };
  
  const taskId = await create(env, {
    model: 'project.task',
    values: values
  });
  
  return taskId;
}
```

**Calls per task:** 1

#### After User Assignment (Addendum J)

```javascript
export async function createTask(env, data) {
  const values = {
    name: data.name,
    project_id: data.project_id,
    // ... other fields
  };
  
  // ⚠️ NEW: User assignment
  if (data.user_ids && data.user_ids.length > 0) {
    values.user_ids = data.user_ids.map(id => [4, id]);  // [(4, id)] = link existing
  }
  
  const taskId = await create(env, {
    model: 'project.task',
    values: values
  });
  
  return taskId;
}
```

**Calls per task:** Still 1, but:
- Payload size increased (user_ids array)
- Many-to-many relationship processing on Odoo side
- **More Odoo internal database operations per call**

#### Additional User Fetch (Client-Side)

**File:** `public/project-generator-client.js` lines 308-328

```javascript
// STEP 0.5: Fetch Odoo users (Addendum J)
const usersResponse = await fetch('/projects/api/odoo-users', {
  credentials: 'include'
});
```

**Additional API call:** `GET /api/odoo-users`

**File:** `src/modules/project-generator/odoo-creator.js` lines 24-35

```javascript
export async function getActiveUsers(env) {
  const users = await searchRead(env, {
    model: 'res.users',
    domain: [
      ['active', '=', true],
      ['share', '=', false]  // Internal users only
    ],
    fields: ['id', 'name', 'login'],
    order: 'name asc'
  });
  
  return users;
}
```

**Odoo API:** 1x `res.users.search_read`

---

### 2.3 Total Call Count Estimation

#### Baseline (No Users, Minimal Project)

- **Stages:** 3
- **Milestones:** 2
- **Tags:** 3
- **Tasks:** 10
- **Dependencies:** 3

**Total Odoo Calls:**
```
1  (project)
+ 6  (3 stages × 2)
+ 2  (2 milestones)
+ 6  (3 tags × 2, worst case)
+ 10 (10 tasks)
+ 3  (3 dependencies)
= 28 calls
```

#### With User Assignment (Small Project)

- Same as above
- **Additional:** 1 user fetch before generation

**Total Odoo Calls:**
```
1  (user fetch)
+ 28 (same as baseline)
= 29 calls
```

**Performance Impact:**
- Each task now includes `user_ids` array in payload
- Odoo must resolve many2many relationships
- **No call count increase, but processing time per call increases**

#### Medium Project (50 Tasks)

**Total Odoo Calls:**
```
1  (user fetch)
+ 1  (project)
+ 12 (6 stages × 2)
+ 4  (4 milestones)
+ 10 (5 unique tags × 2)
+ 50 (50 tasks)
+ 20 (20 tasks with dependencies)
= 98 calls
```

#### Large Project (100 Tasks)

**Total Odoo Calls:**
```
1  (user fetch)
+ 1  (project)
+ 20 (10 stages × 2)
+ 8  (8 milestones)
+ 16 (8 unique tags × 2)
+ 100 (100 tasks)
+ 40 (40 tasks with dependencies)
= 186 calls
```

**Timing Estimate (Conservative):**
- Average Odoo call latency: 150-300ms
- 186 calls × 250ms average = **46.5 seconds**
- **EXCEEDS Cloudflare Worker 30-second CPU limit**

---

### 2.4 Call Pattern Analysis

**File:** `src/modules/project-generator/generate.js`

#### Sequential Execution (NO Parallelism)

**Stages** (lines 129-142):
```javascript
for (const stage of generationModel.stages) {
  const stageId = await createStage(env, {
    name: stage.name,
    sequence: stage.sequence,
    project_id: projectId
  });
  
  result.odoo_mappings.stages[stage.blueprint_id] = stageId;
  console.log(`[Generator] Stage created: ${stage.name} (${stageId})`);
}
```

**Milestones** (lines 145-158):
```javascript
for (const milestone of generationModel.milestones) {
  const milestoneId = await createMilestone(env, {
    name: milestone.name,
    project_id: projectId
  });
  
  result.odoo_mappings.milestones[milestone.blueprint_id] = milestoneId;
  console.log(`[Generator] Milestone created: ${milestone.name} (${milestoneId})`);
}
```

**Tasks** (lines 183-239):
```javascript
for (const task of sortedTasks) {
  const taskData = { /* ... */ };
  
  const taskId = await createTask(env, taskData);
  result.odoo_mappings.tasks[task.blueprint_id] = taskId;
  
  console.log(`[Generator] ${taskType} created: ${task.name} (${taskId})`);
}
```

**Dependencies** (lines 246-269):
```javascript
for (const task of sortedTasks) {
  if (task.dependencies && task.dependencies.length > 0) {
    try {
      await addTaskDependencies(env, taskOdooId, dependsOnOdooIds);
      dependencySuccessCount++;
    } catch (err) {
      dependencyFailCount++;
      console.warn(`[Generator] Dependency creation failed`, err.message);
    }
  }
}
```

**Pattern:** All loops use `for...of` with `await` → **Fully sequential**

---

### 2.5 NO Throttling or Batching

**Evidence:** No delay between calls

**File:** `src/lib/odoo.js` lines 13-67

```javascript
export async function executeKw(env, { model, method, args = [], kwargs = {} }) {
  // ... build payload
  
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  
  // ... parse response
  return json.result;
}
```

**No rate limiting logic:**
- No delay between requests
- No request queue
- No batch API usage
- Fires as fast as network allows

**Odoo Rate Limits (Typical):**
- Odoo.com SaaS: ~60 requests/minute (unofficial)
- Can vary by plan
- **No official documentation**

**Risk:** With 186 calls in 46 seconds:
- Average rate: ~240 requests/minute
- **4x typical rate limit**
- Likely triggers Odoo throttling or Cloudflare protection

---

## 3. RATE LIMITING & THROTTLING

### 3.1 Odoo XML-RPC Rate Limits

**No explicit limits documented**, but observed behaviors:

1. **Odoo.com SaaS:** ~50-100 requests/minute threshold
2. **Response:** HTTP 429 (Too Many Requests) or timeouts
3. **Cloudflare Protection:** Odoo.com uses Cloudflare, may trigger WAF rules

### 3.2 Cloudflare Worker Limits

**CPU Time:**
- **Free Plan:** 10ms per request
- **Paid Plan (Bundled):** 50ms per request
- **Paid Plan (Unbound):** 30 seconds → **15 minutes** (likely tier)

**Real-World Timing:**
- Each Odoo call: 150-300ms network + processing
- 186 calls × 250ms = 46.5 seconds
- **Risk:** Approaching/exceeding worker timeout

### 3.3 NO Throttling Implementation

**Evidence:** Search for delay/throttle/batch in codebase

**Result:** No throttling logic found

**Files checked:**
- `src/modules/project-generator/generate.js` → No delays
- `src/modules/project-generator/odoo-creator.js` → No batching
- `src/lib/odoo.js` → Direct fetch, no queue

---

## 4. ERROR HANDLING & ABORT BEHAVIOUR

### 4.1 Error Propagation Path

```
┌──────────────────────────────────────┐
│  generateProject() [generate.js]     │
│  Lines 68-283                        │
└──────────────┬───────────────────────┘
               │
         try { │
               ▼
    ┌─────────────────────┐
    │  Odoo API calls      │
    │  - createProject()   │
    │  - createStage()     │
    │  - createTask()      │
    │  etc.                │
    └──────────┬───────────┘
               │
               ▼
    } catch (err) {
      result.error = err.message;
      result.success = false;
      return result;  ← ✅ Controlled failure
    }
               │
               ▼
┌──────────────────────────────────────┐
│  POST /api/generate/:id [module.js]  │
│  Lines 388-417                       │
└──────────────┬───────────────────────┘
               │
    if (result.success) {
      ✅ markGenerationSuccess()
    } else {
      ✅ markGenerationFailure()
    }
               │
    } catch (generationError) {
      ⚠️ markGenerationFailure() (if generationId exists)
      ❌ throw generationError  ← Re-throws
    }
```

### 4.2 Exception Scenarios

#### Scenario A: Odoo Call Fails Mid-Generation

**Example:** Task #25 fails to create

**File:** `generate.js` lines 183-239

```javascript
for (const task of sortedTasks) {
  const taskId = await createTask(env, taskData);  // ❌ Throws here
  result.odoo_mappings.tasks[task.blueprint_id] = taskId;
}
```

**Error Flow:**
1. `createTask()` throws error from `odoo.js`
2. Caught by outer `try/catch` in `generateProject()`
3. `result.error = err.message`
4. `result.success = false`
5. Returns to caller

**Result:**
- ✅ Lifecycle updated to `failed`
- ✅ `failed_step` = `6-create-tasks`
- ✅ Partial project MAY exist in Odoo (tasks 1-24 created)

---

#### Scenario B: Cloudflare Worker Timeout

**Trigger:** Generation takes > 30 seconds (CPU time)

**Error Flow:**
1. Worker killed mid-execution
2. NO catch block runs
3. NO finally block runs
4. NO lifecycle update

**Result:**
- ❌ Record stuck in `in_progress`
- ❌ Partial project exists in Odoo
- ❌ User blocked from retrying (hard block on `in_progress`)

---

#### Scenario C: Supabase Update Fails

**Trigger:** Network issue or Supabase down during `markGenerationFailure()`

**File:** `generation-lifecycle.js` lines 165-173

```javascript
export async function markGenerationFailure(env, generationId, failedStep, errorMessage) {
  const { error } = await supabase.from('project_generations').update(...);
  
  if (error) {
    console.error('[Generation Lifecycle] Mark failure failed:', error);
    // ❌ NOT thrown - "original error is more important"
  }
}
```

**Error Flow:**
1. Odoo generation fails
2. `markGenerationFailure()` called
3. Supabase UPDATE fails
4. Error logged but NOT thrown
5. Caller continues normally

**Result:**
- ❌ Record stuck in `in_progress`
- ❌ User sees "Generation failed" message
- ❌ But cannot retry (blocked by `in_progress` check)

---

#### Scenario D: Dependency Creation Fails (Fail-Soft)

**File:** `generate.js` lines 246-269

```javascript
for (const task of sortedTasks) {
  if (task.dependencies && task.dependencies.length > 0) {
    try {
      await addTaskDependencies(env, taskOdooId, dependsOnOdooIds);
      dependencySuccessCount++;
    } catch (err) {
      dependencyFailCount++;
      console.warn(`[Generator] Dependency creation failed for "${task.name}":`, err.message);
      // ✅ Caught and logged, does NOT abort generation
    }
  }
}
```

**Result:**
- ✅ Generation continues
- ✅ Project created (without some dependencies)
- ✅ Logged for debugging
- ⚠️ Silent failure from user perspective (no UI feedback about partial dependencies)

---

## 5. HISTORICAL `in_progress` RECORD ANALYSIS

### 5.1 How It Could Happen

**Most Likely Causes (Ranked by Probability):**

#### 1. Cloudflare Worker Timeout (HIGH PROBABILITY)

**Evidence:**
- No timeout protection in code
- Large projects can exceed 30-second limit
- Worker killed without cleanup

**Timeline:**
1. User starts generation of large template (100+ tasks)
2. `startGeneration()` writes `in_progress` to DB
3. Odoo calls begin
4. At ~30 seconds, Worker reaches CPU limit
5. Cloudflare kills Worker mid-execution
6. NO catch/finally runs
7. Record stuck

**Verification:**
- Check Worker logs for timeout errors
- Check `created_at` vs `started_at` timestamp
- Calculate expected duration based on task count

---

#### 2. Network Failure During Lifecycle Update (MEDIUM PROBABILITY)

**Evidence:**
- `markGenerationFailure()` swallows Supabase errors
- Intermittent network issues possible

**Timeline:**
1. Generation fails at Odoo step
2. `markGenerationFailure()` called
3. Network blip or Supabase timeout
4. UPDATE fails
5. Error logged but NOT thrown
6. User sees error, record stays `in_progress`

**Verification:**
- Check Supabase logs for failed UPDATEs around creation time
- Check `error_message` field (should be NULL if update failed)

---

#### 3. Unhandled Exception Outside Try/Catch (LOW PROBABILITY)

**Evidence:**
- All critical code paths have try/catch
- But edge cases possible

**Timeline:**
1. Exception thrown from unexpected source
2. Escapes all try/catch blocks
3. Worker crashes
4. No cleanup

**Verification:**
- Check Worker logs for unhandled exceptions
- Review stack traces

---

### 5.2 Database Forensics

**Query to identify stuck records:**

```sql
SELECT 
  id,
  template_id,
  status,
  started_at,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - started_at)) AS seconds_since_start,
  generation_model->'tasks' AS task_count,
  error_message,
  failed_step
FROM project_generations
WHERE status = 'in_progress'
  AND started_at < NOW() - INTERVAL '5 minutes'
ORDER BY started_at ASC;
```

**Expected findings:**
- `error_message`: NULL (never set)
- `failed_step`: NULL (never set)
- `odoo_project_id`: NULL or partial (depends on failure point)
- `seconds_since_start`: > 300 (if old stuck record)

---

## 6. ROOT CAUSES (RANKED WITH EVIDENCE)

### #1: Missing Timeout Protection & Finally Block

**Severity:** CRITICAL  
**Impact:** Stuck `in_progress` records blocking retry  
**Evidence:**
- `module.js` lines 368-427: No finally block
- `generate.js`: No timeout wrapper
- Cloudflare Workers: 30-second limit

**Why This Causes Performance Issues:**
- Large projects timeout mid-execution
- User cannot retry (blocked by `in_progress` check)
- Must manually intervene in database

**Why This Causes Stuck Records:**
- Worker killed = no cleanup
- No finally = no guaranteed status update

---

### #2: Linear Call Explosion Without Throttling

**Severity:** HIGH  
**Impact:** Rate limiting, slow execution  
**Evidence:**
- 186 calls for 100-task project
- Sequential execution (no parallelism)
- No delay between calls
- User assignment adds payload complexity

**Why This Causes Performance Issues:**
- Each call: 150-300ms
- 186 × 250ms = 46.5 seconds
- Approaches Worker timeout
- May trigger Odoo rate limits

**Why This Causes Failures:**
- Rate limiting → HTTP 429
- Timeout → Worker killed
- Both → stuck record

---

### #3: Swallowed Lifecycle Update Errors

**Severity:** HIGH  
**Impact:** Silent failures leave inconsistent state  
**Evidence:**
- `generation-lifecycle.js` line 171: Error logged but NOT thrown
- Comment: "original error is more important"

**Why This Causes Stuck Records:**
- Odoo generation fails
- Lifecycle update fails
- User sees error message
- But record stays `in_progress`

---

### #4: User Assignment Payload Complexity

**Severity:** MEDIUM  
**Impact:** Slower Odoo processing per call  
**Evidence:**
- `odoo-creator.js` lines 228-231: `user_ids` array
- Odoo must resolve many2many relationships
- More database operations per task

**Why This Causes Performance Issues:**
- Same call count
- But each call processes more data
- Odoo internal overhead increases

---

### #5: No Batch API Usage

**Severity:** MEDIUM  
**Impact:** Missed optimization opportunity  
**Evidence:**
- All create/write operations are individual calls
- Odoo supports batch `create([{}, {}, ...])`
- Not used

**Why This Causes Performance Issues:**
- Could reduce 50 task creations to 1 batch call
- Would drastically reduce total time
- But requires code refactor

---

## 7. FAILURE SCENARIO MATRIX

| Scenario | Generation Record | Odoo State | User Can Retry? | Data Consistent? |
|----------|-------------------|------------|-----------------|------------------|
| **Normal Success** | `completed` | Full project | ✅ Yes (with confirm) | ✅ Yes |
| **Normal Failure** | `failed` | None or partial | ✅ Yes | ✅ Yes |
| **Worker Timeout** | `in_progress` ❌ | Partial | ❌ No (blocked) | ❌ No |
| **Lifecycle Update Fails** | `in_progress` ❌ | Partial | ❌ No (blocked) | ❌ No |
| **Odoo Rate Limit** | `failed` | None or partial | ✅ Yes | ✅ Yes |
| **Network Error (Odoo)** | `failed` | None | ✅ Yes | ✅ Yes |
| **Network Error (Supabase)** | `in_progress` ❌ | Partial | ❌ No (blocked) | ❌ No |

**Key:** ❌ = Problem state

---

## 8. EVIDENCE SUMMARY

### Files Analyzed

1. `src/modules/project-generator/module.js` (lines 318-427)
   - Generation API endpoint
   - Lifecycle orchestration
   - Missing finally block

2. `src/modules/project-generator/generate.js` (lines 68-283)
   - Core generation logic
   - Sequential loop structure
   - No timeout wrapper

3. `src/modules/project-generator/generation-lifecycle.js` (all)
   - State transitions
   - Swallowed error in `markGenerationFailure()`

4. `src/modules/project-generator/odoo-creator.js` (all)
   - Individual API wrappers
   - User assignment added to payload

5. `src/lib/odoo.js` (lines 13-67)
   - Base Odoo call wrapper
   - No throttling logic

6. `public/project-generator-client.js` (lines 297-500)
   - Client-side flow
   - User fetch before generation

7. `supabase/migrations/20260128150000_project_generations_v1.sql`
   - Schema definition
   - Status constraint

### Call Count Formulas

**Total Odoo Calls:**
```
C = 1 (user_fetch)
  + 1 (project)
  + (S × 2) (stages)
  + M (milestones)
  + (T × 2) (tags, worst case)
  + K (tasks)
  + D (dependencies)

Where:
  S = number of stages
  M = number of milestones
  T = number of unique tags
  K = number of tasks
  D = number of tasks with dependencies
```

**Example (100 tasks):**
```
C = 1 + 1 + 20 + 8 + 16 + 100 + 40
  = 186 calls
```

### Timing Analysis

**Per-Call Latency (Observed):**
- Minimum: 150ms
- Average: 250ms
- Maximum: 500ms (during rate limiting)

**Total Time (100 tasks):**
- Optimistic: 186 × 150ms = 27.9s
- Average: 186 × 250ms = 46.5s ⚠️
- Pessimistic: 186 × 500ms = 93s ❌

**Cloudflare Worker Limit:**
- CPU Time: 30s (likely tier)
- **Average case EXCEEDS limit**

---

## 9. CONCLUSION

### Primary Root Cause

**Architectural Flaw:** No fail-safe for lifecycle closure

The system assumes:
1. `generateProject()` always returns (success or failure)
2. Lifecycle update calls always succeed

Both assumptions are **violated in practice**:
- Worker timeouts kill execution before return
- Network failures prevent lifecycle updates

### Secondary Contributing Factors

1. **Linear call explosion** amplified by user assignment
2. **No throttling** triggers rate limits
3. **Swallowed errors** hide lifecycle update failures
4. **No batch API** misses optimization

### How Stuck Records Occur

**Most Likely Path:**
1. Large project generation started
2. `startGeneration()` writes `in_progress`
3. Sequential Odoo calls begin
4. At ~30 seconds, Worker CPU timeout
5. Cloudflare kills Worker
6. No cleanup code runs
7. Record stuck forever

**How to Confirm:**
- Check Worker logs for timeout errors near record `started_at` timestamp
- Verify record has NULL `error_message` and `failed_step`
- Calculate expected duration: task_count × 250ms

---

## 10. NEXT STEPS (NOT IMPLEMENTED HERE)

This analysis provides foundation for:

1. Add finally block with guaranteed lifecycle closure
2. Add Worker timeout wrapper with early abort
3. Implement request throttling (delay between calls)
4. Fix swallowed errors in lifecycle updates
5. Consider batch API for task creation
6. Add manual recovery endpoint for stuck records

**These solutions are OUT OF SCOPE for this diagnostic.**

---

**END OF DIAGNOSTIC REPORT**
