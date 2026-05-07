// ============================================================
// FEATURE HANDLERS — register/remove/list/get feature
// ============================================================

import type { KnowledgeBase, McpResponse, WorkflowStep } from "../types.js";
import { handleVerifyFeatureHealth } from "./health.js";

export function handleRegisterFeature(
  kb: KnowledgeBase,
  persist: () => void,
  args: Record<string, unknown>
): McpResponse {
  const { name, description, workflow, test_scenarios, overwrite } = args as {
    name: string;
    description: string;
    workflow: WorkflowStep[];
    test_scenarios?: string[];
    overwrite?: boolean;
  };

  if (kb.features[name] && !overwrite) {
    return {
      content: [{ type: "text", text: `Feature "${name}" already exists. Use overwrite=true to replace it.` }],
      isError: true,
    };
  }

  // Validate workflow steps
  const stepNumbers = workflow.map((s) => s.step);
  const hasDuplicates = new Set(stepNumbers).size !== stepNumbers.length;
  if (hasDuplicates) {
    return {
      content: [{ type: "text", text: "Error: Duplicate step numbers in workflow. Each step must have a unique number." }],
      isError: true,
    };
  }

  kb.features[name] = {
    name,
    description,
    workflow: workflow.sort((a, b) => a.step - b.step),
    test_scenarios: test_scenarios || [],
  };

  persist();

  const action = overwrite && kb.features[name] ? "updated" : "registered";
  return {
    content: [{
      type: "text",
      text: `Feature "${name}" ${action} with ${workflow.length} workflow steps.`,
    }],
  };
}

export function handleRemoveFeature(
  kb: KnowledgeBase,
  persist: () => void,
  args: Record<string, unknown>
): McpResponse {
  const { name } = args as { name: string };

  if (!kb.features[name]) {
    return {
      content: [{ type: "text", text: `Feature "${name}" not found.` }],
      isError: true,
    };
  }

  delete kb.features[name];
  persist();

  return {
    content: [{ type: "text", text: `Feature "${name}" removed.` }],
  };
}

export function handleGetFeature(
  kb: KnowledgeBase,
  args: Record<string, unknown>
): McpResponse {
  const { name, includeHealth, verbose } = args as { name: string; includeHealth?: boolean; verbose?: boolean };

  const feature = kb.features[name];
  if (!feature) {
    return {
      content: [{ type: "text", text: `Feature "${name}" not found.` }],
      isError: true,
    };
  }

  // ============================================================
  // COMPACT MODE (default) — return a concise summary
  // ============================================================
  if (!verbose) {
    const lines: string[] = [];
    lines.push(`Feature: ${feature.name}`);
    lines.push(`Description: ${feature.description}`);
    lines.push(`Steps (${feature.workflow.length}): ${feature.workflow.map((s) => `${s.step}. ${s.name}`).join(", ")}`);
    lines.push(`Test scenarios: ${feature.test_scenarios?.length || 0}`);

    // Count how many steps have cross-project mappings
    const projectCounts: Record<string, number> = {};
    for (const step of feature.workflow) {
      for (const projName of Object.keys(step.projects || {})) {
        projectCounts[projName] = (projectCounts[projName] || 0) + 1;
      }
    }
    const mappingSummary = Object.entries(projectCounts)
      .map(([p, n]) => `${p}=${n}`)
      .join(", ");
    lines.push(`Cross-project mappings: ${mappingSummary || "none"}`);

    if (includeHealth) {
      const healthResult = handleVerifyFeatureHealth(kb, { featureName: name, compact: true });
      const healthText = healthResult.content[0].text;
      lines.push(`Health: ${healthText}`);
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }

  // ============================================================
  // VERBOSE MODE — full detailed output
  // ============================================================
  const output: Record<string, unknown> = { ...feature };

  if (includeHealth) {
    const healthResult = handleVerifyFeatureHealth(kb, { featureName: name });
    output.health = healthResult.content[0].text;
  }

  return {
    content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
  };
}
