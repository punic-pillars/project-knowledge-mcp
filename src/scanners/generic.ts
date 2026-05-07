// ============================================================
// GENERIC SCANNER — Fallback for unknown frameworks
// ============================================================

import { readFileSync } from "fs";
import { relative } from "path";
import { findFiles } from "./helpers.js";
import type { ScanResult } from "./helpers.js";

export function scanGeneric(projectPath: string, projectName: string): ScanResult {
  const result: ScanResult = {
    projectName,
    projectPath,
    framework: "generic",
    endpoints: [],
    screens: [],
    pages: [],
    errors: [],
  };

  try {
    const tsFiles = findFiles(projectPath, /\.(tsx|ts|jsx|js)$/);

    for (const filePath of tsFiles) {
      try {
        const content = readFileSync(filePath, "utf-8");
        const relativePath = relative(projectPath, filePath);

        if (relativePath.includes("node_modules")) continue;

        // Look for API endpoint definitions
        const endpointPatterns = [
          /app\.(?:get|post|put|patch|delete)\(["']([^"']+)["']/gi,
          /router\.(?:get|post|put|patch|delete)\(["']([^"']+)["']/gi,
          /@(?:Get|Post|Put|Patch|Delete)\(["']([^"']*)["']\)/g,
        ];

        for (const pattern of endpointPatterns) {
          let genericMatch: RegExpExecArray | null;
          while ((genericMatch = pattern.exec(content)) !== null) {
            const endpointPath = genericMatch[1];
            if (!result.endpoints.find((e) => e.path === endpointPath)) {
              result.endpoints.push({
                method: "UNKNOWN",
                path: endpointPath,
                handler: "endpoint",
                file: relativePath,
                lineNumber: 1,
              });
            }
          }
        }

        // Pattern: Route config arrays with path + component
        // e.g., { path: '/users', component: Users }
        const routeConfigRegex = /path\s*:\s*["']([^"']+)["']\s*,\s*\n?\s*component\s*:/g;
        let routeMatch: RegExpExecArray | null;
        while ((routeMatch = routeConfigRegex.exec(content)) !== null) {
          const routePath = routeMatch[1];
          if (!result.pages.find((p) => p.route === routePath)) {
            result.pages.push({
              route: routePath,
              file: relativePath,
            });
          }
        }
      } catch {
        // skip
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(`Error scanning generic project: ${message}`);
  }

  return result;
}
