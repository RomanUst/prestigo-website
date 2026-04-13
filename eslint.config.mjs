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
    // Vercel build output — generated files, not source
    ".vercel/**",
  ]),
  {
    rules: {
      // Marketing/content pages contain legitimate English contractions — not a bug.
      "react/no-unescaped-entities": "off",
      // Synchronous setState in useEffect is the standard hydration + media-query
      // initialisation pattern throughout this codebase; new react-hooks/7 rule is
      // overly strict for these valid use cases.
      "react-hooks/set-state-in-effect": "off",
      // Allow intentionally-unused variables/params prefixed with underscore.
      "@typescript-eslint/no-unused-vars": ["warn", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_",
      }],
    },
  },
]);

export default eslintConfig;
