# AgentPost

> Describe what you shipped. AI posts it everywhere.

AgentPost is an AI-native CLI that turns a one-line update into platform-perfect posts and publishes them across Twitter, LinkedIn, Bluesky, Threads, Instagram, and more — in one command.

```bash
$ agentpost "shipped webhooks today 🎉"

Loading your accounts and capabilities...
Generating drafts for 3 accounts via claude-opus-4-6...

╭─────────────────────────────────────────────────╮
│ Twitter / X  @yuxiaobohit                  82/280 │
│                                                   │
│ webhooks are live 🎉                              │
│                                                   │
│ for anyone who's been waiting on the receipt-    │
│ side of an integration: it's done.                │
╰─────────────────────────────────────────────────╯

╭─────────────────────────────────────────────────╮
│ LinkedIn  @yuxiaobohit@gmail.com         268/3000 │
│                                                   │
│ Webhooks shipped today.                           │
│                                                   │
│ This was the most-requested feature from the     │
│ last quarter — every customer integration that   │
│ needed event notifications was effectively       │
│ waiting on this. It's out, it's documented,     │
│ and it's already firing in production.            │
│                                                   │
│ If you've been blocked on the receiving side    │
│ of an integration, today's a good day to revisit │
│ it.                                               │
╰─────────────────────────────────────────────────╯

╭─────────────────────────────────────────────────╮
│ Bluesky  @unipostdev.bsky.social           33/300 │
│                                                   │
│ webhooks shipped today 🎉 finally                 │
╰─────────────────────────────────────────────────╯

Press P or Enter to publish all, C or Esc to cancel.
```

Press `P` and the posts go live in ~3 seconds.

## Why

Every developer who ships things has the same problem: writing the same news three different ways for three different audiences is friction. You either don't post (and your work is invisible), you cross-post the same caption everywhere (and it lands flat on every platform), or you spend 15 minutes rewriting the same announcement four times.

AgentPost is the third option: write once in your own voice, let Claude rewrite it per platform, review the previews, and publish.

It is **not** a scheduler. It is **not** a content factory. It is a one-command CLI that respects your voice and your audience's intelligence. The default mode is interactive — you always see what's about to publish before it goes live.

## Installation

```bash
npm install -g @unipost/agentpost
```

Then:

```bash
agentpost init
```

You'll be asked for two things:

1. **A UniPost API key** — get one free at [app.unipost.dev/api-keys](https://app.unipost.dev/api-keys). UniPost is the publishing API that handles the OAuth + multi-platform fan-out under the hood.
2. **An Anthropic API key** — get one at [console.anthropic.com](https://console.anthropic.com/settings/keys). AgentPost uses Claude (currently `claude-opus-4-6`) to draft per-platform posts. Your key never touches AgentPost's servers — it's stored locally at `~/.agentpost/config.json`.

That's it. No accounts to create, no signup flow, no telemetry.

## Usage

```bash
# The headline use case
agentpost "shipped webhooks today 🎉"

# Preview without publishing
agentpost "still figuring this one out" --dry-run

# List your connected accounts
agentpost accounts

# Re-run init to update keys
agentpost init
```

## Connecting your social accounts

AgentPost itself doesn't do OAuth. The accounts you publish to are connected through UniPost's dashboard. Two paths:

- **For your own accounts** — visit [app.unipost.dev](https://app.unipost.dev) → Quickstart Mode → Connect Account. One-click OAuth for Twitter, LinkedIn, Threads, Instagram, TikTok, YouTube. Bluesky uses an app password.
- **For your end users' accounts** (if you're building a SaaS on top of UniPost) — use the Connect API. See [UniPost docs](https://app.unipost.dev/docs#connect).

## How the prompt works

The single most important file in AgentPost is `src/lib/prompt.ts`. It's the system prompt Claude reads on every invocation. The core rules:

- Match the user's energy. If they wrote `🎉`, the output should be similarly upbeat.
- Per-platform style: Twitter is punchy and short, LinkedIn is professional and longer, Bluesky is casual and lowercase-friendly, Threads is conversational, Mastodon is technical.
- Hard limits enforced: never exceed the character cap, never use buzzword openers, never invent facts not in the input, never hashtag-spam LinkedIn.
- Eight hand-curated few-shot examples covering ship updates, bug fixes, milestones, and link shares.

If the output isn't to your taste, the prompt is a single file you can fork and tune. PRs to improve it are welcome.

## Built on UniPost

AgentPost is the open-source frontend. The actual publishing — OAuth, token refresh, per-platform API quirks, retry logic, scheduling — happens on [UniPost](https://unipost.dev), a paid SaaS API for multi-platform publishing.

Why split it this way? Because the CLI should be free, hackable, and yours. The infrastructure that handles 47 different OAuth flows and rate limits should be a managed service that you don't have to maintain. Use AgentPost without UniPost? Not really — the CLI is a thin client. But you can use UniPost without AgentPost (it has its own dashboard, MCP server, and REST API).

If you want to understand the split: **UniPost is the rails, AgentPost is the train.**

## What it's NOT

- A scheduler — AgentPost publishes immediately. If you want to schedule, use UniPost's `scheduled_at` field directly.
- An analytics dashboard — UniPost has analytics; AgentPost is publish-only.
- A content generator — AgentPost rewrites your input per platform. It will not invent posts from nothing.
- A growth hacking tool — there are no engagement loops, no auto-replies, no follower bots. AgentPost helps you post; it does not help you "win."

## Roadmap

- `v0.1` (this release) — CLI with Claude, interactive preview, publish to Twitter / LinkedIn / Bluesky / Threads / Instagram via UniPost
- `v0.2` — OpenAI + Gemini adapters; more example agents (changelog-bot, rss-bridge, release-bot)
- `v0.3` — Web UI; Slack frontend; team configurations

## Contributing

Issues and PRs welcome. The most useful contributions right now are:

1. **Prompt improvements** — `src/lib/prompt.ts`. Better few-shot examples or better tone calibration directly improves the launch quality of the project.
2. **New example agents** — `examples/changelog-bot/` is the template. Each example imports `src/lib/` and exposes a small wrapper.
3. **Bug reports** — try edge cases (very short messages, very long messages, messages in non-English languages, messages with code blocks) and file what breaks.

## License

MIT. Do whatever you want with it.

---

Built with [UniPost](https://unipost.dev). Made by indie developers who got tired of writing the same announcement four times.
