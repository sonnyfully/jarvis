import { z } from "zod"
import { randomUUID } from "node:crypto"
import type { JarvisConfig } from "../config"
import type { Session } from "./session"
import type { RouterDecision } from "./types"
import {buildRouterPrompt} from "./prompts"
import {runLLM} from "../llm/routing"
import type {Ollamaclient} from "../llm/ollamaClient"
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
  

  function safeJSONParse(response: string): unknown {
    const trimmed = response.trim()
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
    llmclient: Ollamaclient,
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

    // Try normalization
    const normalized = normalizeRouterOutput(safeJSONParse(first.text))
    if (normalized.ok) {
        await router.info("router.normalized", "Router output normalized", {
          original: first.text,
          normalized: normalized.decision,
        })
        return { decision: normalized.decision, model: first.model, rawText: first.text }
    }

    const retryMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system" as const, content: systemPrompt },
        ...routerMessages,
        { role: "user" as const, content: args.userText },
        { role: "assistant" as const, content: first.text },
        { role: "user" as const, content: "Your previous response was not valid. Please try again.; output only JSON matching the schema below:" },
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

    // Try normalization on retry
    const normalized2 = normalizeRouterOutput(safeJSONParse(retry.text))
    if (normalized2.ok) {
        await router.info("router.normalized", "Router output normalized on retry", {
          original: retry.text,
          normalized: normalized2.decision,
        })
        return { decision: normalized2.decision, model: retry.model, rawText: retry.text }
    }

    // Fallback: return a clarifying question if parsing fails twice
    const fallback: RouterDecision = {
        type: "clarifyingQuestion",
        question: "I'm having trouble understanding your request. Could you please rephrase it?"
    }
    await router.warn("router.parseFailed", "Router parse failed after all attempts, using fallback", {
      attempts: 2,
    })
    return { decision: fallback, model: retry.model, rawText: retry.text }
  }