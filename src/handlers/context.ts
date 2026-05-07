// ============================================================
// CONTEXT HANDLERS — get_context (with optional analyzeImpact)
// ============================================================

import { existsSync } from "fs";
import { join } from "path";
import type { KnowledgeBase, McpResponse, BreakingChangeAlert, ImpactEntry } from "../types.js";

export function handleGetContext(
  kb: KnowledgeBase,
  args: Record<string, unknown>
): McpResponse {
  const { featureName, stepNumber, analyzeImpact, verbose } = args as {
    featureName: string;
    stepNumber?: number;
    analyzeImpact?: boolean;
    verbose?: boolean;
  };

  const feature = kb.features[featureName];
  if (!feature) {
    return {
      content: [{ type: "text", text: `Feature "${featureName}" not found.` }],
      isError: true,
    };
  }

  let steps = feature.workflow;
  if (stepNumber !== undefined) {
    steps = steps.filter((s) => s.step === stepNumber);
    if (steps.length === 0) {
      return {
        content: [{ type: "text", text: `Step ${stepNumber} not found in feature "${featureName}".` }],
        isError: true,
      };
    }
  }

  // ============================================================
  // COMPACT MODE (default) — return a concise summary
  // ============================================================
  if (!verbose) {
    const lines: string[] = [];
    lines.push(`Feature: ${featureName}`);
    lines.push(`Description: ${feature.description}`);
    lines.push(`Steps (${steps.length}): ${steps.map((s) => `${s.step}. ${s.name}`).join(", ")}`);
    lines.push(`Test scenarios: ${feature.test_scenarios?.length || 0}`);

    // Collect unique files across all steps
    const allFiles = new Set<string>();
    for (const step of steps) {
      for (const [projName, mapping] of Object.entries(step.projects || {})) {
        if (mapping.file) allFiles.add(`[${projName}] ${mapping.file}`);
      }
    }
    if (allFiles.size > 0) {
      lines.push(`Referenced files (${allFiles.size}):`);
      for (const f of allFiles) {
        lines.push(`  ${f}`);
      }
    }

    // Compact impact analysis summary
    if (analyzeImpact) {
      const impactMap = new Map<string, ImpactEntry>();

      for (const step of steps) {
        for (const [projName, mapping] of Object.entries(step.projects || {})) {
          if (!mapping.file) continue;
          const key = `${projName}::${mapping.file}`;
          if (!impactMap.has(key)) {
            const alert = analyzeFileImpact(kb, mapping.file);
            impactMap.set(key, {
              file: mapping.file,
              project: projName,
              staleWarning: alert.staleWarning,
              affectedSteps: [],
              referencedIn: alert.referencedIn,
              affectedCrossProjectFiles: alert.affectedCrossProjectFiles,
            });
          }
          const entry = impactMap.get(key)!;
          if (!entry.affectedSteps.some((s) => s.step === step.step)) {
            entry.affectedSteps.push({ step: step.step, name: step.name });
          }
        }
      }

      const impacted = [...impactMap.values()].filter(
        (entry) =>
          entry.referencedIn.length > 0 ||
          entry.affectedCrossProjectFiles.length > 0 ||
          entry.staleWarning
      );

      if (impacted.length > 0) {
        lines.push(`Impact analysis: ${impacted.length} file(s) would be affected:`);
        for (const entry of impacted) {
          const warnings: string[] = [];
          if (entry.staleWarning) warnings.push("STALE");
          if (entry.referencedIn.length > 0) warnings.push(`${entry.referencedIn.length} reference(s)`);
          if (entry.affectedCrossProjectFiles.length > 0) warnings.push(`${entry.affectedCrossProjectFiles.length} cross-project file(s)`);
          lines.push(`  [${entry.project}] ${entry.file} (${warnings.join(", ")})`);
        }
      } else {
        lines.push(`Impact analysis: No breaking changes detected.`);
      }
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }

  // ============================================================
  // VERBOSE MODE — full detailed output
  // ============================================================
  const context: Record<string, unknown> = {
    feature: featureName,
    description: feature.description,
    steps: steps.map((step) => ({
      step: step.step,
      name: step.name,
      description: step.description,
      intentional: step.intentional,
      projects: step.projects || {},
    })),
    test_scenarios: feature.test_scenarios,
  };

  // If analyzeImpact is true, run breaking change analysis on all referenced files
  if (analyzeImpact) {
    const impactMap = new Map<string, ImpactEntry>();

    for (const step of steps) {
      for (const [projName, mapping] of Object.entries(step.projects || {})) {
        if (!mapping.file) continue;
        const key = `${projName}::${mapping.file}`;

        if (!impactMap.has(key)) {
          const alert = analyzeFileImpact(kb, mapping.file);
          impactMap.set(key, {
            file: mapping.file,
            project: projName,
            staleWarning: alert.staleWarning,
            affectedSteps: [],
            referencedIn: alert.referencedIn,
            affectedCrossProjectFiles: alert.affectedCrossProjectFiles,
          });
        }

        const entry = impactMap.get(key)!;
        if (!entry.affectedSteps.some((s) => s.step === step.step)) {
          entry.affectedSteps.push({ step: step.step, name: step.name });
        }
      }
    }

    context.impactAnalysis = [...impactMap.values()].filter(
      (entry) =>
        entry.referencedIn.length > 0 ||
        entry.affectedCrossProjectFiles.length > 0 ||
        entry.staleWarning
    );
  }

  return {
    content: [{ type: "text", text: JSON.stringify(context, null, 2) }],
  };
}

/**
 * Analyze a file path for breaking change impact across the knowledge graph.
 */
function analyzeFileImpact(
  kb: KnowledgeBase,
  filePath: string
): BreakingChangeAlert {
  const lowerPath = filePath.toLowerCase();

  // Extract entity name from file path (e.g., "station.entity.ts" -> "station")
  const fileNameMatch = filePath.match(/([^\\/]+)\.\w+$/);
  const entityName = fileNameMatch ? fileNameMatch[1].toLowerCase() : filePath.toLowerCase();

  // Check if the file exists on disk in any registered project
  let fileExists = false;
  let staleWarning: string | undefined;
  for (const proj of Object.values(kb.projects)) {
    const absolutePath = join(proj.path, filePath);
    if (existsSync(absolutePath)) {
      fileExists = true;
      break;
    }
  }
  if (!fileExists) {
    staleWarning = `File "${filePath}" does not exist on disk. It may have been renamed, moved, or deleted. Run validate_knowledge for a full audit.`;
  }

  const alert: BreakingChangeAlert = {
    filePath,
    staleWarning,
    referencedIn: [],
    affectedCrossProjectFiles: [],
  };

  const seenFiles = new Set<string>();

  // 1. Check if the file is referenced in any feature workflow
  for (const [featName, feat] of Object.entries(kb.features)) {
    for (const step of feat.workflow) {
      for (const [projName, mapping] of Object.entries(step.projects || {})) {
        if (mapping.file?.toLowerCase().includes(lowerPath)) {
          alert.referencedIn.push({
            feature: featName,
            step: step.step,
            stepName: step.name,
            project: projName,
          });
        }
      }
    }
  }

  // 2. Find related files in OTHER projects that reference the same entity name
  for (const [, feat] of Object.entries(kb.features)) {
    for (const step of feat.workflow) {
      for (const [projName, mapping] of Object.entries(step.projects || {})) {
        if (mapping.file && mapping.file.toLowerCase().includes(entityName)) {
          const key = `${projName}:${mapping.file}`;
          if (!seenFiles.has(key)) {
            seenFiles.add(key);
            alert.affectedCrossProjectFiles.push({
              project: projName,
              file: mapping.file,
              context: `Part of step "${step.name}" in feature "${feat.name}"`,
            });
          }
        }
      }
    }
  }

  // 3. Check type mappings for this entity
  for (const tm of kb.typeMappings) {
    if (
      tm.typeName.toLowerCase().includes(entityName) ||
      tm.sourceFile.toLowerCase().includes(lowerPath) ||
      tm.targetFile.toLowerCase().includes(lowerPath)
    ) {
      const key = `${tm.targetProject}:${tm.targetFile}`;
      if (!seenFiles.has(key)) {
        seenFiles.add(key);
        alert.affectedCrossProjectFiles.push({
          project: tm.targetProject,
          file: tm.targetFile,
          context: `Type mapping: ${tm.typeName} (${tm.description || "no description"})`,
        });
      }
    }
  }

  return alert;
}
