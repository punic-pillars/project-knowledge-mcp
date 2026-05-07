// ============================================================
// CONFIG — CLI argument parsing + knowledge base persistence
// ============================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { detectFramework } from "./scanners/index.js";
import type { CliConfig, KnowledgeBase, WorkflowStep } from "./types.js";

// ---- CLI Parsing ----

function parseCliArgs(): CliConfig {
  const args = process.argv.slice(2);
  const cliConfig: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : "true";
      cliConfig[key] = value;
      if (value !== "true") i++;
    }
  }

  const config: CliConfig = {
    knowledgeFile: cliConfig["knowledge-file"] || "",
    bootstrapProjects: [],
  };

  // Parse bootstrap projects from CLI flags
  // --backend-path "C:/..." --backend-framework "nestjs" --backend-name "backend"
  // --mobile-path "C:/..." --mobile-framework "react-native" --mobile-name "mobile"
  // --admin-path "C:/..." --admin-framework "nextjs" --admin-name "admin"
  const projectPrefixes = ["backend", "mobile", "admin"];
  for (const prefix of projectPrefixes) {
    const path = cliConfig[`${prefix}-path`];
    if (path) {
      config.bootstrapProjects.push({
        name: cliConfig[`${prefix}-name`] || prefix,
        path,
        framework: cliConfig[`${prefix}-framework`] || "auto",
      });
    }
  }

  return config;
}

export const cliConfig = parseCliArgs();

// ---- Knowledge Persistence ----

function getKnowledgeFilePath(): string {
  if (cliConfig.knowledgeFile) return cliConfig.knowledgeFile;

  // Default: workspace-relative project-knowledge.json for better UX
  // Simple, visible, and IDE-agnostic
  return join(process.cwd(), "project-knowledge.json");
}

// ============================================================
// MIGRATION — Upgrade old knowledge files that used fixed
// mobile/backend/admin top-level keys on WorkflowStep to the
// new dynamic `projects` record format.
// ============================================================

function migrateStep(step: Record<string, unknown>): WorkflowStep {
  // Already migrated — has `projects` key
  if (step.projects && typeof step.projects === "object") {
    return step as unknown as WorkflowStep;
  }

  const projects: Record<string, unknown> = {};
  const LEGACY_KEYS = ["mobile", "backend", "admin"] as const;

  for (const key of LEGACY_KEYS) {
    if (step[key] && typeof step[key] === "object") {
      projects[key] = step[key];
    }
  }

  const migrated: Record<string, unknown> = {
    step: step.step,
    name: step.name,
    description: step.description,
  };
  if (step.intentional !== undefined) migrated.intentional = step.intentional;
  if (Object.keys(projects).length > 0) migrated.projects = projects;

  return migrated as unknown as WorkflowStep;
}

function migrateKnowledgeBase(raw: Record<string, unknown>): KnowledgeBase {
  const kb: KnowledgeBase = {
    projects: (raw.projects as KnowledgeBase["projects"]) || {},
    features: {},
    typeMappings: (raw.typeMappings as KnowledgeBase["typeMappings"]) || [],
  };

  const rawFeatures = (raw.features as Record<string, unknown>) || {};
  for (const [featName, feat] of Object.entries(rawFeatures)) {
    const f = feat as Record<string, unknown>;
    kb.features[featName] = {
      name: f.name as string,
      description: f.description as string,
      workflow: ((f.workflow as Record<string, unknown>[]) || []).map(migrateStep),
      test_scenarios: (f.test_scenarios as string[]) || [],
    };
  }

  return kb;
}

let knowledgeBase: KnowledgeBase = { projects: {}, features: {}, typeMappings: [] };

function loadKnowledge(): void {
  const filePath = getKnowledgeFilePath();
  if (existsSync(filePath)) {
    try {
      const raw = JSON.parse(readFileSync(filePath, "utf-8"));
      knowledgeBase = migrateKnowledgeBase(raw);
    } catch (e) {
      console.error(`Failed to load knowledge file: ${e}`);
      knowledgeBase = { projects: {}, features: {}, typeMappings: [] };
    }
  } else {
    knowledgeBase = { projects: {}, features: {}, typeMappings: [] };
  }
}

function saveKnowledge(): void {
  const filePath = getKnowledgeFilePath();
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, JSON.stringify(knowledgeBase, null, 2), "utf-8");
  } catch (e) {
    console.error(`Failed to save knowledge file: ${e}`);
  }
}

// Bootstrap projects from CLI args
function bootstrapProjects(): void {
  for (const bp of cliConfig.bootstrapProjects) {
    let framework = bp.framework;
    if (framework === "auto") {
      const detected = detectFramework(bp.path);
      framework = detected || "generic";
    }

    knowledgeBase.projects[bp.name] = {
      name: bp.name,
      path: bp.path,
      framework,
      description: `Bootstrapped from CLI args`,
    };
  }

  if (cliConfig.bootstrapProjects.length > 0) {
    saveKnowledge();
  }
}

// Initialize on module load
loadKnowledge();
bootstrapProjects();

// ---- Public API ----

export function getKnowledge(): KnowledgeBase {
  return knowledgeBase;
}

export function setKnowledge(kb: KnowledgeBase): void {
  knowledgeBase = kb;
}

export function persist(): void {
  saveKnowledge();
}

export function getKnowledgePath(): string {
  return getKnowledgeFilePath();
}

/**
 * Auto-persist wrapper: updates knowledge base and immediately flushes to disk.
 * Use this in mutation handlers to eliminate manual persist() calls.
 */
export function setKnowledgeAndPersist(kb: KnowledgeBase): void {
  knowledgeBase = kb;
  saveKnowledge();
}
