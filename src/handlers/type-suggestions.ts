// ============================================================
// TYPE SUGGESTIONS HANDLER — Auto-detect potential type mappings
// Scans all registered projects for type/interface/class/enum
// definitions and finds candidates across projects.
// ============================================================

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, relative } from "path";
import type { KnowledgeBase, McpResponse } from "../types.js";

// ============================================================
// CONSTANTS
// ============================================================

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "build",
  "dist",
  ".next",
  ".expo",
  "coverage",
  ".cache",
  ".vscode",
  ".idea",
]);

/** Suffixes/prefixes to strip for name similarity matching */
const STRIP_TOKENS = [
  "Dto", "dto",
  "Schema", "schema",
  "Form", "form",
  "Payload", "payload",
  "Request", "request",
  "Response", "response",
  "Input", "input",
  "Output", "output",
  "Type", "type",
  "Model", "model",
  "Entity", "entity",
  "Create", "create",
  "Update", "update",
  "Delete", "delete",
  "Get", "get",
  "List", "list",
  "Item", "item",
  "Data", "data",
  "Info", "info",
  "Params", "params",
  "Query", "query",
  "Body", "body",
  "Result", "result",
];

// ============================================================
// TYPES
// ============================================================

interface TypeDefinition {
  name: string;
  kind: "interface" | "type" | "class" | "enum";
  file: string;
  project: string;
}

interface TypeSuggestion {
  typeName: string;
  confidence: "high" | "medium";
  occurrences: Array<{
    project: string;
    file: string;
    kind: string;
  }>;
  matchReason: string;
}

// ============================================================
// FILE SCANNING
// ============================================================

/**
 * Recursively find all .ts and .tsx files in a directory, skipping
 * common build/cache directories.
 */
function findTypeFiles(dir: string): string[] {
  const results: string[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        results.push(...findTypeFiles(fullPath));
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return results;
}

/**
 * Extract type/interface/class/enum definitions from a file's content.
 * Uses regex to find export declarations and top-level definitions.
 */
function extractTypeDefinitions(
  content: string,
  filePath: string,
  projectName: string,
  projectPath: string
): TypeDefinition[] {
  const definitions: TypeDefinition[] = [];
  const relativePath = relative(projectPath, filePath).replace(/\\/g, "/");

  // Pattern 1: export interface/type/class/enum Name
  const exportPattern = /export\s+(interface|type|class|enum)\s+(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = exportPattern.exec(content)) !== null) {
    definitions.push({
      name: match[2],
      kind: match[1] as TypeDefinition["kind"],
      file: relativePath,
      project: projectName,
    });
  }

  // Pattern 2: Non-exported top-level interface/type/class/enum Name
  // (only at top level — not inside functions/blocks)
  const topLevelPattern = /^(?:export\s+)?(?:declare\s+)?(interface|type|class|enum)\s+(\w+)/gm;
  while ((match = topLevelPattern.exec(content)) !== null) {
    const name = match[2];
    // Avoid duplicates (already caught by export pattern)
    if (!definitions.find((d) => d.name === name && d.file === relativePath)) {
      definitions.push({
        name,
        kind: match[1] as TypeDefinition["kind"],
        file: relativePath,
        project: projectName,
      });
    }
  }

  return definitions;
}

// ============================================================
// NAME SIMILARITY
// ============================================================

/**
 * Strip common prefixes/suffixes to get the "stem" of a type name.
 * E.g., "StationCreateDto" → "Station", "LoginPayload" → "Login"
 */
function getTypeStem(name: string): string {
  let stem = name;

  // Strip known suffixes (longest first to avoid partial stripping)
  const sortedTokens = [...STRIP_TOKENS].sort((a, b) => b.length - a.length);
  for (const token of sortedTokens) {
    if (stem.endsWith(token)) {
      stem = stem.slice(0, -token.length);
      break;
    }
    if (stem.startsWith(token)) {
      stem = stem.slice(token.length);
      break;
    }
  }

  return stem;
}

// ============================================================
// CANDIDATE DETECTION
// ============================================================

/**
 * Find exact name matches across projects.
 * Returns suggestions where the same type name exists in 2+ projects.
 */
