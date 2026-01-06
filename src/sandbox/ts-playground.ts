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

type Mode = "text" | "voice"

function handleMode(mode: Mode) {
    if (mode === "text") {
        return "Typing mode"
    } else {
        return "Voice mode"
    }
}

interface User1 {
    id: string
    displayName?: string
}

function getGreeting(user: User1): string {
    if user.displayName {
        return `Hello, ${user.displayName}`
    } else {
        return `Hello`
    }
}

type ToolResult1 = 
    | { ok: true; result:string }
    | { ok: false; error: string }

function formatResult(r: ToolResult1): string {
    if (r.ok) {
        return `Success: ${r.result}`
    } else {
        return `Error: ${r.error}`
    }
}

type ToolName1 = "notes" | "search"

interface Tool1 {
    name: ToolName1
    run: () => string
}

async function fetchNumber(): Promise<number> {
    return 42
}

async function main(): Promise<number> {
    const number = await fetchNumber()
    return number * 2
}

async function readA(): Promise<string> {
    return "A"
}

async function readB(): Promise<string> {
    return "B"
}

async function sequential() {
    const a = await readA()
    const b = await readB()
    return `${a} ${b}`
}

async function parallel() {
    const [a, b] = await Promise.all([readA(), readB()])
    return `${a} ${b}`
}

interface Logger {
    log: (message: string) => void
}

const logger: Logger = {
    log: (message: string) {
        console.log(message)
    }
}
