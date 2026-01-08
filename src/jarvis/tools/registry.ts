import type { ToolDef } from "./base"
import { notesTool } from "./notes"

export const tools: ToolDef[] = [notesTool]

export const toolsForRouter = tools.map(t => ({
  name: t.name,
  description: t.description,
}))

export const toolByName: Map<string, ToolDef> = new Map(tools.map(t => [t.name, t]))