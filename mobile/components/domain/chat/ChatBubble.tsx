/**
 * Re-export shim: TypeScript cannot resolve Metro's platform extensions
 * (`.android`, `.native`), so extensionless imports of this component
 * resolve through this file for typechecking. At runtime Metro resolves
 * `ChatBubble.native` directly (there is no `.android` variant: the
 * bubble renders GlassCard, which already switches per platform).
 */
export * from './ChatBubble.native';
