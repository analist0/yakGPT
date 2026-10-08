// Asking the user before a tool runs. Three modes:
// - normal: tools that only read run on their own, everything else asks
// - medium: reads and reversible changes run on their own; destructive
//   actions (delete, send, pay, publish) ask
// - free: everything runs on its own
// A per-tool rule ("auto" / "ask") overrides the mode.
import { useChatStore } from "./ChatStore";
import { ToolRisk, ToolSpec } from "./Tools";

export type ApprovalMode = "normal" | "medium" | "free";
export type ToolRule = "auto" | "ask";

export const APPROVAL_MODES: ApprovalMode[] = ["normal", "medium", "free"];

const autoRuns: Record<ApprovalMode, ToolRisk[]> = {
  normal: ["read"],
  medium: ["read", "write"],
  free: ["read", "write", "destructive"],
};

export const needsApproval = (tool: Pick<ToolSpec, "name" | "risk">) => {
  const { approvalMode, toolRules } = useChatStore.getState();
  const rule = toolRules[tool.name];
  if (rule) return rule === "ask";
  return !autoRuns[approvalMode].includes(tool.risk);
};

export const setApprovalMode = (approvalMode: ApprovalMode) =>
  useChatStore.setState({ approvalMode });

export const setToolRule = (name: string, rule: ToolRule | undefined) =>
  useChatStore.setState((state) => {
    const toolRules = { ...state.toolRules };
    if (rule) toolRules[name] = rule;
    else delete toolRules[name];
    return { toolRules };
  });

// Tool calls waiting for the user, by call id
const waiting = new Map<string, (approved: boolean) => void>();

// Resolves when the user approves (true) or declines (false). An aborted
// signal counts as declined.
export const requestApproval = (callId: string, signal?: AbortSignal) =>
  new Promise<boolean>((resolve) => {
    if (signal?.aborted) return resolve(false);
    waiting.set(callId, resolve);
    signal?.addEventListener("abort", () => resolveApproval(callId, false), { once: true });
  });

export const resolveApproval = (callId: string, approved: boolean) => {
  const resolve = waiting.get(callId);
  if (!resolve) return;
  waiting.delete(callId);
  resolve(approved);
};

export const declineAllApprovals = () =>
  [...waiting.keys()].forEach((callId) => resolveApproval(callId, false));

export const DECLINED_RESULT = "The user declined this action. Do not retry it unless they ask.";
