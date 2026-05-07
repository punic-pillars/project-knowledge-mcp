// ============================================================
// TYPES — Shared interfaces for the entire MCP
// ============================================================

/** A registered project (mobile, backend, admin, etc.) */
export interface ProjectConfig {
  name: string;
  path: string;
  framework: string;
  description?: string;
}

/**
 * A project-side mapping within a workflow step.
 * All fields are optional — use whichever are relevant for the project type.
 *
 * Common patterns:
 *   backend:  endpoint, controller, service, file
 *   mobile:   screen, api, file
 *   frontend: page, file
 *   any:      file (always useful for reverse_lookup and impact analysis)
 */
export interface ProjectMapping {
  // Navigation / routing
  screen?: string;       // mobile screen name
  page?: string;         // web page / route
  // API
  endpoint?: string;     // e.g. "POST /api/v1/auth/login"
  api?: string;          // API call made by this project
  // Code
  controller?: string;   // NestJS controller class
  service?: string;      // service class
  file?: string;         // relative file path (used for impact analysis & validation)
  // Generic
  description?: string;  // free-form description of what this project does in this step
}

/** A single step in a feature's workflow, with dynamic cross-project mappings */
export interface WorkflowStep {
  step: number;
  name: string;
  description: string;
  intentional?: boolean;  // marks this step as intentionally single-project (suppresses health report gaps)
  /**
   * Dynamic project mappings — keyed by project name (e.g. "backend", "mobile", "admin",
   * "ios", "web", "api", or any name you registered via register_project).
   */
  projects?: Record<string, ProjectMapping>;
}

/** A feature with its full workflow and test scenarios */
export interface Feature {
  name: string;
  description: string;
  workflow: WorkflowStep[];
  test_scenarios: string[];
}

/** Links a type/schema in one project to its equivalent in another */
export interface TypeMapping {
  typeName: string;
  sourceProject: string;
  sourceFile: string;
  targetProject: string;
  targetFile: string;
  description?: string;
}

/** The entire knowledge base persisted to JSON */
export interface KnowledgeBase {
  projects: Record<string, ProjectConfig>;
  features: Record<string, Feature>;
  typeMappings: TypeMapping[];
}

/** CLI configuration parsed from --flags */
export interface CliConfig {
  knowledgeFile: string;
  bootstrapProjects: Array<{ name: string; path: string; framework: string }>;
}

/** Standard MCP response helper */
export interface McpResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/** Search result item */
export interface SearchResult {
  type: string;
  [key: string]: unknown;
}

/** Feature-to-file link result */
export interface FileLink {
  feature: string;
  step: number;
  stepName: string;
  project: string;
}

/** Breaking change alert result */
export interface BreakingChangeAlert {
  filePath: string;
  staleWarning?: string;
  referencedIn: Array<{
    feature: string;
    step: number;
    stepName: string;
    project: string;
  }>;
  affectedCrossProjectFiles: Array<{
    project: string;
    file: string;
    context: string;
  }>;
}

/** A deduplicated impact analysis entry — one per unique file, with all steps it belongs to */
export interface ImpactEntry {
  file: string;
  project: string;
  staleWarning?: string;
  affectedSteps: Array<{ step: number; name: string }>;
  referencedIn: Array<{
    feature: string;
    step: number;
    stepName: string;
    project: string;
  }>;
  affectedCrossProjectFiles: Array<{
    project: string;
    file: string;
    context: string;
  }>;
}

/** Health check result for a single step */
export interface StepHealthResult {
  step: number;
  name: string;
  /** Which project names are mapped in this step */
  mappedProjects: string[];
  hasTestScenario: boolean;
  intentional?: boolean;  // step is intentionally single-project
}
