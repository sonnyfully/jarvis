import { JarvisConfig } from "../config";
import { Risk } from "./types";

export type PolicyDecision = {
    allowed: boolean
    reason: string
    requiresConfirmation: boolean
}


export function evaluateToolCall(args: {
    toolName: string
    toolArgs: Record<string, unknown>
    risk: Risk
    config: JarvisConfig
}): PolicyDecision {
    if (args.risk === "readOnly") {
        return {
            allowed: true,
            reason: "Read-only tool call allowed",
            requiresConfirmation: false}
    }
    if (args.risk === "write") {
        return {
            allowed: true,
            reason: "Write tool call allowed depending on configuration",
            requiresConfirmation: !!args.config.writeConfirmationRequired}
    }
    if (args.risk === "destructive") {
        return {allowed: true,
            reason: `Destructive tool call (${args.toolName}) requires confirmation`,
            requiresConfirmation: true}
    }
    
    return {allowed: false, reason: "Unknown risk", requiresConfirmation: false}
}