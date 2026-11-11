/**
 * Re-export shim: TypeScript cannot resolve Metro's platform extensions
 * (`.android`, `.native`), so extensionless imports of this component
 * resolve through this file for typechecking. On Android and iOS Metro
 * resolves the platform file directly (`InputBar.android` / `InputBar.native`); on web
 * this shim resolves to the `.native` implementation.
 */
export * from './InputBar.native';
