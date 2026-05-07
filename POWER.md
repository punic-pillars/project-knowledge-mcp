# Project Knowledge MCP

## Overview
A cross-project knowledge graph that maps features, workflows, files, and types across backend, mobile, and admin projects. Use this power to understand how features work end-to-end, find relevant files before editing, detect breaking changes, and keep multi-project types in sync.

## Keywords
project knowledge, feature workflow, cross-project, breaking change, type mapping, architecture, search codebase, scan project, register feature, feature health, endpoint mapping, screen mapping, file search, knowledge graph, multi-project, find file, explore project, codebase search, type sync, validate knowledge, suggest mappings

## When to Use
- **Before editing any file** -- run `get_context` with `analyzeImpact: true` to see if it is part of a cross-project workflow
- **Before implementing a feature** -- run `get_context` to get all relevant files, endpoints, and screens across projects
- **When searching for code** -- use `search` instead of grep; it searches both the knowledge graph AND file contents
- **When changing a shared type/DTO** -- run `check_type_mapping` to find all files across all projects that use it
- **When exploring an unfamiliar project** -- use `get_architecture` with filter/highlight to navigate the codebase
- **When onboarding a new feature** -- use `register_feature` to map its workflow steps across projects
- **When setting up type mappings** -- use `suggest_type_mappings` to auto-discover cross-project type matches
- **Periodic maintenance** -- run `validate_knowledge` to detect stale file paths

## Projects Registered
- `backend` -- NestJS API
- `mobile` -- React Native app
- `admin` -- Next.js admin panel

## Tools Reference

### Project Management
| Tool | When to use |
|------|-------------|
| `register_project` | Add a new project to the knowledge base |
| `remove_project` | Remove a project |
| `scan_project` | Auto-discover endpoints (backend), screens (mobile), or pages (admin) |

### Feature Management
| Tool | When to use |
|------|-------------|
| `register_feature` | Define a feature with ordered workflow steps mapped to mobile/backend/admin. Use `overwrite: true` to update an existing feature. |
| `remove_feature` | Remove a feature |
| `get_feature` | Get full workflow details for a feature. Use `includeHealth: true` to also run a health check. Use `verbose: true` for full step details. |

### Search & Context
| Tool | When to use |
|------|-------------|
| `search` | Search across features, endpoints, files, and screens by keyword |
| `reverse_lookup` | Given a file path, find all cross-project references to it (graph-registered + scan-discovered) and which features reference it — use this before editing any file |
| `get_context` | Get all cross-project context for a feature step before coding or testing. Use `analyzeImpact: true` to detect breaking changes. Use `verbose: false` for a compact summary. |
| `get_architecture` | Explore a project directory tree with optional `filter` (path keyword), `highlight` (content keyword with star marker), and `showAll` (full tree with matches marked) |

### Type/Schema Synchronization
| Tool | When to use |
|------|-------------|
| `register_type_mappings` | Link one or more types/DTOs between projects. Accepts a single mapping object or an array — use the array form to bulk-register in one call. |
| `check_type_mapping` | Find all files across all projects that use a given type |
| `suggest_type_mappings` | Auto-detect potential type mappings by scanning all projects for matching type/interface/class/enum definitions. Use `limit` and `confidence` to control output size. Use `autoRegister: true` to auto-register high-confidence matches. |

### Validation
| Tool | When to use |
|------|-------------|
| `validate_knowledge` | Check all registered file paths for stale entries. Use `fix: true` to auto-remove broken references. |

### Persistence
| Tool | When to use |
|------|-------------|
| `export_knowledge` | Confirm the knowledge base is persisted and return the file path — useful before committing the file to git or sharing with a teammate. Note: the knowledge base is auto-persisted after every mutation, so this is a confirmation step, not the save trigger. |
| `import_knowledge` | Load knowledge from a JSON file. Use `merge: true` to combine with existing data, `preview: true` to see a diff before applying. |

## Workflow Example
```
1. User asks to modify a feature
2. -> get_context(featureName, analyzeImpact: true)  -- check impact first
3. -> search(keyword)                                -- find related code if needed
4. -> Make the edit
5. -> get_feature(name, includeHealth: true)         -- confirm nothing is out of sync
   (knowledge is auto-persisted — no manual export needed)
```

## Maintenance Workflow
```
1. -> validate_knowledge(fix: true)     -- remove stale file references
2. -> suggest_type_mappings(limit: 10)  -- find unregistered cross-project types
   (changes are auto-persisted after each mutation)
```