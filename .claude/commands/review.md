# /review — Multi-Perspective Code Review

You are entering the **Review** phase of the Compound Engineering workflow.

## Input

The user wants a thorough review of recent changes. Review the current git diff or a specific set of files.

## Your Task

Run a comprehensive review from **6 specialized perspectives**, checking the project-specific rules from CLAUDE.md and the Review Checklist.

### 1. Gather Context
- Run `git diff` to see all current changes (staged + unstaged)
- Read every modified/created file in full
- Read `CLAUDE.md` for project rules and the Review Checklist

### 2. Review from Each Perspective

#### Security Review
- No hardcoded secrets, API keys, or credentials in code
- All sensitive routes require API key or JWT authentication
- Input validation at API boundaries
- No SQL injection, XSS, or command injection vulnerabilities
- CORS properly configured
- Rate limiting on sensitive endpoints
- Nonce validation for replay attack prevention
- Credential revocation checks in verification flow

#### Architecture Review
- Backend services in `backend/src/services/`
- Backend routes in `backend/src/api/routes/`
- No business logic in route handlers — services handle logic
- No monolith files exceeding ~300 lines
- Shared utilities in `backend/src/core/` or `backend/src/utils/`
- OpenID4VCI/VP flows follow spec compliance
- DID operations use proper resolution

#### Data Integrity Review
- Storage adapters used correctly (memory/postgres)
- UUID for identifiers
- Proper credential status tracking
- Revocation list integrity maintained
- Trust registry consistency

#### TypeScript Review
- Strict mode compliance (no `any` unless wrapping untyped external APIs)
- Interfaces for object shapes in types/ files
- async/await only (no .then() chains)
- kebab-case files, camelCase vars, PascalCase types
- Express handlers typed as `async (req: Request, res: Response) => { ... }`
- jose library used correctly for JWT operations

#### Performance Review
- No N+1 queries or missing indexes
- Audit logging is fire-and-forget (never blocks response)
- Cleanup intervals for expired tokens/nonces
- Efficient credential verification

#### Code Simplicity Review
- No over-engineering or premature abstractions
- No unnecessary error handling for impossible scenarios
- YAGNI — only code that serves the current requirement
- Clear, readable code over clever code

### 3. Output Format

```markdown
## Review Results

### P1 — CRITICAL (must fix before merge)
- [ ] [Security] Description of issue (file:line)
- [ ] [Architecture] Description of issue (file:line)

### P2 — IMPORTANT (should fix)
- [ ] [Performance] Description of issue (file:line)
- [ ] [TypeScript] Description of issue (file:line)

### P3 — MINOR (nice to fix)
- [ ] [Simplicity] Description of issue (file:line)

### Passed Checks
- [x] All routes properly authenticated
- [x] No business logic in route handlers
- [x] TypeScript strict mode compliance
```

### 4. Create Todos for Findings
For each P1 and P2 finding, create a todo file in `.claude/todos/` with the appropriate priority and details.

## Rules
- Be specific — include file paths and line numbers
- P1 findings block merge. P2 findings should be addressed. P3 findings are optional.
- Do not create findings for code that was not changed in this diff
- Reference the specific CLAUDE.md rule being violated when applicable
