import { JarvisConfig } from "../config"
import type { LLMClient } from "../llm/base"
import { buildSystemPrompt } from "./prompts"
import { Session } from "./session"
import { tools, toolByName } from "../tools/registry"
import { planNextStep } from "./planner"
import { evaluateToolCall } from "./policy"
import type { RouterDecision } from "./types"
import { FileSessionLogger } from "../logging/sessionLogger"
import { createEvent } from "../logging/canonicalEvents"
import { randomUUID } from "node:crypto"
import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"

export class Orchestrator {
    
    private session: Session
    private llm: LLMClient
    private readline: ReturnType<typeof createInterface> | null = null
    private logger: FileSessionLogger | null = null
    
    constructor(private config: JarvisConfig, llmClient: LLMClient) {
        this.session = new Session()
        this.llm = llmClient
    }
    
    async initialize() {
        const logDir = this.config.logDir || "./data/logs"
        this.logger = new FileSessionLogger(logDir, this.session.sessionId)
        await this.logger.initialize()
        
        const engine = this.logger.stage("engine")
        await engine.info("session.created", "Session initialized", {
          sessionId: this.session.sessionId,
        })
        
        await this.session.addSystemMessage(await buildSystemPrompt(tools))
    }

    private async promptConfirmation(message: string): Promise<boolean> {
        if (!this.readline) {
            this.readline = createInterface({ input, output })
        }
        const answer = await this.readline.question(`${message} (y/n): `)
        return answer.toLowerCase().trim() === "y" || answer.toLowerCase().trim() === "yes"
    }

    private async executeTool(
        toolName: string,
        args: Record<string, unknown>,
        risk: "readOnly" | "write" | "destructive"
    ) {
        const tool = toolByName.get(toolName)
        if (!tool) {
            const toolStage = this.logger?.stage("tool")
            await toolStage?.error("tool.failed", `Tool "${toolName}" not found`, {
              tool: toolName,
            })
            return {
                ok: false as const,
                error: `Tool "${toolName}" not found`
            }
        }

        const toolStage = this.logger?.stage("tool")
        await toolStage?.info("tool.started", `Tool execution started: ${toolName}`, {
          tool: toolName,
          args,
          risk,
        })

        try {
            const context = {
                dataDir: this.config.dataDir,
            }
            const result = await tool.run(args, context)

            if (result.ok) {
                await toolStage?.info("tool.finished", `Tool execution succeeded: ${toolName}`, {
                  tool: toolName,
                  result: result.result,
                })
            } else {
                await toolStage?.warn("tool.failed", `Tool execution failed: ${toolName}`, {
                  tool: toolName,
                  error: result.error,
                })
            }

            return result
        } catch (error) {
            const err = error as Error
            await toolStage?.error("tool.failed", `Tool execution threw error: ${toolName}`, {
              tool: toolName,
              error: err.message,
            })

            return {
                ok: false as const,
                error: err.message
            }
        }
    }

    private async generateFinalResponse(
        userInput: string,
        decision: RouterDecision,
        toolResult?: { ok: boolean; result?: unknown; error?: string }
    ): Promise<string> {
        const messages = this.session.getMessages()
        
        // Build tool result context message
        let toolContextMessage = ""
        if (decision.type === "toolCall" && toolResult) {
            if (toolResult.ok) {
                const resultStr = typeof toolResult.result === "string" 
                    ? toolResult.result 
                    : JSON.stringify(toolResult.result, null, 2)
                toolContextMessage = `The tool "${decision.tool}" has been executed successfully. Here is the result:\n\n${resultStr}\n\nNow provide a clear, natural language response to the user based on this result.`
            } else {
                toolContextMessage = `The tool "${decision.tool}" failed with error: ${toolResult.error}\n\nExplain this to the user and suggest what to do next.`
            }
        }

        // Build response messages with proper ordering: system messages first, then conversation
        const responseMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = []
        
        // Separate system messages from conversation messages
        const systemMessages: Array<{ role: "system"; content: string }> = []
        const conversationMessages: Array<{ role: "user" | "assistant"; content: string }> = []
        
        // Process existing messages (excluding the last user message to avoid duplication)
        const existingMessages = messages.slice(0, -1)
        for (const msg of existingMessages) {
            if (msg.role === "system") {
                systemMessages.push({ role: "system", content: msg.content })
            } else {
                conversationMessages.push({ role: msg.role, content: msg.content })
            }
        }
        
        // Add system messages first
        responseMessages.push(...systemMessages)
        
        // Add tool context as a system message if we have it
        if (toolContextMessage) {
            responseMessages.push({ role: "system", content: toolContextMessage })
        }
        
        // Add conversation history
        responseMessages.push(...conversationMessages)
        
        // Add the current user input
        responseMessages.push({ role: "user", content: userInput })

        // Ensure we have at least one message
        if (responseMessages.length === 0) {
            throw new Error("Cannot generate response: no messages available")
        }

        // Validate all messages have content
        for (const msg of responseMessages) {
            if (!msg.content || typeof msg.content !== "string" || msg.content.trim().length === 0) {
                throw new Error(`Invalid message: empty or missing content. Message: ${JSON.stringify(msg)}`)
            }
        }

        const response = await this.llm.chat({
            model: this.config.ollamaModel,
            messages: responseMessages,
            temperature: 0.7,
            maxTokens: 500,
        })

        return response
    }

