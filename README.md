# Project Knowledge MCP Server

[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![npm](https://img.shields.io/badge/npm-%3E%3D9-blue)](https://npmjs.com)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**A cross-project knowledge graph for the Model Context Protocol (MCP).** Map features across mobile, backend, and admin codebases so your AI agent has full-stack context when testing, writing code, debugging, or adding features.

---

## Quick Start

```bash
npx project-knowledge-mcp --knowledge-file ./project-knowledge.json
```

Then add to your MCP settings:

```json
{
  "mcpServers": {
    "project-knowledge": {
      "command": "npx",
      "args": [
        "project-knowledge-mcp",
        "--knowledge-file", "C:\\projects\\project-knowledge.json"
      ],
      "autoApprove": []
    }
  }
}
```

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation & Configuration](#installation--configuration)
- [Knowledge File Management](#knowledge-file-management)
- [Tools Reference](#tools-reference)
- [Usage Walkthrough](#usage-walkthrough)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

### The Problem

When working on a project with multiple codebases — for example, a React Native mobile app, a NestJS backend, and a Next.js admin panel — the AI agent has no awareness of how a single feature flows across all three. This leads to incomplete context, missed dependencies, and breaking changes that could have been caught earlier.

### The Solution

This MCP server stores a **knowledge graph** of your features, mapping each workflow step to the relevant screens, endpoints, controllers, and files in every project. The AI agent can then query this graph to understand end-to-end feature flows, detect cross-project impacts before editing files, and keep type definitions synchronized across codebases.

---

## Features

- **Multi-project awareness** — register any number of projects (mobile, backend, admin, etc.)
- **Feature workflow mapping** — define features as ordered steps across all projects
- **Auto-scanning** — discover NestJS endpoints, Next.js pages, and React Native screens automatically
- **Full-text search** — search across features, endpoints, files, and screens
- **Cross-reference lookup** — given a file path, find which features reference it
- **Rich context** — retrieve all endpoints, screens, and files for a feature at a specific workflow step
- **Breaking change detection** — before editing a file, see which other projects will be affected
- **Type/schema synchronization** — map equivalent types across projects (e.g., `ProductCreateDto` ↔ `ProductFormSchema`)
- **Architecture exploration** — browse any project's directory tree with keyword filtering and content highlighting
- **Health validation** — verify that all registered file paths still exist; auto-detect stale entries
- **Persistent knowledge** — auto-saves to a JSON file after every mutation; can be git-tracked and shared
- **100% dynamic** — all configuration via CLI arguments and runtime tools; no source code edits required

---

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9 (or pnpm / yarn equivalent)
- An MCP-compatible client (e.g., VS Code with Cline, any AI-powered IDE)

---

## Installation & Configuration

### Install from npm (recommended)

```bash
npm install --save-dev project-knowledge-mcp
```

Or run directly without installing:

```bash
npx project-knowledge-mcp --knowledge-file ./project-knowledge.json
```

### Build from Source

```bash
git clone https://github.com/punic-pillars/project-knowledge-mcp.git
cd project-knowledge-mcp
npm install
npm run build
```

### CLI Flags

All configuration is provided via CLI arguments. No environment variables or configuration files are required.

| Flag | Description | Default |
|------|-------------|---------|
| `--backend-path` | Absolute path to the backend project | — |
| `--backend-framework` | Backend framework (`nestjs`, `nextjs`, `react-native`, or `auto`) | `auto` |
| `--backend-name` | Custom name for the backend project | `backend` |
| `--mobile-path` | Absolute path to the mobile project | — |
| `--mobile-framework` | Mobile framework | `auto` |
| `--mobile-name` | Custom name for the mobile project | `mobile` |
| `--admin-path` | Absolute path to the admin project | — |
| `--admin-framework` | Admin framework | `auto` |
| `--admin-name` | Custom name for the admin project | `admin` |
| `--knowledge-file` | Absolute path to persist the knowledge JSON | `./project-knowledge.json` |

### MCP Client Configuration

**Basic setup** — register projects at runtime via tools:

```json
{
  "mcpServers": {
    "project-knowledge": {
      "command": "npx",
      "args": [
        "project-knowledge-mcp",
        "--knowledge-file", "C:\\projects\\project-knowledge.json"
      ],
      "autoApprove": []
    }
  }
}
```

**Bootstrap setup** — pre-register projects at startup:

```json
{
  "mcpServers": {
    "project-knowledge": {
      "command": "npx",
      "args": [
        "project-knowledge-mcp",
        "--knowledge-file", "C:\\projects\\project-knowledge.json",
        "--backend-path", "C:\\projects\\backend",
        "--mobile-path", "C:\\projects\\mobile",
        "--admin-path", "C:\\projects\\admin"
      ],
      "autoApprove": []
    }
  }
}
```

---

## Knowledge File Management

The knowledge file is a plain JSON file that stores all registered projects, feature workflows, and type mappings. Understanding where it lives is essential for maintaining a consistent knowledge graph.

### The Shared File Pattern

If your fullstack projects live in separate directories (e.g., `backend/`, `mobile/`, `admin/`), each IDE window starts the MCP server from a different working directory. Without `--knowledge-file`, each instance creates its own fragment:

```
backend/
└── project-knowledge.json   ← only backend context

mobile/
└── project-knowledge.json   ← only mobile context

admin/
└── project-knowledge.json   ← only admin context
```

This defeats the purpose of cross-project awareness. **Always use `--knowledge-file` with an absolute path** to point all IDE windows to the same file:

```
projects/
├── project-knowledge.json   ← single source of truth
├── backend/
├── mobile/
└── admin/
```

Use the **same `--knowledge-file` path** in every IDE window, regardless of which sub-project you have open. All instances read and write to the same file, keeping the knowledge graph complete and consistent.

### When the Default Is Safe

The default path (no `--knowledge-file`) is only safe when you open the **monorepo root** — the single directory containing all sub-projects:

```
my-monorepo/              ← open this in your IDE
├── project-knowledge.json   ← created here, covers everything
├── backend/
├── mobile/
└── admin/
```

If your projects are in separate repositories or directories, always use `--knowledge-file`.

### Sharing with Your Team

Since the knowledge file is plain JSON, you can commit it to version control and share it with your team:

```bash
# Track the knowledge graph
git add project-knowledge.json
git commit -m "chore: add project knowledge graph"

# Or keep it local
echo "project-knowledge.json" >> .gitignore
```

> **Guideline**: One fullstack project = one knowledge file. Use `--knowledge-file` with an absolute path whenever your projects live in separate directories.

---

## Tools Reference

### Project Management

| Tool | Description |
|------|-------------|
| `register_project` | Register a project with name, path, and framework |
| `remove_project` | Remove a registered project |
| `scan_project` | Auto-discover endpoints, screens, or pages from a project |

### Feature Management

| Tool | Description |
|------|-------------|
| `register_feature` | Define a feature with its multi-project workflow steps |
| `remove_feature` | Remove a feature |
| `get_feature` | Retrieve full feature details (compact or verbose, with optional health check) |

### Search & Query

| Tool | Description |
|------|-------------|
| `search` | Search across features, endpoints, files, and screens |
| `reverse_lookup` | Find all cross-project references to a file (graph-registered + scan-discovered), plus which features reference it |
| `get_context` | Retrieve cross-project context for a feature or step (with optional impact analysis) |

### Type/Schema Synchronization

| Tool | Description |
|------|-------------|
| `register_type_mappings` | Register one or more type mappings (accepts single object or array) |
| `check_type_mapping` | Find all files across projects that define or reference a type |
| `suggest_type_mappings` | Auto-detect potential type mappings by scanning all projects |

### Architecture Exploration

| Tool | Description |
|------|-------------|
| `get_architecture` | Explore a project's directory tree with optional `filter` (path keyword), `highlight` (content keyword with ★ marker), and `showAll` (full tree with matches marked) |

### Validation

| Tool | Description |
|------|-------------|
| `validate_knowledge` | Check all registered file paths for stale entries; optionally auto-fix with `fix=true` |

### Persistence

| Tool | Description |
|------|-------------|
| `export_knowledge` | Confirm the knowledge file path and trigger an explicit save (auto-persist handles this after every mutation) |
| `import_knowledge` | Load knowledge from a JSON file (merge or replace, with preview) |

---

## Usage Walkthrough

This walkthrough demonstrates the core workflow using a real multi-project setup (NestJS backend, React Native mobile, Next.js admin panel). Domain names have been anonymized — "products" instead of "stations", "orders" instead of "reports" — but every command shown was run against actual projects.

### Step 1: Register Projects

```json
register_project { name: "backend", path: "C:/projects/backend", framework: "nestjs" }
register_project { name: "mobile", path: "C:/projects/mobile", framework: "react-native" }
register_project { name: "admin", path: "C:/projects/admin", framework: "auto" }
```

### Step 2: Scan Projects

Discover endpoints, screens, and pages automatically:

```json
scan_project { projectName: "backend" }
scan_project { projectName: "mobile" }
scan_project { projectName: "admin" }
```

The scanners discover **150+ endpoints**, **200+ screens**, and multiple admin pages across all registered projects.

### Step 3: Define a Feature

Register an **auth** feature — a straightforward flow that touches all three projects:

```json
register_feature {
  name: "auth",
  description: "Authentication flow — login, register, forgot password, email confirmation",
  workflow: [
    {
      step: 1, name: "Login",
      description: "User logs in with email and password",
      mobile: { screen: "LoginScreen", api: "POST /api/v1/auth/email/login" },
      backend: { endpoint: "POST /api/v1/auth/email/login", controller: "AuthController", file: "src/auth/auth.controller.ts" },
      admin: { page: "/login", file: "src/pages/Login" }
    },
    {
      step: 2, name: "Register",
      description: "User registers a new account",
      mobile: { screen: "RegisterScreen", api: "POST /api/v1/auth/email/register" },
      backend: { endpoint: "POST /api/v1/auth/email/register", controller: "AuthController", file: "src/auth/auth.controller.ts" }
    },
    {
      step: 3, name: "Email Confirmation",
      description: "Confirm email address",
      mobile: { api: "POST /api/v1/auth/email/confirm" },
      backend: { endpoint: "POST /api/v1/auth/email/confirm", controller: "AuthController", file: "src/auth/auth.controller.ts" }
    },
    {
      step: 4, name: "Forgot Password",
      description: "Request password reset",
      mobile: { screen: "ForgotPasswordScreen", api: "POST /api/v1/auth/forgot/password" },
      backend: { endpoint: "POST /api/v1/auth/forgot/password", controller: "AuthController", file: "src/auth/auth.controller.ts" }
    },
    {
      step: 5, name: "Reset Password",
      description: "Reset password with token",
      mobile: { screen: "ResetPasswordScreen", api: "POST /api/v1/auth/reset/password" },
      backend: { endpoint: "POST /api/v1/auth/reset/password", controller: "AuthController", file: "src/auth/auth.controller.ts" }
    }
  ],
  test_scenarios: [
    "Login with valid credentials returns token",
    "Login with invalid email returns 401",
    "Register with existing email returns conflict",
    "Forgot password sends email",
    "Reset password with valid token works"
  ]
}
```

### Step 4: Query Features

**Compact mode** — get a summary:

```json
get_feature { name: "auth" }
```

Returns: 5 steps, 5 test scenarios, mobile=5 screens, backend=5 endpoints, admin=1 page.

**Verbose mode** — get full workflow details:

```json
get_feature { name: "auth", verbose: true }
```

Returns all 5 steps with full mobile screens, backend endpoints, controllers, and file paths.

**With health check** — verify all registered paths exist:

```json
get_feature { name: "auth", includeHealth: true }
```

Returns: Health: 5/5 backend ok, mobile=5/5, admin=1/5, 5 test scenarios.

### Step 5: Search and Cross-Reference

**Search across the knowledge graph:**

```json
search { query: "product" }
```

Returns 100+ results across features, workflow steps, backend mappings, mobile mappings, type mappings, and file contents.

**Find cross-project references to a file:**

```json
reverse_lookup { filePath: "auth.controller.ts" }
```

Returns:
- **Feature associations**: Which features reference this file (steps 1–5 of the auth feature)
- **Graph-registered**: 5 exact matches (steps 1–5 of the auth feature, all backend), plus the admin Login page
- **Scan-discovered**: All files across all projects that import or reference `auth.controller.ts`

### Step 6: Type Mappings

**Register a cross-project type mapping:**

```json
register_type_mappings {
  mapping: {
    typeName: "productId",
    sourceProject: "backend",
    sourceFile: "src/products/infrastructure/persistence/relational/entities/product.entity.ts",
    targetProject: "mobile",
    targetFile: "app/_types/ProductTypes.ts",
    description: "Standardizing productId as numeric INTEGER across all projects"
  }
}
```

**Check what references a type before changing it:**

```json
check_type_mapping { typeName: "productId" }
```

Returns all files across all projects that define or reference `productId`.

**Auto-discover potential type mappings:**

```json
suggest_type_mappings { limit: 5, confidence: "high" }
```

Scans all registered projects and finds exact type name matches — returns suggestions with source and target file paths ready to register.

### Step 7: Validate and Export

**Validate knowledge health:**

```json
validate_knowledge
```

Checks all registered file paths across all features and type mappings. Returns a report of existing and missing entries.

**Confirm persistence:**

The knowledge graph is **auto-persisted** after every mutation — `register_project`, `register_feature`, `register_type_mappings`, and `validate_knowledge` with `fix=true` all write to disk immediately. Use `export_knowledge` to confirm the file path before committing to version control:

```json
export_knowledge
```

Returns the path to the knowledge file. Git-track this file to share context with your team.

---

## Security

- **Knowledge file is plain JSON** — you control where it is stored and who has access
- **No credentials stored** — this MCP only stores project paths and feature mappings
- **File scanning is read-only** — scanners only read files, never modify them

---

## Contributing

Contributions are welcome. Please open an issue or pull request for any improvements, bug fixes, or feature requests.

---

## License

[MIT](LICENSE)
