import { defineConfig } from "drizzle-kit";
import path from "path";

const directUrl =
  process.env.SUPABASE_DIRECT_URL ?? process.env.SUPABASE_DATABASE_URL;

if (!directUrl) {
  throw new Error(
    "SUPABASE_DIRECT_URL must be set before running database commands.",
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: directUrl,
  },
});
