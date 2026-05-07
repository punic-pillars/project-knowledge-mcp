// ============================================================
// VALIDATION HANDLER — validate_knowledge tool
// Checks all registered file paths exist on disk to detect
// stale entries (renamed, moved, or deleted files).
// ============================================================

import { existsSync } from "fs";
import { join } from "path";
import type { KnowledgeBase, McpResponse } from "../types.js";

// ============================================================
// Types for validation results
// ============================================================

interface FileCheckResult {
  status: "EXISTS" | "MISSING";
  project: string;
  relativePath: string;
  absolutePath: string;
}

interface FeatureValidation {
  featureName: string;
  stepChecks: Array<{
    step: number;
    stepName: string;
    files: FileCheckResult[];
  }>;
}

interface TypeMappingValidation {
  typeName: string;
  sourceCheck: FileCheckResult;
  targetCheck: FileCheckResult;
}

interface ValidationReport {
  summary: {
    totalFilesChecked: number;
    existing: number;
    missing: number;
    projectsChecked: number;
    featuresChecked: number;
    typeMappingsChecked: number;
  };
  projectPathIssues: Array<{
    projectName: string;
    path: string;
    exists: boolean;
  }>;
  featureValidations: FeatureValidation[];
  typeMappingValidations: TypeMappingValidation[];
}

// ============================================================
// Core validation logic
// ============================================================

function checkFile(
  projectPath: string,
  projectName: string,
  relativePath: string
): FileCheckResult {
  const absolutePath = join(projectPath, relativePath);
  const exists = existsSync(absolutePath);
  return {
    status: exists ? "EXISTS" : "MISSING",
    project: projectName,
    relativePath,
    absolutePath,
  };
}

function validateKnowledgeBase(
  kb: KnowledgeBase,
  featureName?: string
): ValidationReport {
  const report: ValidationReport = {
    summary: {
      totalFilesChecked: 0,
      existing: 0,
      missing: 0,
      projectsChecked: 0,
      featuresChecked: 0,
      typeMappingsChecked: 0,
    },
    projectPathIssues: [],
    featureValidations: [],
    typeMappingValidations: [],
  };

  // ---- Check project paths exist ----
  for (const [projName, proj] of Object.entries(kb.projects)) {
    const projectExists = existsSync(proj.path);
    report.projectPathIssues.push({
      projectName: projName,
      path: proj.path,
      exists: projectExists,
    });
    report.summary.projectsChecked++;
  }

  // ---- Check feature step files ----
  const featuresToCheck = featureName
    ? { [featureName]: kb.features[featureName] }
    : kb.features;

  for (const [featName, feat] of Object.entries(featuresToCheck)) {
    if (!feat) continue;

    const stepChecks: FeatureValidation["stepChecks"] = [];

    for (const step of feat.workflow) {
      const files: FileCheckResult[] = [];

      for (const [projName, mapping] of Object.entries(step.projects || {})) {
        if (!mapping.file) continue;
        const project = kb.projects[projName];
        if (project) {
          files.push(checkFile(project.path, projName, mapping.file));
        }
      }

      if (files.length > 0) {
        stepChecks.push({
          step: step.step,
          stepName: step.name,
          files,
        });
      }
    }

    if (stepChecks.length > 0) {
      report.featureValidations.push({
        featureName: featName,
        stepChecks,
      });
      report.summary.featuresChecked++;
    }
  }

  // ---- Check type mapping files ----
  for (const tm of kb.typeMappings) {
    const sourceProject = kb.projects[tm.sourceProject];
    const targetProject = kb.projects[tm.targetProject];

    if (!sourceProject || !targetProject) continue;

    const sourceCheck = checkFile(sourceProject.path, tm.sourceProject, tm.sourceFile);
    const targetCheck = checkFile(targetProject.path, tm.targetProject, tm.targetFile);

    report.typeMappingValidations.push({
      typeName: tm.typeName,
      sourceCheck,
      targetCheck,
    });
    report.summary.typeMappingsChecked++;
  }

  // ---- Compute summary counts ----
  let totalFiles = 0;
  let existing = 0;
  let missing = 0;

  for (const fv of report.featureValidations) {
    for (const sc of fv.stepChecks) {
      for (const f of sc.files) {
        totalFiles++;
        if (f.status === "EXISTS") existing++;
        else missing++;
      }
    }
  }

  for (const tmv of report.typeMappingValidations) {
    totalFiles += 2;
    if (tmv.sourceCheck.status === "EXISTS") existing++;
    else missing++;
    if (tmv.targetCheck.status === "EXISTS") existing++;
    else missing++;
  }

  report.summary.totalFilesChecked = totalFiles;
  report.summary.existing = existing;
  report.summary.missing = missing;

  return report;
}

// ============================================================
// Format the report as a human-readable string
// ============================================================

