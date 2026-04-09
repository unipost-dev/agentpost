// rss-bridge — example AgentPost agent.
//
// Polls an RSS or Atom feed, finds items newer than the last seen
// guid, and asks Claude to draft a per-platform post for each new
// item. Publishes via UniPost's POST /v1/social-posts/bulk.
//
// Useful for: blog → social, podcast → social, GitHub releases atom
// feed → social, Substack → social, RSS-aware status pages, etc.
//
// Usage:
//   tsx src/index.ts <feed-url> [--state state.json] [--max 5] [--dry-run]
//
// Or in CI (see .github/workflows/poll.yml.example):
//   tsx src/index.ts https://example.com/feed.xml --state state.json
//
// State file: a tiny JSON record of the last seen item guid plus
// the timestamp it was processed at. Designed to be committed back
// to the repo via the GitHub Action so the next run knows where
// to resume from. The state is intentionally a single guid (not a
// set of seen guids) — feeds that prepend new items are the common
// case, and any feed that mixes new and old items can fall back
// to the --since flag.
//
// This is intentionally a small, hackable script — fewer than 300
// lines — so users can fork it, change the prompt, and drop it
// into their own repo without learning the AgentPost CLI's
// internals.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import RSSParser from "rss-parser";

const UNIPOST_API_URL = process.env.UNIPOST_API_URL || "https://api.unipost.dev";
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

interface CLIArgs {
  feedURL: string;
  statePath: string;
  maxItems: number;
  dryRun: boolean;
}

interface State {
  last_seen_guid: string | null;
  updated_at: string;
}

interface Account {
  id: string;
  platform: string;
  account_name: string | null;
  status: string;
}

interface FeedItem {
  guid: string;
  title: string;
  link: string;
  contentSnippet: string;
  isoDate: string | undefined;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Step 1: load state — defaults to "no last seen" on first run.
  // First-run behavior: process the SINGLE most recent item, not the
  // entire feed history. The first run otherwise floods every social
  // platform with 30+ posts in a row, which is the worst possible
  // first impression of this bridge.
  const state = loadState(args.statePath);
  const isFirstRun = state.last_seen_guid === null;

  // Step 2: fetch + parse the feed.
  console.log(`Fetching ${args.feedURL}...`);
  const parser = new RSSParser();
  const feed = await parser.parseURL(args.feedURL);

  // Normalize each item's guid: prefer guid, fall back to link.
  // Some feeds (especially Substack) leave guid empty. Without
  // this fallback the state file ends up storing empty strings
  // and every run treats every item as new.
  const items: FeedItem[] = (feed.items || []).map((it) => ({
    guid: (it.guid || it.link || "") as string,
    title: it.title || "(untitled)",
    link: it.link || "",
    contentSnippet: it.contentSnippet || it.content || "",
    isoDate: it.isoDate,
  }));

  if (items.length === 0) {
    console.log("Feed has no items.");
    return;
  }

  // Step 3: find new items.
  // First run: just the top item.
  // Subsequent runs: every item above last_seen_guid in feed order.
  // Cap at args.maxItems to bound a recovery scenario where the
  // bridge has been off for a while.
  let newItems: FeedItem[];
  if (isFirstRun) {
    console.log("First run — bridging only the most recent item.");
    newItems = [items[0]!];
  } else {
    newItems = [];
    for (const it of items) {
      if (it.guid === state.last_seen_guid) {
        break;
      }
      newItems.push(it);
    }
    if (newItems.length > args.maxItems) {
      console.log(
        `Capping ${newItems.length} new items to ${args.maxItems} (--max). The rest will be skipped.`,
      );
      newItems = newItems.slice(0, args.maxItems);
    }
  }

  if (newItems.length === 0) {
    console.log("No new items since last run.");
    return;
  }

  console.log(`Found ${newItems.length} new item(s):`);
  for (const it of newItems) {
    console.log(`  - ${it.title}`);
  }

  // Step 4: load connected accounts.
  const accounts = await listAccounts();
  const active = accounts.filter((a) => a.status === "active");
  if (active.length === 0) {
    console.error("No active connected accounts. Connect at least one in your UniPost dashboard.");
    process.exit(1);
  }

  // Step 5: for each new item, draft and publish (oldest-first so
  // a feed reader and a social timeline tell the same story).
  const ordered = [...newItems].reverse();
  let lastSucceededGuid = state.last_seen_guid;

