import { parse } from 'yaml';
import { z } from 'zod';
import { SHARED_CONFIG } from '../config';
import { VehicleGraphFileSchema, type VehicleGraphFile } from './graphSchema';

// --- YAML loading (LM-38) ---
// Seed files live in data/knowledge-graph/*.yaml. This module is the only
// place graph YAML is parsed: it turns file text into a validated graph
// file, and any failure (bad YAML, wrong version, a reference to an
// unknown component) throws an Error that names the problem instead of
// returning a half-valid graph. Core stays free of Node-only imports, so
// the loader takes text, not a file path; callers that read from disk
// pass the text in.

export const KNOWLEDGE_GRAPH_YAML_VERSION = SHARED_CONFIG.KNOWLEDGE_GRAPH.YAML_VERSION;

/** Parses one seed file's text into its validated vehicle graph file. */
export function parseKnowledgeGraphYaml(yamlText: string): VehicleGraphFile {
    let parsedYaml: unknown;
    try {
        parsedYaml = parse(yamlText);
    } catch (error) {
        const detail = error instanceof Error ? error.message : 'unknown YAML error';
        throw new Error(`Knowledge graph YAML does not parse: ${detail}`);
    }
    try {
        return VehicleGraphFileSchema.parse(parsedYaml);
    } catch (error) {
        if (error instanceof z.ZodError) {
            const problems = error.issues
                .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
                .join('; ');
            throw new Error(`Knowledge graph YAML failed validation: ${problems}`);
        }
        throw error;
    }
}
