import { defineConfig } from "drizzle-kit";
import { config } from "./src/config/env";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: config.databaseUrl,
  },
});
