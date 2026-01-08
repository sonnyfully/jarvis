export type RouterDecision =
    | {
        type: "directResponse"
        content: string
      }
    | {
        type: "clarifyingQuestion"
        question: string
      }
    | {
        type: "toolCall"
        tool: string
        args: Record<string, unknown>
        reason: string
        risk: "readOnly" | "write" | "destructive"
      }
    | {
        type: "escalate"
        reason: string
      }

export type Risk = "readOnly" | "write" | "destructive"

export type Role = "system" | "user" | "assistant"