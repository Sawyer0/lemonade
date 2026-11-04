import { FunctionDeclaration, SchemaType } from '@google-cloud/vertexai';

export const DISPLAY_CONTENT_TOOL: FunctionDeclaration = {
    name: 'display_content',
    description:
        'Display a specific diagram, manual page, or visual reference to the user on their screen. Use this when the user asks to "see" something or when a visual aid would clarify a complex instruction.',
    parameters: {
        type: SchemaType.OBJECT,
        properties: {
            title: {
                type: SchemaType.STRING,
                description: 'A short title for the content, e.g., "Fuse Box Diagram" or "Torque Specs Table".',
            },
            url: {
                type: SchemaType.STRING,
                description:
                    'The valid URL to display. MUST be a publicly accessible URL (e.g. storage.googleapis.com) or a reliable external documentation link.',
            },
            type: {
                type: SchemaType.STRING,
                enum: ['image', 'pdf', 'html'],
                description: 'The type of content to render.',
            },
        },
        required: ['url', 'type', 'title'],
    },
};
