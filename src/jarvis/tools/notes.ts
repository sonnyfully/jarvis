import * as path from "node:path"
import type { ToolDef, ToolContext, ToolResult } from "./base"
import type { Risk } from "../orchestrator/types"
import * as fs from "node:fs/promises"

type NotesActions = "create" | "read" | "list" | "append"

function isString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0
}

function slugify(title: string): string {
    return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function getNotesPath(context: ToolContext, title: string): string {
    const file = `${slugify(title)}.md`
    return path.join(context.dataDir, "notes", file)
}

function getAction(args: Record<string, unknown>): NotesActions | null {
    const action = args.action
    if (action === "create" || action === "append" || action === "read" || action === "list") {
        return action
    }
    return null
}

export const notesTool: ToolDef = {
    name: "notes",
    description:
    "Create, read, list, and append markdown notes under data/notes. \n Args: { action: 'create'|'read'|'list'|'append', title?, content? }",

    getRisk: (args: Record<string, unknown>): Risk => {
        const action = getAction(args)
        if (action === "create" || action === "append") {
            return "write"
        }
        return "readOnly"
    },

    async run(args, context): Promise<ToolResult> {
        const action = getAction(args)
        if (!action) return { ok: false, error: "Missing or invalid action" }

        const notesDir = path.join(context.dataDir, "notes")
        await fs.mkdir(notesDir, { recursive: true })

        if (action === 'list') {
            const files = await fs.readdir(notesDir)
            const titles = files
            .filter((file: string) => file.endsWith('.md'))
            .map((file: string) => file.replace(/\.md/, ''))
            return { ok: true, result: {notes: titles } }
        }

        if (action === 'read') {
            if (!isString(args.title)) return { ok: false, error: "Title is required for read" }
            const p = getNotesPath(context, args.title)
            const content = await fs.readFile(p, 'utf-8').catch(() => null)
            return { ok: true, result: {title: args.title, content} }
        }

        if (action === 'create') {
            if (!isString(args.title)) return { ok: false, error: "Title is required for create" }
            if (!isString(args.content)) return { ok: false, error: "Content is required for create" }
            const p = getNotesPath(context, args.title)
            await fs.writeFile(p, args.content.trim() + '\n', {flag: 'wx'}).catch((error: unknown) => {
                const err = error as Error
                throw new Error(`Failed to create note: ${err.message}`)
            })
            return { ok: true, result: {title: args.title} }
        }

        if (action === 'append') {
            if (!isString(args.title)) return { ok: false, error: "Title is required for append" }
            if (!isString(args.content)) return { ok: false, error: "Content is required for append" }
            const p = getNotesPath(context, args.title)
            await fs.appendFile(p, "\n" + args.content.trim() + '\n', 'utf-8')
            return { ok: true, result: {title: args.title} }
        }

        // TypeScript exhaustiveness check - this should never be reached
        return { ok: false, error: `Unhandled action: ${action}` }
    }
}