# /deploy — Stage, Commit, and Push Changes

You are entering the **Deploy** phase of the Compound Engineering workflow.

This phase runs after `/compound` is complete. All P1 review findings must already be resolved.

## Your Task

### 1. Verify Prerequisites

Before touching git, confirm:
- Run `git status` to see all modified and untracked files
- Run `git diff --stat` to get a summary of changes
- Confirm there are no unresolved P1 findings from the review phase
- Confirm `/compound` has already been run (check that `.claude/solutions/` or CLAUDE.md was updated in this cycle)

If prerequisites are not met, stop and tell the user what is missing.

### 2. Determine What to Stage

- Review the changed files from `git status`
- Stage only files that are part of this cycle's work
- Do NOT stage: `.env` files, secrets, large binaries, or unrelated changes
- Use specific file paths, not `git add .` or `git add -A`

```bash
git add <file1> <file2> ...
```

### 3. Generate a Commit Message

Based on the changes, generate a Conventional Commits message:

- `feat:` — new feature or endpoint
- `fix:` — bug fix
- `chore:` — tooling, config, docs updates
- `refactor:` — restructuring without behavior change
- `test:` — test additions or changes
- `security:` — security improvements

Format: `<type>(<optional-scope>): <short imperative description>`

Scopes: `openid4vci`, `openid4vp`, `did`, `sdjwt`, `wallet`, `issuer`, `verifier`, `auth`, `api`

Examples:
- `feat(openid4vci): add nonce validation for replay attack prevention`
- `fix(openid4vp): revocation check in credential verification`
- `security(api): add rate limiting to token endpoint`
- `chore(docs): update architecture documentation`

Present the commit message to the user and ask for confirmation before committing.

### 4. Commit

```bash
git commit -m "<confirmed message>"
```

### 5. Push

```bash
git push origin main
```

### 6. Confirm

After pushing, run `git log --oneline -5` to confirm the commit is in place, and report the result to the user.

## Rules

- Never use `git add .` or `git add -A` — stage files explicitly
- Never skip prerequisites — do not deploy if P1 findings are unresolved
- Never force push (`--force`) to `main`
- Never commit `.env`, wallet keys, API keys, or any secrets
- Always use Conventional Commits format
- Push target is always `main`
