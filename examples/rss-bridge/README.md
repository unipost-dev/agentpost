# rss-bridge

> Poll an RSS or Atom feed and post new items as platform-perfect social posts via UniPost.

`rss-bridge` is the second example AgentPost agent. It's the simplest way to bridge any RSS-aware source — your blog, your podcast, your GitHub releases, your Substack — into per-platform social posts on every connected account.

Drop the GitHub Action into your own repo, point it at a feed URL, and any new feed item gets a Twitter post + LinkedIn post + Bluesky post + Threads post within an hour.

## What you get

When the bot detects a new feed item, it:

1. Fetches and parses the feed (RSS or Atom both work)
2. Compares against the last seen guid in `state.json`
3. For each new item, asks Claude for a per-platform post
4. Publishes via UniPost's `POST /v1/social-posts/bulk` in one call
5. Commits the updated `state.json` back to the repo so the next run knows where to resume from

Total cost per published item: ~$0.01 in Claude tokens + your normal X / LinkedIn / Bluesky API quotas.

**First-run safety**: on the very first run (when there's no `state.json` yet), the bridge processes ONLY the most recent item, not the entire feed history. Without this guard the first run would flood every social platform with 30+ posts in a row, which is the worst possible first impression.

## Setup (5 minutes)

### 1. Connect your social accounts

If you haven't already, sign up for UniPost at [app.unipost.dev](https://app.unipost.dev) and connect at least one social account.

### 2. Add secrets to your GitHub repo

Settings → Secrets and variables → Actions → New repository secret:

| Name | Value |
|---|---|
| `UNIPOST_API_KEY` | A `up_live_...` key from [app.unipost.dev/api-keys](https://app.unipost.dev/api-keys) |
| `ANTHROPIC_API_KEY` | An `sk-ant-...` key from [console.anthropic.com](https://console.anthropic.com/settings/keys) |

### 3. Drop the workflow into your repo

Copy `.github/workflows/poll.yml.example` from this example into your own repo as `.github/workflows/rss-bridge.yml`. Edit the `FEED_URL` line to point at your feed.

### 4. Push and wait

The workflow runs every hour on its own and on demand from the Actions tab. The first run will publish the latest item; every subsequent run will publish anything new.

## Local testing

```bash
cd examples/rss-bridge
npm install

# Dry-run against any feed (no API calls, prints what it would post):
UNIPOST_API_KEY=... ANTHROPIC_API_KEY=... \
  npx tsx src/index.ts https://example.com/feed.xml --dry-run

# Real run against your blog:
UNIPOST_API_KEY=... ANTHROPIC_API_KEY=... \
  npx tsx src/index.ts https://yourblog.com/feed.xml --state state.json
```

## Configuration

| Flag | Default | Description |
|---|---|---|
| `<feed-url>` | _required_ | RSS or Atom feed URL (positional argument) |
| `--state <path>` | `state.json` | Where to read/write the last-seen-guid record |
| `--max <n>` | `5` | Cap on how many backlogged items to publish in one run |
| `--dry-run` | off | Print what would be posted without calling the publish API |

| Env var | Default | Description |
|---|---|---|
| `UNIPOST_API_KEY` | _required_ | Your UniPost API key |
| `ANTHROPIC_API_KEY` | _required_ | Your Anthropic API key |
| `UNIPOST_API_URL` | `https://api.unipost.dev` | Override for self-hosted instances |
| `CLAUDE_MODEL` | `claude-opus-4-6` | Override for cheaper Claude variants |

## Hacking on the prompt

The prompt lives at the top of `src/index.ts` (the `draftPlatformPosts` function). Fork it freely. Common tweaks:

- **Add a hashtag rule**: tell Claude to always include one specific hashtag for your brand
- **Change the platform list**: this example assumes Twitter / LinkedIn / Bluesky / Threads — change the platform character limits in the prompt if you have other accounts connected
- **Add per-platform style guidance**: "On LinkedIn, lead with the takeaway, not the headline"
- **Switch to a different LLM**: Anthropic, OpenAI, and Gemini SDKs are all interchangeable here — the AgentPost CLI's `src/lib/llm/` directory has reference implementations for each

The prompt is intentionally minimal — fewer than 30 lines. The point of this example is to show the SHAPE of an AgentPost agent, not to be the One True Prompt.

## How the state file works

`state.json` is a single-record file:

```json
{
  "last_seen_guid": "https://example.com/posts/2026-04-10-shipped-foo",
  "updated_at": "2026-04-10T15:00:00Z"
}
```

- On first run (no file), the bridge publishes the top item and writes the file.
- On subsequent runs, the bridge walks the feed top-down until it hits `last_seen_guid`, publishes everything above it (oldest-first so the social timeline matches the feed reader timeline), and updates the guid.
- If a publish fails for every connected account on a given item, the state is left untouched and the next run will retry the same item.
- The `--max` flag caps how many backlogged items get processed in one run, so a long outage doesn't suddenly produce a 30-post burst.

## Why guid not link?

`<guid>` is the canonical "item identity" field in RSS — it's what feed readers use to deduplicate items across re-fetches. It's a more reliable cursor than `<link>` because:

1. Some feeds rewrite links when they migrate domains, but keep the guid stable.
2. Some feeds have multiple items with the same link (e.g. update redirects).
3. Atom feeds use `<id>` which the parser maps to `guid`.

If your feed leaves `<guid>` empty (Substack used to do this), the bridge falls back to `<link>` automatically.

## What this example does NOT do

- **Doesn't handle media**: image and video posts work in UniPost but this example only sends text + link captions. Adding media is a ~10 line change in `bulkPublish`.
- **Doesn't filter items**: every new feed item gets posted. If you only want to post items tagged "release" or matching a specific category, add a filter step in `main()`.
- **Doesn't schedule**: every run posts immediately. UniPost's `scheduled_at` field works in `POST /v1/social-posts/bulk` if you want a delay.
- **Doesn't retry**: a failed item is left for the next run, but there's no exponential backoff or per-platform retry. The next hourly cron is the retry.

These are all good things to add when you fork this for your own use. The example stays minimal so you can read the whole thing in five minutes.

## License

Same as AgentPost: MIT. Fork freely.
