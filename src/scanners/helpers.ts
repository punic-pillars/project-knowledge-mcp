// ============================================================
// SCANNER HELPERS — Shared types, utilities, and constants
// ============================================================

import { readdirSync } from "fs";
import { join } from "path";

export interface ScannedEndpoint {
  method: string;
  path: string;
  handler: string;
  file: string;
  lineNumber: number;
}

export interface ScannedScreen {
  name: string;
  file: string;
  route?: string;
}

export interface ScannedPage {
  route: string;
  file: string;
}

export interface SuggestedFeatureLink {
  pageRoute: string;
  featureName: string;
  matchReason: string;
}

export interface ScanResult {
  projectName: string;
  projectPath: string;
  framework: string;
  endpoints: ScannedEndpoint[];
  screens: ScannedScreen[];
  pages: ScannedPage[];
  errors: string[];
  suggestedFeatureLinks?: SuggestedFeatureLink[];
}

export const SKIP_DIRS = new Set(["node_modules", ".git", "build", "dist", ".next", ".expo", "coverage", ".cache"]);

export function findFiles(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        results.push(...findFiles(fullPath, pattern));
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return results;
}