function findExactMatches(
  allTypes: TypeDefinition[]
): TypeSuggestion[] {
  const suggestions: TypeSuggestion[] = [];
  const seen = new Set<string>();

  // Group by type name
  const byName: Record<string, TypeDefinition[]> = {};
  for (const t of allTypes) {
    if (!byName[t.name]) byName[t.name] = [];
    byName[t.name].push(t);
  }

  for (const [typeName, occurrences] of Object.entries(byName)) {
    // Need at least 2 different projects
    const uniqueProjects = new Set(occurrences.map((o) => o.project));
    if (uniqueProjects.size < 2) continue;

    // Deduplicate by (project, file) pairs
    const uniqueOccurrences: TypeDefinition[] = [];
    const seenPairs = new Set<string>();
    for (const occ of occurrences) {
      const pair = `${occ.project}::${occ.file}`;
      if (!seenPairs.has(pair)) {
        seenPairs.add(pair);
        uniqueOccurrences.push(occ);
      }
    }

    if (uniqueOccurrences.length < 2) continue;

    const key = `exact::${typeName}`;
    if (seen.has(key)) continue;
    seen.add(key);

    suggestions.push({
      typeName,
      confidence: "high",
      occurrences: uniqueOccurrences,
      matchReason: `Exact name match — "${typeName}" found in ${uniqueProjects.size} projects`,
    });
  }

  return suggestions;
}

/**
 * Find name-similar matches across projects.
 * Strips common prefixes/suffixes and compares stems.
 */