    async handleInput(input: string): Promise<string> {
        if (!this.logger) {
            throw new Error("Logger not initialized")
        }

        const turnId = randomUUID()
        this.logger.setTurnId(turnId)
        const engine = this.logger.stage("engine")
        
        await engine.info("turn.started", "Turn started", {
          userInput: input,
        })

        // Add user message to session
        await this.session.addUserMessage(input)
        await engine.info("message.received", "User message received", {
          content: input,
        })

        // Step 1: Call Planner
        const { decision, model, rawText } = await planNextStep({
            session: this.session,
            config: this.config,
            llmclient: this.llm,
            userText: input,
            logger: this.logger,
        })

        // Step 2: Handle Decision Types
        if (decision.type === "directResponse") {
            const response = decision.content
            await this.session.addAssistantMessage(response)
            await engine.info("response.emitted", "Direct response emitted", {
              response,
            })
            await engine.info("turn.completed", "Turn completed", {})
            return response
        }

        if (decision.type === "clarifyingQuestion") {
            const response = decision.question
            await this.session.addAssistantMessage(response)
            await engine.info("response.emitted", "Clarifying question emitted", {
              response,
            })
            await engine.info("turn.completed", "Turn completed", {})
            return response
        }

        if (decision.type === "escalate") {
            const response = `I need to think more deeply about this: ${decision.reason}. For now, let me provide a basic response.`
            await this.session.addAssistantMessage(response)
            await engine.info("response.emitted", "Escalate response emitted", {
              response,
            })
            await engine.info("turn.completed", "Turn completed", {})
            return response
        }

        const policy = this.logger.stage("policy")
        const policyDecision = evaluateToolCall({
            toolName: decision.tool,
            toolArgs: decision.args,
            risk: decision.risk,
            config: this.config,
        })

        await policy.info("policy.decision", "Policy decision made", {
          allowed: policyDecision.allowed,
          reason: policyDecision.reason,
          requiresConfirmation: policyDecision.requiresConfirmation,
          tool: decision.tool,
        })

        if (!policyDecision.allowed) {
            const response = `Action denied: ${policyDecision.reason}`
            await this.session.addAssistantMessage(response)
            await engine.info("response.emitted", "Policy denied response emitted", {
              response,
            })
            await engine.info("turn.completed", "Turn completed", {})
            return response
        }

        if (policyDecision.requiresConfirmation) {
            const confirmMessage = `${policyDecision.reason}\nProceed with ${decision.tool}?`
            const confirmed = await this.promptConfirmation(confirmMessage)
            
            if (!confirmed) {
                const response = `Action cancelled by user.`
                await this.session.addAssistantMessage(response)
                await engine.info("response.emitted", "User cancelled response emitted", {
                  response,
                })
                await engine.info("turn.completed", "Turn completed", {})
                return response
            }
        }

        // Step 5: Tool Execution
        const toolResult = await this.executeTool(
            decision.tool,
            decision.args,
            decision.risk
        )

        // Step 6: Generate Final Response
        const response = this.logger.stage("response")
        const finalResponse = await this.generateFinalResponse(input, decision, toolResult)
        await this.session.addAssistantMessage(finalResponse)
        await response.info("response.emitted", "Final response emitted", {
          response: finalResponse,
        })
        await engine.info("turn.completed", "Turn completed", {})
        
        return finalResponse
    }

    async close(): Promise<void> {
        if (this.logger) {
            await this.logger.close()
        }
        if (this.readline) {
            this.readline.close()
        }
    }
}