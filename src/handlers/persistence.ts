// ============================================================
// PERSISTENCE HANDLERS — export/import knowledge
// ============================================================

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import type { KnowledgeBase, McpResponse } from "../types.js";

export function handleExportKnowledge(
  persist: () => void,
  getKnowledgePath: () => string
): McpResponse {
  persist();
  return {
    content: [{ type: "text", text: `Knowledge base saved to ${getKnowledgePath()}` }],
  };
}

// ============================================================
// DIFF PREVIEW — Generate a human-readable diff of what would
// change during an import, without actually applying it.
// ============================================================

function generateImportDiff(
  current: KnowledgeBase,
  imported: KnowledgeBase
): string {
  const lines: string[] = [];

  // ---- Projects ----
  const currentProjects = new Set(Object.keys(current.projects));
  const importedProjects = new Set(Object.keys(imported.projects));

  const addedProjects = [...importedProjects].filter((p) => !currentProjects.has(p));
  const removedProjects = [...currentProjects].filter((p) => !importedProjects.has(p));
  const commonProjects = [...currentProjects].filter((p) => importedProjects.has(p));

  if (addedProjects.length > 0 || removedProjects.length > 0 || commonProjects.length > 0) {
    lines.push("Projects:");
    for (const name of addedProjects) {
      const p = imported.projects[name];
      lines.push(`  + Add "${name}" (framework: ${p.framework})`);
    }
    for (const name of removedProjects) {
      const p = current.projects[name];
      lines.push(`  - Remove "${name}" (framework: ${p.framework})`);
    }
    for (const name of commonProjects) {
      const cur = current.projects[name];
      const imp = imported.projects[name];
      const changes: string[] = [];
      if (cur.path !== imp.path) changes.push("path changed");
      if (cur.framework !== imp.framework) changes.push(`framework: ${cur.framework} → ${imp.framework}`);
      if (cur.description !== imp.description) changes.push("description changed");
      if (changes.length > 0) {
        lines.push(`  ~ Update "${name}" (${changes.join(", ")})`);
      }
    }
  }

  // ---- Features ----
  const currentFeatures = new Set(Object.keys(current.features));
  const importedFeatures = new Set(Object.keys(imported.features));

  const addedFeatures = [...importedFeatures].filter((f) => !currentFeatures.has(f));
  const removedFeatures = [...currentFeatures].filter((f) => !importedFeatures.has(f));
  const commonFeatures = [...currentFeatures].filter((f) => importedFeatures.has(f));

  if (addedFeatures.length > 0 || removedFeatures.length > 0 || commonFeatures.length > 0) {
    lines.push("Features:");
    for (const name of addedFeatures) {
      const f = imported.features[name];
      lines.push(`  + Add "${name}" (${f.workflow.length} steps)`);
    }
    for (const name of removedFeatures) {
      const f = current.features[name];
      lines.push(`  - Remove "${name}" (${f.workflow.length} steps)`);
    }
    for (const name of commonFeatures) {
      const cur = current.features[name];
      const imp = imported.features[name];
      const changes: string[] = [];
      if (cur.description !== imp.description) changes.push("description changed");
      if (cur.workflow.length !== imp.workflow.length) {
        changes.push(`steps: ${cur.workflow.length} → ${imp.workflow.length}`);
      } else {
        // Check if any step content changed
        const stepsChanged = cur.workflow.some((s, i) => {
          const other = imp.workflow[i];
          return JSON.stringify(s) !== JSON.stringify(other);
        });
        if (stepsChanged) changes.push("steps modified");
      }
      if (JSON.stringify(cur.test_scenarios) !== JSON.stringify(imp.test_scenarios)) {
        changes.push("test scenarios changed");
      }
      if (changes.length > 0) {
        lines.push(`  ~ Update "${name}" (${changes.join(", ")})`);
      }
    }
  }

  // ---- Type Mappings ----
  const currentTmKeys = new Set(
    current.typeMappings.map((tm) => `${tm.typeName}|${tm.sourceProject}|${tm.targetProject}`)
  );
  const importedTmKeys = new Set(
    imported.typeMappings.map((tm) => `${tm.typeName}|${tm.sourceProject}|${tm.targetProject}`)
  );

  const addedTm = [...importedTmKeys].filter((k) => !currentTmKeys.has(k));
  const removedTm = [...currentTmKeys].filter((k) => !importedTmKeys.has(k));

  if (addedTm.length > 0 || removedTm.length > 0) {
    lines.push("Type Mappings:");
    if (addedTm.length > 0) lines.push(`  + Add ${addedTm.length} new mapping(s)`);
    if (removedTm.length > 0) lines.push(`  - Remove ${removedTm.length} mapping(s)`);
  }

  // ---- Summary ----
  const totalAdds = addedProjects.length + addedFeatures.length + addedTm.length;
  const totalRemoves = removedProjects.length + removedFeatures.length + removedTm.length;
  const totalUpdates = commonProjects.filter((n) => {
    const cur = current.projects[n];
    const imp = imported.projects[n];
    return cur.path !== imp.path || cur.framework !== imp.framework || cur.description !== imp.description;
  }).length + commonFeatures.filter((n) => {
    const cur = current.features[n];
    const imp = imported.features[n];
    return cur.description !== imp.description ||
      cur.workflow.length !== imp.workflow.length ||
      JSON.stringify(cur.workflow) !== JSON.stringify(imp.workflow) ||
      JSON.stringify(cur.test_scenarios) !== JSON.stringify(imp.test_scenarios);
  }).length;

  lines.push("");
  lines.push(
    `Total: +${totalAdds} item(s), -${totalRemoves} item(s), ~${totalUpdates} update(s)`
  );

  return lines.join("\n");
}

