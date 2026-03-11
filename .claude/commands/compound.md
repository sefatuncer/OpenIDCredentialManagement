# /compound — Document Learnings and Extract Patterns

You are entering the **Compound** phase of the Compound Engineering workflow.

This is the phase that makes each unit of work compound into the next. You will document what was learned during the most recent Plan → Work → Review cycle.

## Input

The user has just completed a work + review cycle. They may reference specific findings, patterns, or lessons.

## Your Task

### 1. Analyze the Recent Cycle
- Read the most recent plan from `.claude/plans/`
- Review git log for recent commits to understand what was built
- Check `.claude/todos/` for any findings from the review phase
- Identify what went well, what went wrong, and what was surprising

### 2. Create a Solution Document (if applicable)

If a reusable pattern or solved problem emerged, create a file in `.claude/solutions/`:

```yaml
---
title: "Descriptive title of the solved problem"
tags: [relevant, tags, for, searchability]
category: security | architecture | performance | openid4vci | openid4vp | did | sdjwt
difficulty: easy | medium | hard
date: YYYY-MM-DD
---

## Problem
What was the challenge or issue.

## Approach
How it was solved, including the reasoning.

## Key Details
- File paths and specific implementation choices
- Patterns used
- Dependencies

## Lessons Learned
What to remember for next time.

## Prevention
How to avoid this issue or recognize this pattern in the future.
```

### 3. Update CLAUDE.md Lessons Learned

Add an entry to the "Lessons Learned" section of CLAUDE.md:

Format: `- **[YYYY-MM-DD] Category:** Description. Context: what happened. Fix: what to do instead.`

Categories: `Architecture`, `Security`, `Performance`, `TypeScript`, `OpenID4VCI`, `OpenID4VP`, `DID`, `SD-JWT`, `Testing`

### 4. Update Pattern Library (if applicable)

If the solution represents a reusable pattern, add a reference to the "Pattern Library" section of CLAUDE.md with a brief description and a link to the solution document.

### 5. Update Progress

- Update `.claude/progress.md` if this work completed an implementation step
- Update the relevant todo files in `.claude/todos/` (rename with `done` status)

### 6. Update Project Reference (project-up-to-date.md)

Her compound çalıştırıldığında `.claude/project-up-to-date.md` dosyasını güncel tut:

- Yeni eklenen endpoint'leri API Endpoints bölümüne ekle
- Yeni eklenen dosyaları Temel Dosyalar tablosuna ekle
- Bileşen → Endpoint Etkileşim Haritası'nı güncelle (yeni page'ler, yeni API call'lar)
- Akış Diyagramları'nı güncelle (değişen flow'lar)
- Mimari değişiklikleri (yeni servisler, yeni bağımlılıklar) Genel Mimari bölümüne yansıt
- Güvenlik veya protokol değişikliklerini ilgili bölümlere ekle

Bu dosya projenin güncel API ve mimari referansıdır — her cycle sonunda senkronize olmalı.

## Rules
- Only document genuine learnings — not trivial observations
- Keep CLAUDE.md entries concise (1-2 lines each)
- Put detailed content in `.claude/solutions/`, not in CLAUDE.md
- Tag solutions for searchability — future agents will search by tags
- Do not duplicate information already in `.claude/solutions/`