function formatReport(report: ValidationReport): string {
  const lines: string[] = [];
  const { summary } = report;

  lines.push("VALIDATION REPORT");
  lines.push("=================");
  lines.push("");

  const healthEmoji = summary.missing === 0 ? "✅" : "⚠️";
  lines.push(
    `${healthEmoji} ${summary.totalFilesChecked} files checked: ` +
    `${summary.existing} exist, ${summary.missing} missing`
  );
  lines.push(`   Projects checked: ${summary.projectsChecked}`);
  lines.push(`   Features checked: ${summary.featuresChecked}`);
  lines.push(`   Type mappings checked: ${summary.typeMappingsChecked}`);
  lines.push("");

  const deadProjects = report.projectPathIssues.filter((p) => !p.exists);
  if (deadProjects.length > 0) {
    lines.push("❌ PROJECT PATH ISSUES:");
    for (const p of deadProjects) {
      lines.push(`   Project "${p.projectName}" — path does not exist:`);
      lines.push(`     ${p.path}`);
    }
    lines.push("");
  }

  for (const fv of report.featureValidations) {
    const hasMissing = fv.stepChecks.some((sc) =>
      sc.files.some((f) => f.status === "MISSING")
    );
    const icon = hasMissing ? "⚠️" : "✅";
    lines.push(`${icon} Feature "${fv.featureName}":`);

    for (const sc of fv.stepChecks) {
      const missingFiles = sc.files.filter((f) => f.status === "MISSING");
      if (missingFiles.length > 0) {
        lines.push(`   Step ${sc.step} ("${sc.stepName}"):`);
        for (const f of sc.files) {
          if (f.status === "EXISTS") {
            lines.push(`      [${f.project}] ${f.relativePath} — ✅ EXISTS`);
          } else {
            lines.push(`      [${f.project}] ${f.relativePath} — ❌ MISSING`);
          }
        }
      }
    }

    const allExist = fv.stepChecks.every((sc) =>
      sc.files.every((f) => f.status === "EXISTS")
    );
    if (allExist) {
      const totalStepFiles = fv.stepChecks.reduce(
        (sum, sc) => sum + sc.files.length,
        0
      );
      lines.push(`   All ${totalStepFiles} file(s) across ${fv.stepChecks.length} step(s) exist ✅`);
    }

    lines.push("");
  }

  if (report.typeMappingValidations.length > 0) {
    lines.push("TYPE MAPPINGS:");
    for (const tmv of report.typeMappingValidations) {
      const hasMissing =
        tmv.sourceCheck.status === "MISSING" ||
        tmv.targetCheck.status === "MISSING";
      const icon = hasMissing ? "⚠️" : "✅";
      lines.push(`   ${icon} "${tmv.typeName}":`);
      lines.push(
        `      [${tmv.sourceCheck.project}] ${tmv.sourceCheck.relativePath} — ` +
        (tmv.sourceCheck.status === "EXISTS" ? "✅ EXISTS" : "❌ MISSING")
      );
      lines.push(
        `      [${tmv.targetCheck.project}] ${tmv.targetCheck.relativePath} — ` +
        (tmv.targetCheck.status === "EXISTS" ? "✅ EXISTS" : "❌ MISSING")
      );
    }
    lines.push("");
  }

  if (summary.missing === 0 && deadProjects.length === 0) {
    lines.push("✅ All registered file paths exist on disk. Knowledge graph is up to date.");
  } else {
    lines.push("⚠️ Some registered file paths are stale. Consider updating feature steps or type mappings.");
    lines.push("   Use scan_project to re-discover project structure, then update feature steps accordingly.");
  }

  return lines.join("\n");
}

// ============================================================
// Cleanup logic — remove stale entries when fix: true
// ============================================================

interface CleanupAction {
  type: "feature-file-removed" | "type-mapping-removed";
  detail: string;
}

interface CleanupReport {
  actions: CleanupAction[];
  stepsNowEmpty: Array<{ feature: string; step: number; stepName: string }>;
}

