/**
 * Re-export shim: TypeScript cannot resolve Metro's platform extensions
 * (`.android`, `.native`), so extensionless imports of this component
 * resolve through this file for typechecking. At runtime Metro resolves
 * the platform file directly (`TextInput.android` on Android,
 * `TextInput.native` elsewhere) and never loads this file.
 */
export * from './TextInput.native';
