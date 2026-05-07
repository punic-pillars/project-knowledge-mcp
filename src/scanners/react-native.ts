// ============================================================
// REACT NATIVE SCANNER — Discover screens and API calls
// ============================================================

import { readFileSync, existsSync } from "fs";
import { join, relative } from "path";
import { findFiles } from "./helpers.js";
import type { ScanResult } from "./helpers.js";

export function scanReactNative(projectPath: string, projectName: string): ScanResult {
  const result: ScanResult = {
    projectName,
    projectPath,
    framework: "react-native",
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

        // Pattern 1: React Navigation screen definitions
        // <Stack.Screen name="Login" component={LoginScreen} />
        // Also handles Tab.Screen and Drawer.Screen
        const screenRegex = /(?:Stack|Tab|Drawer)\.Screen\s+name\s*=\s*["']([^"']+)["']/g;
        let screenMatch: RegExpExecArray | null;
        while ((screenMatch = screenRegex.exec(content)) !== null) {
          const name = screenMatch[1];
          if (!result.screens.find((s) => s.name === name && s.file === relativePath)) {
            result.screens.push({
              name,
              file: relativePath,
            });
          }
        }

        // Pattern 2: API calls (axios/fetch)
        const apiCallRegex = /(?:axios|fetch)\(?\s*(?:"([^"]+)"|'([^']+)')/g;
        let apiMatch: RegExpExecArray | null;
        while ((apiMatch = apiCallRegex.exec(content)) !== null) {
          const url = apiMatch[1] ?? apiMatch[2] ?? "";
          if (url.startsWith("/api/") || url.startsWith("/v1/") || url.startsWith("/auth/")) {
            if (!result.endpoints.find((e) => e.path === url)) {
              result.endpoints.push({
                method: "UNKNOWN",
                path: url,
                handler: "api call",
                file: relativePath,
                lineNumber: 1,
              });
            }
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    // Pattern 3: Expo Router file-based routing
    // Scan the app/ directory for .tsx/.ts files and derive screen names from filenames
    const appDir = join(projectPath, "app");
    if (existsSync(appDir)) {
      const appFiles = findFiles(appDir, /\.(tsx|ts)$/);
      for (const filePath of appFiles) {
        const relativePath = relative(projectPath, filePath);
        // Skip _layout.tsx files — they are layout configs, not screens
        if (relativePath.includes("_layout")) continue;

        // Derive screen name from the file path relative to app/
        let screenName = relative(appDir, filePath)
          .replace(/\\/g, "/")
          .replace(/\.(tsx|ts)$/, "")
          .replace(/\/index$/, "")
          .replace(/\/?$/, "") || "index";

        // Handle route groups like (tabs)/stations → (tabs)/stations
        // and group-less routes like reports/config → reports/config

        if (!result.screens.find((s) => s.name === screenName && s.file === relativePath)) {
          result.screens.push({
            name: screenName,
            file: relativePath,
          });
        }
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push(`Error scanning React Native project: ${message}`);
  }

  return result;
}
