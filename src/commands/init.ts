// `agentpost init` walks a new user through configuring the CLI:
// pastes a UniPost API key, pastes an Anthropic API key, optionally
// tests both, and writes ~/.agentpost/config.json with mode 0600.
//
// First-run UX is intentionally minimal — three prompts, ~30
// seconds, no telemetry question, no model picker. Customization
// happens by editing the JSON file directly later.

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import kleur from "kleur";

import { UniPost } from "@unipost/sdk";
import { writeConfig, configPath, configExists, readConfig } from "../lib/config.js";
import { DEFAULT_CONFIG } from "../types.js";
import type { LLMProvider } from "../types.js";

export async function runInit(): Promise<void> {
  const rl = createInterface({ input, output });

  process.stdout.write(kleur.bold("\nAgentPost setup\n\n"));
  process.stdout.write(
    kleur.gray(
      "AgentPost needs two API keys: one for UniPost (where your social accounts are connected) and one for Anthropic (the AI that drafts posts).\n\n",
    ),
  );

  if (configExists()) {
    process.stdout.write(
      kleur.yellow(
        `A config already exists at ${configPath()}. Continuing will overwrite it.\n\n`,
      ),
    );
    const ok = await rl.question("Continue? [y/N] ");
    if (ok.trim().toLowerCase() !== "y") {
      rl.close();
      process.stdout.write("Cancelled.\n");
      return;
    }
  }

  const existing = readConfig();

  // 1. UniPost API key
  process.stdout.write(
    kleur.gray("\n1. UniPost API key — get one at https://app.unipost.dev/api-keys\n"),
  );
  const unipostKey = (
    await rl.question(
      `   Paste it here${existing?.unipost_api_key ? " (or press Enter to keep existing)" : ""}: `,
    )
  ).trim();
  const finalUnipostKey = unipostKey || existing?.unipost_api_key || "";
  if (!finalUnipostKey) {
    rl.close();
    process.stderr.write(kleur.red("UniPost API key is required.\n"));
    process.exit(1);
  }

  // 2. LLM provider choice (Sprint 5 PR5).
  //
  // Default is Anthropic — that's what the prompt was tuned against
  // and the v0.1 launch experience is unchanged for Anthropic users.
  // OpenAI and Gemini are listed as alternatives for users who
  // already pay for one of those and don't want a second AI bill.
  process.stdout.write(
    kleur.gray("\n2. AI provider — which LLM should draft your posts?\n"),
  );
  process.stdout.write("   1) Anthropic Claude (recommended — the prompt was tuned against it)\n");
  process.stdout.write("   2) OpenAI (gpt-4o)\n");
  process.stdout.write("   3) Google Gemini (gemini-1.5-pro)\n");
  const defaultProviderLabel = existing?.llm_provider
    ? ` (default: ${existing.llm_provider})`
    : " (default: 1)";
  const providerChoice = (
    await rl.question(`   Choose [1-3]${defaultProviderLabel}: `)
  ).trim();
  const provider = parseProviderChoice(providerChoice, existing?.llm_provider ?? "anthropic");

  // 3. Provider-specific API key. We only ask for the key matching
  // the chosen provider — switching providers later just re-runs
  // init and asks for that one.
  const providerInfo = providerKeyInfo(provider);
  process.stdout.write(
    kleur.gray(`\n3. ${providerInfo.label} API key — get one at ${providerInfo.url}\n`),
  );
  const existingKey = pickExistingKey(existing, provider);
  const pastedKey = (
    await rl.question(
      `   Paste it here${existingKey ? " (or press Enter to keep existing)" : ""}: `,
    )
  ).trim();
  const finalProviderKey = pastedKey || existingKey || "";
  if (!finalProviderKey) {
    rl.close();
    process.stderr.write(kleur.red(`${providerInfo.label} API key is required.\n`));
    process.exit(1);
  }

  rl.close();

  // Build the new config, preserving any keys for OTHER providers
  // the user previously configured. Lets them switch back without
  // re-pasting.
  const cfg = {
    unipost_api_key: finalUnipostKey,
    unipost_api_url: existing?.unipost_api_url ?? DEFAULT_CONFIG.unipost_api_url,
    llm_provider: provider,
    anthropic_api_key:
      provider === "anthropic" ? finalProviderKey : existing?.anthropic_api_key ?? "",
    openai_api_key:
      provider === "openai" ? finalProviderKey : existing?.openai_api_key ?? "",
    gemini_api_key:
      provider === "gemini" ? finalProviderKey : existing?.gemini_api_key ?? "",
    claude_model: existing?.claude_model ?? DEFAULT_CONFIG.claude_model,
    openai_model: existing?.openai_model ?? DEFAULT_CONFIG.openai_model,
    gemini_model: existing?.gemini_model ?? DEFAULT_CONFIG.gemini_model,
    default_platforms: existing?.default_platforms ?? DEFAULT_CONFIG.default_platforms,
  };

  // Test the UniPost key by hitting /v1/social-accounts. Cheap call,
  // returns clear error if the key is wrong.
  process.stdout.write(kleur.gray("\nTesting UniPost connection... "));
  try {
    const client = new UniPost({
      apiKey: cfg.unipost_api_key,
      ...(cfg.unipost_api_url && { baseUrl: cfg.unipost_api_url }),
    });
    const res = await client.accounts.list();
    const accounts = res.data;
    process.stdout.write(
      kleur.green(`✓ ${accounts.length} accounts connected\n`),
    );
  } catch (e) {
    process.stdout.write(kleur.red(`✗ ${(e as Error).message}\n`));
    process.stdout.write(
      kleur.yellow(
        "Saving the config anyway — fix the key and re-run init if needed.\n",
      ),
    );
  }

  writeConfig(cfg);

  process.stdout.write(
    kleur.green(`\n✓ Config saved to ${configPath()}\n\n`),
  );
  process.stdout.write("You're all set. Try:\n");
  process.stdout.write(
    kleur.cyan("  agentpost \"shipped webhooks today 🎉\"\n\n"),
  );
}

// parseProviderChoice converts a "1"/"2"/"3"/"" prompt response into
// a typed LLMProvider, falling back to the supplied default for an
// empty answer or any unrecognized input. The fallback is generous
// because forcing a re-prompt over a typo is bad first-run UX.
function parseProviderChoice(choice: string, fallback: LLMProvider): LLMProvider {
  switch (choice) {
    case "1":
    case "anthropic":
      return "anthropic";
    case "2":
    case "openai":
      return "openai";
    case "3":
    case "gemini":
      return "gemini";
    default:
      return fallback;
  }
}

// providerKeyInfo returns the (label, signup URL) tuple for the
// provider's "where do I get a key" prompt line. Centralized so
// the messaging stays consistent if a URL changes.
function providerKeyInfo(p: LLMProvider): { label: string; url: string } {
  switch (p) {
    case "anthropic":
      return { label: "Anthropic", url: "https://console.anthropic.com/settings/keys" };
    case "openai":
      return { label: "OpenAI", url: "https://platform.openai.com/api-keys" };
    case "gemini":
      return { label: "Google Gemini", url: "https://aistudio.google.com/app/apikey" };
  }
}

// pickExistingKey returns the previously-stored key for the chosen
// provider, so the "press Enter to keep existing" hint works after
// switching back.
function pickExistingKey(
  existing: ReturnType<typeof readConfig>,
  provider: LLMProvider,
): string {
  if (!existing) return "";
  switch (provider) {
    case "anthropic":
      return existing.anthropic_api_key;
    case "openai":
      return existing.openai_api_key;
    case "gemini":
      return existing.gemini_api_key;
  }
}
