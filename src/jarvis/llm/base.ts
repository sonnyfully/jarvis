export type LLMMessage = {
    role: "system" | "user" | "assistant"
    content: string
  }
  
  export interface LLMClient {
    chat(args: {
      model: string
      messages: LLMMessage[]
      temperature: number
      maxTokens: number
      stop?: string[]
      topP?: number
    }): Promise<string>
  }