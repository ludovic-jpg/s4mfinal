import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/serveur/bd/schema.ts",
  out: "./drizzle",
});
