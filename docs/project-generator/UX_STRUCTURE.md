# Project Generator - UX Structure

## Design Principles

### Manager-Centric Language
- No technical jargon in UI
- "Blueprint" not "schema" or "config"
- "Generate" not "deploy" or "execute"
- "Stage" not "state" or "status node"
- "Milestone" not "epic" or "phase object"
- Task "depends on" not "has prerequisite"

### Progressive Disclosure
- Simple path for basic templates (5 minutes)
- Advanced features available but not required
- Expandable sections for power users
- Tooltips for guidance, not walls of text

### Visual First
- Drag-and-drop for ordering
- Visual kanban preview
- Dependency graph visualization
- Color coding for quick scanning
- Icons for actions

### Educate, Don't Block
- Show warnings, allow override
- Suggest improvements, don't mandate
- Preview before generate
- Explain consequences clearly

---

## Screen Structure

### Main Navigation (Integrated with Platform)

The module appears in the existing platform navigation following the established pattern.

**Navigation Item:**
```
Icon: 📊 (briefcase)
Label: "Projects"
Route: /projects
Badge: Optional (e.g., "3" for templates needing review)
```

### Screen Hierarchy

```
/projects
├── Template Library (landing page)
├── Blueprint Editor
│   ├── New Blueprint
│   └── Edit Blueprint
├── Generate Project
│   ├── Select Template
│   ├── Configure Instance
│   └── Generation Progress
├── Generation History
└── Template Detail View
```

---

## Screen 1: Template Library (Landing Page)

**URL:** `/projects`  
**Purpose:** Browse, search, and manage templates

### Layout

**Header Section:**
```
┌─────────────────────────────────────────────────────────────┐
│ Project Templates                                    [+ New] │
├─────────────────────────────────────────────────────────────┤
│ Search: [_______________]  Status: [All ▾]  Sort: [Recent ▾]│
└─────────────────────────────────────────────────────────────┘
```

**Template Cards (Grid View):**
```
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ 📋 Client        │ │ 🚀 Product       │ │ 📅 Event         │
│ Onboarding v2    │ │ Launch v1        │ │ Planning v3      │
│                  │ │                  │ │                  │
│ ▪ 5 stages       │ │ ▪ 7 stages       │ │ ▪ 4 stages       │
│ ▪ 4 milestones   │ │ ▪ 3 milestones   │ │ ▪ 5 milestones   │
│ ▪ 23 tasks       │ │ ▪ 45 tasks       │ │ ▪ 18 tasks       │
│                  │ │                  │ │                  │
│ Used 12 times    │ │ Used 3 times     │ │ Used 8 times     │
│ Updated 2d ago   │ │ Updated 1w ago   │ │ Updated 3d ago   │
│                  │ │                  │ │                  │
│ [Generate] [Edit]│ │ [Generate] [Edit]│ │ [Generate] [Edit]│
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

**DaisyUI Components:**
- Card component for templates
- Badge for status (draft, published, archived)
- Button primary for "Generate"
- Button ghost for "Edit"
- Dropdown for filters
- Input with search icon

### Interactions

**Search:**
- Live search (debounced 300ms)
- Searches name, description, tags
- Shows result count: "12 templates found"

**Filters:**
- Status: All / Published / Draft / Archived
- Created by: Me / Everyone
- Tags: Multi-select checkbox menu

**Sort:**
- Recently updated
- Name A-Z
- Most used
- Recently created

**Card Actions:**
- Click card → Template Detail View
- "Generate" button → Generate Project flow
- "Edit" button → Blueprint Editor (if permitted)
- "..." menu → Clone, Archive, Export, Delete

**View Toggle:**
Grid view (default) ⇔ List view (compact table)

### Empty States

**No Templates:**
```
┌───────────────────────────────────────┐
│         📋                            │
│   No templates yet                    │
│                                       │
│   Create your first project template │
│   to get started.                     │
│                                       │
│         [+ New Template]              │
└───────────────────────────────────────┘
```

**No Results (Search):**
```
No templates match "XYZ"
[Clear search]
```

---

## Screen 2: Blueprint Editor

**URL:** `/projects/new` or `/projects/edit/:id`  
**Purpose:** Design complete project structure

### Layout Philosophy

**Left Panel (30%):** Structure tree/outline  
**Center Panel (50%):** Active editor  
**Right Panel (20%):** Properties & validation

### Header
```
┌──────────────────────────────────────────────────────────────┐
│ ← Back    Editing: "Client Onboarding v2"         [Save ▾]   │
│                                                    [Validate] │
└──────────────────────────────────────────────────────────────┘
```

**Save Dropdown:**
- Save as Draft
- Publish as New Version
- Save & Generate Project

### Left Panel: Structure Outline

```
┌─────────────────────────┐
│ Template Details        │
│ ✓ Name, description     │
│                         │
│ Kanban Design          │
│ ✓ 5 stages             │
│                         │
│ Milestones             │
│ ○ 4 defined            │
│                         │
│ Tasks                  │
│ ⚠ 23 tasks, 2 warnings │
│                         │
│ Dependencies           │
│ ✓ 12 connections       │
│                         │
│ Review & Validate      │
│ ○ Not validated        │
└─────────────────────────┘
```

**Visual Indicators:**
- ✓ Checkmark: section complete, no issues
- ⚠ Warning triangle: warnings present
- ○ Circle: section incomplete or not started
- 🔴 Error: blocking issues

**Click section → navigate to that editor view**

### Center Panel: Tabbed Editor

**Tab 1: Template Info**
```
Name*         [Client Onboarding v2________________]
Description   [Multi-line text area for description
               ...                                   ]
