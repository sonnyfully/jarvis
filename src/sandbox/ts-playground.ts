interface User {
    readonly uuid: string
    displayName: string
    email?: string
    voicePref: boolean
    timestamp: number
}

type RiskLevel = 'readOnly' | 'write' | 'destructive'

interface Tool {
    name: string
    description: string
    riskLevel: RiskLevel
    confirmation: boolean
}

interface ToolCall {
    toolName: string
    toolArgs: Record<string, any>
    whyNeeded: string
    riskOverride?: RiskLevel
    timestamp: number
}

type ToolResult = 
    | { toolName: string;
        ok: true;
        result: string | object;
        runtimeMs: number }
    | { toolName: string;
        ok: false;
        error: string;
        runtimeMs: number }


type policyDecision = 
    | { allowed: true; needsConfirmation?: boolean }
    | {allowed:false; reason: string}