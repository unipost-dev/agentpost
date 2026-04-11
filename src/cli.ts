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
  .option("--llm <provider>", "Override the configured LLM provider (anthropic, openai, gemini)")
  .action(async (message: string, opts: { dryRun: boolean; profile?: string; llm?: string }) => {
    await runPost({ message, dryRun: opts.dryRun, profile: opts.profile, llm: opts.llm });
  });

// Bare positional fallback: `agentpost "<message>" [flags]` and
// `agentpost [flags] "<message>"` are wired by rewriting argv before
// parsing — a program-level .argument() as a sibling of subcommands
// breaks commander's subcommand option parsing.
//
// Walk past any leading flags (and their values for value-taking
// options) until we find the first positional. If that positional
// isn't a known subcommand, it's a bare message — inject "post"
// at position 2 so commander routes to the post subcommand.
const knownSubcommands = new Set(["init", "accounts", "post", "help"]);
const valueTakingFlags = new Set(["--profile", "--llm"]);
let firstPositionalIdx = 2;
while (firstPositionalIdx < process.argv.length) {
  const t = process.argv[firstPositionalIdx];
  if (t === "-h" || t === "--help" || t === "-V" || t === "--version") {
    break;
  }
  if (t.startsWith("--") && t.includes("=")) {
    firstPositionalIdx += 1;
    continue;
  }
  if (valueTakingFlags.has(t)) {
    firstPositionalIdx += 2;
    continue;
  }
  if (t.startsWith("-")) {
    firstPositionalIdx += 1;
    continue;
  }
  break;
}
const firstPositional = process.argv[firstPositionalIdx];
if (firstPositional && !knownSubcommands.has(firstPositional)) {
  process.argv.splice(2, 0, "post");
}

if (!process.argv[2]) {
  program.help();
}

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
