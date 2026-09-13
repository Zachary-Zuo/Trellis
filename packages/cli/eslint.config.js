import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    // Shipped template assets and build scripts are not sources: the launcher
    // under `src/templates/**` and the build scripts run in Node (and in the
    // user's project) verbatim, so linting them as sources reports Node globals
    // as undefined. `**/` is required — a bare `*.js` only matches this
    // directory in flat-config glob semantics.
    ignores: [
      "dist/**",
      "node_modules/**",
      "**/*.js",
      "**/*.cjs",
      "scripts/**",
    ],
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    rules: {
      // TypeScript strict rules
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/strict-boolean-expressions": "off",
      "@typescript-eslint/no-inferrable-types": "off",

      // General rules
      "no-console": "off",
      "prefer-const": "error",
      "no-var": "error",
    },
  },
];
