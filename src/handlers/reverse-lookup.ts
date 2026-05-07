// ============================================================
// REVERSE LOOKUP HANDLER — reverse_lookup tool
// Given a file path, find all cross-project references to it:
//   1. graphRegistered  — relationships in the Knowledge Graph
//   2. scanDiscovered   — import/require/type-usage found by scanning file contents
// ============================================================

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, relative } from "path";
import type { KnowledgeBase, McpResponse } from "../types.js";

// ============================================================
// TYPES
// ============================================================

type ReferenceType = "import" | "require" | "type-usage";

interface FileReference {
  project: string;
  filePath: string;
  referenceType: ReferenceType;
}

// ============================================================
// FILE SCANNING
// ============================================================

const SKIP_DIRS = new Set([
  "node_modules", ".git", "build", "dist", ".next",
  ".expo", "coverage", ".cache", ".vscode", ".idea",
]);

function findSourceFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) results.push(...findSourceFiles(fullPath));
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch {
    // unreadable directory — skip
  }
  return results;
}

/**
 * Scan a single source file for structural references to `targetPath`.
 * Matches import/require paths and type annotations — not arbitrary string occurrences.
 *
 * targetPath is the relative path as it would appear in an import statement,
 * e.g. "src/auth/auth.controller" (without extension).
 */
function scanFileForReferences(
  content: string,
  targetStem: string
): ReferenceType[] {
  const found = new Set<ReferenceType>();

  // import ... from '...targetStem...'
  const importPattern = /import\s+[^'"]*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importPattern.exec(content)) !== null) {
    if (m[1].includes(targetStem)) {
      found.add("import");
    }
  }

  // require('...targetStem...')
  const requirePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = requirePattern.exec(content)) !== null) {
    if (m[1].includes(targetStem)) {
      found.add("require");
    }
  }

  // type X = import('...targetStem...')  or  : SomeType  where SomeType comes from targetStem
  // We detect explicit type-import syntax
  const typeImportPattern = /import\s+type\s+[^'"]*['"]([^'"]+)['"]/g;
  while ((m = typeImportPattern.exec(content)) !== null) {
    if (m[1].includes(targetStem)) {
      found.add("type-usage");
    }
  }

  return [...found];
}

// ============================================================
// HANDLER
// ============================================================

