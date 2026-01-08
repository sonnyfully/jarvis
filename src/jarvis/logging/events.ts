import type { RouterDecision, Risk, Role } from "../orchestrator/types"

type EventBase = {
    id: string
    sessionId: string
    turnId: string
    createdAt: number
  }
  
  export type SessionEvent =
    | (EventBase & {
        type: "message"
        role: Role
        content: string
      })
    | (EventBase & {
        type: "router_decision"
        decision: RouterDecision
        model: string
      })
    | (EventBase & {
        type: "tool_call"
        tool: string
        args: Record<string, unknown>
        risk: Risk
      })
    | (EventBase & {
        type: "policy_decision"
        allowed: boolean
        reason: string
        requiresConfirmation: boolean
      })
    | (EventBase & {
        type: "tool_result"
        tool: string
        ok: boolean
        result: unknown
        error?: string
      })
    | (EventBase & {
        type: "llm_request"
        mode: "router" | "thinker"
        model: string
        messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
      })
    | (EventBase & {
        type: "llm_response"
        mode: "router" | "thinker"
        model: string
        rawText: string
      })
    | (EventBase & {
        type: "parse_error"
        source: "router" | "thinker"
        rawText: string
        error: string
        attempt: number
      })