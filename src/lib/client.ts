// Thin wrapper: reads the API key from config and returns an
// initialized @unipost/sdk client instance.

import { UniPost } from "@unipost/sdk";
import { readConfig } from "./config.js";

export function createUniPostClient(): UniPost {
  const config = readConfig();
  if (!config?.unipost_api_key) {
    throw new Error(
      "UniPost API key not found. Run `agentpost init` to set it up.",
    );
  }
  return new UniPost({
    apiKey: config.unipost_api_key,
    ...(config.unipost_api_url && { baseUrl: config.unipost_api_url }),
  });
}
