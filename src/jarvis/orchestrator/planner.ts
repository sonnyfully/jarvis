import { z } from "zod"
import { randomUUID } from "node:crypto"
import type { JarvisConfig } from "../config"
import type { Session } from "./session"
import type { RouterDecision } from "./types"
import {buildRouterPrompt} from "./prompts"
import {runLLM} from "../llm/routing"
import type {LLMClient} from "../llm/base"
import {toolsForRouter} from "../tools/registry"
import type {SessionLogger} from "../logging/sessionLogger"
import {normalizeRouterOutput} from "./routerNormalizer"


const RouteDecisionSchema = z.discriminatedUnion("type", [
    z.object({
      type: z.literal("directResponse"),
      content: z.string().min(1),
    }),
    z.object({
      type: z.literal("clarifyingQuestion"),
      question: z.string().min(1),
    }),
    z.object({
      type: z.literal("toolCall"),
      tool: z.string().min(1),
      args: z.record(z.unknown()),
      reason: z.string().min(1),
      risk: z.enum(["readOnly", "write", "destructive"]),
    }),
    z.object({
      type: z.literal("escalate"),
      reason: z.string().min(1),
    }),
  ])
  

  /**
   * Extracts and parses JSON from LLM response.
   * Handles cases where JSON might be wrapped in markdown code blocks or have prose around it.
   * Also attempts to fix common JSON issues like unescaped newlines.
   */
  function safeJSONParse(response: string): unknown {
    const trimmed = response.trim()
    
    // Try direct parse first (most common case)
    try {
      return JSON.parse(trimmed)
    } catch {
      // Continue to extraction logic
    }
    
    // Try to extract JSON from markdown code blocks (```json ... ``` or ``` ... ```)
    const markdownJsonMatch = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
    if (markdownJsonMatch) {
      try {
        return JSON.parse(markdownJsonMatch[1])
      } catch {
        // Continue
      }
    }
    
    // Try to find JSON object in the text (look for {...})
    const jsonObjectMatch = trimmed.match(/\{[\s\S]*\}/)
    if (jsonObjectMatch) {
      let jsonStr = jsonObjectMatch[0]
      
      // Try parsing as-is first
      try {
        return JSON.parse(jsonStr)
      } catch (parseError) {
        // If that fails, try to fix unescaped newlines in string values
        // This handles cases where the LLM outputs \n instead of \\n
        try {
          // Find all string values (content between quotes) and escape unescaped newlines
          let fixed = jsonStr
          let inString = false
          let escaped = false
          let result = ''
          
          for (let i = 0; i < fixed.length; i++) {
            const char = fixed[i]
            const prevChar = i > 0 ? fixed[i - 1] : ''
            
            if (escaped) {
              result += char
              escaped = false
              continue
            }
            
            if (char === '\\') {
              escaped = true
              result += char
              continue
            }
            
            if (char === '"' && prevChar !== '\\') {
              inString = !inString
              result += char
              continue
            }
            
            if (inString && char === '\n') {
              // Escape unescaped newline in string
              result += '\\n'
            } else if (inString && char === '\r') {
              // Escape unescaped carriage return in string
              result += '\\r'
            } else {
              result += char
            }
          }
          
          return JSON.parse(result)
        } catch {
          // If fixing didn't work, throw the original error
          throw parseError
        }
      }
    }
    
    // If all else fails, try parsing the trimmed text again (will throw)
    return JSON.parse(trimmed)
  }

  function tryParseDecision(text: string, attempt: number): { ok: true; decision: RouterDecision } | { ok: false; error: string; normalized?: RouterDecision } {
    try {
      const obj = safeJSONParse(text)
      
      // First try strict parsing
      try {
        const decision = RouteDecisionSchema.parse(obj)
        return { ok: true, decision }
      } catch (strictError) {
        // If strict parsing fails, try normalization
        const normalized = normalizeRouterOutput(obj)
        if (normalized.ok) {
          return { ok: true, decision: normalized.decision }
        }
        return { ok: false, error: normalized.error }
      }
    } catch (error) {
      const err = error as Error
      return { ok: false, error: err.message }
    }
  }

  export async function planNextStep(args: {
    session: Session,
    config: JarvisConfig,
    llmclient: LLMClient,
    userText: string,
    logger: SessionLogger,
  }): Promise<{decision: RouterDecision, model: string, rawText: string}> {
    const systemPrompt = buildRouterPrompt(toolsForRouter)
    const router = args.logger.stage("router")
    const turnId = args.session.getCurrentTurnId()
    const spanId1 = randomUUID()
    const spanId2 = randomUUID()

    const routerMessages = args.session.toLLMMessages({ mode: "router" })
    const requestMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system" as const, content: systemPrompt },
        ...routerMessages,
        { role: "user" as const, content: args.userText },
    ]

    args.logger.setSpanId(spanId1)
    args.logger.setAttempt(1)
    await router.info("llm.requested", "Router LLM request", {
      model: args.config.ollamaModel,
      messageCount: requestMessages.length,
    })

    const first = await runLLM({
        config: args.config,
        client: args.llmclient,
        mode: "router",
        messages: requestMessages,
    })

    await router.info("llm.responded", "Router LLM response", {
      model: first.model,
      rawText: first.text,
    })

    const parsed1 = tryParseDecision(first.text, 1)
    if (!parsed1.ok) {
        await router.warn("router.parseFailed", "Router parse failed", {
          rawText: first.text,
          error: parsed1.error,
          attempt: 1,
        })
    } else {
        await router.info("router.parsed", "Router decision parsed", {
          decision: parsed1.decision,
        })
    }
    
    if (parsed1.ok) {
        return { decision: parsed1.decision, model: first.model, rawText: first.text }
    }

    // Try normalization (with error handling in case text isn't JSON)
    try {
        const normalized = normalizeRouterOutput(safeJSONParse(first.text))
        if (normalized.ok) {
            await router.info("router.normalized", "Router output normalized", {
              original: first.text,
              normalized: normalized.decision,
            })
            return { decision: normalized.decision, model: first.model, rawText: first.text }
        }
    } catch (error) {
        // Text is not valid JSON, skip normalization and proceed to retry
        await router.warn("router.normalizationSkipped", "Router output is not JSON, skipping normalization", {
          rawText: first.text,
          error: error instanceof Error ? error.message : String(error),
        })
    }

    const retryMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system" as const, content: systemPrompt },
        ...routerMessages,
        { role: "user" as const, content: args.userText },
        { role: "assistant" as const, content: first.text },
        { role: "user" as const, content: "Your previous response was not valid JSON. You must output ONLY a JSON object, nothing else. No prose, no markdown, no explanations. Start with { and end with }. Output only the JSON matching one of the schemas from the system prompt." },
    ]

    args.logger.setSpanId(spanId2)
    args.logger.setAttempt(2)
    await router.info("llm.requested", "Router LLM retry request", {
      model: args.config.ollamaModel,
      messageCount: retryMessages.length,
    })

    const retry = await runLLM({
        config: args.config,
        client: args.llmclient,
        mode: "router",
        messages: retryMessages,
    })

    await router.info("llm.responded", "Router LLM retry response", {
      model: retry.model,
      rawText: retry.text,
    })

    const parsed2 = tryParseDecision(retry.text, 2)
    if (!parsed2.ok) {
        await router.warn("router.parseFailed", "Router parse failed on retry", {
          rawText: retry.text,
          error: parsed2.error,
          attempt: 2,
        })
    } else {
        await router.info("router.parsed", "Router decision parsed on retry", {
          decision: parsed2.decision,
        })
    }
    
    if (parsed2.ok) {
        return { decision: parsed2.decision, model: retry.model, rawText: retry.text }
    }

    // Try normalization on retry (with error handling in case text isn't JSON)
    try {
        const normalized2 = normalizeRouterOutput(safeJSONParse(retry.text))
        if (normalized2.ok) {
            await router.info("router.normalized", "Router output normalized on retry", {
              original: retry.text,
              normalized: normalized2.decision,
            })
            return { decision: normalized2.decision, model: retry.model, rawText: retry.text }
        }
    } catch (error) {
        // Text is not valid JSON, skip normalization and proceed to fallback
        await router.warn("router.normalizationSkipped", "Router output is not JSON on retry, skipping normalization", {
          rawText: retry.text,
          error: error instanceof Error ? error.message : String(error),
        })
    }

    const fallback: RouterDecision = {
        type: "clarifyingQuestion",
        question: "I'm having trouble understanding your request, sir. Could you please rephrase it?"
    }
    await router.warn("router.parseFailed", "Router parse failed after all attempts, using fallback", {
      attempts: 2,
    })
    return { decision: fallback, model: retry.model, rawText: retry.text }
  }