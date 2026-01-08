import { promises as fs } from "node:fs"
import { join } from "node:path"
import type { SessionEvent } from "./events"

export interface SessionLogger {
    logEvent(event: SessionEvent): Promise<void>
    flush(): Promise<void>
}

export class FileSessionLogger implements SessionLogger {
    private logDir: string
    private sessionId: string
    private logFile: string
    private buffer: SessionEvent[] = []
    private flushInterval: NodeJS.Timeout | null = null
    private readonly bufferSize = 10
    private readonly flushIntervalMs = 5000

    constructor(logDir: string, sessionId: string) {
        this.logDir = logDir
        this.sessionId = sessionId
        this.logFile = join(logDir, `session-${sessionId}.jsonl`)
        this.startPeriodicFlush()
    }

    async initialize(): Promise<void> {
        await fs.mkdir(this.logDir, { recursive: true })
    }

    async logEvent(event: SessionEvent): Promise<void> {
        this.buffer.push(event)
        if (this.buffer.length >= this.bufferSize) {
            await this.flush()
        }
    }

    async flush(): Promise<void> {
        if (this.buffer.length === 0) {
            return
        }

        const events = this.buffer.splice(0, this.buffer.length)
        const lines = events.map(event => JSON.stringify(event)).join("\n") + "\n"

        try {
            await fs.appendFile(this.logFile, lines, "utf-8")
        } catch (error) {
            const err = error as Error
            console.error(`[SessionLogger] Failed to write to ${this.logFile}:`, err.message)
            // Re-add events to buffer for retry
            this.buffer.unshift(...events)
        }
    }

    private startPeriodicFlush(): void {
        this.flushInterval = setInterval(() => {
            this.flush().catch(err => {
                console.error("[SessionLogger] Periodic flush failed:", err)
            })
        }, this.flushIntervalMs)
    }

    async close(): Promise<void> {
        if (this.flushInterval) {
            clearInterval(this.flushInterval)
            this.flushInterval = null
        }
        await this.flush()
    }
}

export class NoOpLogger implements SessionLogger {
    async logEvent(_event: SessionEvent): Promise<void> {
        // No-op
    }
    async flush(): Promise<void> {
        // No-op
    }
}

