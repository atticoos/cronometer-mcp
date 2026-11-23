import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.next/**", "**/out/**", "**/next-env.d.ts", "**/worker-configuration.d.ts"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ["apps/web/tests/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    // Worker logs go through src/logger.ts so every record follows the schema in
    // src/log-events.ts. console output would bypass it (and the privacy review).
    files: ["apps/cronometer-mcp/src/**/*.{ts,tsx}"],
    rules: { "no-console": "error" },
  },
  {
    files: ["apps/web/app/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs["recommended-legacy"].rules,
  },
);
