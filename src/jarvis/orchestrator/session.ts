import { randomUUID } from "node:crypto"
import type { SessionEvent } from "../logging/events"
import type { Role } from "./types"

export type Message = {
    role: "user" | "assistant" | "system"
    content: string
}

export class Session {
    readonly sessionId: string
    private events: SessionEvent[] = []
    private currentTurnId: string = ""

    constructor() {
        this.sessionId = randomUUID()
    }

    async addSystemMessage(text: string): Promise<void> {
        const event: SessionEvent = {
            id: randomUUID(),
            sessionId: this.sessionId,
            turnId: this.currentTurnId || randomUUID(),
            createdAt: Date.now(),
            type: "message",
            role: "system" as Role,
            content: text,
        }
        await this.appendEvent(event)
    }

    async addUserMessage(text: string): Promise<void> {
        this.currentTurnId = randomUUID()
        const event: SessionEvent = {
            id: randomUUID(),
            sessionId: this.sessionId,
            turnId: this.currentTurnId,
            createdAt: Date.now(),
            type: "message",
            role: "user" as Role,
            content: text,
        }
        await this.appendEvent(event)
    }

    async addAssistantMessage(text: string): Promise<void> {
        const event: SessionEvent = {
            id: randomUUID(),
            sessionId: this.sessionId,
            turnId: this.currentTurnId || randomUUID(),
            createdAt: Date.now(),
            type: "message",
            role: "assistant" as Role,
            content: text,
        }
        await this.appendEvent(event)
    }

    getMessages(): Message[] {
        return this.events
            .filter((event): event is SessionEvent & { type: "message" } => event.type === "message")
            .map((event) => ({
                role: event.role,
                content: event.content,
            }))
    }

    toLLMMessages(args: { mode: "router" | "thinker" }): Message[] {
        const messages = this.getMessages()
        // For router mode, return recent messages (last 10 for context)
        // For thinker mode, return all messages
        if (args.mode === "router") {
            // Return last 10 messages for router context
            return messages.slice(-10)
        }
        return messages
    }

    async appendEvent(event: SessionEvent): Promise<void> {
        this.events.push(event)
    }

    getEvents() {
        return this.events
    }

    getRecentEvents(count: number) {
        return this.events.slice(-count)
    }

    getCurrentTurnId(): string {
        return this.currentTurnId
    }

    createEvent<T extends SessionEvent>(event: Omit<T, "id" | "sessionId" | "turnId" | "createdAt">): T {
        return {
            ...event,
            id: randomUUID(),
            sessionId: this.sessionId,
            turnId: this.currentTurnId || randomUUID(),
            createdAt: Date.now(),
        } as T
    }
}