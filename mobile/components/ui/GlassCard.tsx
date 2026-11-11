/**
 * Re-export shim: TypeScript cannot resolve Metro's platform extensions
 * (`.android`, `.ios`, `.native`), so extensionless imports of this component
 * resolve through this file for typechecking. On Android and iOS Metro
 * resolves the platform file directly (`GlassCard.android` / `GlassCard.ios`);
 * on web this file is the surface, re-exporting the plain `.native`
 * implementation.
 */
export * from './GlassCard.native';
