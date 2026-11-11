/**
 * Re-export shim: TypeScript cannot resolve Metro's platform extensions
 * (`.android`, `.native`), so extensionless imports of this component
 * resolve through this file for typechecking. At runtime Metro resolves
 * the platform file directly (`GlassCard.android` on Android,
 * `GlassCard.native` elsewhere) and never loads this file.
 */
export * from './GlassCard.native';
