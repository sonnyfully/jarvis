/**
 * Router output normalizer - converts LLM output to canonical schema
 * Handles variations like tool_call -> toolCall, missing risk fields, etc.
 */

import type { RouterDecision } from "./types"

export interface RawRouterOutput {
  type: string
  content?: string
  question?: string
  tool?: string
  args?: Record<string, unknown>
  reason?: string
  risk?: string
}

/**
 * Normalizes router output to match canonical schema
 * - Converts snake_case types to camelCase
 * - Adds missing risk field for toolCall based on tool action
 * - Validates required fields
 */
export function normalizeRouterOutput(raw: unknown): { ok: true; decision: RouterDecision } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "Router output must be an object" }
  }

  const obj = raw as RawRouterOutput

  // Normalize type field
  let normalizedType: RouterDecision["type"]
  switch (obj.type) {
    case "direct_response":
    case "directResponse":
      normalizedType = "directResponse"
      break
    case "clarifying_question":
    case "clarifyingQuestion":
      normalizedType = "clarifyingQuestion"
      break
    case "tool_call":
    case "toolCall":
      normalizedType = "toolCall"
      break
    case "escalate":
      normalizedType = "escalate"
      break
    default:
      return { ok: false, error: `Invalid type: ${obj.type}. Expected directResponse, clarifyingQuestion, toolCall, or escalate` }
  }

  // Build normalized decision
  if (normalizedType === "directResponse") {
    if (!obj.content || typeof obj.content !== "string") {
      return { ok: false, error: "directResponse requires content field" }
    }
    return {
      ok: true,
      decision: {
        type: "directResponse",
        content: obj.content,
      },
    }
  }

  if (normalizedType === "clarifyingQuestion") {
    if (!obj.question || typeof obj.question !== "string") {
      return { ok: false, error: "clarifyingQuestion requires question field" }
    }
    return {
      ok: true,
      decision: {
        type: "clarifyingQuestion",
        question: obj.question,
      },
    }
  }

  if (normalizedType === "toolCall") {
    if (!obj.tool || typeof obj.tool !== "string") {
      return { ok: false, error: "toolCall requires tool field" }
    }
    if (!obj.args || typeof obj.args !== "object") {
      return { ok: false, error: "toolCall requires args field" }
    }
    // Provide default reason if missing or empty
    const reason = obj.reason && typeof obj.reason === "string" && obj.reason.trim()
      ? obj.reason.trim()
      : `Calling ${obj.tool} tool to fulfill user request`

    // Normalize risk field - infer from tool action
    // First, infer what the risk should be based on the action
    const action = (obj.args as any)?.action
    let inferredRisk: "readOnly" | "write" | "destructive" = "readOnly"
    if (action === "create" || action === "append" || action === "write" || action === "delete") {
      inferredRisk = "write"
    } else if (action === "read" || action === "list" || action === "get") {
      inferredRisk = "readOnly"
    }
    
    // Use provided risk if valid, otherwise use inferred
    let risk: "readOnly" | "write" | "destructive" = inferredRisk
    if (obj.risk) {
      const riskLower = obj.risk.toLowerCase()
      if (riskLower === "readonly" || riskLower === "read_only") {
        risk = "readOnly"
      } else if (riskLower === "write") {
        risk = "write"
      } else if (riskLower === "destructive") {
        risk = "destructive"
      }
      // If the provided risk doesn't match the inferred risk for write actions, override it
      // (e.g., if action is "create" but risk is "readOnly", use "write")
      if ((action === "create" || action === "append" || action === "write") && risk === "readOnly") {
        risk = "write"
      }
    }

    return {
      ok: true,
      decision: {
        type: "toolCall",
        tool: obj.tool,
        args: obj.args,
        reason,
        risk,
      },
    }
  }

  if (normalizedType === "escalate") {
    if (!obj.reason || typeof obj.reason !== "string") {
      return { ok: false, error: "escalate requires reason field" }
    }
    return {
      ok: true,
      decision: {
        type: "escalate",
        reason: obj.reason,
      },
    }
  }

  return { ok: false, error: "Unknown decision type" }
}