function applyFixes(
  kb: KnowledgeBase,
  report: ValidationReport
): CleanupReport {
  const actions: CleanupAction[] = [];
  const stepsNowEmpty: CleanupReport["stepsNowEmpty"] = [];

  // ---- Fix feature step files ----
  for (const fv of report.featureValidations) {
    const feature = kb.features[fv.featureName];
    if (!feature) continue;

    for (const sc of fv.stepChecks) {
      const step = feature.workflow.find((s) => s.step === sc.step);
      if (!step) continue;

      for (const fileCheck of sc.files) {
        if (fileCheck.status !== "MISSING") continue;

        const projName = fileCheck.project;
        const mapping = step.projects?.[projName];
        if (mapping?.file) {
          actions.push({
            type: "feature-file-removed",
            detail: `${fv.featureName} step ${sc.step}: ${projName} file "${mapping.file}"`,
          });
          delete mapping.file;
          // Clean up empty mapping object
          const hasOtherFields = Object.values(mapping).some((v) => v !== undefined);
          if (!hasOtherFields && step.projects) {
            delete step.projects[projName];
          }
        }
      }

      // Check if step now has no file references at all
      const hasAnyFile = Object.values(step.projects || {}).some((m) => m.file);
      if (!hasAnyFile) {
        stepsNowEmpty.push({
          feature: fv.featureName,
          step: sc.step,
          stepName: sc.stepName,
        });
      }
    }
  }

  // ---- Fix type mappings ----
  const remainingMappings: typeof kb.typeMappings = [];
  for (const tmv of report.typeMappingValidations) {
    const mapping = kb.typeMappings.find(
      (tm) =>
        tm.typeName === tmv.typeName &&
        tm.sourceProject === tmv.sourceCheck.project &&
        tm.sourceFile === tmv.sourceCheck.relativePath &&
        tm.targetProject === tmv.targetCheck.project &&
        tm.targetFile === tmv.targetCheck.relativePath
    );

    if (!mapping) {
      remainingMappings.push({
        typeName: tmv.typeName,
        sourceProject: tmv.sourceCheck.project,
        sourceFile: tmv.sourceCheck.relativePath,
        targetProject: tmv.targetCheck.project,
        targetFile: tmv.targetCheck.relativePath,
      });
      continue;
    }

    const sourceMissing = tmv.sourceCheck.status === "MISSING";
    const targetMissing = tmv.targetCheck.status === "MISSING";

    if (sourceMissing || targetMissing) {
      const reasons: string[] = [];
      if (sourceMissing) reasons.push(`source file "${tmv.sourceCheck.relativePath}" missing in ${tmv.sourceCheck.project}`);
      if (targetMissing) reasons.push(`target file "${tmv.targetCheck.relativePath}" missing in ${tmv.targetCheck.project}`);
      actions.push({
        type: "type-mapping-removed",
        detail: `"${tmv.typeName}" (${reasons.join("; ")})`,
      });
    } else {
      remainingMappings.push(mapping);
    }
  }
  kb.typeMappings = remainingMappings;

  return { actions, stepsNowEmpty };
}

function formatCleanupReport(cleanup: CleanupReport): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("CLEANUP REPORT");
  lines.push("==============");

  const featureRemovals = cleanup.actions.filter((a) => a.type === "feature-file-removed");
  const mappingRemovals = cleanup.actions.filter((a) => a.type === "type-mapping-removed");

  if (featureRemovals.length > 0) {
    lines.push(`✅ Removed ${featureRemovals.length} stale file reference(s) from features:`);
    for (const action of featureRemovals) {
      lines.push(`   - ${action.detail}`);
    }
  }

  if (mappingRemovals.length > 0) {
    lines.push(`✅ Removed ${mappingRemovals.length} stale type mapping(s):`);
    for (const action of mappingRemovals) {
      lines.push(`   - ${action.detail}`);
    }
  }

  if (cleanup.stepsNowEmpty.length > 0) {
    lines.push(`⚠️ ${cleanup.stepsNowEmpty.length} step(s) now have no file references — consider re-registering with correct paths:`);
    for (const s of cleanup.stepsNowEmpty) {
      lines.push(`   - "${s.feature}" step ${s.step} ("${s.stepName}")`);
    }
  }

  if (cleanup.actions.length === 0) {
    lines.push("No stale entries found — nothing to fix.");
  }

  return lines.join("\n");
}

// ============================================================
// Handler export
// ============================================================

export function handleValidateKnowledge(
  kb: KnowledgeBase,
  setKb: (kb: KnowledgeBase) => void,
  persist: () => void,
  args: Record<string, unknown>
): McpResponse {
  const { featureName, fix } = args as { featureName?: string; fix?: boolean };

  if (featureName && !kb.features[featureName]) {
    return {
      content: [{
        type: "text",
        text: `Feature "${featureName}" not found. Available features: ${Object.keys(kb.features).join(", ") || "(none)"}`,
      }],
      isError: true,
    };
  }

  try {
    const report = validateKnowledgeBase(kb, featureName);
    let formatted = formatReport(report);

    if (fix && report.summary.missing > 0) {
      const cleanup = applyFixes(kb, report);
      setKb(kb);
      persist();
      formatted += formatCleanupReport(cleanup);
    } else if (fix && report.summary.missing === 0) {
      formatted += "\n\nNo stale entries found — nothing to fix.";
    }

    return {
      content: [{ type: "text", text: formatted }],
    };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Validation error: ${err.message}` }],
      isError: true,
    };
  }
}
