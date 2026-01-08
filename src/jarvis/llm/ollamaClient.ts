import type { LLMMessage, LLMClient } from "./base"

export class Ollamaclient implements LLMClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  async chat(args: {
    model: string
    messages: LLMMessage[]
    temperature: number
    maxTokens: number
    stop?: string[]
    topP?: number
  }): Promise<string> {
    const options: Record<string, unknown> = {
      temperature: args.temperature,
      num_predict: args.maxTokens,
    }
    
    if (args.stop !== undefined) {
      options.stop = args.stop
    }
    
    if (args.topP !== undefined) {
      options.top_p = args.topP
    }

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: args.model,
          messages: args.messages,
          stream: false,
          options,
        }),
      })
    } catch (error) {
      const err = error as Error & { code?: string }
      if (err.code === "ECONNREFUSED" || err.message.includes("fetch failed")) {
        throw new Error(
          `Cannot connect to Ollama at ${this.baseUrl}. ` +
          `Make sure Ollama is running. Start it with: ollama serve`
        )
      }
      throw error
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")
      throw new Error(
        `Ollama API error (${response.status}): ${errorText}. ` +
        `Make sure Ollama is running and the model "${args.model}" is available.`
      )
    }

    const data = await response.json()
    if (!data.message || !data.message.content) {
      throw new Error(`Invalid response from Ollama: missing message content`)
    }
    return data.message.content
  }
}