import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Deliberately narrow: the Rules of Hooks, as ERRORS.
 *
 * This exists because a conditional hook (a `useState` declared after an early `return`) shipped to
 * the checkout page and crashed it for any customer with a non-empty cart. Nothing caught it —
 * `tsc` does not model hook order, vitest had no component test, and `next build` skipped linting.
 * This is the one class of bug the rest of the toolchain is blind to, so it is wired up on its own
 * rather than bundled into a style regime nobody has time to triage.
 *
 * `exhaustive-deps` is a WARNING, not an error: it is advisory and has legitimate exceptions
 * (fire-once effects guarded by a ref), so it must not fail a build.
 */
export default [
  { ignores: [".next/**", "node_modules/**", "supabase/functions/**", "public/**"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
    // @typescript-eslint and @next/next are registered only so the codebase's existing
    // `eslint-disable-next-line` comments resolve to real rules. None of their rules are switched
    // on — registering a definition is not the same as enforcing it.
    plugins: { "@typescript-eslint": tsPlugin, "@next/next": nextPlugin, "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
