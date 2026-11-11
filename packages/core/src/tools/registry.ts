import { ToolNameSchema } from './types';
import type { ToolContext, ToolDefinition, ToolResult, ToolSide } from './types';

/**
 * One typed, namespaced tool registry shared by chat, Live and the reasoner
 * (LM-16). A tool is looked up by its registry name or, for legacy tools,
 * by the flat name the model calls it by. Registration rejects duplicate
 * names and names outside `namespace.name`; calling validates arguments
 * against the tool's Zod schema before the handler runs, and a handler
 * failure is returned as data so one bad tool call never crashes the loop.
 */
export class ToolRegistry {
    private readonly byName = new Map<string, ToolDefinition>();
    private readonly byModelName = new Map<string, ToolDefinition>();

    register(definition: ToolDefinition): void {
        ToolNameSchema.parse(definition.name);
        if (this.byName.has(definition.name)) {
            throw new Error(`tool already registered: ${definition.name}`);
        }
        const modelName = definition.modelName ?? definition.name;
        if (this.byModelName.has(modelName) && this.byModelName.get(modelName)?.name !== definition.name) {
            throw new Error(`tool model name already registered: ${modelName}`);
        }
        this.byName.set(definition.name, definition);
        this.byModelName.set(modelName, definition);
    }

    /** Resolves a registry name or a legacy flat model name. */
    get(name: string): ToolDefinition | undefined {
        return this.byName.get(name) ?? this.byModelName.get(name);
    }

    has(name: string): boolean {
        return this.get(name) !== undefined;
    }

    /** Which side runs this tool, or undefined when the name is not registered. */
    sideOf(name: string): ToolSide | undefined {
        return this.get(name)?.side;
    }

    /** Every registered tool, sorted by registry name. */
    list(): ToolDefinition[] {
        return [...this.byName.values()].sort((a, b) => a.name.localeCompare(b.name));
    }

    listByNamespace(namespace: string): ToolDefinition[] {
        return this.list().filter((definition) => definition.name.startsWith(`${namespace}.`));
    }

    /** Name and description of every tool, for the model prompt that lists what it may call. */
    describeForModel(): Array<{ name: string; description: string; side: ToolSide }> {
        return this.list().map((definition) => ({
            name: definition.modelName ?? definition.name,
            description: definition.description,
            side: definition.side,
        }));
    }

    async call(name: string, rawArgs: unknown, context: ToolContext = {}): Promise<ToolResult> {
        const definition = this.get(name);
        if (!definition) {
            return { ok: false, error: `unknown tool: ${name}` };
        }
        const parsed = definition.argsSchema.safeParse(rawArgs);
        if (!parsed.success) {
            return { ok: false, error: `invalid arguments for ${name}: ${parsed.error.message}` };
        }
        if (!definition.handler) {
            return { ok: false, error: `tool ${name} has no handler in this registry` };
        }
        try {
            const output = await definition.handler(parsed.data, context);
            return { ok: true, output };
        } catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
}
