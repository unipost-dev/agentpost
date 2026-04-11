// `agentpost accounts` lists every connected social account,
// grouped by Profile (Workspace+Profile model).

import kleur from "kleur";
import { AuthError } from "@unipost/sdk";
import type { SocialAccount } from "@unipost/sdk";

import { createUniPostClient } from "../lib/client.js";

export interface AccountsOptions {
  profile?: string;
}

export async function runAccounts(opts: AccountsOptions = {}): Promise<void> {
  const client = createUniPostClient();

  let accounts: SocialAccount[];
  try {
    const res = await client.accounts.list();
    accounts = res.data;
  } catch (e) {
    if (e instanceof AuthError) {
      console.error(kleur.red("Invalid API key. Run `agentpost init` to reset."));
      process.exit(1);
    }
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

  const byProfile = new Map<string, SocialAccount[]>();
  for (const acc of accounts) {
    const key = acc.profile_name || "Default";
    if (!byProfile.has(key)) byProfile.set(key, []);
    byProfile.get(key)!.push(acc);
  }

  // --profile flag: filter to a single profile
  if (opts.profile) {
    const match = [...byProfile.keys()].find(
      (k) => k.toLowerCase() === opts.profile!.toLowerCase(),
    );
    if (!match) {
      console.error(kleur.red(`Profile "${opts.profile}" not found.`));
      console.error(kleur.gray(`Available: ${[...byProfile.keys()].join(", ")}`));
      process.exit(1);
    }
    const filtered = byProfile.get(match)!;
    byProfile.clear();
    byProfile.set(match, filtered);
  }

  // Output grouped by profile
  for (const [profileName, accs] of byProfile) {
    if (byProfile.size > 1 || (byProfile.size === 1 && profileName !== "Default")) {
      process.stdout.write(kleur.bold(`\n● Profile: ${profileName}\n`));
    } else {
      process.stdout.write(kleur.bold(`\n${accounts.length} connected accounts:\n`));
    }
    process.stdout.write("\n");
    for (const a of accs) {
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
  }

  const total = accounts.length;
  const profiles = byProfile.size;
  if (profiles > 1) {
    process.stdout.write(
      kleur.gray(`\n${total} account${total !== 1 ? "s" : ""} across ${profiles} profile${profiles !== 1 ? "s" : ""}\n`),
    );
  }
  process.stdout.write("\n");
}
