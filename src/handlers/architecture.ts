// ============================================================
// ARCHITECTURE HANDLER — get_architecture + buildTree + previewChildren
// ============================================================

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import type { KnowledgeBase, McpResponse } from "../types.js";

const SKIP_DIRS = new Set([
  "node_modules", ".git", "build", "dist", ".next", ".expo", "coverage", ".cache",
]);

/**
 * Recursively build a tree structure for a directory, skipping unwanted dirs.
 */
function buildTree(
  dirPath: string,
  basePath: string,
  filter?: string,
  highlight?: string,
  showAll?: boolean
): { lines: string[]; fileCount: number; matchCount: number } {
  const lines: string[] = [];
  let fileCount = 0;
  let matchCount = 0;

  function walk(currentPath: string, prefix: string): void {
    let entries: string[];
    try {
      entries = readdirSync(currentPath);
    } catch {
      return; // permission denied, etc.
    }

    // Filter out skipped directories and sort
    const filtered = entries.filter((e) => !SKIP_DIRS.has(e)).sort();
    const dirs = filtered.filter((e) => {
      try { return statSync(join(currentPath, e)).isDirectory(); } catch { return false; }
    });
    const files = filtered.filter((e) => {
      try { return statSync(join(currentPath, e)).isFile(); } catch { return false; }
    });

    const allItems = [...dirs, ...files];

    for (let i = 0; i < allItems.length; i++) {
      const item = allItems[i];
      const isLast = i === allItems.length - 1;
      const connector = isLast ? "└── " : "├── ";
      const childPrefix = isLast ? "    " : "│   ";
      const itemPath = join(currentPath, item);
      const relPath = relative(basePath, itemPath);
      const relPathLower = relPath.toLowerCase();

      const isDir = dirs.includes(item);

      // Determine if this item should be shown
      let show = true;
      let isMatch = false;

      if (filter) {
        if (!isDir) {
          show = relPathLower.includes(filter.toLowerCase());
        }
      }

      if (highlight) {
        if (!isDir) {
          try {
            const stats = statSync(itemPath);
            if (stats.size <= 1024 * 100) {
              const content = readFileSync(itemPath, "utf-8");
              isMatch = content.toLowerCase().includes(highlight.toLowerCase());
            }
          } catch {
            // skip unreadable files
          }
        }

        if (showAll) {
          show = true;
        } else {
          if (!isDir) {
            show = isMatch;
          }
        }
      }

      if (!show) continue;

      if (isDir && (filter || (highlight && !showAll))) {
        const childResult = previewChildren(itemPath, basePath, filter, highlight, showAll);
        if (childResult === 0) continue;
      }

      const suffix = isDir ? "/" : "";
      const marker = isMatch ? " ★" : "";
      lines.push(`${prefix}${connector}${item}${suffix}${marker}`);
      fileCount++;
      if (isMatch) matchCount++;

      if (isDir) {
        walk(itemPath, prefix + childPrefix);
      }
    }
  }

  walk(dirPath, "");
  return { lines, fileCount, matchCount };
}

/**
 * Quick preview: count visible children in a directory (without building full tree).
 */
function previewChildren(
  dirPath: string,
  basePath: string,
  filter?: string,
  highlight?: string,
  showAll?: boolean
): number {
  let count = 0;
  try {
    const entries = readdirSync(dirPath);
    for (const e of entries) {
      if (SKIP_DIRS.has(e)) continue;
      const fullPath = join(dirPath, e);
      const relPath = relative(basePath, fullPath).toLowerCase();
      let show = true;
      const isDir = statSync(fullPath).isDirectory();

      if (filter) {
        if (!isDir) {
          show = relPath.includes(filter.toLowerCase());
        }
      }
      if (highlight && !showAll) {
        if (!isDir) {
          try {
            const stats = statSync(fullPath);
            if (stats.size <= 1024 * 100) {
              const content = readFileSync(fullPath, "utf-8");
              show = content.toLowerCase().includes(highlight.toLowerCase());
            } else {
              show = false;
            }
          } catch {
            show = false;
          }
        } else {
          const sub = previewChildren(fullPath, basePath, filter, highlight, showAll);
          show = sub > 0;
        }
      }
      if (show) count++;
      if (show && isDir) {
        count += previewChildren(fullPath, basePath, filter, highlight, showAll);
      }
    }
  } catch {
    // ignore
  }
  return count;
}

export function handleGetArchitecture(
  kb: KnowledgeBase,
  args: Record<string, unknown>
): McpResponse {
  const { projectName, filter, highlight, showAll } = args as {
    projectName: string;
    filter?: string;
    highlight?: string;
    showAll?: boolean;
  };

  const project = kb.projects[projectName];
  if (!project) {
    return {
      content: [{ type: "text", text: `Project "${projectName}" not found. Register it first with register_project.` }],
      isError: true,
    };
  }

  const projectPath = project.path;
  if (!existsSync(projectPath)) {
    return {
      content: [{ type: "text", text: `Project path "${projectPath}" does not exist on disk.` }],
      isError: true,
    };
  }

  try {
    const result = buildTree(projectPath, projectPath, filter, highlight, showAll ?? false);

    const lines: string[] = [];
    lines.push(`Architecture for "${projectName}" (${projectPath}):`);
    lines.push(``);

    if (result.lines.length === 0) {
      if (filter) {
        lines.push(`(No files match filter "${filter}")`);
      } else if (highlight) {
        lines.push(`(No files contain "${highlight}")`);
      } else {
        lines.push(`(Empty project)`);
      }
    } else {
      lines.push(...result.lines);
    }

    lines.push(``);
    lines.push(`─── ${result.fileCount} file(s) total`);
    if (highlight && result.matchCount > 0) {
      lines.push(`─── ${result.matchCount} file(s) contain "${highlight}" (marked with ★)`);
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Error reading architecture: ${err.message}` }],
      isError: true,
    };
  }
}