Tags          [+ Add tag] [onboarding ×] [clients ×]
Version       1.0.0 (auto-incremented on publish)
Status        ● Draft
```

---

**Tab 2: Kanban Design**

**Visual Kanban Builder:**
```
┌─────────────────────────────────────────────────────────┐
│ Your Kanban Flow                          [+ Add Stage] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [To Do] ──→ [In Progress] ──→ [Review] ──→ [Done]     │
│  Backlog     In Progress       Review       Done        │
│  🔵          🟡                🟠           🟢          │
│  [⋮]         [⋮]               [⋮]          [⋮]         │
│                                                         │
└─────────────────────────────────────────────────────────┘

Stage Details (selected: "In Progress")
┌──────────────────────────┐
│ Name      [In Progress_] │
│ Type      [In Progress ▾]│
│ Color     [🟡 Yellow ▾]  │
│ Folded    [ ] Collapsed  │
│                          │
│ [Delete Stage]           │
└──────────────────────────┘
```

**Interactions:**
- Drag stages to reorder
- Click stage to edit details in sidebar
- Type dropdown shows semantic types with explanations
- Add stage: defaults appear in sequence
- Delete: confirmation if tasks reference this stage

**Validation Feedback (inline):**
- ⚠ "You have 2 'Done' stages. This is allowed but unusual."
- ℹ "Tip: Most teams use 4-7 stages for optimal flow."

---

**Tab 3: Milestones**

**List View with Inline Add:**
```
┌──────────────────────────────────────────────────────────┐
│ Milestones                            [+ Add Milestone]  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ ⋮ 1. Discovery                                    [Edit] │
│   Initial client discovery and requirements gathering   │
│   Tasks: 5                                               │
│                                                          │
│ ⋮ 2. Implementation                               [Edit] │
│   Core implementation phase                              │
│   Tasks: 12                                              │
│                                                          │
│ ⋮ 3. Go-Live                                      [Edit] │
│   Production deployment and handoff                      │
│   Tasks: 6                                               │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Add/Edit Modal:**
```
┌────────────────────────────────┐
│ Add Milestone              [×] │
├────────────────────────────────┤
│ Name*                          │
│ [Discovery_______________]     │
│                                │
│ Description                    │
│ [Multi-line text area____]     │
│ [________________________]     │
│                                │
│        [Cancel]  [Save]        │
└────────────────────────────────┘
```

