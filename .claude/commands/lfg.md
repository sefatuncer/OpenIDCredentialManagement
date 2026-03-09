# /lfg — End-to-End: Plan → Work → Review → Compound → Deploy

Run the full Compound Engineering cycle for a feature or task.

## Input

Describe the feature, bug fix, or improvement you want to implement. If no input is given, pick the highest-priority pending todo from `.claude/todos/`.

## Workflow

Execute all five phases sequentially:

### Phase 1: Plan
1. Read `CLAUDE.md` for project structure and conventions
2. Search `.claude/solutions/` for related prior solutions
3. Research the relevant codebase areas:
   - Backend: `backend/src/services/`, `backend/src/api/routes/`
   - Web Wallet: `web-wallet/src/`
   - Frontend: `frontend-issuer-verifier/src/`
4. Create a plan in `.claude/plans/YYYY-MM-DD-<feature>.md`
5. Present the plan and wait for user approval before proceeding

### Phase 2: Work
1. Execute the approved plan step by step
2. Follow all CLAUDE.md rules (modularity, service layer, naming, error handling)
3. Track progress with TodoWrite
4. Verify TypeScript compiles after each significant change:
   - `cd backend && npx tsc --noEmit`
   - `cd web-wallet && npx tsc --noEmit`
   - `cd frontend-issuer-verifier && npx tsc --noEmit`

### Phase 3: Review
1. Run `git diff` to gather all changes
2. Review from 6 perspectives: Security, Architecture, Data Integrity, TypeScript, Performance, Code Simplicity
3. Output findings as P1/P2/P3
4. Fix all P1 findings immediately
5. Create todos for P2 findings

### Phase 4: Compound
1. Create a solution document in `.claude/solutions/` if a reusable pattern emerged
2. Add a Lessons Learned entry to CLAUDE.md if something surprising was discovered
3. Update the Pattern Library if applicable
4. Update `.claude/progress.md`
5. Update todo file statuses

### Phase 5: Deploy
1. Run `git status` and confirm only cycle-related files are changed
2. Stage files explicitly (never `git add .`)
3. Generate a Conventional Commits message and confirm with the user
4. Commit and push to `main`
5. Confirm with `git log --oneline -5`

## Rules
- Always get plan approval before starting work
- Fix all P1 review findings before considering the cycle complete
- The compound phase is NOT optional — always document learnings
- Never deploy until compound is complete and all P1s are resolved
- Never force push; never commit secrets or `.env` files
- Follow the 80/20 time split: most effort goes to planning and review, not coding
- Auto-push to `origin main` after successful deploy
