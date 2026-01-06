import type { Message } from "../orchestrator/session"

export class Ollamaclient {
    private baseUrl: string
    private model: string

    constructor(baseUrl: string, model: string) {
        this.baseUrl = baseUrl
        this.model = model
    }

    async chat(messages: Message[]): Promise<string> {
        const response = await fetch(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                model: this.model,
                messages,
                stream: false,
            }),
        })
        const data = await response.json()
        return data.message.content
    }
}