  for (const item of ordered) {
    console.log(`\n=== ${item.title} ===`);
    const drafts = await draftPlatformPosts(item, active);

    if (args.dryRun) {
      console.log("--dry-run: skipping publish");
      for (const d of drafts) {
        console.log(`  [${d.platform}] ${d.caption}`);
      }
      lastSucceededGuid = item.guid;
      continue;
    }

    const result = await bulkPublish(drafts);
    console.log(`Published: ${result.status}`);
    for (const r of result.results) {
      const tag = r.status === "published" ? "✓" : "✗";
      const where = `${r.platform}/${r.account_name ?? r.social_account_id}`;
      console.log(`  ${tag} ${where}${r.error_message ? `  ${r.error_message}` : ""}`);
    }

    // Only advance state on at least partial success — if every
    // platform failed, we want the next run to retry the same item.
    if (result.status !== "failed") {
      lastSucceededGuid = item.guid;
    } else {
      console.error("All platforms failed for this item — leaving state untouched and stopping.");
      break;
    }
  }

  // Step 6: persist state. Skipped on dry-run because we didn't
  // actually do anything user-visible.
  if (!args.dryRun && lastSucceededGuid !== state.last_seen_guid) {
    saveState(args.statePath, {
      last_seen_guid: lastSucceededGuid,
      updated_at: new Date().toISOString(),
    });
    console.log(`\nState saved to ${args.statePath}`);
  }
}

// draftPlatformPosts asks Claude for one post per active account.
// The prompt is intentionally minimal — for a real bridge you'd
// likely want to fork this to add platform-specific style rules,
// signal what kind of feed it is, etc. The point of this example
// is to show the SHAPE of an AgentPost agent, not to be the One
// True Prompt.
async function draftPlatformPosts(item: FeedItem, accounts: Account[]) {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const accountList = accounts
    .map((a) => `- ${a.platform} (account_id: ${a.id})${a.account_name ? ` — ${a.account_name}` : ""}`)
    .join("\n");

  const userMsg = [
    "I just published a new item to my feed. Draft a per-platform social post that links to it.",
    "",
    `Title: ${item.title}`,
    `Link: ${item.link}`,
    `Excerpt: ${item.contentSnippet.slice(0, 500)}`,
    "",
    "Connected accounts (one post per account):",
    accountList,
    "",
    'Output JSON only: {"drafts": [{"account_id": "<id>", "caption": "<text>"}, ...]}',
    "Twitter ≤280 chars. LinkedIn 100-300 words. Bluesky ≤300 chars casual. Threads ≤500 chars conversational. Always include the link.",
  ].join("\n");

  const resp = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system:
      "You are a social media bridge that turns blog/podcast/release feed items into per-platform social posts. Output JSON only. Never invent facts beyond the title, excerpt, and link the user provides. Always include the link.",
    messages: [{ role: "user", content: userMsg }],
  });

  const text = resp.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Claude response had no text content");
  }
  const cleaned = text.text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned) as {
    drafts: Array<{ account_id: string; caption: string }>;
  };
  return parsed.drafts.map((d) => {
    const acc = accounts.find((a) => a.id === d.account_id);
    return {
      account_id: d.account_id,
      caption: d.caption,
      platform: acc?.platform ?? "unknown",
      account_name: acc?.account_name ?? null,
    };
  });
}

async function listAccounts(): Promise<Account[]> {
  const res = await fetch(`${UNIPOST_API_URL}/v1/social-accounts`, {
    headers: { Authorization: `Bearer ${UNIPOST_API_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`listAccounts failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { data: Account[] };
  return body.data;
}

async function bulkPublish(drafts: Array<{ account_id: string; caption: string }>) {
  const res = await fetch(`${UNIPOST_API_URL}/v1/social-posts/bulk`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UNIPOST_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      platform_posts: drafts.map((d) => ({
        account_id: d.account_id,
        caption: d.caption,
      })),
    }),
  });
  if (!res.ok) {
    throw new Error(`bulk publish failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as {
    status: string;
    results: Array<{
      social_account_id: string;
      platform: string;
      account_name?: string;
      status: string;
      external_id?: string;
      error_message?: string;
    }>;
  };
}

function loadState(path: string): State {
  if (!existsSync(path)) {
    return { last_seen_guid: null, updated_at: new Date().toISOString() };
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as State;
  } catch {
    console.warn(`State file ${path} is invalid JSON; starting from scratch.`);
    return { last_seen_guid: null, updated_at: new Date().toISOString() };
  }
}

function saveState(path: string, state: State): void {
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
}

function parseArgs(argv: string[]): CLIArgs {
  let feedURL = "";
  let statePath = "state.json";
  let maxItems = 5;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--state") {
      statePath = argv[++i] ?? "state.json";
    } else if (a === "--max") {
      maxItems = parseInt(argv[++i] ?? "5", 10);
    } else if (a === "--dry-run") {
      dryRun = true;
    } else if (!feedURL) {
      feedURL = a;
    }
  }
  if (!feedURL) {
    console.error("Usage: tsx src/index.ts <feed-url> [--state state.json] [--max 5] [--dry-run]");
    process.exit(1);
  }
  return { feedURL, statePath, maxItems, dryRun };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
