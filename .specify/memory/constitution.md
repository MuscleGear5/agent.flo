<!--
Sync Impact Report
===================
Version change: N/A → 1.0.0 (initial ratification)
Added sections:
  - Principle I: Modular Monorepo
  - Principle II: ESM & TypeScript Strictness
  - Principle III: Test-First with London School TDD
  - Principle IV: Security at Boundaries
  - Principle V: Coordinated Publishing
  - Principle VI: DDD Bounded Contexts
  - Principle VII: CLI Coordinates, Agents Execute
  - Section: Operational Constraints
  - Section: Development Workflow
  - Section: Governance
Templates requiring updates:
  - .specify/templates/plan-template.md — Constitution Check gate
    references generic placeholders; ✅ compatible (gates are
    derived dynamically from principles at plan time)
  - .specify/templates/spec-template.md — ✅ compatible
    (no constitution-specific references)
  - .specify/templates/tasks-template.md — ✅ compatible
    (phase structure aligns with principles)
  - No command templates directory exists (skipped)
Follow-up TODOs: none
-->

# Ruflo v3.5 Constitution

## Core Principles

### I. Modular Monorepo

All packages live under `v3/@claude-flow/*` as a pnpm workspace.
Each package MUST be independently buildable (`npm run build`) and
testable (`npm test`). The root package (`claude-flow`) and alias
(`ruflo`) are thin wrappers that proxy to `@claude-flow/cli`. No
package may import from another package's `src/` directly — only
from its published exports or workspace-linked `dist/`.

### II. ESM & TypeScript Strictness

Every package MUST use `"type": "module"` and target ES2022. All
imports between files MUST include the `.js` extension. TypeScript
strict mode is enabled; `noImplicitReturns` and
`noFallthroughCasesInSwitch` are enforced. Path aliases (`@v3/*`)
are permitted only in the root tsconfig; individual packages MUST
use relative imports so they remain portable when published.

### III. Test-First with London School TDD

New functionality MUST follow London School (mock-first) TDD:
write tests that define expected collaborator interactions, watch
them fail, then implement. Vitest is the sole test runner.
`mockReset`, `clearMocks`, and `restoreMocks` MUST all be `true`
in vitest config to prevent cross-test bleed. Integration tests
(in `__tests__/integration/`) exercise real subsystems; unit tests
(in `__tests__/unit/` or co-located `__tests__/` within packages)
use mocks exclusively.

### IV. Security at Boundaries

All external input (CLI args, MCP messages, API payloads, file
paths) MUST be validated with Zod schemas or the
`@claude-flow/security` validators before reaching domain logic.
File paths MUST pass `PathValidator` to prevent directory
traversal. Shell commands MUST pass `SafeExecutor` to prevent
injection. Secrets MUST NOT appear in source, commits, or logs.
`.env` files MUST be in `.gitignore`. API keys MUST be loaded from
environment variables at runtime.

### V. Coordinated Publishing

The three npm packages (`@claude-flow/cli`, `claude-flow`, `ruflo`)
MUST be published together with identical version numbers. ALL
dist-tags (`alpha`, `latest`, and `v3alpha` where applicable) MUST
be updated on all three packages. Publishing is not complete until
`npm view <pkg> dist-tags --json` confirms correct tags on all
three. A build (`npm run build` in `v3/@claude-flow/cli`) MUST
succeed before any publish.

### VI. DDD Bounded Contexts

The `v3/src/` directory follows Domain-Driven Design. Domain
entities (`Agent`, `Task`, `MemoryEntity`) live in
`<context>/domain/`. Application services (`SwarmCoordinator`,
`WorkflowEngine`) live in `<context>/application/`. Infrastructure
adapters (`SQLiteBackend`, `MCPServer`) live in
`<context>/infrastructure/` or `infrastructure/`. Domain code MUST
NOT import from infrastructure directly; it depends on interfaces
that infrastructure implements. New bounded contexts MUST be
justified — prefer extending an existing context over creating a
new one.

### VII. CLI Coordinates, Agents Execute

The CLI (`@claude-flow/cli`) handles orchestration: swarm init,
memory management, hooks, routing, session lifecycle. Actual code
generation, file operations, and git work are performed by Claude
Code's Agent/Task tool or headless `claude -p` instances. CLI
commands MUST NOT perform code generation or file writes outside
their own config/state directories (`.claude-flow/`, `.swarm/`).
MCP tools expose coordination primitives, not execution
primitives.

## Operational Constraints

- Files MUST stay under 500 lines. Exceeding this requires
  extracting a new module with a clear single responsibility.
- Node.js >= 20.0.0 is required. pnpm >= 8.0.0 for the v3
  workspace.
- The root package uses npm; the v3 monorepo uses pnpm. Do not
  mix package managers within a single workspace scope.
- Memory backend is hybrid (SQLite + AgentDB). HNSW indexing is
  enabled with cosine metric, M=16, ef_construction=200.
- Swarm topology default is `hierarchical-mesh` with max 15
  agents and `specialized` strategy.
- Provider routing follows the fallback chain: zai -> minimax ->
  deepseek.
- Beads (`bd`) is the sole issue tracker. Do not use TodoWrite,
  TaskCreate, or markdown TODO files for task tracking.

## Development Workflow

1. **Find work**: `bd ready` to see available issues.
2. **Claim**: `bd update <id> --claim` before starting.
3. **Branch**: Work on `main` or a feature branch as appropriate.
4. **Implement**: Write failing tests first (Principle III), then
   implement. Validate inputs at boundaries (Principle IV).
5. **Build & test**: `npm run build && npm test` from root, or
   `cd v3 && pnpm -r build && vitest run` for the monorepo.
6. **Close**: `bd close <id>` when done.
7. **Push**: `git push` is mandatory — work is not complete until
   pushed to remote.

## Governance

This constitution is the authoritative source for project-wide
technical decisions. It supersedes ad-hoc conventions found in
code comments, commit messages, or informal agreements.

**Amendment procedure**: Any change to a Core Principle requires
documenting the rationale, updating this file with a version bump,
and propagating changes to dependent templates in
`.specify/templates/`. Operational Constraints and Development
Workflow sections may be updated with a PATCH version bump.

**Versioning**: This constitution follows semantic versioning.
MAJOR for principle removals or incompatible redefinitions. MINOR
for new principles or materially expanded guidance. PATCH for
clarifications and wording fixes.

**Compliance**: All code reviews and plan documents
(`.specify/templates/plan-template.md` Constitution Check gate)
MUST verify alignment with these principles. Violations MUST be
justified in a Complexity Tracking table (per plan template) or
rejected.

**Version**: 1.0.0 | **Ratified**: 2026-03-24 | **Last Amended**: 2026-03-25
