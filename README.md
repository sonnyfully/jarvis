# Jarvis — Local-First Agent System

"Agents" aren't interesting unless they can actually be trusted, in my opinion.

Most agent demos collapse as soon as you remove hosted APIs, unlimited context, or blind tool execution. Jarvis is my attempt to build something smaller, stricter, and more honest: a local-first assistant that runs on my own machine, makes its decisions explicitly, and fails in ways I can reason about, while providing a useful second brain for new projects.

This is not a GPT wrapper, nor a single clever prompt. It’s a system.

---

Jarvis is solving a very specific problem: **how to safely coordinate language models, tools, and memory on a personal machine without pretending the model is omniscient or infallible**.

In most setups, the model is implicitly trusted to:
- decide what tools to run,
- execute them correctly,
- and not do anything stupid or destructive.

That assumption breaks immediately in real environments. Here, the model never executes anything directly. It proposes actions. The system decides whether they’re allowed, whether confirmation is required, and how failures are handled. Every step is logged.

The focus is on control and logic, not cleverness.

---

At a high level, the architecture is intentionally boring:

- A **local LLM runtime** (via Ollama)
- A **two-model strategy**:
  - a fast router for intent classification and simple tasks
  - a slower thinker model for planning and hard reasoning
- A **custom orchestrator** written in TypeScript that:
  - manages sessions
  - enforces policy
  - coordinates tool calls
  - handles retries, timeouts, and errors
- A **strict tool layer** (filesystem, notes, search, shell) with permission tiers
- A **memory system** that only writes when explicitly allowed
- A CLI interface as the primary surface area, soon to be upgraded to UI.

The LLM is treated as a fallible component, not the brain of the system.

---

There are a few constraints that drive almost every design decision here:

- **Local-only**: no OpenAI or hosted ingerence.
- **Resource-bounded**: designed for an Apple M4 machine with 16GB RAM.
- **Explicit permissions**: destructive actions require confirmation.
- **Auditability**: every tool call, argument, and result is logged.
- **Minimal magic**: if something happens, it should be traceable in code or logs.

If a feature can’t be made understandable, I don't add it

---

This system has known weaknesses.

Some failure modes I expect (and want to surface):
- Router misclassification leading to unnecessary escalation or shallow answers
- Context starvation when prompts grow faster than retrieval can compensate
- Tool refusal loops when the model proposes actions outside policy
- Latency spikes when the thinker model is invoked too often
- Memory pollution if summarization isn’t aggressive enough

The goal isn’t to eliminate these failures, but to make them visible, bounded, and ultimately fixable.

---

What I’m exploring next is less about adding features and more about tightening guarantees:

- Better routing heuristics so the thinker model is truly rare
- Stronger memory schemas instead of raw embedding dumps
- Clearer failure recovery strategies when tools error mid-plan
- Voice I/O without turning the system into a background daemon
- Formalizing “confidence” signals from the router instead of guessing

Longer-term, I’m interested in whether small, well-governed systems like this can outperform larger, opaque ones in day-to-day usefulness — not because they’re smarter, but because they’re more predictable and learn essential tasks.

---

This repo is not a product.  
If something looks overly strict, that’s probably the point.