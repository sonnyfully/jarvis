import { JarvisConfig } from "../config"

export type Message = {
    role: "user" | "assistant" | "system"
    content: string
}

export class Session {
    private sessionId: string
    private messages: Message[] = []

    constructor(private config: JarvisConfig) {
        this.sessionId = crypto.randomUUID()
    }

    addSystemMessage(text: string) {
        this.messages.push({ role: "system", content: text })
    }

    addUserMessage(text: string) {
        this.messages.push({ role: "user", content: text })
    }

    addJarvisMessage(text: string) {
        this.messages.push({ role: "assistant", content: text })
    }

    getMessages() {
        return this.messages
    }
}