function findSimilarMatches(
  allTypes: TypeDefinition[],
  exactMatches: TypeSuggestion[]
): TypeSuggestion[] {
  const suggestions: TypeSuggestion[] = [];

  // Collect names already covered by exact matches
  const exactCovered = new Set<string>();
  for (const em of exactMatches) {
    exactCovered.add(em.typeName);
  }

  // Group by stem
  const byStem: Record<string, TypeDefinition[]> = {};
  for (const t of allTypes) {
    const stem = getTypeStem(t.name).toLowerCase();
    if (stem.length < 2) continue;
    if (!byStem[stem]) byStem[stem] = [];
    byStem[stem].push(t);
  }

  const seen = new Set<string>();

  for (const [stem, occurrences] of Object.entries(byStem)) {
    const uniqueProjects = new Set(occurrences.map((o) => o.project));
    if (uniqueProjects.size < 2) continue;

    // Deduplicate by (project, file) pairs
    const uniqueOccurrences: TypeDefinition[] = [];
    const seenPairs = new Set<string>();
    for (const occ of occurrences) {
      const pair = `${occ.project}::${occ.file}`;
      if (!seenPairs.has(pair)) {
        seenPairs.add(pair);
        uniqueOccurrences.push(occ);
      }
    }

    if (uniqueOccurrences.length < 2) continue;

    // Check that at least some names are different (not all exact matches)
    const uniqueNames = new Set(uniqueOccurrences.map((o) => o.name));
    if (uniqueNames.size < 2) continue;

    // Skip if all names are already covered by exact matches
    const allCovered = [...uniqueNames].every((n) => exactCovered.has(n));
    if (allCovered) continue;

    const key = `similar::${stem}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const nameList = [...uniqueNames].join(", ");
    suggestions.push({
      typeName: [...uniqueNames].join(" ↔ "),
      confidence: "medium",
      occurrences: uniqueOccurrences,
      matchReason: `Name similarity — types sharing stem "${stem}": ${nameList}`,
    });
  }

  return suggestions;
}

// ============================================================
// MAIN HANDLER
// ============================================================

export function handleSuggestTypeMappings(
  kb: KnowledgeBase,
  persist: () => void,
  args: Record<string, unknown>
): McpResponse {
  const { typeName, projectName, limit: rawLimit, confidence: rawConfidence, verbose, autoRegister } = args as {
    typeName?: string;
    projectName?: string;
    limit?: number;
    confidence?: string;
    verbose?: boolean;
    autoRegister?: boolean;
  };

  // Parse and validate limit (default: 10, 0 = no limit)
  const limit = typeof rawLimit === "number" && rawLimit >= 0 ? Math.floor(rawLimit) : 10;

  // Parse and validate confidence filter (default: "high")
  const confidence: "high" | "medium" | "all" =
    rawConfidence === "medium" || rawConfidence === "all" ? rawConfidence : "high";

  const projectEntries = Object.entries(kb.projects);

  if (projectEntries.length === 0) {
    return {
      content: [{
        type: "text",
        text: "No projects registered. Use register_project first to add projects, then run suggest_type_mappings.",
      }],
    };
  }

  // ============================================================
  // PHASE 1: Scan all projects for type definitions
  // ============================================================

  const allTypes: TypeDefinition[] = [];
  const scanErrors: string[] = [];

  for (const [pName, project] of projectEntries) {
    // Filter by projectName if provided
    if (projectName && pName !== projectName) continue;

    if (!existsSync(project.path)) {
      scanErrors.push(`Project "${pName}" path does not exist: ${project.path}`);
      continue;
    }

    try {
      const files = findTypeFiles(project.path);
      for (const filePath of files) {
        try {
          const content = readFileSync(filePath, "utf-8");
          const defs = extractTypeDefinitions(content, filePath, pName, project.path);
          allTypes.push(...defs);
        } catch {
          // Skip files that can't be read
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      scanErrors.push(`Error scanning project "${pName}": ${message}`);
    }
  }

  if (allTypes.length === 0) {
    const msg = projectName
      ? `No type definitions found in project "${projectName}".`
      : "No type definitions found in any registered project.";
    return {
      content: [{ type: "text", text: msg }],
    };
  }

  // ============================================================
  // PHASE 2: Filter by typeName if provided
  // ============================================================

  let filteredTypes = allTypes;
  if (typeName) {
    const lowerQuery = typeName.toLowerCase();
    filteredTypes = allTypes.filter(
      (t) =>
        t.name.toLowerCase().includes(lowerQuery) ||
        lowerQuery.includes(t.name.toLowerCase())
    );

    if (filteredTypes.length === 0) {
      return {
        content: [{
          type: "text",
          text: `No type definitions found matching "${typeName}" in the scanned projects.`,
        }],
      };
    }
  }

  // ============================================================
  // PHASE 3: Find candidates
  // ============================================================

  const exactMatches = findExactMatches(filteredTypes);
  const similarMatches = findSimilarMatches(filteredTypes, exactMatches);

  // ============================================================
  // PHASE 3.5: Auto-register HIGH confidence matches if requested
  // ============================================================

  const autoRegistered: Array<{ typeName: string; sourceProject: string; targetProject: string }> = [];

  if (autoRegister && exactMatches.length > 0) {
    for (const match of exactMatches) {
      // Only auto-register if there are exactly 2 occurrences (one source, one target)
      // More than 2 would be ambiguous
      if (match.occurrences.length === 2) {
        const [source, target] = match.occurrences;

        // Check if mapping already exists
        const existing = kb.typeMappings.find(
          (m) =>
            m.typeName === match.typeName &&
            m.sourceProject === source.project &&
            m.targetProject === target.project
        );

        if (!existing) {
          kb.typeMappings.push({
            typeName: match.typeName,
            sourceProject: source.project,
            sourceFile: source.file,
            targetProject: target.project,
            targetFile: target.file,
            description: `Auto-registered: ${match.typeName} shared between ${source.project} and ${target.project}`,
          });

          autoRegistered.push({
            typeName: match.typeName,
            sourceProject: source.project,
            targetProject: target.project,
          });
        }
      }
    }

    // Persist once after all auto-registrations
    if (autoRegistered.length > 0) {
      persist();
    }
  }

  // ============================================================
  // PHASE 4: Filter by confidence level
  // ============================================================

  let displayExact = exactMatches;
  let displaySimilar: TypeSuggestion[] = [];

  if (confidence === "high") {
    // Only exact matches
    displaySimilar = [];
  } else if (confidence === "medium") {
    // Exact + similar
    displaySimilar = similarMatches;
  } else {
    // "all" — everything
    displaySimilar = similarMatches;
  }

  // ============================================================
  // PHASE 5: Apply limit
  // ============================================================

  let combined: TypeSuggestion[] = [...displayExact, ...displaySimilar];
  const totalAvailable = combined.length;

  if (limit > 0 && combined.length > limit) {
    combined = combined.slice(0, limit);
  }

  // Separate back for display ordering
  const limitedExact = combined.filter((s) => s.confidence === "high");
  const limitedSimilar = combined.filter((s) => s.confidence === "medium");

  // ============================================================
  // PHASE 6: Build output
  // ============================================================

  const lines: string[] = [];
  const projectCount = projectName ? 1 : projectEntries.length;
  const typeCount = filteredTypes.length;

  const confidenceLabel =
    confidence === "high" ? "high (exact matches only)" :
    confidence === "medium" ? "medium (exact + similar)" :
    "all";

  lines.push(`Type Mapping Suggestions`);
  lines.push(`========================`);
  lines.push(`Scanned ${projectCount} project(s), found ${typeCount} type definitions.`);
  lines.push(`Filter: confidence=${confidenceLabel}, limit=${limit === 0 ? "none" : limit}, autoRegister=${autoRegister ? "true" : "false"}`);
  lines.push(``);

  // Auto-registration summary
  if (autoRegistered.length > 0) {
    lines.push(`✅ Auto-registered ${autoRegistered.length} HIGH confidence mapping(s):`);
    for (const ar of autoRegistered) {
      lines.push(`  • "${ar.typeName}" (${ar.sourceProject} ↔ ${ar.targetProject})`);
    }
    lines.push(``);
  }

  // Summary
  if (totalAvailable === 0) {
    lines.push(`No cross-project type mapping candidates found.`);
    lines.push(``);
    lines.push(`Tip: Register more projects or check that your projects contain`);
    lines.push(`exported type/interface/class/enum definitions.`);
  } else {
    const shown = combined.length;
    const hidden = totalAvailable - shown;
    lines.push(`Found ${totalAvailable} potential type mapping(s), showing ${shown}${hidden > 0 ? ` (${hidden} hidden — increase limit or set limit=0 to see all)` : ""}:`);
    lines.push(``);

    // ============================================================
    // COMPACT MODE (default) — just list type names, no file paths
    // ============================================================
    if (!verbose) {
      // HIGH confidence
      if (limitedExact.length > 0) {
        lines.push(`🟢 HIGH confidence (exact name match):`);
        for (const s of limitedExact) {
          const projects = [...new Set(s.occurrences.map((o) => o.project))].join(", ");
          const wasAutoRegistered = autoRegistered.some((ar) => ar.typeName === s.typeName);
          const badge = wasAutoRegistered ? " [AUTO-REGISTERED]" : "";
          lines.push(`  "${s.typeName}" (${projects})${badge}`);
        }
        lines.push(``);
      }

      // MEDIUM confidence
      if (limitedSimilar.length > 0) {
        lines.push(`🟡 MEDIUM confidence (name similarity):`);
        for (const s of limitedSimilar) {
          lines.push(`  ${s.matchReason}`);
        }
        lines.push(``);
      }

      lines.push(`[Use verbose=true for full details with file paths and registration instructions]`);
    } else {
      // ============================================================
      // VERBOSE MODE — full details with file paths
      // ============================================================

      // HIGH confidence
      if (limitedExact.length > 0) {
        lines.push(`🟢 HIGH confidence (exact name match):`);
        for (const s of limitedExact) {
          const wasAutoRegistered = autoRegistered.some((ar) => ar.typeName === s.typeName);
          const badge = wasAutoRegistered ? " [AUTO-REGISTERED]" : "";
          lines.push(`  "${s.typeName}"${badge}`);
          for (const occ of s.occurrences) {
            lines.push(`    • [${occ.project}] ${occ.file} (${occ.kind})`);
          }
          lines.push(``);
        }
      }

      // MEDIUM confidence
      if (limitedSimilar.length > 0) {
        lines.push(`🟡 MEDIUM confidence (name similarity):`);
        for (const s of limitedSimilar) {
          lines.push(`  ${s.matchReason}`);
          for (const occ of s.occurrences) {
            lines.push(`    • [${occ.project}] ${occ.file} (${occ.kind})`);
          }
          lines.push(``);
        }
      }

      // Registration instructions
      lines.push(`---`);
      lines.push(`To register a mapping, call register_type_mapping with:`);
      if (limitedExact.length > 0) {
        const first = limitedExact[0];
        const [a, b] = first.occurrences.slice(0, 2);
        lines.push(`  Example:`);
        lines.push(`    typeName: "${first.typeName}"`);
        lines.push(`    sourceProject: "${a.project}", sourceFile: "${a.file}"`);
        lines.push(`    targetProject: "${b.project}", targetFile: "${b.file}"`);
      }
    }
  }

  // Append scan errors if any
  if (scanErrors.length > 0) {
    lines.push(``);
    lines.push(`⚠️ Scan warnings:`);
    for (const err of scanErrors) {
      lines.push(`  • ${err}`);
    }
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}
