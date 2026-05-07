// ============================================================
// TYPE MAPPING HANDLERS — register/check type mapping
// ============================================================

import { existsSync } from "fs";
import { join } from "path";
import type { KnowledgeBase, McpResponse, TypeMapping } from "../types.js";

// ============================================================
// register_type_mapping has been merged into register_type_mappings
// Use register_type_mappings instead — it accepts both single objects and arrays.
// ============================================================

/**
 * BULK TYPE MAPPING REGISTRATION
 * Register multiple type mappings in a single call to reduce token usage.
 * Returns structured BulkRegistrationResult with separate conflict/missing-file buckets.
 * 
 * Accepts either a single mapping object OR an array of mappings.
 * This absorbs the functionality of register_type_mapping.
 */
export function handleRegisterTypeMappings(
  kb: KnowledgeBase,
  persist: () => void,
  args: Record<string, unknown>
): McpResponse {
  const rawMappings = args.mappings ?? args;

  // Normalize to array: accept single object or array
  let mappings: Array<{
    typeName: string;
    sourceProject: string;
    sourceFile: string;
    targetProject: string;
    targetFile: string;
    description?: string;
  }>;

  if (Array.isArray(rawMappings)) {
    mappings = rawMappings;
  } else if (typeof rawMappings === "object" && rawMappings !== null && "typeName" in rawMappings) {
    // Single mapping object passed directly
    mappings = [rawMappings as typeof mappings[number]];
  } else {
    return {
      content: [{ type: "text", text: "No mappings provided. Pass a mapping object or an array of mapping objects." }],
      isError: true,
    };
  }

  if (mappings.length === 0) {
    return {
      content: [{ type: "text", text: "No mappings provided. Pass a mapping object or an array of mapping objects." }],
      isError: true,
    };
  }

  type Candidate = typeof mappings[number];

  const registered: Candidate[] = [];
  const skippedConflicts: Candidate[] = [];
  const skippedMissingFiles: Candidate[] = [];
  const errors: Array<{ candidate: Candidate; reason: string }> = [];

  for (const candidate of mappings) {
    const { typeName, sourceProject, sourceFile, targetProject, targetFile } = candidate;

    // Validate projects are registered
    if (!kb.projects[sourceProject]) {
      errors.push({ candidate, reason: `Source project "${sourceProject}" not registered` });
      continue;
    }
    if (!kb.projects[targetProject]) {
      errors.push({ candidate, reason: `Target project "${targetProject}" not registered` });
      continue;
    }

    // Check files exist on disk (skip-on-missing-files per spec)
    const sourceAbsolute = join(kb.projects[sourceProject].path, sourceFile);
    const targetAbsolute = join(kb.projects[targetProject].path, targetFile);
    if (!existsSync(sourceAbsolute) || !existsSync(targetAbsolute)) {
      skippedMissingFiles.push(candidate);
      continue;
    }

    // Check for duplicate mapping (skip-on-conflict per spec)
    const existing = kb.typeMappings.find(
      (m) =>
        m.typeName === typeName &&
        m.sourceProject === sourceProject &&
        m.targetProject === targetProject
    );
    if (existing) {
      skippedConflicts.push(candidate);
      continue;
    }

    // Register
    kb.typeMappings.push({
      typeName,
      sourceProject,
      sourceFile,
      targetProject,
      targetFile,
      description: candidate.description || `${typeName} shared between ${sourceProject} and ${targetProject}`,
    });

    registered.push(candidate);
  }

  // Persist once after all registrations
  persist();

  // Build output matching BulkRegistrationResult shape
  const lines: string[] = [];
  lines.push(`Bulk Type Mapping Registration`);
  lines.push(`==============================`);
  lines.push(`Attempted: ${mappings.length} | Registered: ${registered.length} | Conflicts: ${skippedConflicts.length} | Missing files: ${skippedMissingFiles.length} | Errors: ${errors.length}`);
  lines.push(``);

  if (registered.length > 0) {
    lines.push(`✅ Registered (${registered.length}):`);
    for (const c of registered) {
      lines.push(`  • ${c.typeName} (${c.sourceProject} → ${c.targetProject})`);
    }
    lines.push(``);
  }

  if (skippedConflicts.length > 0) {
    lines.push(`⚠️ Skipped — already registered (${skippedConflicts.length}):`);
    for (const c of skippedConflicts) {
      lines.push(`  • ${c.typeName} (${c.sourceProject} → ${c.targetProject})`);
    }
    lines.push(``);
  }

  if (skippedMissingFiles.length > 0) {
    lines.push(`⚠️ Skipped — file not found on disk (${skippedMissingFiles.length}):`);
    for (const c of skippedMissingFiles) {
      lines.push(`  • ${c.typeName}: ${c.sourceFile} or ${c.targetFile}`);
    }
    lines.push(``);
  }

  if (errors.length > 0) {
    lines.push(`❌ Errors — unregistered project (${errors.length}):`);
    for (const e of errors) {
      lines.push(`  • ${e.candidate.typeName} — ${e.reason}`);
    }
    lines.push(``);
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
    isError: errors.length === mappings.length,
  };
}

export function handleCheckTypeMapping(
  kb: KnowledgeBase,
  args: Record<string, unknown>
): McpResponse {
  const { typeName } = args as { typeName: string };
  const lowerType = typeName.toLowerCase();

  const matchingMappings = kb.typeMappings.filter(
    (m) =>
      m.typeName.toLowerCase().includes(lowerType) ||
      lowerType.includes(m.typeName.toLowerCase())
  );

  if (matchingMappings.length === 0) {
    return {
      content: [{
        type: "text",
        text: `No type mappings found for "${typeName}".\nUse register_type_mapping to create one.`,
      }],
    };
  }

  // Group by typeName
  const grouped: Record<string, TypeMapping[]> = {};
  for (const m of matchingMappings) {
    if (!grouped[m.typeName]) grouped[m.typeName] = [];
    grouped[m.typeName].push(m);
  }

  const lines: string[] = [];
  for (const [tName, mappings] of Object.entries(grouped)) {
    lines.push(`Type: "${tName}"`);
    for (const m of mappings) {
      lines.push(`  • [${m.sourceProject}] ${m.sourceFile}`);
      lines.push(`    ↔ [${m.targetProject}] ${m.targetFile}`);
      if (m.description) lines.push(`    ${m.description}`);
    }
    lines.push(``);
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}
