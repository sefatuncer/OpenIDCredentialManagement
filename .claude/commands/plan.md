# /plan — Create a Detailed Implementation Plan

You are entering the **Plan** phase of the Compound Engineering workflow.

## Input

The user will describe a feature, bug fix, or improvement they want to implement. If no specific input is given, check `todos/` for the highest-priority pending item.

## Your Task

### 1. Research Phase
- Read `CLAUDE.md` to understand the project structure and conventions
- Search `.claude/solutions/` for previously solved problems that relate to this task
- Explore the relevant modules:
  - Backend services: `backend/src/services/`
  - Backend routes: `backend/src/api/routes/`
  - Web wallet: `web-wallet/src/`
  - Frontend: `frontend-issuer-verifier/src/`
- Research the codebase for similar functionality that can be reused

### 2. Plan Creation
Create a detailed plan file at `.claude/plans/YYYY-MM-DD-<feature-name>.md` with:

```markdown
---
title: "Feature title"
date: YYYY-MM-DD
module: backend | web-wallet | frontend | all
related_todos: [NNN, NNN]
---

## Goal
What this plan achieves in 1-2 sentences.

## Research Findings
- Existing patterns found in the codebase
- Related solutions from .claude/solutions/
- Dependencies and constraints

## Implementation Steps
Ordered steps with specific file paths:
1. Step description → `path/to/file.ts`
2. Step description → `path/to/file.ts`

## Files to Create/Modify
| File | Action | Description |
|------|--------|-------------|
| path/to/file.ts | Create/Modify | What changes |

## Validation
How to verify the implementation works (specific commands, API calls, expected outputs).

## Risks
What could go wrong and how to mitigate.
```

### 3. Present the Plan
Show the plan to the user for review. Do NOT start implementation until the plan is approved.

## Rules
- Follow all rules in CLAUDE.md (modularity, service layer pattern, naming conventions)
- Never propose changes to files you haven't read
- Prefer editing existing files over creating new ones
- Keep the plan specific — include exact file paths and function signatures
- Reference existing utilities and patterns from the codebase
- Consider all three modules (backend, web-wallet, frontend) when planning features