export function handleReverseLookup(
  kb: KnowledgeBase,
  args: Record<string, unknown>
): McpResponse {
  const { filePath } = args as { filePath: string };

  if (!filePath || typeof filePath !== "string") {
    return {
      content: [{ type: "text", text: "filePath is required." }],
      isError: true,
    };
  }

  // ---- Resolve the file against registered projects ----
  // Accept both absolute paths and relative paths (relative to any project root)
  let resolvedAbsolute: string | null = null;
  let resolvedProject: string | null = null;
  let resolvedRelative: string = filePath;

  for (const [projName, proj] of Object.entries(kb.projects)) {
    const candidate = join(proj.path, filePath);
    if (existsSync(candidate)) {
      resolvedAbsolute = candidate;
      resolvedProject = projName;
      resolvedRelative = filePath.replace(/\\/g, "/");
      break;
    }
    // Also check if filePath is already absolute and within this project
    if (existsSync(filePath) && filePath.startsWith(proj.path)) {
      resolvedAbsolute = filePath;
      resolvedProject = projName;
      resolvedRelative = relative(proj.path, filePath).replace(/\\/g, "/");
      break;
    }
  }

  // Error on missing file (spec requirement 4)
  if (!resolvedAbsolute) {
    return {
      content: [{
        type: "text",
        text: `File not found: "${filePath}"\nChecked against all registered project roots. Verify the path is correct and the project is registered.`,
      }],
      isError: true,
    };
  }

  // ---- Phase 1: Graph-registered relationships ----
  const graphRegistered: FileReference[] = [];
  const graphKeys = new Set<string>(); // for deduplication

  for (const [, feat] of Object.entries(kb.features)) {
    for (const step of feat.workflow) {
      for (const [projName, mapping] of Object.entries(step.projects || {})) {
        if (!mapping.file) continue;
        const normalFile = mapping.file.replace(/\\/g, "/");
        const normalTarget = resolvedRelative.replace(/\\/g, "/");
        if (normalFile === normalTarget || normalFile.endsWith("/" + normalTarget) || normalTarget.endsWith("/" + normalFile)) {
          const key = `${projName}::${normalFile}`;
          if (!graphKeys.has(key)) {
            graphKeys.add(key);
            graphRegistered.push({ project: projName, filePath: normalFile, referenceType: "import" });
          }
        }
      }
    }
  }

  // ---- Phase 2: Scan-discovered references ----
  // Strip extension for import path matching (imports rarely include .ts)
  const targetStem = resolvedRelative.replace(/\.(ts|tsx|js|jsx)$/, "").replace(/\\/g, "/");

  const scanDiscovered: FileReference[] = [];
  const scanKeys = new Set<string>();

  for (const [projName, proj] of Object.entries(kb.projects)) {
    if (!existsSync(proj.path)) continue;

    const files = findSourceFiles(proj.path);
    for (const absFile of files) {
      // Don't report the file as referencing itself
      if (absFile === resolvedAbsolute) continue;

      let content: string;
      try {
        content = readFileSync(absFile, "utf-8");
      } catch {
        continue;
      }

      const refTypes = scanFileForReferences(content, targetStem);
      if (refTypes.length === 0) continue;

      const relFile = relative(proj.path, absFile).replace(/\\/g, "/");

      for (const refType of refTypes) {
        const key = `${projName}::${relFile}::${refType}`;
        // Skip if already in graphRegistered
        if (graphKeys.has(`${projName}::${relFile}`)) continue;
        if (!scanKeys.has(key)) {
          scanKeys.add(key);
          scanDiscovered.push({ project: projName, filePath: relFile, referenceType: refType });
        }
      }
    }
  }

  // ---- Phase 3: Feature associations (absorbed from link_path_to_feature) ----
  interface FeatureMatch {
    feature: string;
    step: number;
    stepName: string;
    project: string;
    file: string;
  }

  const featureMatches: FeatureMatch[] = [];
  const featureKeys = new Set<string>();

  for (const [featName, feat] of Object.entries(kb.features)) {
    for (const step of feat.workflow) {
      for (const [projName, mapping] of Object.entries(step.projects || {})) {
        if (!mapping.file) continue;
        const normalFile = mapping.file.replace(/\\/g, "/");
        const normalTarget = resolvedRelative.replace(/\\/g, "/");
        if (normalFile === normalTarget || normalFile.endsWith("/" + normalTarget) || normalTarget.endsWith("/" + normalFile)) {
          const key = `${featName}:${step.step}:${projName}`;
          if (!featureKeys.has(key)) {
            featureKeys.add(key);
            featureMatches.push({
              feature: featName,
              step: step.step,
              stepName: step.name,
              project: projName,
              file: normalFile,
            });
          }
        }
      }
    }
  }

  // ---- Build output ----
  const lines: string[] = [];
  lines.push(`Reverse Lookup: "${resolvedRelative}"`);
  lines.push(`Project: ${resolvedProject}`);
  lines.push(`=`.repeat(50));
  lines.push(``);

  // Explicit empty result (spec requirement 3)
  if (graphRegistered.length === 0 && scanDiscovered.length === 0 && featureMatches.length === 0) {
    lines.push(`No cross-project references found.`);
    lines.push(`This file is not imported, required, or referenced in any registered project.`);
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }

  // Feature associations first (most actionable)
  if (featureMatches.length > 0) {
    lines.push(`🎯 Feature Associations (${featureMatches.length}):`);
    lines.push(`   This file is registered in the following features:`);
    for (const match of featureMatches) {
      lines.push(`  • [${match.feature}] Step ${match.step}: ${match.stepName} (${match.project})`);
    }
    lines.push(``);
  }

  if (graphRegistered.length > 0) {
    lines.push(`📌 Graph-registered (${graphRegistered.length}):`);
    lines.push(`   These relationships are formally tracked in the Knowledge Graph.`);
    for (const ref of graphRegistered) {
      lines.push(`  • [${ref.project}] ${ref.filePath} (${ref.referenceType})`);
    }
    lines.push(``);
  }

  if (scanDiscovered.length > 0) {
    lines.push(`🔍 Scan-discovered (${scanDiscovered.length}):`);
    lines.push(`   Found by scanning import/require/type-usage in file contents. Not yet in the graph.`);
    for (const ref of scanDiscovered) {
      lines.push(`  • [${ref.project}] ${ref.filePath} (${ref.referenceType})`);
    }
    lines.push(``);
    lines.push(`Tip: Register these relationships via register_feature (overwrite=true) to add them to the graph.`);
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
