/**
 * Canonical event schema - single source of truth for all session events
 */

export type EventLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"

export type EventStage = "engine" | "planner" | "router" | "policy" | "tool" | "response"

export type EventType =
  | "session.created"
  | "turn.started"
  | "message.received"
  | "llm.requested"
  | "llm.responded"
  | "router.parsed"
  | "router.parseFailed"
  | "router.normalized"
  | "policy.decision"
  | "tool.started"
  | "tool.finished"
  | "tool.failed"
  | "response.emitted"
  | "turn.completed"
  | "error.raised"

export interface CanonicalEvent {
  id: string
  sessionId: string
  turnId: string
  spanId?: string // For correlating LLM request/response pairs
  attempt?: number // For retry attempts
  ts: string // ISO 8601 timestamp
  level: EventLevel
  stage: EventStage
  type: EventType
  summary: string
  data?: Record<string, unknown>
}

export function createEvent(params: {
  id: string
  sessionId: string
  turnId: string
  spanId?: string
  attempt?: number
  level: EventLevel
  stage: EventStage
  type: EventType
  summary: string
  data?: Record<string, unknown>
}): CanonicalEvent {
  return {
    id: params.id,
    sessionId: params.sessionId,
    turnId: params.turnId,
    ...(params.spanId !== undefined && { spanId: params.spanId }),
    ...(params.attempt !== undefined && { attempt: params.attempt }),
    ts: new Date().toISOString(),
    level: params.level,
    stage: params.stage,
    type: params.type,
    summary: params.summary,
    ...(params.data !== undefined && { data: params.data }),
  }
}

