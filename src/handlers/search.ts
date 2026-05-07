// ============================================================
// SEARCH HANDLERS — search + link_path_to_feature
// ============================================================
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, relative, sep } from "path";
import type { KnowledgeBase, McpResponse } from "../types.js";
const SKIP_DIRS = new Set([
    "node_modules", ".git", "build", "dist", ".next", ".expo", "coverage", ".cache",
]);
/**
* Check if all query words appear in the given text (case-insensitive).
* Splits the query into individual words so multi-word searches like
* "bulk config mobile" match files containing all three words anywhere.
*/
function matchesAllQueryWords(lowerText: string, lowerQuery: string): boolean {
    const words = lowerQuery.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return false;
    return words.every(word => lowerText.includes(word));
}
/**
* Recursively walk a project directory and search file contents for a keyword.
* Appends matching results to the results array.
* Supports multi-word queries — all words must appear in the file (any order).
*/
function walkFilesForSearch(
    currentPath: string,
    basePath: string,
    lowerQuery: string,
    projectName: string,
    results: Array<Record<string, unknown>>,
    seenPaths: Set<string>
): void {
    let entries: string[];
    try {
        entries = readdirSync(currentPath);
    } catch {
        return;
    }
    for (const entry of entries) {
        if (SKIP_DIRS.has(entry)) continue;
        const fullPath = join(currentPath, entry);
        let stat;
        try {
            stat = statSync(fullPath);
        } catch {
            continue;
        }
        if (stat.isDirectory()) {
            walkFilesForSearch(fullPath, basePath, lowerQuery, projectName, results, seenPaths);
        } else if (stat.isFile()) {
            // Skip files larger than 100KB
            if (stat.size > 1024 * 100) continue;
            const relPath = relative(basePath, fullPath);
            const normalizedPath = relPath.split(sep).join("/");
            // Avoid duplicate results (same file matched via different paths)
            const key = `${projectName}:${normalizedPath}`;
            if (seenPaths.has(key)) continue;
            try {
                const content = readFileSync(fullPath, "utf-8");
                const lowerContent = content.toLowerCase();
                if (matchesAllQueryWords(lowerContent, lowerQuery)) {
                    seenPaths.add(key);
                    // Extract a brief context snippet (first line containing any query word)
                    const lines = content.split("\n");
                    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 0);
                    let snippet = "";
                    for (const line of lines) {
                        const lowerLine = line.toLowerCase();
                        if (queryWords.some(word => lowerLine.includes(word))) {
                            snippet = line.trim().substring(0, 150);
                            break;
                        }
                    }
                    results.push({
                        type: "file_content",
                        project: projectName,
                        file: normalizedPath,
                        snippet: snippet || "(binary or empty file)",
                    });
                }
            } catch {
                // skip unreadable files
            }
        }
    }
}
export function handleSearch(
    kb: KnowledgeBase,
    args: Record<string, unknown>
): McpResponse {
    const { query } = args as { query: string };
    const lowerQuery = query.toLowerCase();
    const results: Array<Record<string, unknown>> = [];
    // Search features
    for (const [featName, feat] of Object.entries(kb.features)) {
        if (
            featName.toLowerCase().includes(lowerQuery) ||
            feat.description.toLowerCase().includes(lowerQuery)
        ) {
            results.push({ type: "feature", name: featName, description: feat.description });
        }
        // Search within workflow steps
        for (const step of feat.workflow) {
            if (
                step.name.toLowerCase().includes(lowerQuery) ||
                step.description.toLowerCase().includes(lowerQuery)
            ) {
                results.push({
                    type: "workflow_step",
                    feature: featName,
                    step: step.step,
                    name: step.name,
                    description: step.description,
                });
            }
            // Search project mappings within this step (dynamic — any project name)
            for (const [projName, mapping] of Object.entries(step.projects || {})) {
                const mappingText = [
                    mapping.screen,
                    mapping.page,
                    mapping.endpoint,
                    mapping.api,
                    mapping.controller,
                    mapping.service,
                    mapping.file,
                    mapping.description,
                ].filter(Boolean).join(" ").toLowerCase();

                if (mappingText.includes(lowerQuery)) {
                    results.push({
                        type: "project_mapping",
                        project: projName,
                        feature: featName,
                        step: step.step,
                        ...mapping,
                    });
                }
            }
        }
        // Search test scenarios
        for (const scenario of feat.test_scenarios) {
            if (scenario.toLowerCase().includes(lowerQuery)) {
                results.push({ type: "test_scenario", feature: featName, scenario });
            }
        }
    }
    // Search projects
    for (const [projName, proj] of Object.entries(kb.projects)) {
        if (
            projName.toLowerCase().includes(lowerQuery) ||
            proj.path.toLowerCase().includes(lowerQuery) ||
            proj.framework.toLowerCase().includes(lowerQuery)
        ) {
            results.push({ type: "project", name: projName, path: proj.path, framework: proj.framework });
        }
    }
    // Search type mappings
    for (const tm of kb.typeMappings) {
        if (
            tm.typeName.toLowerCase().includes(lowerQuery) ||
            tm.sourceFile.toLowerCase().includes(lowerQuery) ||
            tm.targetFile.toLowerCase().includes(lowerQuery) ||
            (tm.description && tm.description.toLowerCase().includes(lowerQuery))
        ) {
            results.push({
                type: "type_mapping",
                typeName: tm.typeName,
                sourceProject: tm.sourceProject,
                sourceFile: tm.sourceFile,
                targetProject: tm.targetProject,
                targetFile: tm.targetFile,
            });
        }
    }
    // ============================================================
    // FILE SYSTEM SEARCH — Scan project files for the keyword
    // ============================================================
    const seenFilePaths = new Set<string>();
    for (const [projName, proj] of Object.entries(kb.projects)) {
        const projectPath = proj.path;
        if (!existsSync(projectPath)) continue;
        try {
            walkFilesForSearch(projectPath, projectPath, lowerQuery, projName, results, seenFilePaths);
        } catch {
            // skip projects that can't be scanned
        }
    }
    return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
}
// ============================================================
// link_path_to_feature has been merged into reverse_lookup
// Use reverse_lookup instead — it provides feature associations
// plus cross-project references (graph + scan).
// ============================================================
