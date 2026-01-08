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
    
    // Handle different possible response structures
    let content: string | undefined
    
    // Standard structure: { message: { content: "..." } }
    if (data.message?.content) {
      content = data.message.content
    }
    // Alternative structure: { content: "..." }
    else if (data.content) {
      content = data.content
    }
    // Check if there's an error in the response
    else if (data.error) {
      throw new Error(`Ollama API returned an error: ${data.error}`)
    }
    
    if (!content || content.trim().length === 0) {
      // Log the actual response for debugging
      console.error("Unexpected Ollama response structure:", JSON.stringify(data, null, 2))
      
      // If we have a done_reason, include it in the error
      const doneReason = data.done_reason ? ` (done_reason: ${data.done_reason})` : ""
      throw new Error(
        `Invalid response from Ollama: empty or missing message content${doneReason}. ` +
        `This usually means the model stopped generating early or the prompt was unclear. ` +
        `Response structure: ${JSON.stringify(data).substring(0, 200)}`
      )
    }
    
    return content
  }
}