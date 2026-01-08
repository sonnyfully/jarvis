# JARVIS — Orchestrator Flow (High Level Context for Cursor)

This repo is “Jarvis” as a **system**, not “a model”: a local-first assistant where the LLM proposes actions, but **never executes anything directly**. The orchestrator controls tools, permissions, confirmations, logging, and (later) memory + voice.  

## Core Goal

Build a reliable, local assistant that can:
- answer normally when no actions are needed
- plan multi-step work when needed
- use tools safely (read/write/shell/search/notes)
- escalate to a stronger model only when the “router” model isn’t enough
- be auditable: every action is logged, permissioned, and reversible where possible  

## Canonical Execution Path

**engine => planner => router => policy => toolCall => response**

Think of this as a strict pipeline. Each stage produces an output that constrains the next stage.

### 1) Engine (the loop)
The engine is the “brainstem”:
- owns the session (messages + state)
- calls LLMs
- runs tools
- handles retries/timeouts
- writes audit logs for every decision + tool call  
**Engine inputs:** user message + session state  
**Engine outputs:** a final assistant response (and optionally tool actions taken to get there)

### 2) Planner (decides *what should happen*)
Planner decides the *shape* of the work:
- direct response vs clarifying question vs tool usage vs escalation
- if tools: which tools, in what order, and what intermediate artifacts matter
- sets “risk” labels per step (read_only | write | destructive)  

The planner should be deterministic in structure, even if the content comes from the model.

### 3) Router (fast model; picks the branch)
Router LLM is optimized for:
- intent classification
- deciding whether tools are needed
- generating a structured tool plan/tool call JSON
- asking a clarifying question when the request is underspecified  

Router outputs one of:
- **DirectResponse** (no tools)
- **Clarify** (asks user a question before proceeding)
- **ToolPlan / ToolCall** (one or more tool calls)
- **EscalateToThinker** (handoff to smarter model)

### 4) Policy (gatekeeper)
Policy enforces safety + permission tiers:
- Tier 0: read-only (no confirmation)
- Tier 1: write (confirm depending on config)
- Tier 2: destructive/risky (always confirm)
- shell is default-deny with allowlists + typed confirmations  

Policy consumes a proposed tool call and returns:
- allow / deny / require_confirmation
- a human-readable rationale (used in audit log + user-facing prompts when relevant)

### 5) ToolCall (execution)
If policy allows (and user confirmed when needed), engine executes tool:
- validates args
- enforces path/command restrictions
- returns typed ToolResult: ok/result/error
- logs everything (inputs, outputs, duration, exit codes)  

### 6) Response (final assistant message)
Engine composes the final response from:
- the user request
- the tool results (if any)
- the plan’s intent (“why we did what we did”)
- optionally: suggested next actions

The response must be:
- clear about what was done vs what is proposed
- explicit when something was blocked or requires confirmation
- grounded in tool output, not invented

---

## Deviations / Branches (Where the Canonical Path Splits)

### A) Direct Response branch (no tools)
If router decides: “answerable from context,” flow becomes:

**engine => planner => router => response**

No policy/tooling involved. Still log: route decision + model output.

### B) Clarifying Question branch
If missing critical info, do:

**engine => planner => router => response(clarifying question)**

Then on next user message, resume canonical flow. Goal: avoid wrong tool calls.

### C) Thinker escalation branch (hard tasks)
If router confidence is low or task is complex:

**engine => planner => router => thinker => (policy => toolCall)* => response**

Thinker is used for:
- multi-step debugging/coding
- ambiguous planning
- large file reasoning/synthesis
- cases where router repeatedly fails or contradicts itself  

Router’s job is to *minimize* thinker usage while maintaining correctness.

### D) Tool loop branch (multi-step actions)
Some tasks require several tool calls (search → read file → edit note). Pattern:

**engine => planner => router => policy => toolCall => toolResult**
…repeat until done…
**=> response**

Planner should keep the tool loop bounded:
- max steps
- stop conditions
- fallback if a tool fails

### E) “Safe fail” / refusal branch
If policy denies:
- engine returns a response explaining what was blocked and why
- offers safer alternatives (read-only preview, diff, dry-run)
- logs the denial decision

---

## Tool Options (MVP + Typical Uses)

Jarvis tools are “capabilities with guardrails.” Tools should be small, typed, and auditable.  

### Notes Tool (Tier 0–1)
- create_note(title, content)
- append_note(title, content)
- list_notes()
- read_note(title)

Use for: journaling decisions, capturing plans, saving outputs.

### Filesystem Tool (Tier 0–1)
- list_dir(path) (restricted to repo + data)
- read_file(path)
- (later) write_file(path) restricted to data/

Use for: reading project files, summarizing code, generating patches to be applied safely.

### Search Tool (Tier 0)
- search_text(query, root, max_results) (ripgrep-backed)

Use for: “find where X is defined,” “search config usage,” “locate all TODOs.”

### Shell Tool (Tier 1–2, locked down)
- run(command, cwd, env?) with allowlist + confirmations

Use for: safe commands like `git status`, `rg`, `node scripts`, etc.
Default deny for anything that looks destructive or system-level.  [oai_citation:9‡Jarvis context.txt](file-service://file-RFVvHfJfoBzhEwQ2QPfGX5)

---

## Design Rules (Non-Negotiables)

1) **LLM proposes; orchestrator executes.** Never let the model run actions without policy checks.  [oai_citation:10‡Jarvis context.txt](file-service://file-RFVvHfJfoBzhEwQ2QPfGX5)  
2) **Everything is logged.** Tool calls, args (redacted), decisions, confirmations, results.  [oai_citation:11‡Jarvis context.txt](file-service://file-RFVvHfJfoBzhEwQ2QPfGX5)  
3) **Safe by default.** Deny risky actions unless explicitly confirmed.  
4) **Structured outputs.** Tool calls are strict JSON; tool results are typed.  [oai_citation:12‡Jarvis context.txt](file-service://file-RFVvHfJfoBzhEwQ2QPfGX5)  
5) **Two-model strategy.** Router for speed; thinker for depth; escalate intentionally.  [oai_citation:13‡Jarvis context.txt](file-service://file-RFVvHfJfoBzhEwQ2QPfGX5)  

---

## Mental Model Summary

- **Engine**: runtime + state + enforcement  
- **Planner**: decides steps + bounds + stop conditions  
- **Router**: chooses branch, proposes tool calls quickly  
- **Thinker**: deep reasoning when router isn’t enough  
- **Policy**: gatekeeper, confirmations, allowlists  
- **Tools**: narrow capabilities with validation + restrictions  
- **Response**: truthful synthesis of what happened + what’s next