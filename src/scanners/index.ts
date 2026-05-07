// ============================================================
// SCANNERS INDEX — Re-exports + scanProject() + detectFramework() + cache
// ============================================================

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { scanNestJS } from "./nestjs.js";
import { scanNextJS } from "./nextjs.js";
import { scanReactNative } from "./react-native.js";
import { scanGeneric } from "./generic.js";
import type { ScanResult } from "./helpers.js";

export type { ScanResult, ScannedEndpoint, ScannedScreen, ScannedPage } from "./helpers.js";

// ============================================================
// CACHE — Avoid re-scanning unchanged projects
// ============================================================

const scanCache = new Map<string, ScanResult>();

function getCached(projectPath: string, projectName: string, framework: string): ScanResult | null {
  const key = `${projectPath}::${projectName}::${framework}`;
  return scanCache.get(key) ?? null;
}

function setCache(projectPath: string, projectName: string, framework: string, result: ScanResult): void {
  const key = `${projectPath}::${projectName}::${framework}`;
  scanCache.set(key, result);
}

export function clearScanCache(): void {
  scanCache.clear();
}

// ============================================================
// MAIN SCAN ENTRY POINT — With caching
// ============================================================

export function scanProject(projectPath: string, projectName: string, framework: string): ScanResult {
  const normalizedPath = projectPath.replace(/\\/g, "/");

  // Check cache first
  const cached = getCached(normalizedPath, projectName, framework);
  if (cached) return cached;

  let result: ScanResult;

  switch (framework.toLowerCase()) {
    case "nestjs":
    case "nest":
      result = scanNestJS(normalizedPath, projectName);
      break;
    case "nextjs":
    case "next":
      result = scanNextJS(normalizedPath, projectName);
      break;
    case "react-native":
    case "reactnative":
    case "rn":
      result = scanReactNative(normalizedPath, projectName);
      break;
    default:
      result = scanGeneric(normalizedPath, projectName);
  }

  // Cache the result
  setCache(normalizedPath, projectName, framework, result);

  return result;
}

// ============================================================
// FRAMEWORK DETECTION
// ============================================================

export function detectFramework(projectPath: string): string | null {
  const normalizedPath = projectPath.replace(/\\/g, "/");

  const packageJsonPath = join(normalizedPath, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps["@nestjs/core"]) return "nestjs";
      if (deps["next"]) return "nextjs";
      if (deps["react-native"] || deps["expo"]) return "react-native";
    } catch {
      // ignore
    }
  }

  // Check for specific config files
  if (existsSync(join(normalizedPath, "nest-cli.json"))) return "nestjs";
  if (existsSync(join(normalizedPath, "next.config.js")) || existsSync(join(normalizedPath, "next.config.mjs"))) return "nextjs";
  if (existsSync(join(normalizedPath, "app.json")) && existsSync(join(normalizedPath, "metro.config.js"))) return "react-native";

  return null;
}
