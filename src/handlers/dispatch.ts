// ============================================================
// DISPATCHER — Routes tool name to the correct handler
// ============================================================

import type { KnowledgeBase, McpResponse } from "../types.js";
import { handleRegisterProject, handleRemoveProject, handleScanProject } from "./project.js";
import { handleRegisterFeature, handleRemoveFeature, handleGetFeature } from "./feature.js";
import { handleSearch } from "./search.js";
import { handleGetContext } from "./context.js";
import { handleCheckTypeMapping, handleRegisterTypeMappings } from "./type-mapping.js";
import { handleGetArchitecture } from "./architecture.js";
import { handleExportKnowledge, handleImportKnowledge } from "./persistence.js";
import { handleValidateKnowledge } from "./validation.js";
import { handleSuggestTypeMappings } from "./type-suggestions.js";
import { handleReverseLookup } from "./reverse-lookup.js";

export type ToolHandler = (
  kb: KnowledgeBase,
  setKb: (kb: KnowledgeBase) => void,
  persist: () => void,
  getKnowledgePath: () => string,
  args: Record<string, unknown>
) => McpResponse | Promise<McpResponse>;

export function dispatchTool(name: string): ToolHandler | null {
  switch (name) {
    case "register_project":
      return (_kb, _set, persist, _gkp, args) => handleRegisterProject(_kb, persist, args);
    case "remove_project":
      return (_kb, _set, persist, _gkp, args) => handleRemoveProject(_kb, persist, args);
    case "scan_project":
      return (_kb, _set, _persist, _gkp, args) => handleScanProject(_kb, args);
    case "register_feature":
      return (_kb, _set, persist, _gkp, args) => handleRegisterFeature(_kb, persist, args);
    case "remove_feature":
      return (_kb, _set, persist, _gkp, args) => handleRemoveFeature(_kb, persist, args);
    case "get_feature":
      return (_kb, _set, _persist, _gkp, args) => handleGetFeature(_kb, args);
    case "search":
      return (_kb, _set, _persist, _gkp, args) => handleSearch(_kb, args);
    case "get_context":
      return (_kb, _set, _persist, _gkp, args) => handleGetContext(_kb, args);
    case "register_type_mappings":
      return (_kb, _set, persist, _gkp, args) => handleRegisterTypeMappings(_kb, persist, args);
    case "check_type_mapping":
      return (_kb, _set, _persist, _gkp, args) => handleCheckTypeMapping(_kb, args);
    case "get_architecture":
      return (_kb, _set, _persist, _gkp, args) => handleGetArchitecture(_kb, args);
    case "export_knowledge":
      return (_kb, _set, persist, gkp, _args) => handleExportKnowledge(persist, gkp);
    case "import_knowledge":
      return (_kb, _set, persist, gkp, args) => handleImportKnowledge(_kb, _set, persist, gkp, args);
    case "validate_knowledge":
      return (kb, setKb, persist, _gkp, args) => handleValidateKnowledge(kb, setKb, persist, args);
    case "suggest_type_mappings":
      return (_kb, _set, persist, _gkp, args) => handleSuggestTypeMappings(_kb, persist, args);
    case "reverse_lookup":
      return (_kb, _set, _persist, _gkp, args) => handleReverseLookup(_kb, args);
    default:
      return null;
  }
}
