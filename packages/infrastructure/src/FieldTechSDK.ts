import { IFieldTechAgent } from '@lemonade/core';
import { TYPES } from './di/types';
import { createContainer } from './di/container';

/**
 * Creates a fully-configured instance of the FieldTech Agent.
 * Uses an internal DI container to wire up all dependencies.
 */
export function createFieldTechAgent(): IFieldTechAgent {
    const container = createContainer();
    return container.get<IFieldTechAgent>(TYPES.FieldTechAgent);
}
