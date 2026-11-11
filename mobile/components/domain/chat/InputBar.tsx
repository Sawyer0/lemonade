/**
 * Re-export shim: TypeScript cannot resolve Metro's platform extensions
 * (`.android`, `.native`), so extensionless imports of this component
 * resolve through this file for typechecking. At runtime Metro resolves
 * the platform file directly (`InputBar.android` on Android,
 * `InputBar.native` elsewhere) and never loads this file.
 */
export * from './InputBar.native';
