import type { Risk } from "../orchestrator/types";

export type ToolResult = 
    | { ok: true; result: unknown}
    | { ok: false; error: string }

export type ToolContext = {
    dataDir: string
}

export type ToolCall = {
    name: string
    args: Record<string, unknown>
}

export type ToolDef = {
    name: string
    description: string
    getRisk: (args: Record<string, unknown>) => Risk
    run: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>
}