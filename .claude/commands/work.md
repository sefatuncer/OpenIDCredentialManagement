# /work — Execute an Implementation Plan

You are entering the **Work** phase of the Compound Engineering workflow.

## Input

The user will reference a plan from `.claude/plans/` or describe what to implement. If no specific input is given, look for the most recent plan in `.claude/plans/`.

## Your Task

### 1. Load the Plan
- Read the referenced plan from `.claude/plans/`
- Read all CLAUDE.md rules (architecture, code style, naming, error handling)
- Understand the project structure:
  - Backend: `backend/src/` (services, api/routes, agents, core)
  - Web Wallet: `web-wallet/src/` (pages, services, components)
  - Frontend: `frontend-issuer-verifier/src/` (pages, services, components)

### 2. Execute Step by Step
For each step in the plan:
1. Read the target file(s) before making changes
2. Implement the change following all project conventions
3. Verify the change compiles (TypeScript strict mode)
4. Mark progress as you go using the TodoWrite tool

### 3. Track Progress
- Use the TodoWrite tool to track each step
- After completing all steps, update `.claude/progress.md` if this relates to implementation phases
- Update the corresponding todo file in `.claude/todos/` (change status from `pending` to `done`)

### 4. Verify Each Module
After making changes, verify TypeScript compiles:
```bash
# Backend
cd backend && npx tsc --noEmit

# Web Wallet
cd web-wallet && npx tsc --noEmit

# Frontend
cd frontend-issuer-verifier && npx tsc --noEmit
```

## Rules
- Follow the plan exactly — do not add features or refactoring beyond what was planned
- If the plan has a gap or error, stop and ask the user rather than improvising
- Backend services go in `backend/src/services/`
- Backend routes go in `backend/src/api/routes/`
- Never put business logic in route handlers — use services
- No file should exceed ~300 lines
- Use async/await, never .then()
- Wrap route handlers in try/catch with proper error responses
- Test that TypeScript compiles with zero errors after each significant change
- Auto-push changes to `origin main` after significant progress
