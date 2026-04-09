// `agentpost accounts` lists every connected social account on the
// configured UniPost project. Useful for verifying that init worked
// and that AgentPost can see what the user expects.

import kleur from "kleur";

import { requireConfig } from "../lib/config.js";
import { UniPostClient } from "../lib/unipost.js";

export async function runAccounts(): Promise<void> {
  const cfg = requireConfig();
  const client = new UniPostClient(cfg.unipost_api_key, cfg.unipost_api_url);

  let accounts;
  try {
    accounts = await client.listAccounts();
  } catch (e) {
    console.error(kleur.red(`Failed to load accounts: ${(e as Error).message}`));
    process.exit(1);
  }

  if (accounts.length === 0) {
    process.stdout.write(
      kleur.yellow(
        "No connected accounts. Connect at least one in your UniPost dashboard:\n",
      ) +
        kleur.cyan("  https://app.unipost.dev\n"),
    );
    return;
  }

  process.stdout.write(
    kleur.bold(`\n${accounts.length} connected accounts:\n\n`),
  );
  for (const a of accounts) {
    const name = a.account_name ?? a.id;
    const status =
      a.status === "active"
        ? kleur.green("active")
        : a.status === "reconnect_required"
          ? kleur.yellow("needs reconnect")
          : kleur.red("disconnected");
    const type =
      a.connection_type === "managed" ? kleur.gray(" (managed)") : "";
    process.stdout.write(
      `  ${kleur.cyan(a.platform.padEnd(10))} ${name.padEnd(28)} ${status}${type}\n`,
    );
  }
  process.stdout.write("\n");
}
