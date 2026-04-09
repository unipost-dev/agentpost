// changelog-bot — example AgentPost agent.
//
// Usage:
//   tsx src/index.ts <changelog-path> [previous-ref] [current-ref]
//
// Or in CI (see .github/workflows/post-on-release.yml):
//   tsx src/index.ts CHANGELOG.md ${{ github.event.before }} ${{ github.sha }}
//
// What it does:
//   1. Read CHANGELOG.md
//   2. Extract the most recent (top) section — that's the release just shipped
//   3. Use Claude to translate the section into per-platform launch posts
//   4. Call UniPost's POST /v1/social-posts/bulk to publish to every connected
//      account in the project
//
// This is intentionally a small, hackable script — fewer than 200 lines —
// so users can fork it, change the prompt, and drop it into their own
// release workflow without learning the AgentPost CLI's internals.

import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const UNIPOST_API_URL =
  process.env.UNIPOST_API_URL || "https://api.unipost.dev";
const UNIPOST_API_KEY = mustEnv("UNIPOST_API_KEY");
const ANTHROPIC_API_KEY = mustEnv("ANTHROPIC_API_KEY");
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-4-6";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const changelogPath = process.argv[2] || "CHANGELOG.md";
  const changelog = readFileSync(changelogPath, "utf-8");

  // Extract the most recent release section (between the first two
  // ## headings, or to EOF if there's only one). Most CHANGELOG.md
  // files keep the unreleased section at the top followed by version
  // headings — we want the version below "## [Unreleased]" if it
  // exists, otherwise the very first ## section.
  const section = extractLatestSection(changelog);
  if (!section) {
    console.error("Could not find a release section in the changelog");
    process.exit(1);
  }

  console.log("Latest release section:\n");
  console.log(section);
  console.log("\n---\n");

  // Load connected accounts so the prompt knows what to write for.
  const accounts = await listAccounts();
  const active = accounts.filter((a) => a.status === "active");
  if (active.length === 0) {
    console.error("No active connected accounts in the UniPost project");
    process.exit(1);
  }

  console.log(`Generating posts for ${active.length} accounts via ${CLAUDE_MODEL}...`);
  const drafts = await generateDrafts(section, active);

  console.log("\nDrafts generated:\n");
  for (const d of drafts) {
    const acc = active.find((a) => a.id === d.account_id);
    console.log(`[${acc?.platform}] ${d.caption}\n`);
  }

  if (process.env.DRY_RUN === "1") {
    console.log("\nDRY_RUN=1 — skipping publish.");
    return;
  }

  console.log("Publishing...");
  const result = await publishBulk(drafts);
  console.log(`Published ${result.length} posts`);
  for (const r of result) {
    if (r.status === 200) {
      console.log(`  ✓ ${r.data?.results?.[0]?.platform} ${r.data?.id}`);
    } else {
      console.log(`  ✗ ${r.error?.message || "failed"}`);
    }
  }
}

// extractLatestSection finds the first non-empty release section in
// a Keep-A-Changelog-style markdown file. Skips a top "## [Unreleased]"
// heading if present.
function extractLatestSection(changelog: string): string | null {
  const lines = changelog.split("\n");
  const sections: { title: string; body: string[] }[] = [];
  let current: { title: string; body: string[] } | null = null;

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (current) sections.push(current);
      current = { title: line, body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) sections.push(current);

  // Find the first section that isn't "## [Unreleased]" and has
  // non-trivial body content.
  for (const sec of sections) {
    if (/unreleased/i.test(sec.title)) continue;
    const body = sec.body.join("\n").trim();
    if (body.length > 0) {
      return `${sec.title}\n${body}`;
    }
  }
  return null;
}

interface ConnectedAccount {
  id: string;
  platform: string;
  account_name: string | null;
  status: string;
}

async function listAccounts(): Promise<ConnectedAccount[]> {
  const res = await fetch(`${UNIPOST_API_URL}/v1/social-accounts`, {
    headers: { Authorization: `Bearer ${UNIPOST_API_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`UniPost /v1/social-accounts: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { data: ConnectedAccount[] };
  return body.data;
}

interface Draft {
  account_id: string;
  caption: string;
}

async function generateDrafts(
  section: string,
  accounts: ConnectedAccount[],
): Promise<Draft[]> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const accountsList = accounts
    .map((a) => `- ${a.platform} (account_id: ${a.id})${a.account_name ? ` (${a.account_name})` : ""}`)
    .join("\n");

  const userMessage = `The following section was just added to our project's CHANGELOG.md (this is the release we just shipped):

${section}

Generate one launch post per platform announcing the most user-facing changes from that section. Only highlight the items that real users will notice — skip internal refactors and dependency bumps.

Connected accounts:
${accountsList}

Output JSON only: { "drafts": [{ "account_id": "...", "caption": "..." }, ...] }. One entry per account. No prose, no markdown, no apologies.`;

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system:
      "You are a release notes assistant. You translate CHANGELOG.md sections into platform-perfect launch posts. Twitter is short and punchy, LinkedIn is professional and longer, Bluesky is casual and lowercase-friendly. Never use buzzword openers like 'Excited to announce'. Never invent features not in the changelog. Output JSON only.",
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text block");
  }
  const cleaned = textBlock.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const parsed = JSON.parse(cleaned) as { drafts: Draft[] };
  return parsed.drafts;
}

interface BulkResult {
  status: number;
  data?: {
    id: string;
    results?: Array<{ platform: string; status: string; external_id?: string }>;
  };
  error?: { message: string };
}

async function publishBulk(drafts: Draft[]): Promise<BulkResult[]> {
  const posts = drafts.map((d) => ({
    platform_posts: [{ account_id: d.account_id, caption: d.caption }],
  }));
  const res = await fetch(`${UNIPOST_API_URL}/v1/social-posts/bulk`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UNIPOST_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ posts }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`UniPost /v1/social-posts/bulk: ${res.status} ${text}`);
  }
  const body = (await res.json()) as { data: BulkResult[] };
  return body.data;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
