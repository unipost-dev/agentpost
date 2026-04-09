// `agentpost post "<message>"` (also the default action when the
// CLI is invoked with a positional argument).
//
// Flow:
//   1. Read config
//   2. Fetch capabilities + connected accounts in parallel
//   3. Call Claude with the prompt + accounts + capabilities
//   4. Render preview cards (Ink TUI)
//   5. Prompt user: publish / regenerate / cancel
//   6. On publish: call UniPost POST /v1/social-posts
//   7. Print results

import React from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import kleur from "kleur";

import { requireConfig } from "../lib/config.js";
import { UniPostClient } from "../lib/unipost.js";
import { generateDrafts } from "../lib/claude.js";
import { Preview } from "../ui/preview.js";
import type {
  PlatformDraft,
  CapabilitiesResponse,
  PublishResult,
} from "../types.js";

export interface PostOptions {
  message: string;
  dryRun: boolean;
}

export async function runPost(opts: PostOptions): Promise<void> {
  const cfg = requireConfig();
  const client = new UniPostClient(cfg.unipost_api_key, cfg.unipost_api_url);

  // Fetch in parallel — both calls are independent and the savings
  // matter on slow connections.
  process.stdout.write(kleur.gray("Loading your accounts and capabilities...\n"));
  let accounts, capabilities;
  try {
    [accounts, capabilities] = await Promise.all([
      client.listAccounts(),
      client.getCapabilities(),
    ]);
  } catch (e) {
    console.error(kleur.red(`Failed to load from UniPost: ${(e as Error).message}`));
    process.exit(1);
  }

  const active = accounts.filter((a) => a.status === "active");
  if (active.length === 0) {
    console.error(
      kleur.red("No active connected accounts. Run `agentpost accounts` to see what's connected, then connect at least one via your UniPost dashboard."),
    );
    process.exit(1);
  }

  process.stdout.write(
    kleur.gray(`Generating drafts for ${active.length} accounts via ${cfg.claude_model}...\n`),
  );

  let drafts: PlatformDraft[];
  try {
    drafts = await generateDrafts({
      userMessage: opts.message,
      accounts,
      capabilities,
      model: cfg.claude_model,
      apiKey: cfg.anthropic_api_key,
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

  // Render the interactive preview + confirm prompt.
  const action = await runInteractivePreview(drafts, capabilities);
  if (action === "cancel") {
    process.stdout.write(kleur.gray("\nCancelled.\n"));
    return;
  }

  // Publish.
  process.stdout.write(kleur.gray("\nPublishing...\n"));
  let publishRes;
  try {
    publishRes = await client.createPost(drafts);
  } catch (e) {
    console.error(kleur.red(`Publish failed: ${(e as Error).message}`));
    process.exit(1);
  }

  printPublishResults(publishRes.results);

  if (publishRes.status === "failed") {
    process.exit(1);
  }
}

// renderStaticPreview prints the cards once and exits — used by
// --dry-run and by the publish results path.
function renderStaticPreview(
  drafts: PlatformDraft[],
  capabilities: CapabilitiesResponse,
): void {
  const { unmount } = render(<Preview drafts={drafts} capabilities={capabilities} />);
  // Give Ink a tick to flush, then unmount so the process can exit.
  setTimeout(() => unmount(), 50);
}

// Interactive preview is a small Ink app that renders the cards
// and listens for a single keypress: P to publish, C to cancel.
// Future iterations can add: R to regenerate, E to edit-one,
// S to skip-platform.
function runInteractivePreview(
  drafts: PlatformDraft[],
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

function printPublishResults(results: PublishResult[]): void {
  for (const r of results) {
    const label = r.account_name ? `@${r.account_name}` : r.social_account_id;
    if (r.status === "published") {
      process.stdout.write(
        kleur.green(`✓ ${r.platform} ${label}`) +
          (r.external_id ? kleur.gray(`  (${r.external_id})`) : "") +
          "\n",
      );
      if (r.warnings && r.warnings.length > 0) {
        for (const w of r.warnings) {
          process.stdout.write(kleur.yellow(`  warning: ${w}\n`));
        }
      }
    } else {
      process.stdout.write(
        kleur.red(`✗ ${r.platform} ${label}`) +
          (r.error_message ? `  ${r.error_message}` : "") +
          "\n",
      );
    }
  }
}
