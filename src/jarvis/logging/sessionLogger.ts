import { promises as fs } from "node:fs"
import { join } from "node:path"
import type { CanonicalEvent, EventLevel, EventStage } from "./canonicalEvents"
import { createEvent } from "./canonicalEvents"
import { randomUUID } from "node:crypto"

export interface SessionLogger {
  emit(event: CanonicalEvent): Promise<void>
  stage(stageName: EventStage): StageLogger
  setTurnId(turnId: string): void
  setSpanId(spanId: string): void
  setAttempt(attempt: number): void
  flush(): Promise<void>
  close(): Promise<void>
}

export interface StageLogger {
  debug(type: string, summary: string, data?: Record<string, unknown>): Promise<void>
  info(type: string, summary: string, data?: Record<string, unknown>): Promise<void>
  warn(type: string, summary: string, data?: Record<string, unknown>): Promise<void>
  error(type: string, summary: string, data?: Record<string, unknown>): Promise<void>
}

export class FileSessionLogger implements SessionLogger {
  private logDir: string
  private sessionId: string
  private logFile: string
  private buffer: CanonicalEvent[] = []
  private flushInterval: NodeJS.Timeout | null = null
  private readonly bufferSize = 10
  private readonly flushIntervalMs = 5000
  private currentTurnId: string = ""
  private currentSpanId: string | null = null
  private currentAttempt: number = 0

  constructor(logDir: string, sessionId: string) {
    this.logDir = logDir
    this.sessionId = sessionId
    this.logFile = join(logDir, `session-${sessionId}.jsonl`)
    this.startPeriodicFlush()
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.logDir, { recursive: true })
  }

  setTurnId(turnId: string): void {
    this.currentTurnId = turnId
    this.currentSpanId = null
    this.currentAttempt = 0
  }

  setSpanId(spanId: string): void {
    this.currentSpanId = spanId
  }

  setAttempt(attempt: number): void {
    this.currentAttempt = attempt
  }

  async emit(event: CanonicalEvent): Promise<void> {
    // Validate in dev mode
    if (process.env.NODE_ENV !== "production") {
      this.validate(event)
    }

    this.buffer.push(event)
    if (this.buffer.length >= this.bufferSize) {
      await this.flush()
    }
  }

  stage(stageName: EventStage): StageLogger {
    return {
      debug: async (type: string, summary: string, data?: Record<string, unknown>) => {
        await this.emit(
          createEvent({
            id: randomUUID(),
            sessionId: this.sessionId,
            turnId: this.currentTurnId,
            spanId: this.currentSpanId || undefined,
            attempt: this.currentAttempt > 0 ? this.currentAttempt : undefined,
            level: "DEBUG",
            stage: stageName,
            type: type as any,
            summary,
            data,
          })
        )
      },
      info: async (type: string, summary: string, data?: Record<string, unknown>) => {
        await this.emit(
          createEvent({
            id: randomUUID(),
            sessionId: this.sessionId,
            turnId: this.currentTurnId,
            spanId: this.currentSpanId || undefined,
            attempt: this.currentAttempt > 0 ? this.currentAttempt : undefined,
            level: "INFO",
            stage: stageName,
            type: type as any,
            summary,
            data,
          })
        )
      },
      warn: async (type: string, summary: string, data?: Record<string, unknown>) => {
        await this.emit(
          createEvent({
            id: randomUUID(),
            sessionId: this.sessionId,
            turnId: this.currentTurnId,
            spanId: this.currentSpanId || undefined,
            attempt: this.currentAttempt > 0 ? this.currentAttempt : undefined,
            level: "WARN",
            stage: stageName,
            type: type as any,
            summary,
            data,
          })
        )
      },
      error: async (type: string, summary: string, data?: Record<string, unknown>) => {
        await this.emit(
          createEvent({
            id: randomUUID(),
            sessionId: this.sessionId,
            turnId: this.currentTurnId,
            spanId: this.currentSpanId || undefined,
            attempt: this.currentAttempt > 0 ? this.currentAttempt : undefined,
            level: "ERROR",
            stage: stageName,
            type: type as any,
            summary,
            data,
          })
        )
      },
    }
  }

  private validate(event: CanonicalEvent): void {
    if (!event.id || !event.sessionId || !event.turnId || !event.ts || !event.level || !event.stage || !event.type || !event.summary) {
      throw new Error(`Invalid event: missing required fields. Event: ${JSON.stringify(event)}`)
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
  async emit(_event: CanonicalEvent): Promise<void> {
    // No-op
  }
  stage(_stageName: EventStage): StageLogger {
    return {
      debug: async () => {},
      info: async () => {},
      warn: async () => {},
      error: async () => {},
    }
  }
  setTurnId(_turnId: string): void {
    // No-op
  }
  setSpanId(_spanId: string): void {
    // No-op
  }
  setAttempt(_attempt: number): void {
    // No-op
  }
  async flush(): Promise<void> {
    // No-op
  }
  async close(): Promise<void> {
    // No-op
  }
}

