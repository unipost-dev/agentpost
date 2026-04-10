#!/usr/bin/env node
// AgentPost CLI entry.
//
//   agentpost init                    — set up API keys
//   agentpost accounts                — list connected accounts
//   agentpost "<message>"             — generate + publish posts
//   agentpost post "<message>"        — same as above (explicit form)

import { Command } from "commander";

import { runInit } from "./commands/init.js";
import { runAccounts } from "./commands/accounts.js";
import { runPost } from "./commands/post.js";

const program = new Command();

program
  .name("agentpost")
  .description("AI-native CLI for multi-platform social posting. Built on UniPost.")
  .version("0.2.0");

program
  .command("init")
  .description("Set up your UniPost + AI provider API keys")
  .action(async () => {
    await runInit();
  });

program
  .command("accounts")
  .description("List your connected social accounts")
  .option("--profile <name>", "Filter by profile name")
  .action(async (opts: { profile?: string }) => {
    await runAccounts(opts);
  });

program
  .command("post")
  .description("Generate and publish posts to all connected platforms")
  .argument("<message>", "What you want to say (in your own voice)")
  .option("--dry-run", "Generate the drafts but don't publish", false)
  .option("--profile <name>", "Only post to accounts in this profile")
  .action(async (message: string, opts: { dryRun: boolean; profile?: string }) => {
    await runPost({ message, dryRun: opts.dryRun, profile: opts.profile });
  });

// Bare positional fallback: `agentpost "<message>"`
program
  .argument("[message]", "Shorthand for `agentpost post <message>`")
  .option("--dry-run", "Generate the drafts but don't publish", false)
  .option("--profile <name>", "Only post to accounts in this profile")
  .action(async (message: string | undefined, opts: { dryRun: boolean; profile?: string }) => {
    if (!message) {
      program.help();
      return;
    }
    await runPost({ message, dryRun: opts.dryRun, profile: opts.profile });
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
