import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "functions/lib/**",
    "packages/core/dist/**",
    "packages/infrastructure/dist/**",
    "packages/core/src/**/*.d.ts",
    "public/**",
  ]),
  {
    files: ["**/*.cjs", "**/*.js", "**/jest.config.js", "**/jest.setup.js", "**/metro.config.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-var-requires": "off"
    }
  }
]);

export default eslintConfig;
