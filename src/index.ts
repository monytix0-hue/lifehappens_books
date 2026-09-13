import { Container } from "@cloudflare/containers";

/**
 * Flask book site runs inside this container.
 * One named instance keeps Flask sessions sticky.
 */
export class BookContainer extends Container {
  defaultPort = 8080;
  // Keep the reader warm between page turns
  sleepAfter = "30m";
  envVars = {
    ACCESS_CODE: "moments",
    // Stable secrets so Flask sessions survive container restarts
    SECRET_KEY: "life-happens-cloudflare-secret-change-me",
    STREAM_SECRET: "life-happens-stream-secret-change-me",
    TOKEN_TTL: "7200",
    FIREBASE_PROJECT_ID: "momentra-v2",
    PORT: "8080",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Sticky single instance so login cookies + local analytics stay consistent
    const container = env.BOOK_CONTAINER.getByName("life-happens");
    return container.fetch(request);
  },
};

interface Env {
  BOOK_CONTAINER: DurableObjectNamespace<BookContainer>;
}
