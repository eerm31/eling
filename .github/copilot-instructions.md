# Copilot Instructions

## Workspace structure
Two independent areas — treat them separately:
- **`site/`** — Static anniversary website (`index.html`, `styles.css`, `script.js`, `assets/`). No build step; keep it plain HTML/CSS/JS.
- **`spec-kit/`** — Primary Python spec-driven CLI toolkit. Everything below applies to `spec-kit/`.

## Architecture map
| Directory | Role |
|---|---|
| `src/specify_cli/` | Core CLI implementation — start here for behavior changes |
| `tests/` | Behavioral contract; consult before and after any change |
| `templates/` | Canonical generation templates (plan/spec/tasks/commands/checklist/constitution); consumed by CLI |
| `extensions/` | Extension API, catalogs (`catalog.json`, `catalog.community.json`), agent-context rules, and developer guides |
| `integrations/` | Integration catalogs (same two-catalog split) |
| `presets/` | Preset catalogs + `ARCHITECTURE.md` + `PUBLISHING.md` |
| `docs/` | DocFX site (`docfx.json`); sections: install, quickstart, concepts, guides, reference |
| `specs/` | Example spec artifacts (e.g., `001-anniversary-website/`); follow existing numbering |
| `scripts/bash/` + `scripts/powershell/` | Shell automation helpers |
| `workflows/` | Workflow architecture docs |

## Critical developer workflows
- **Project metadata/entrypoint:** `pyproject.toml` (package name, scripts, dependencies, test config).
- **Running tests:** use the runner configured in `pyproject.toml`; tests in `tests/` cover auth, CLI versioning, extension registration/skills/update hardening, branch numbering, init, merge, presets, GitHub HTTP/workflows, and more.
- **Agent-context rules for extensions:** `extensions/agent-context/` — read when working on the extension system.
- **Docs build:** DocFX config at `docs/docfx.json`.

## Project-specific conventions
- **Change order:** read tests → implement → update catalogs/templates/docs in the same change.
- **Branch/spec numbering is enforced** by `tests/test_branch_numbering.py` — never invent new numbering schemes.
- **Catalog files are contracts.** Changing field names or schema in `extensions/catalog*.json`, `presets/catalog*.json`, or `integrations/catalog*.json` impacts discovery tooling — check all consumers first.
- **Template placeholders are tightly coupled** to CLI generation and tests; changing structure or placeholder names in `templates/` will break both.
- **Do not relocate** files in `templates/`, `extensions/`, `integrations/`, or `presets/`; paths are hardcoded in tests and CLI code.
- `extensions/` has both official (`catalog.json`) and community (`catalog.community.json`) catalogs — keep both correct.

## Integration/coupling points
- CLI (`src/specify_cli/`) ↔ Templates (`templates/`) ↔ Tests (`tests/`) — tightest coupling triangle.
- Extension system: `extensions/` catalogs ↔ `extensions/agent-context/` rules ↔ CLI extension commands.
- Presets and integrations each have parallel catalog + contribution + doc structures; treat them symmetrically.

## When uncertain
Search priority: **tests → templates/catalogs → CLI source (`src/specify_cli/`) → docs**.