// ============================================================
// IMPORT HANDLER — With auto-backup and preview support
// ============================================================

export function handleImportKnowledge(
  kb: KnowledgeBase,
  setKb: (kb: KnowledgeBase) => void,
  persist: () => void,
  getKnowledgePath: () => string,
  args: Record<string, unknown>
): McpResponse {
  const { filePath, merge, preview } = args as {
    filePath: string;
    merge?: boolean;
    preview?: boolean;
  };

  if (!existsSync(filePath)) {
    return {
      content: [{ type: "text", text: `File not found: ${filePath}` }],
      isError: true,
    };
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    const imported = JSON.parse(raw) as KnowledgeBase;

    // ---- PREVIEW MODE ----
    if (preview) {
      const diff = generateImportDiff(kb, imported);
      const header = `IMPORT PREVIEW for "${filePath}"\n${"=".repeat(60)}`;
      return {
        content: [{ type: "text", text: `${header}\n${diff}` }],
      };
    }

    // ---- AUTO-BACKUP before non-merge imports ----
    let backupPath: string | undefined;
    if (!merge) {
      // Save current state first
      persist();

      // Create a timestamped backup file
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const knowledgePath = getKnowledgePath();
      const dir = dirname(knowledgePath);
      const ext = knowledgePath.endsWith(".json") ? ".json" : "";
      const baseName = knowledgePath.split(/[\\/]/).pop()?.replace(/\.json$/, "") || "project-knowledge";
      backupPath = join(dir, `${baseName}.backup.${timestamp}${ext}`);

      writeFileSync(backupPath, JSON.stringify(kb, null, 2), "utf-8");
    }

    // ---- APPLY IMPORT ----
    if (merge) {
      // Merge projects
      for (const [key, proj] of Object.entries(imported.projects)) {
        kb.projects[key] = proj;
      }
      // Merge features
      for (const [key, feat] of Object.entries(imported.features)) {
        kb.features[key] = feat;
      }
      // Merge type mappings
      if (imported.typeMappings) {
        for (const tm of imported.typeMappings) {
          const exists = kb.typeMappings.some(
            (m) =>
              m.typeName === tm.typeName &&
              m.sourceProject === tm.sourceProject &&
              m.targetProject === tm.targetProject
          );
          if (!exists) kb.typeMappings.push(tm);
        }
      }
    } else {
      setKb(imported);
    }

    persist();

    // ---- BUILD RESPONSE ----
    const summary = `Imported ${Object.keys(imported.projects).length} projects, ${Object.keys(imported.features).length} features, and ${(imported.typeMappings || []).length} type mappings from ${filePath}. Merge mode: ${merge ? "on" : "off"}`;

    let responseText = summary;
    if (backupPath) {
      responseText += `\nBackup of previous state saved to: ${backupPath}`;
    }

    return {
      content: [{ type: "text", text: responseText }],
    };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Error importing knowledge: ${err.message}` }],
      isError: true,
    };
  }
}
