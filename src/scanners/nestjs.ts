// ============================================================
// NESTJS SCANNER — Discover endpoints from NestJS controllers
// ============================================================

import { readFileSync } from "fs";
import { relative } from "path";
import { findFiles } from "./helpers.js";
import type { ScanResult } from "./helpers.js";

export function scanNestJS(projectPath: string, projectName: string): ScanResult {
  const result: ScanResult = {
    projectName,
    projectPath,
    framework: "nestjs",
    endpoints: [],
    screens: [],
    pages: [],
    errors: [],
  };

  try {
    const controllerFiles = findFiles(projectPath, /\.controller\.ts$/);

    for (const filePath of controllerFiles) {
      try {
        const content = readFileSync(filePath, "utf-8");
        const relativePath = relative(projectPath, filePath);

        // Extract controller prefix
        const controllerMatch = content.match(/@Controller\(\s*(?:"([^"]+)"|'([^']+)')\s*\)/);
        const controllerPrefix = controllerMatch?.[1] ?? controllerMatch?.[2] ?? "";

        // Extract all route handlers in a single pass
        const methodPatterns = [
          { method: "GET", regex: /@(?:Get|All)\(\s*(?:"([^"]*)"|'([^']*)')\s*\)/g },
          { method: "POST", regex: /@Post\(\s*(?:"([^"]*)"|'([^']*)')\s*\)/g },
          { method: "PUT", regex: /@Put\(\s*(?:"([^"]*)"|'([^']*)')\s*\)/g },
          { method: "PATCH", regex: /@Patch\(\s*(?:"([^"]*)"|'([^']*)')\s*\)/g },
          { method: "DELETE", regex: /@Delete\(\s*(?:"([^"]*)"|'([^']*)')\s*\)/g },
        ];

        for (const { method, regex } of methodPatterns) {
          regex.lastIndex = 0;

          let match: RegExpExecArray | null;
          while ((match = regex.exec(content)) !== null) {
            const routePath = match[1] ?? match[2] ?? "";
            const fullPath = `/${[controllerPrefix, routePath].filter(Boolean).join("/")}`.replace(/\/+/g, "/");

            const matchIndex = match.index;
            const lineBefore = content.substring(0, matchIndex).split("\n");
            const decoratorLine = lineBefore.length;

            // Look for the method name after the decorator
            const afterDecorator = content.substring(matchIndex);
            const handlerMatch = afterDecorator.match(/\n\s*(?:async\s+)?(\w+)\s*\(/);
            const handlerName = handlerMatch?.[1] ?? "unknown";

            result.endpoints.push({
              method,
              path: fullPath,
              handler: handlerName,
              file: relativePath,
              lineNumber: decoratorLine,
            });
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push(`Error scanning ${filePath}: ${message}`);
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(`Error scanning NestJS project: ${message}`);
  }

  return result;
}