**Interactions:**
- Drag ⋮ to reorder
- Click milestone → expand to show tasks
- Delete: warn if tasks assigned

---

**Tab 4: Tasks**

**Two-Pane Layout:**

**Left: Milestone Selector**
```
┌─────────────────────┐
│ Select Milestone    │
├─────────────────────┤
│ ▶ Discovery    (5)  │
│ ▼ Implementation(12)│
│   - Task 1          │
│   - Task 2          │
│   - ...             │
│ ▶ Go-Live      (6)  │
└─────────────────────┘
```

**Right: Task Editor**
```
┌──────────────────────────────────────────────────────────┐
│ Implementation → Task Details                            │
├──────────────────────────────────────────────────────────┤
│ Name*          [Initial kickoff meeting______________]   │
│                                                          │
│ Description    [Conduct kickoff meeting with team___]    │
│                [____________________________________]    │
│                                                          │
│ Default Stage  [To Do ▾]                                 │
│                                                          │
│ Tags           [+ Add] [discovery ×] [client-facing ×]   │
│                                                          │
│ This task depends on:                                    │
│   [+ Add dependency]                                     │
│   ○ No dependencies                                      │
│                                                          │
│ Subtasks (2)                                [+ Add]      │
│   ⋮ 1. Prepare agenda                       [Edit] [×]  │
│   ⋮ 2. Send calendar invite                 [Edit] [×]  │
│                                                          │
│                              [Delete Task] [Save]        │
└──────────────────────────────────────────────────────────┘
```

**Add Dependency Interaction:**
Click "+ Add dependency" → Modal with searchable task list
```
┌────────────────────────────────────┐
│ Select Prerequisite Task       [×] │
├────────────────────────────────────┤
│ Search [____________]              │
│                                    │
│ □ Discovery / Contract signed      │
│ □ Discovery / Requirements doc     │
│ ☑ Discovery / Kickoff scheduled    │
│ □ Implementation / Setup dev env   │
│                                    │
│           [Cancel]  [Add]          │
└────────────────────────────────────┘
```

**Dependency Visualization (Collapsible Section):**
Click "View dependency graph" → expands inline
```
┌──────────────────────────────────────┐
│ Dependency Graph                     │
│                                      │
│    [Task A] ──→ [Task B] ──→ [Task C]│
│                      ↓               │
│                 [Task D]             │
│                                      │
│ Critical path: 3 tasks               │
│ Bottlenecks: Task B (blocks 2 tasks) │
│                                      │
│ [View Full Graph]                    │
└──────────────────────────────────────┘
```

Full graph opens modal with interactive visualization (D3/Cytoscape).

---

**Tab 5: Review & Validate**

**Validation Results Dashboard:**
```
┌──────────────────────────────────────────────────────────┐
│ Blueprint Validation                      [Run Validation]│
├──────────────────────────────────────────────────────────┤
│                                                          │
│ ✅ No Errors                                             │
│                                                          │
│ ⚠️ 2 Warnings                                            │
│   • More than 15 kanban stages may clutter UI           │
│   • Task "Final review" has 6 dependencies (complex)    │
│                                                          │
│ ℹ️ Structure Summary                                     │
│   • 5 Kanban stages                                      │
│   • 4 Milestones                                         │
│   • 23 Tasks (2 with subtasks)                           │
│   • 12 Dependencies                                      │
│   • Critical path length: 8 tasks                        │
│                                                          │
│ 📊 Complexity Analysis                                   │
│   • Bottleneck tasks: 2                                  │
│   • Isolated tasks: 3 (no dependencies)                  │
│   • Average dependencies per task: 0.52                  │
│                                                          │
│                    [Save as Draft] [Publish Template]    │
└──────────────────────────────────────────────────────────┘
```

**Validation States:**
- ✅ Green: Ready to publish
- ⚠️ Yellow: Warnings present, can still publish
- 🔴 Red: Errors present, cannot publish

