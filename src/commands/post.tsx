// `agentpost post "<message>"` (also the default action when the
// CLI is invoked with a positional argument).
//
// v2.0: Uses @unipost/sdk instead of hand-written REST client.
// Structured error handling (AuthError, QuotaError, RateLimitError).
// --profile flag filters accounts by profile_name.

import React from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import kleur from "kleur";
import { AuthError, QuotaError, RateLimitError } from "@unipost/sdk";
import type { SocialAccount, CreatePostPlatformPost } from "@unipost/sdk";

import { requireConfig } from "../lib/config.js";
import { createUniPostClient } from "../lib/client.js";
import { generateDrafts, modelForProvider, providerLabel, requireProviderKey } from "../lib/llm/index.js";
import { Preview } from "../ui/preview.js";
import type { DraftWithMeta, CapabilitiesResponse } from "../types.js";

export interface PostOptions {
  message: string;
  dryRun: boolean;
  profile?: string;
}

export async function runPost(opts: PostOptions): Promise<void> {
  const cfg = requireConfig();
  const client = createUniPostClient();

  process.stdout.write(kleur.gray("Loading your accounts and capabilities...\n"));

  let accounts: SocialAccount[];
  let capabilities: CapabilitiesResponse;
  try {
    const [accountsRes, capRes] = await Promise.all([
      client.accounts.list(),
      fetchCapabilities(cfg.unipost_api_url, cfg.unipost_api_key),
    ]);
    accounts = accountsRes.data as SocialAccount[];
    capabilities = capRes;
  } catch (e) {
    if (e instanceof AuthError) {
      console.error(kleur.red("Invalid API key. Run `agentpost init` to reset."));
      process.exit(1);
    }
    console.error(kleur.red(`Failed to load from UniPost: ${(e as Error).message}`));
    process.exit(1);
  }

  // --profile flag: filter by profile_name (case-insensitive)
  let active = accounts.filter((a) => a.status === "active");
  if (opts.profile) {
    active = active.filter(
      (a) => ((a as any).profile_name ?? "Default").toLowerCase() === opts.profile!.toLowerCase(),
    );
    if (active.length === 0) {
      console.error(kleur.red(`No active accounts in profile "${opts.profile}".`));
      console.error(kleur.gray("Run `agentpost accounts` to see available profiles."));
      process.exit(1);
    }
  }

  if (active.length === 0) {
    console.error(
      kleur.red("No active connected accounts. Run `agentpost accounts` to see what's connected, then connect at least one via your UniPost dashboard."),
    );
    process.exit(1);
  }

  try {
    requireProviderKey(cfg);
  } catch (e) {
    console.error(kleur.red((e as Error).message));
    process.exit(1);
  }

  const provider = cfg.llm_provider ?? "anthropic";
  process.stdout.write(
    kleur.gray(
      `Generating drafts for ${active.length} accounts via ${providerLabel(provider)} (${modelForProvider(cfg)})...\n`,
    ),
  );

  let drafts: DraftWithMeta[];
  try {
    drafts = await generateDrafts({
      userMessage: opts.message,
      accounts: active,
      capabilities,
      config: cfg,
    });
  } catch (e) {
    console.error(kleur.red(`Generation failed: ${(e as Error).message}`));
    process.exit(1);
  }

  if (opts.dryRun) {
    process.stdout.write(kleur.yellow("\n--dry-run: skipping confirmation + publish\n\n"));
    renderStaticPreview(drafts, capabilities);
    return;
  }

  const action = await runInteractivePreview(drafts, capabilities);
  if (action === "cancel") {
    process.stdout.write(kleur.gray("\nCancelled.\n"));
    return;
  }

  // Build SDK-compatible payload
  const platformPosts: CreatePostPlatformPost[] = drafts.map((d) => ({
    accountId: d.accountId,
    caption: d.caption,
    ...(d.firstComment && { firstComment: d.firstComment }),
    ...(d.threadPosition && { threadPosition: d.threadPosition }),
  }));

  process.stdout.write(kleur.gray("\nPublishing...\n"));
  try {
    const result = await client.posts.create({ platformPosts });
    if (result.results) {
      for (const r of result.results) {
        const label = r.account_name ? `@${r.account_name}` : r.social_account_id;
        if (r.status === "published") {
          process.stdout.write(
            kleur.green(`✓ ${r.platform} ${label}`) +
              (r.external_id ? kleur.gray(`  (${r.external_id})`) : "") +
              "\n",
          );
        } else {
          process.stdout.write(
            kleur.red(`✗ ${r.platform} ${label}`) +
              (r.error_message ? `  ${r.error_message}` : "") +
              "\n",
          );
        }
      }
    }
    if (result.status === "failed") process.exit(1);
  } catch (err) {
    if (err instanceof AuthError) {
      console.error(kleur.red("Invalid API key. Run `agentpost init` to reset."));
    } else if (err instanceof QuotaError) {
      console.error(kleur.red("Monthly quota exceeded. Visit app.unipost.dev/billing to upgrade."));
    } else if (err instanceof RateLimitError) {
      console.error(kleur.red("Rate limited. Please wait a moment and try again."));
    } else {
      console.error(kleur.red(`Publish failed: ${(err as Error).message}`));
    }
    process.exit(1);
  }
}

// Capabilities endpoint is not yet in the SDK — fetch directly.
async function fetchCapabilities(baseUrl: string, apiKey: string): Promise<CapabilitiesResponse> {
  const url = `${baseUrl}/v1/platforms/capabilities`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": "agentpost-cli",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to load capabilities: ${res.status}`);
  }
  const body = (await res.json()) as { data: CapabilitiesResponse };
  return body.data;
}

function renderStaticPreview(
  drafts: DraftWithMeta[],
  capabilities: CapabilitiesResponse,
): void {
  const { unmount } = render(<Preview drafts={drafts} capabilities={capabilities} />);
  setTimeout(() => unmount(), 50);
}

function runInteractivePreview(
  drafts: DraftWithMeta[],
  capabilities: CapabilitiesResponse,
): Promise<"publish" | "cancel"> {
  return new Promise((resolve) => {
    const App: React.FC = () => {
      const { exit } = useApp();
      useInput((input, key) => {
        if (input === "p" || input === "P" || key.return) {
          exit();
          resolve("publish");
        }
        if (input === "c" || input === "C" || key.escape) {
          exit();
          resolve("cancel");
        }
      });
      return (
        <Box flexDirection="column">
          <Preview drafts={drafts} capabilities={capabilities} />
          <Box marginTop={1}>
            <Text color="gray">
              Press <Text color="green" bold>P</Text> or <Text color="green" bold>Enter</Text> to publish all,{" "}
              <Text color="red" bold>C</Text> or <Text color="red" bold>Esc</Text> to cancel.
            </Text>
          </Box>
        </Box>
      );
    };
    render(<App />);
  });
}
