#!/usr/bin/env node
// AgentPost CLI entry. Three commands:
//
//   agentpost init                    — set up API keys
//   agentpost accounts                — list connected accounts
//   agentpost "<message>"             — generate + publish posts
//   agentpost post "<message>"        — same as above (explicit form)
//
// The bare positional form (no `post` keyword) is the headline UX
// from the README — `agentpost "shipped webhooks today 🎉"` should
// just work without remembering a subcommand.

import { Command } from "commander";

import { runInit } from "./commands/init.js";
import { runAccounts } from "./commands/accounts.js";
import { runPost } from "./commands/post.js";

const program = new Command();

program
  .name("agentpost")
  .description("AI-native CLI for multi-platform social posting. Built on UniPost.")
  .version("0.1.0");

program
  .command("init")
  .description("Set up your UniPost + Anthropic API keys")
  .action(async () => {
    await runInit();
  });

program
  .command("accounts")
  .description("List your connected social accounts")
  .action(async () => {
    await runAccounts();
  });

program
  .command("post")
  .description("Generate and publish posts to all connected platforms")
  .argument("<message>", "What you want to say (in your own voice)")
  .option("--dry-run", "Generate the drafts but don't publish", false)
  .action(async (message: string, opts: { dryRun: boolean }) => {
    await runPost({ message, dryRun: opts.dryRun });
  });

// Bare positional fallback: `agentpost "<message>"` without a
// subcommand. We register a default action that delegates to the
// post command. Commander handles this via the program-level
// arguments() + action() pair.
program
  .argument("[message]", "Shorthand for `agentpost post <message>`")
  .option("--dry-run", "Generate the drafts but don't publish", false)
  .action(async (message: string | undefined, opts: { dryRun: boolean }) => {
    if (!message) {
      program.help();
      return;
    }
    await runPost({ message, dryRun: opts.dryRun });
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
