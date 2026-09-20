// Configuration ESLint « à plat ».
// Règle d'architecture D1 : le noyau `src/domaine` est PUR — il n'importe ni le serveur,
// ni le client, ni aucune bibliothèque technique. C'est ESLint qui le garantit, pas la bonne volonté.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "donnees", "coverage", "playwright-report", "test-results", "src/client/routeTree.gen.ts", "drizzle"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["src/domaine/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/serveur/*", "@/client/*", "**/serveur/**", "**/client/**"], message: "Le noyau métier ne dépend ni du serveur ni du client (décision D1)." },
            { group: ["node:*", "hono", "hono/*", "drizzle-orm", "drizzle-orm/*", "react", "react-dom"], message: "Le noyau métier reste pur : aucune dépendance technique (décision D1)." },
          ],
        },
      ],
    },
  },
  prettier,
);
