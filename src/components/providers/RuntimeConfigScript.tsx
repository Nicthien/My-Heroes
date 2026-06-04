import { connection } from "next/server";
import { getServerPublicConfig, RUNTIME_CONFIG_GLOBAL } from "@/lib/config/supabaseEnv";

/**
 * Injects the public runtime config (Supabase URL + anon key) into the page so
 * the browser reads THIS deployment's values at runtime — instead of values
 * baked into the image at build. This is what keeps the Docker image generic and
 * shareable: no IP or key is ever compiled in.
 *
 * `connection()` forces a per-request render so `process.env` is read at runtime
 * (not prerendered at build, which would freeze empty values into the HTML).
 */
export default async function RuntimeConfigScript() {
  await connection();
  const config = getServerPublicConfig();

  return (
    <script
      // Trusted, server-generated one-liner; values are our own env, JSON-encoded.
      dangerouslySetInnerHTML={{
        __html: `window.${RUNTIME_CONFIG_GLOBAL}=${JSON.stringify(config).replace(/</g, "\\u003c")};`,
      }}
    />
  );
}
