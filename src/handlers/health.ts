// ============================================================
// HEALTH HANDLER — verify_feature_health
// Fully dynamic — works with any project names, not just
// the hardcoded mobile/backend/admin trio.
// ============================================================

import type { KnowledgeBase, McpResponse, StepHealthResult } from "../types.js";

export function handleVerifyFeatureHealth(
  kb: KnowledgeBase,
  args: Record<string, unknown>
): McpResponse {
  const { featureName, compact } = args as { featureName: string; compact?: boolean };

  const feature = kb.features[featureName];
  if (!feature) {
    return {
      content: [{ type: "text", text: `Feature "${featureName}" not found.` }],
      isError: true,
    };
  }

  // Collect all project names that appear across all steps
  const allProjectNames = new Set<string>();
  for (const step of feature.workflow) {
    for (const projName of Object.keys(step.projects || {})) {
      allProjectNames.add(projName);
    }
  }

  const results: StepHealthResult[] = [];

  for (const step of feature.workflow) {
    const mappedProjects = Object.keys(step.projects || {});
    results.push({
      step: step.step,
      name: step.name,
      mappedProjects,
      hasTestScenario: feature.test_scenarios.length > 0,
      intentional: step.intentional,
    });
  }

  // Summary stats
  const nonIntentional = results.filter((r) => !r.intentional);
  const intentionalSteps = results.filter((r) => r.intentional);
  const totalProjects = allProjectNames.size;

  // Per-project coverage counts
  const projectCoverage: Record<string, number> = {};
  for (const projName of allProjectNames) {
    projectCoverage[projName] = results.filter((r) =>
      r.mappedProjects.includes(projName)
    ).length;
  }

  // ============================================================
  // COMPACT MODE — one-liner summary
  // ============================================================
  if (compact) {
    const coverageParts = Object.entries(projectCoverage)
      .map(([p, n]) => `${p}=${n}/${results.length}`)
      .join(", ");
    const summary = `${coverageParts}, ${feature.test_scenarios.length} test scenarios`;
    return {
      content: [{ type: "text", text: summary }],
    };
  }

  // ============================================================
  // FULL MODE — detailed report
  // ============================================================
  const lines: string[] = [];
  lines.push(`Feature Health Report: "${featureName}"`);
  lines.push(`Description: ${feature.description}`);
  lines.push(`Total steps: ${feature.workflow.length}`);
  lines.push(``);

  lines.push(`Summary:`);
  for (const [projName, count] of Object.entries(projectCoverage)) {
    lines.push(`  � ${projName} mapped: ${count}/${results.length}`);
  }
  lines.push(`  🧪 Test scenarios: ${feature.test_scenarios.length}`);
  if (intentionalSteps.length > 0) {
    lines.push(`  🎯 Intentionally single-project: ${intentionalSteps.length}`);
  }
  lines.push(``);

  // ---- Missing coverage (action required) ----
  // Flag non-intentional steps that are missing any registered project
  const gapSteps = nonIntentional.filter(
    (r) => totalProjects > 0 && r.mappedProjects.length < totalProjects
  );

  if (gapSteps.length > 0) {
    lines.push(`Missing coverage (action required):`);
    for (const r of gapSteps) {
      const missing = [...allProjectNames].filter(
        (p) => !r.mappedProjects.includes(p)
      );
      lines.push(`  - Step ${r.step} [${r.name}]: no ${missing.join(", ")} mapping`);
    }
    lines.push(``);
  }

  // ---- Intentionally single-project (by design) ----
  if (intentionalSteps.length > 0) {
    lines.push(`Intentionally single-project (by design):`);
    for (const r of intentionalSteps) {
      const projects = r.mappedProjects.join(", ") || "none";
      lines.push(`  - Step ${r.step} [${r.name}]: ${projects} only — no gap expected`);
    }
    lines.push(``);
  }

  // ---- Per-step breakdown ----
  lines.push(`Step-by-step breakdown:`);
  for (const r of results) {
    const testIcon = r.hasTestScenario ? "🧪" : "⬜";
    const intentionalBadge = r.intentional ? " 🎯 intentional" : "";

    lines.push(`  Step ${r.step}: ${r.name}${intentionalBadge}`);
    for (const projName of allProjectNames) {
      const mapped = r.mappedProjects.includes(projName);
      lines.push(`    ${mapped ? "✅" : "⬜"} ${projName}: ${mapped ? "Mapped" : "Not mapped"}`);
    }
    lines.push(`    ${testIcon} Tests: ${r.hasTestScenario ? "Has scenarios" : "No scenarios"}`);
    lines.push(``);
  }

  // ---- Out of sync warnings (non-intentional steps only) ----
  const outOfSync: string[] = [];
  for (const r of nonIntentional) {
    if (r.mappedProjects.length > 0 && r.mappedProjects.length < totalProjects) {
      const missing = [...allProjectNames].filter(
        (p) => !r.mappedProjects.includes(p)
      );
      outOfSync.push(
        `Step ${r.step} ("${r.name}"): mapped in [${r.mappedProjects.join(", ")}] but missing [${missing.join(", ")}]`
      );
    }
  }

  if (outOfSync.length > 0) {
    lines.push(`⚠️  Out of Sync Warnings:`);
    for (const warning of outOfSync) {
      lines.push(`  • ${warning}`);
    }
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}
