// ============================================================
// NEXT.JS SCANNER — Discover pages and API routes
// ============================================================

import { readFileSync, existsSync } from "fs";
import { join, relative } from "path";
import { findFiles } from "./helpers.js";
import type { ScanResult } from "./helpers.js";

export function scanNextJS(projectPath: string, projectName: string): ScanResult {
  const result: ScanResult = {
    projectName,
    projectPath,
    framework: "nextjs",
    endpoints: [],
    screens: [],
    pages: [],
    errors: [],
  };

  try {
    // Scan app/ directory (App Router)
    const appDir = join(projectPath, "app");
    if (existsSync(appDir)) {
      const pageFiles = findFiles(appDir, /\/page\.(tsx|jsx|ts|js)$/);

      for (const filePath of pageFiles) {
        const relativePath = relative(projectPath, filePath);
        let route = relative(join(projectPath, "app"), filePath)
          .replace(/\\/g, "/")
          .replace(/\/page\.(tsx|jsx|ts|js)$/, "")
          .replace(/\/?$/, "") || "/";

        route = `/${route}`.replace(/\/+/g, "/");

        result.pages.push({ route, file: relativePath });
      }
    }

    // Scan pages/ directory (Pages Router)
    const pagesDir = join(projectPath, "pages");
    if (existsSync(pagesDir)) {
      const pageFiles = findFiles(pagesDir, /\.(tsx|jsx|ts|js)$/);

      for (const filePath of pageFiles) {
        const relativePath = relative(projectPath, filePath);
        let route = relative(join(projectPath, "pages"), filePath)
          .replace(/\\/g, "/")
          .replace(/\.(tsx|jsx|ts|js)$/, "")
          .replace(/\/index$/, "")
          .replace(/\/?$/, "") || "/";

        route = `/${route}`.replace(/\/+/g, "/");

        // Skip non-page files like _app, _document, api routes
        if (route.startsWith("/_") || route.startsWith("/api/")) continue;

        result.pages.push({ route, file: relativePath });
      }
    }

    // Scan API routes
    const apiDir = join(projectPath, "app", "api");
    if (existsSync(apiDir)) {
      const routeFiles = findFiles(apiDir, /\/route\.(ts|js)$/);

      for (const filePath of routeFiles) {
        const relativePath = relative(projectPath, filePath);
        let route = relative(join(projectPath, "app"), filePath)
          .replace(/\\/g, "/")
          .replace(/\/route\.(ts|js)$/, "")
          .replace(/\/?$/, "") || "/";

        route = `/api/${route}`.replace(/\/+/g, "/");

        result.endpoints.push({
          method: "ANY",
          path: route,
          handler: "route handler",
          file: relativePath,
          lineNumber: 1,
        });
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(`Error scanning Next.js project: ${message}`);
  }

  return result;
}
