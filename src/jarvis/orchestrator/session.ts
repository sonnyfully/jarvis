import { randomUUID } from "node:crypto"

export type Message = {
    role: "user" | "assistant" | "system"
    content: string
}

export class Session {
    readonly sessionId: string
    private messages: Message[] = []

    constructor() {
        this.sessionId = randomUUID()
    }

    addSystemMessage(text: string) {
        this.messages.push({ role: "system", content: text })
    }

    addUserMessage(text: string) {
        this.messages.push({ role: "user", content: text })
    }

    addAssistantMessage(text: string) {
        this.messages.push({ role: "assistant", content: text })
    }

    getMessages() {
        return this.messages
    }
}