**Publish Flow:**
Click "Publish Template" → Version bump modal
```
┌────────────────────────────────────┐
│ Publish Template               [×] │
├────────────────────────────────────┤
│ Current version: 1.2.0             │
│                                    │
│ New version:                       │
│ ○ 2.0.0 (Major - breaking changes)│
│ ● 1.3.0 (Minor - new features)    │
│ ○ 1.2.1 (Patch - small fixes)     │
│                                    │
│ ☑ Lock this version after publish │
│                                    │
│        [Cancel]  [Publish]         │
└────────────────────────────────────┘
```

---

## Screen 3: Template Detail View

**URL:** `/projects/template/:id`  
**Purpose:** View template details, manage, or take action

### Layout

**Header:**
```
┌──────────────────────────────────────────────────────────┐
│ ← Back to Library                                        │
│                                                          │
│ 📋 Client Onboarding v2                                  │
│ Version 2.1.0 • Published • Used 12 times                │
│                                                          │
│ [Generate Project]  [Edit]  [Clone]  [...]              │
└──────────────────────────────────────────────────────────┘
```

**Tabs:**
1. Overview
2. Structure Preview
3. Version History
4. Usage Stats

---

**Tab: Overview**
```
Description
Standard client onboarding process including discovery,
implementation, and go-live phases.

Tags: [onboarding] [clients] [standard]

Details
• Created by: John Doe
• Created: Jan 15, 2026
• Last updated: Jan 20, 2026
• Status: Published, Locked 🔒

Structure
• 5 Kanban stages
• 4 Milestones
• 23 Tasks (2 with subtasks)
• 12 Dependencies
```

---

**Tab: Structure Preview**

**Visual Kanban:**
(Same as editor, but read-only)

**Milestone Tree:**
```
▼ Discovery (5 tasks)
  • Contract signed
  • Requirements gathering
  • Kickoff meeting
  • Technical assessment
  • Discovery report

▼ Implementation (12 tasks)
  • Setup dev environment
  • ...
```

**Dependency Graph:**
Interactive visualization (read-only)

---

**Tab: Version History**
```
┌──────────────────────────────────────────────────────────┐
│ v2.1.0 (Current)                           Jan 20, 2026  │
│ Published • Locked                                       │
│ Added post-launch review milestone                       │
│                                            [View] [Clone] │
├──────────────────────────────────────────────────────────┤
│ v2.0.0                                     Jan 10, 2026  │
│ Published                                                │
│ Major restructure of implementation phase                │
│                                            [View] [Clone] │
├──────────────────────────────────────────────────────────┤
│ v1.0.0                                     Dec 15, 2025  │
│ Published                                                │
│ Initial version                                          │
│                                            [View] [Clone] │
└──────────────────────────────────────────────────────────┘
```

Click "View" → Read-only blueprint viewer  
Click "Clone" → Creates new draft template with that version's structure

---

**Tab: Usage Stats**
```
Projects Generated: 12

Recent Generations
┌──────────────────────────────────────────────────────────┐
│ ACME Corp Onboarding      Jan 28, 2026   John Doe  ✅    │
│ Beta Inc Onboarding       Jan 25, 2026   Jane Smith ✅   │
│ Gamma LLC Onboarding      Jan 22, 2026   John Doe   ✅   │
│ ...                                                      │
└──────────────────────────────────────────────────────────┘

[View Full History]
```

---

## Screen 4: Generate Project Flow

**URL:** `/projects/generate`  
**Purpose:** Create Odoo project from template

### Step 1: Select Template

**If accessed directly (not from template card):**
```
┌──────────────────────────────────────────────────────────┐
│ Generate New Project                                     │
│ Step 1 of 3: Select Template                             │
├──────────────────────────────────────────────────────────┤
│ Search templates [_________________]                     │
│                                                          │
│ ○ Client Onboarding v2         5 stages, 23 tasks       │
│ ○ Product Launch v1            7 stages, 45 tasks       │
│ ○ Event Planning v3            4 stages, 18 tasks       │
│                                                          │
│                                    [Cancel]  [Next →]    │
└──────────────────────────────────────────────────────────┘
```

