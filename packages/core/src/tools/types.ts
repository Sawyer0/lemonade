import { z } from 'zod';

// --- Tool names ---
// Every tool has one namespaced registry name (`namespace.name`, lowercase
// snake_case) shared by chat, Live and the reasoner. Tools that predate the
// registry keep the flat name the model already calls them by as
// `modelName`; new tools use the registry name on the wire too.
export const ToolNameSchema = z
    .string()
    .regex(/^[a-z][a-z0-9]*\.[a-z][a-z0-9_]*$/, 'tool name must be namespace.name in lowercase snake_case');
export type ToolName = z.infer<typeof ToolNameSchema>;

/** Where a tool runs: on the server, or on the client that holds the camera and screen. */
export const ToolSideSchema = z.enum(['server', 'client']);
export type ToolSide = z.infer<typeof ToolSideSchema>;

export interface ToolContext {
    caseId?: string;
    sessionId?: string;
    userId?: string;
}

/**
 * What a tool call returns to the caller. The loop appends `output` to its
 * transcript on success and `Tool <name> failed: <error>` on failure; a
 * handler never throws past the registry, so a bad tool call is data, not
 * a crashed run.
 */
export type ToolResult = { ok: true; output: string } | { ok: false; error: string };

/**
 * A tool handler receives arguments the registry already validated against
 * `argsSchema`, and returns the transcript-ready output as a string.
 */
export type ToolHandler = (args: unknown, context: ToolContext) => Promise<string> | string;

export interface ToolDefinition {
    /** Namespaced registry name, e.g. `diag.exec_python`. */
    name: string;
    /** Flat name the model calls, when it differs from the registry name (legacy tools only). */
    modelName?: string;
    description: string;
    side: ToolSide;
    argsSchema: z.ZodType<unknown>;
    /**
     * Handler that executes the tool. Absent when the tool runs elsewhere:
     * chat tools run in FunctionCallHandler, client tools run on the mobile
     * app. `ToolRegistry.call` reports those as failures instead of
     * pretending to run them.
     */
    handler?: ToolHandler;
}
