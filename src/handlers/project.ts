// ============================================================
// PROJECT HANDLERS — register/remove/scan project
// ============================================================

import { scanProject, detectFramework } from "../scanners/index.js";
import type { KnowledgeBase, McpResponse, Feature } from "../types.js";

export function handleRegisterProject(
  kb: KnowledgeBase,
  persist: () => void,
  args: Record<string, unknown>
): McpResponse {
  const { name, path, framework, description } = args as {
    name: string;
    path: string;
    framework?: string;
    description?: string;
  };

  if (kb.projects[name]) {
    return {
      content: [{ type: "text", text: `Project "${name}" already exists. Use remove_project first or update manually.` }],
      isError: true,
    };
  }

  let resolvedFramework = framework || "auto";
  if (resolvedFramework === "auto") {
    const detected = detectFramework(path);
    resolvedFramework = detected || "generic";
  }

  kb.projects[name] = {
    name,
    path,
    framework: resolvedFramework,
    description: description || "",
  };

  persist();

  return {
    content: [{
      type: "text",
      text: `Project "${name}" registered successfully.\nPath: ${path}\nFramework: ${resolvedFramework}`,
    }],
  };
}

export function handleRemoveProject(
  kb: KnowledgeBase,
  persist: () => void,
  args: Record<string, unknown>
): McpResponse {
  const { name } = args as { name: string };

  if (!kb.projects[name]) {
    return {
      content: [{ type: "text", text: `Project "${name}" not found.` }],
      isError: true,
    };
  }

  delete kb.projects[name];
  persist();

  return {
    content: [{ type: "text", text: `Project "${name}" removed.` }],
  };
}

/**
 * Generate suggested feature links by matching discovered pages against registered features.
 * Uses case-insensitive substring matching on page routes and filenames.
 */
function generateSuggestedLinks(
  pages: Array<{ route: string; file: string }>,
  features: Record<string, Feature>
): Array<{ pageRoute: string; featureName: string; matchReason: string }> {
  const links: Array<{ pageRoute: string; featureName: string; matchReason: string }> = [];
  const featureNames = Object.keys(features);

  for (const page of pages) {
    const routeLower = page.route.toLowerCase();
    const fileLower = page.file.toLowerCase();

    // Extract meaningful words from filename (e.g., "station-list-page.tsx" → ["station", "list"])
    const fileNameWords = fileLower
      .replace(/\\/g, "/")
      .split("/")
      .pop()
      ?.replace(/\.(tsx|ts|jsx|js)$/, "")
      .split(/[-_]/)
      .filter(Boolean) ?? [];

    for (const featureName of featureNames) {
      const featureLower = featureName.toLowerCase();

      // Check if route contains the feature name
      if (routeLower.includes(featureLower)) {
        links.push({
          pageRoute: page.route,
          featureName,
          matchReason: `Page route "${page.route}" contains feature name "${featureName}"`,
        });
        break; // One link per page is enough
      }

      // Check if any word in the filename matches the feature name
      if (fileNameWords.some((word) => word === featureLower || featureLower.includes(word))) {
        links.push({
          pageRoute: page.route,
          featureName,
          matchReason: `Filename word matches feature name "${featureName}"`,
        });
        break;
      }
    }
  }

  return links;
}

export function handleScanProject(
  kb: KnowledgeBase,
  args: Record<string, unknown>
): McpResponse {
  const { projectName } = args as { projectName: string };

  const project = kb.projects[projectName];
  if (!project) {
    return {
      content: [{ type: "text", text: `Project "${projectName}" not found. Register it first with register_project.` }],
      isError: true,
    };
  }

  try {
    const scanResult = scanProject(project.path, projectName, project.framework);

    // Generate suggested feature links from discovered pages
    const suggestedLinks = generateSuggestedLinks(scanResult.pages, kb.features);

    let output = JSON.stringify(scanResult, null, 2);

    if (suggestedLinks.length > 0) {
      output += "\n\n--- Suggested Feature Links ---\n";
      for (const link of suggestedLinks) {
        output += `  Page "${link.pageRoute}" → Feature "${link.featureName}" (${link.matchReason})\n`;
      }
      output += "\nUse register_feature with overwrite=true to link these pages to their feature steps.";
    }

    return {
      content: [{
        type: "text",
        text: output,
      }],
    };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Error scanning project: ${err.message}` }],
      isError: true,
    };
  }
}