**If accessed from template card:**
Skip to Step 2 with template pre-selected.

---

### Step 2: Configure Project

```
┌──────────────────────────────────────────────────────────┐
│ Generate New Project                                     │
│ Step 2 of 3: Project Details                             │
├──────────────────────────────────────────────────────────┤
│ Template: Client Onboarding v2 (version 2.1.0)           │
│                                                          │
│ Project Name*                                            │
│ [ACME Corp Onboarding_____________________________]      │
│                                                          │
│ Company                                                  │
│ [Your Company ▾]                                         │
│                                                          │
│ Description (optional)                                   │
│ [Custom description or leave blank to use template_]     │
│ [________________________________________________]        │
│                                                          │
│                          [← Back]  [Next: Review →]      │
└──────────────────────────────────────────────────────────┘
```

**Validation:**
- Project name required
- Company defaults to user's company
- Warning if project name exists in Odoo (doesn't block)

---

### Step 3: Review & Generate

```
┌──────────────────────────────────────────────────────────┐
│ Generate New Project                                     │
│ Step 3 of 3: Review                                      │
├──────────────────────────────────────────────────────────┤
│ You're about to create:                                  │
│                                                          │
│ Project Name:  ACME Corp Onboarding                      │
│ Template:      Client Onboarding v2 (v2.1.0)             │
│ Company:       Your Company                              │
│                                                          │
│ This will create in Odoo:                                │
│   ✓ 1 Project                                            │
│   ✓ 5 Kanban stages                                      │
│   ✓ 4 Milestones                                         │
│   ✓ 23 Tasks (including 2 subtasks)                      │
│   ✓ 12 Task dependencies                                 │
│                                                          │
│ ⏱ Estimated time: ~8 seconds                             │
│                                                          │
│ ⚠ After creation, the project is fully independent       │
│   in Odoo. Template changes won't affect it.             │
│                                                          │
│                          [← Back]  [Generate Project]    │
└──────────────────────────────────────────────────────────┘
```

---

### Step 4: Generation Progress

**Immediate transition after clicking "Generate Project":**

```
┌──────────────────────────────────────────────────────────┐
│ Generating Project...                                    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ ✅ Creating project in Odoo                              │
│ ✅ Creating kanban stages                                │
│ ⏳ Creating milestones... (2 of 4)                       │
│ ⏹ Creating tasks...                                     │
│ ⏹ Setting dependencies...                               │
│                                                          │
│ [████████░░░░░░░░░░] 40%                                 │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Progress Updates:**
- Real-time via SSE or polling every 500ms
- Shows current phase and completion percentage
- Smooth progress bar animation

---

### Success Screen

```
┌──────────────────────────────────────────────────────────┐
│ ✅ Project Created Successfully!                         │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ ACME Corp Onboarding is ready in Odoo                    │
│                                                          │
│ Created:                                                 │
│   • 1 Project                                            │
│   • 5 Kanban stages                                      │
│   • 4 Milestones                                         │
│   • 23 Tasks                                             │
│   • 12 Dependencies                                      │
│                                                          │
│ Duration: 7.2 seconds                                    │
│                                                          │
│         [Open in Odoo]  [Generate Another]  [Done]       │
└──────────────────────────────────────────────────────────┘
```

**Actions:**
- "Open in Odoo" → New tab to Odoo project view
- "Generate Another" → Return to Step 1
- "Done" → Return to Template Library

---

### Error Screen

```
┌──────────────────────────────────────────────────────────┐
│ ❌ Generation Failed                                     │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ Could not create project in Odoo                         │
│                                                          │
│ Error during: Creating kanban stages                     │
│ Reason: API error - Invalid stage name                   │
│                                                          │
│ The system attempted to rollback: Success                │
│ No orphaned records in Odoo.                             │
│                                                          │
│ What you can do:                                         │
│   • Check the template for invalid characters           │
│   • Try again in a few minutes                           │
│   • Contact support if this persists                     │
│                                                          │
│ [View Error Details]  [Try Again]  [Back to Library]     │
└──────────────────────────────────────────────────────────┘
```

**Error Details (expandable):**
```
Technical Details
Generation ID: 550e8400-e29b-41d4-a716-446655440000
Template: Client Onboarding v2 (v2.1.0)
Failed Phase: create_stages
API Error: Invalid field value: name contains emoji
Timestamp: 2026-01-28 14:23:45 UTC
Rollback: Successful
```

---

## Screen 5: Generation History

**URL:** `/projects/history`  
**Purpose:** View audit log of all project generations

### Layout

```
┌──────────────────────────────────────────────────────────┐
│ Generation History                                       │
├──────────────────────────────────────────────────────────┤
│ Filter: [Status: All ▾]  [User: Me ▾]  Date: [Last 30d ▾]│
└──────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ Project Name            Template           Date         Status    Duration  │
├─────────────────────────────────────────────────────────────────────────────┤
│ ACME Corp Onboarding    Client Onb. v2.1  Jan 28, 14:23  ✅ Success  7.2s   │
│ [View in Odoo] [View Log]                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ Beta Inc Onboarding     Client Onb. v2.1  Jan 25, 10:15  ✅ Success  6.8s   │
│ [View in Odoo] [View Log]                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ Gamma Setup Project     Product Lau. v1   Jan 22, 16:45  ❌ Failed   3.2s   │
│ [View Log] [Retry]                                                          │
└─────────────────────────────────────────────────────────────────────────────┘

Showing 1-10 of 156 generations          [1] [2] [3] ... [16] [Next →]
```

**Click "View Log" → Modal:**
```
┌────────────────────────────────────────┐
│ Generation Log                     [×] │
├────────────────────────────────────────┤
│ Project: ACME Corp Onboarding          │
│ Template: Client Onboarding v2.1.0     │
│ Generated by: John Doe                 │
│ Started: Jan 28, 2026 14:23:12         │
│ Completed: Jan 28, 2026 14:23:19       │
│ Status: Success                        │
│                                        │
│ Created Records:                       │
│   • Project ID: 123                    │
│   • Stage IDs: [45, 46, 47, 48, 49]    │
│   • Milestone IDs: [12, 13, 14, 15]    │
│   • Task IDs: [234, 235, ..., 256]     │
│                                        │
│ Performance:                           │
│   • Total API calls: 38                │
│   • Duration: 7.2 seconds              │
│                                        │
│              [Close]                   │
└────────────────────────────────────────┘
```

---

## Interaction Patterns

### Drag-and-Drop

**Where Used:**
- Reorder kanban stages
- Reorder milestones
- Reorder tasks within milestone
- Reorder subtasks

**Visual Feedback:**
- Grab cursor on hover over drag handle (⋮)
- Ghost preview of item while dragging
- Drop zone highlighting
- Smooth animation on drop

**Implementation:**
- HTML5 Drag and Drop API
- Or library: SortableJS (lightweight, compatible with DaisyUI)

---

### Modal Dialogs

**Used For:**
- Add/Edit Milestone
- Add/Edit Task
- Add Dependency
- Confirm Delete
- Publish Template
- Error Details
- Generation Log

**DaisyUI Components:**
- Modal backdrop (semi-transparent overlay)
- Modal box (centered, responsive)
- Modal actions (buttons right-aligned)

**Behavior:**
- Close on backdrop click (configurable)
- Close on ESC key
- Focus trap inside modal
- Return focus to trigger element on close

---

### Validation Feedback

**Real-Time Validation:**
- Field-level validation on blur
- Form-level validation on submit
- Blueprint validation on save

**Visual States:**
- Input border colors:
  - Default: neutral
  - Focus: primary blue
  - Error: red
  - Success: green (optional)
- Error messages below fields (red text)
- Warning messages (yellow background, inline)

**Example:**
```
Project Name*
[___________________________]
⚠ This name already exists in Odoo. You can still proceed.
```

---

### Tooltips & Help

**Tooltips (hover):**
- Appear on hover over ⓘ icon
- Short explanations (1-2 sentences)
- Examples: "Backlog stages are for work not yet started"

**Contextual Help:**
- Expandable "Learn more" sections
- Inline documentation without leaving page
- Links to full docs (optional)

**Example:**
```
Stage Type  [Backlog ▾]  ⓘ

[Hover on ⓘ shows:]
"Backlog stages hold tasks that aren't being
actively worked on yet. Most teams have one."
```

---

### Guided Empty States

**When section is empty, show guidance:**

**No Milestones:**
```
┌───────────────────────────────────────┐
│ 📍 No milestones yet                  │
│                                       │
│ Milestones help organize tasks into   │
│ phases or major deliverables.         │
│                                       │
│ Examples: "Discovery", "Go-Live"      │
│                                       │
│      [+ Add Your First Milestone]     │
└───────────────────────────────────────┘
```

**No Dependencies:**
```
ℹ️ No task dependencies defined.

This is fine if all tasks can run in parallel.
If some tasks must happen before others,
add dependencies to visualize the flow.

[+ Add Dependency]
```

---

### Keyboard Shortcuts (Optional, Power Users)

**Global:**
- `Ctrl+S` / `Cmd+S`: Save
- `Esc`: Close modal
- `?`: Show keyboard shortcuts

**Editor:**
- `Ctrl+K`: Add task
- `Ctrl+M`: Add milestone
- `Ctrl+Enter`: Save current item

**Discoverable:**
Show shortcuts panel on `?` key or "Keyboard Shortcuts" link in help menu.

---

## Responsive Design

### Desktop (Primary Target)
- Wide layout with panels
- Drag-and-drop fully functional
- Graph visualizations at full size

### Tablet (1024px - 768px)
- Collapsible left panel
- Single-column task editor
- Simplified graph views

### Mobile (< 768px)
- Not primary use case but should degrade gracefully
- Stack all panels vertically
- Disable complex drag-and-drop, use move buttons instead
- Simplified or disabled graph visualizations
- Warning: "Best experienced on desktop"

---

## DaisyUI Component Mapping

### Core Components Used

**Navigation:**
- Navbar (platform-level)
- Tabs (editor views)
- Breadcrumbs (optional)

**Forms:**
- Input (text, search)
- Textarea
- Select dropdown
- Checkbox
- Radio

**Layout:**
- Card (template cards)
- Drawer (side panels, optional)
- Modal (dialogs)
- Collapse (expandable sections)

**Actions:**
- Button (primary, secondary, ghost, outline)
- Button group
- Dropdown menu

**Feedback:**
- Alert (errors, warnings, info)
- Badge (status indicators)
- Progress bar
- Loading spinner
- Toast (notifications, optional)

**Data Display:**
- Table (generation history)
- Stats (summary metrics)
- Timeline (version history, optional)

**Color Scheme:**
- Primary: Blue (actions, focus)
- Success: Green (completed, valid)
- Warning: Yellow (warnings)
- Error: Red (errors, delete)
- Neutral: Gray (default states)

**Theme:**
Use DaisyUI's default light theme or match existing platform theme.

---

## Advanced Features (Progressive Disclosure)

### Dependency Graph Visualization

**When to Show:**
- Optional on Tasks tab (collapsed by default)
- Always available on Review tab
- On Template Detail preview

**Library:**
- Cytoscape.js (recommended: powerful, interactive)
- Or D3.js (more custom, steeper learning curve)

**Features:**
- Nodes = Tasks (colored by milestone)
- Edges = Dependencies (arrows)
- Highlight critical path (thicker lines)
- Highlight bottlenecks (larger nodes)
- Click node → navigate to task editor
- Zoom, pan controls
- Export as PNG (optional)

**Graceful Degradation:**
- If >100 tasks, show warning: "Large graph, may be slow"
- Option to show simplified view (only tasks with dependencies)

---

### Bulk Actions (Future)

**Template Library:**
- Select multiple templates → Bulk archive, export, tag

**Tasks:**
- Select multiple tasks → Bulk assign stage, add tag, delete

**Not V1:**
Leave placeholders in UI for future expansion, but don't implement.

---

### Template Import/Export

**Export:**
- Button on Template Detail: "Export as JSON"
- Downloads `template-name-v1.0.0.json`
- Contains all blueprint data

**Import:**
- Button on Template Library: "Import Template"
- Upload JSON file
- Validates schema
- Creates new draft template
- Shows preview before final save

**Use Cases:**
- Backup templates
- Share templates across organizations
- Version control templates in Git

---

## Accessibility Considerations

### ARIA Labels
- All interactive elements labeled
- Icon buttons have text alternatives
- Form inputs associated with labels

### Keyboard Navigation
- All actions accessible via keyboard
- Logical tab order
- Focus indicators visible
- Skip links for long forms

### Screen Readers
- Semantic HTML (headings, lists, buttons)
- Live regions for dynamic updates (validation, progress)
- Descriptive error messages

### Color Contrast
- DaisyUI default themes meet WCAG AA
- Don't rely on color alone (use icons + text)

### Focus Management
- Modal traps focus
- Return focus on close
- Focus first error on validation failure

---

## Performance Optimizations

### Lazy Loading
- Blueprint data loaded only when needed
- Graph visualization library loaded on demand
- Template previews load images lazily

### Debouncing
- Search input: 300ms
- Validation: 500ms on typing, immediate on blur

### Pagination
- Template library: 20 per page
- Generation history: 10 per page
- Task list: Virtual scrolling if >100 tasks

### Caching
- Cache template list in memory (invalidate on create/update)
- Cache validation results until blueprint changes

---

## Error Handling UX

### Field-Level Errors
```
Project Name*
[___________________________]
❌ Project name is required
```

### Form-Level Errors
```
┌───────────────────────────────────┐
│ ❌ Cannot save template           │
│                                   │
│ Please fix these errors:          │
│   • Project name is required      │
│   • Kanban has no stages          │
│                                   │
│           [OK]                    │
└───────────────────────────────────┘
```

### Network Errors
```
⚠️ Network error. Your changes are saved locally.
Retrying connection... [Retry Now]
```

### API Errors
User-friendly translation of technical errors:
- Odoo API error → "Could not connect to Odoo. Please try again."
- Validation error → "Invalid template structure. Please review."
- Permission error → "You don't have permission to edit this template."

---

## Mobile/Tablet Experience

### Not Optimized For, But Functional

**Template Library:**
- Grid → Single column cards
- Filters collapse into drawer

**Blueprint Editor:**
- Tabs stack vertically
- Side panels become full-screen overlays
- Drag-and-drop disabled, use move up/down buttons

**Generate Flow:**
- Works well (simple form)
- Progress screen same as desktop

**Message:**
"💻 For the best experience editing templates, use a desktop browser."

---

## Success States & Celebrations

### Template Published
```
🎉 Template Published!

"Client Onboarding v2.0.0" is now available
for everyone to use.

[View Template] [Create Another]
```

### Project Generated
```
✅ Success!

ACME Corp Onboarding is ready in Odoo.

[Open in Odoo]
```

**Micro-interactions:**
- Confetti animation on success (subtle, optional)
- Success sound (muted by default)
- Green checkmark animation

---

## Navigation Flows Summary

**Template Library → Blueprint Editor:**
1. Click "+ New Template"
2. Or click "Edit" on template card

**Template Library → Generate Project:**
1. Click "Generate" on template card
2. Skips to Step 2 (configure)

**Blueprint Editor → Generate Project:**
1. Click "Save & Generate" in save dropdown
2. Saves template, then redirects to generate flow

**Generate Project → Odoo:**
1. Click "Open in Odoo" on success screen
2. Opens new tab to Odoo project

**Template Detail → Blueprint Editor:**
1. Click "Edit" button (if permitted)

**Template Detail → Generate Project:**
1. Click "Generate Project" button

**Generation History → Template Detail:**
1. Click template name in history row

**Everywhere → Template Library:**
1. Click "Projects" in main navigation
2. Or click "← Back to Library" breadcrumb
