// ============================================================
// TOOLS — Schema definitions for all MCP tools
// These are the descriptions the AI reads to understand
// what each tool does and what parameters it needs.
// ============================================================

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Build the tool list dynamically.
 * projectNames and accountNames are injected at runtime so
 * the AI sees accurate enum values.
 */
export function buildToolList(
  projectNames: string[],
  featureNames: string[]
): Tool[] {
  return [
    // ============================================================
    // PROJECT MANAGEMENT
    // ============================================================
    {
      name: "register_project",
      description:
        "Register a project (mobile, backend, admin) so the MCP knows its path and framework. " +
        "Framework can be 'nestjs', 'nextjs', 'react-native', or 'auto' for auto-detection.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Short name (e.g., 'backend', 'mobile', 'admin')",
          },
          path: {
            type: "string",
            description: "Absolute path to the project directory",
          },
          framework: {
            type: "string",
            description: "'nestjs', 'nextjs', 'react-native', or 'auto'",
            default: "auto",
          },
          description: {
            type: "string",
            description: "Optional description of the project",
          },
        },
        required: ["name", "path"],
      },
    },
    {
      name: "remove_project",
      description: "Remove a registered project from the knowledge base.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            enum: projectNames.length > 0 ? projectNames : undefined,
            description: "Name of the project to remove",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "scan_project",

      description:
        "Auto-discover endpoints (backend), screens (mobile), or pages (admin) from a registered project. " +
        "Returns discovered items for you to link to features.",
      inputSchema: {
        type: "object",
        properties: {
          projectName: {
            type: "string",
            enum: projectNames.length > 0 ? projectNames : undefined,
            description: "Name of the registered project to scan",
          },
        },
        required: ["projectName"],
      },
    },

    // ============================================================
    // FEATURE MANAGEMENT
    // ============================================================
    {
      name: "register_feature",
      description:
        "Define or update a feature with its multi-project workflow steps. " +
        "Each step maps what happens in mobile, backend, and admin. " +
        "Steps are ordered — the AI will use this order to understand user flows. " +
        "Use overwrite=true to replace an existing feature.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Feature name (e.g., 'report', 'stations', 'auth')",
          },
          description: {
            type: "string",
            description: "What this feature does end-to-end",
          },
          workflow: {
            type: "array",
            description:
              "Ordered list of workflow steps. Each step describes what happens " +
              "in mobile, backend, and/or admin at that point in the flow.",
            items: {
              type: "object",
              properties: {
                step: {
                  type: "number",
                  description: "Step number (1, 2, 3...) — must be unique",
                },
                name: {
                  type: "string",
                  description: "Short name (e.g., 'login', 'download config')",
                },
                description: {
                  type: "string",
                  description: "What happens in this step",
                },
                intentional: {
                  type: "boolean",
                  description: "If true, marks this step as intentionally single-project. Suppresses health report gap warnings for this step.",
                  default: false,
                },
                projects: {
                  type: "object",
                  description:
                    "Dynamic per-project mappings for this step. " +
                    "Keys are your registered project names (e.g. 'backend', 'mobile', 'admin', 'api', 'web', 'ios'). " +
                    "Each value is a mapping object with optional fields: " +
                    "screen (mobile screen name), page (web page/route), endpoint (API endpoint), " +
                    "api (API call made by this project), controller (NestJS controller), " +
                    "service (service class), file (relative file path), description (free-form).",
                  additionalProperties: {
                    type: "object",
                    properties: {
                      screen:      { type: "string", description: "Mobile screen name (e.g. 'LoginScreen')" },
                      page:        { type: "string", description: "Web page or route (e.g. '/login')" },
                      endpoint:    { type: "string", description: "API endpoint (e.g. 'POST /api/v1/auth/login')" },
                      api:         { type: "string", description: "API call made by this project" },
                      controller:  { type: "string", description: "Controller class name" },
                      service:     { type: "string", description: "Service class name" },
                      file:        { type: "string", description: "Relative file path within the project (used for impact analysis and validation)" },
                      description: { type: "string", description: "Free-form description of what this project does in this step" },
                    },
                  },
                },
              },
              required: ["step", "name", "description"],
            },
          },
          test_scenarios: {
            type: "array",
            description: "List of test scenarios for this feature",
            items: { type: "string" },
          },
          overwrite: {
            type: "boolean",
            description: "If true, overwrite an existing feature with the same name. If false (default), error if feature already exists.",
            default: false,
          },
        },
        required: ["name", "description", "workflow"],
      },
    },

    {
      name: "remove_feature",
      description: "Remove a feature from the knowledge base.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            enum: featureNames.length > 0 ? featureNames : undefined,
            description: "Feature name to remove",
          },
        },
        required: ["name"],
      },
    },
    {
      name: "get_feature",
      description:
        "Get full details of a feature — all workflow steps with cross-project mappings. " +
        "Use this to understand how a feature works end-to-end before testing or coding. " +
        "Set includeHealth=true to also run a health check on the feature. " +
        "Set verbose=true for full workflow step details (default: compact summary).",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            enum: featureNames.length > 0 ? featureNames : undefined,
            description: "Feature name",
          },
          includeHealth: {
            type: "boolean",
            description: "If true, also run a health check and append results to the output.",
            default: false,
          },
          verbose: {
            type: "boolean",
            description: "If true, return full workflow step details. If false (default), return a compact summary.",
            default: false,
          },
        },
        required: ["name"],
      },
    },


    // ============================================================
    // SEARCH & QUERY
    // ============================================================
    {
      name: "search",
      description:
        "Search across features, endpoints, files, and screens by keyword. " +
        "Searches both the in-memory knowledge graph (features, workflow steps, type mappings) " +
        "AND project file contents on disk. " +
        "Returns all matches with their context (feature name, step, project, or file path + snippet).",

      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search keyword (e.g., 'report', 'station', 'auth', 'controller')",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "reverse_lookup",
      description:
        "Given a file path, find all cross-project references to it — both from the Knowledge Graph " +
        "and by scanning import/require/type-usage in file contents across all registered projects. " +
        "Use this before editing a file to understand its full blast radius, even when the graph is incomplete. " +
        "Returns two labeled buckets: graph-registered (formally tracked) and scan-discovered (found ad hoc). " +
        "Also shows which features and workflow steps reference this file.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Relative path to the file within its project (e.g., 'src/auth/auth.controller.ts')",
          },
        },
        required: ["filePath"],
      },
    },
    {
      name: "get_context",
      description:
        "Get rich cross-project context for a feature at a specific workflow step. " +
        "Returns all relevant endpoints, screens, pages, and files across all projects. " +
        "Use this before testing or implementing a feature step. " +
        "Set analyzeImpact=true to also check for breaking changes across projects. " +
        "Set verbose=true for full per-step breakdown (default: compact summary).",
      inputSchema: {
        type: "object",
        properties: {
          featureName: {
            type: "string",
            enum: featureNames.length > 0 ? featureNames : undefined,
            description: "Feature name",
          },
          stepNumber: {
            type: "number",
            description: "Workflow step number (optional — returns all steps if omitted)",
          },
          analyzeImpact: {
            type: "boolean",
            description: "If true, also run a breaking change analysis on files referenced in the context.",
            default: false,
          },
          verbose: {
            type: "boolean",
            description: "If true, return full per-step breakdown with endpoints/screens/pages. If false (default), return a compact summary.",
            default: false,
          },
        },
        required: ["featureName"],
      },
    },


    // ============================================================
    // ENHANCEMENT 2: TYPE/SCHEMA SYNCHRONIZATION
    // ============================================================
    {
      name: "register_type_mappings",
      description:
        "Register one or more type mappings between projects. " +
        "Accepts either a single mapping object OR an array of mappings. " +
        "For example, if 'StationCreateDto' in the backend corresponds to 'StationFormSchema' in mobile, " +
        "register that mapping here. Then when you change one, you can check what else needs updating. " +
        "When registering multiple mappings, this reduces 50+ tool calls to 1, providing massive token savings.",
      inputSchema: {
        type: "object",
        properties: {
          mappings: {
            type: "array",
            description: "Array of type mapping objects to register (or pass a single mapping object directly)",
            items: {
              type: "object",
              properties: {
                typeName: {
                  type: "string",
                  description: "The shared type name (e.g., 'stationId', 'StationCreateDto', 'User')",
                },
                sourceProject: {
                  type: "string",
                  description: "The project where this type is defined",
                },
                sourceFile: {
                  type: "string",
                  description: "Relative file path where the type is defined in the source project",
                },
                targetProject: {
                  type: "string",
                  description: "The project that has the equivalent type",
                },
                targetFile: {
                  type: "string",
                  description: "Relative file path where the equivalent type is defined in the target project",
                },
                description: {
                  type: "string",
                  description: "Optional description (e.g., 'StationCreateDto ↔ StationFormSchema')",
                },
              },
              required: ["typeName", "sourceProject", "sourceFile", "targetProject", "targetFile"],
            },
          },
        },
        required: ["mappings"],
      },
    },
    {
      name: "check_type_mapping",
      description:
        "Given a type name, find all files across all projects that define or reference it. " +
        "Use this BEFORE changing a type to know exactly which files in which projects need updating. " +
        "For example: check_type_mapping('stationId') returns all files in backend, mobile, and admin that use stationId.",
      inputSchema: {
        type: "object",
        properties: {
          typeName: {
            type: "string",
            description: "Type name to search for (e.g., 'stationId', 'StationCreateDto', 'User')",
          },
        },
        required: ["typeName"],
      },
    },

    // ============================================================
    // ARCHITECTURE EXPLORATION
    // ============================================================

    {
      name: "get_architecture",
      description:
        "Explore a registered project's directory structure as a formatted tree view. " +
        "Use this to understand the project layout, find relevant files, or navigate the codebase. " +
        "Supports optional filtering by path keyword, and optional content highlighting to find files " +
        "containing a specific keyword (marked with ★). " +
        "When using highlight, set showAll=true to see the full tree with matches marked, " +
        "or omit showAll (default false) to show only matching files.",
      inputSchema: {
        type: "object",
        properties: {
          projectName: {
            type: "string",
            enum: projectNames.length > 0 ? projectNames : undefined,
            description: "Name of the registered project to explore",
          },
          filter: {
            type: "string",
            description: "Optional keyword — only show files/folders whose path contains this keyword (case-insensitive)",
          },
          highlight: {
            type: "string",
            description: "Optional keyword — scan file contents and mark files containing this keyword with ★",
          },
          showAll: {
            type: "boolean",
            description: "When used with highlight: if true, show the full tree but mark matching files with ★. If false (default), only show matching files.",
            default: false,
          },
        },
        required: ["projectName"],
      },
    },

    // ============================================================
    // PERSISTENCE
    // ============================================================

    {
      name: "export_knowledge",
      description:
        "Save the current knowledge base to the configured JSON file. " +
        "Note: the knowledge base is auto-persisted after every mutation, so this call is not required to save your work. " +
        "Use it as an explicit confirmation — it returns the file path so you know where the file lives before committing to git.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "import_knowledge",
      description:
        "Load knowledge from a JSON file. Can merge with existing data or replace it entirely. " +
        "When merge=false, the current state is auto-backed up before overwriting. " +
        "Set preview=true to see a diff of what would change without actually importing.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Absolute path to the JSON knowledge file to import",
          },
          merge: {
            type: "boolean",
            description: "If true, merge with existing data. If false, replace.",
            default: false,
          },
          preview: {
            type: "boolean",
            description: "If true, show a diff of what would change without actually importing. Use this to preview before applying.",
            default: false,
          },
        },
        required: ["filePath"],
      },
    },

    // ============================================================
    // VALIDATION
    // ============================================================

    {
      name: "validate_knowledge",
      description:
        "Check all registered file paths across projects, features, and type mappings to detect stale entries. " +
        "Files that have been renamed, moved, or deleted will be flagged as MISSING. " +
        "Use this periodically to keep the knowledge graph in sync with the actual codebase. " +
        "Optionally pass a featureName to validate only files related to that specific feature. " +
        "Set fix=true to automatically remove stale entries (use with caution).",
      inputSchema: {
        type: "object",
        properties: {
          featureName: {
            type: "string",
            enum: featureNames.length > 0 ? featureNames : undefined,
            description: "Optional — if provided, only validate files related to this feature. If omitted, validate everything.",
          },
          fix: {
            type: "boolean",
            description: "If true, automatically remove entries pointing to non-existent files. Use with caution.",
            default: false,
          },
        },
        required: [],
      },

    },

    // ============================================================
    // TYPE SUGGESTIONS
    // ============================================================

    {
      name: "suggest_type_mappings",
      description:
        "Auto-detect potential type mappings by scanning all registered projects for type/interface/class/enum definitions. " +
        "Finds exact name matches across projects (HIGH confidence) and name-similar matches (MEDIUM confidence) " +
        "by stripping common prefixes/suffixes like Dto, Schema, Form, Payload, etc. " +
        "Use this to quickly populate the type mapping registry without manual discovery. " +
        "Set autoRegister=true to automatically register HIGH confidence matches (exact name matches with exactly 2 occurrences).",
      inputSchema: {
        type: "object",
        properties: {
          typeName: {
            type: "string",
            description: "Optional — if provided, only show suggestions related to this type name (case-insensitive partial match).",
          },
          projectName: {
            type: "string",
            enum: projectNames.length > 0 ? projectNames : undefined,
            description: "Optional — if provided, only scan this specific project for type definitions.",
          },
          limit: {
            type: "number",
            description: "Maximum number of suggestions to return (0 = no limit). Default: 10.",
            default: 10,
          },
          confidence: {
            type: "string",
            enum: ["high", "medium", "all"],
            description: "Minimum confidence level to include ('high' = exact matches only, 'medium' = exact + similar, 'all' = everything). Default: 'high'.",
            default: "high",
          },
          verbose: {
            type: "boolean",
            description: "If true, return full details with file paths and registration instructions. If false (default), return a compact summary.",
            default: false,
          },
          autoRegister: {
            type: "boolean",
            description: "If true, automatically register HIGH confidence matches (exact name matches with exactly 2 occurrences). Default: false.",
            default: false,
          },
        },
        required: [],
      },

    },
  ];
}
