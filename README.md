# AgentPost

> Describe what you shipped. AI posts it everywhere.

AgentPost is an AI-native CLI that turns a one-line update into platform-perfect posts and publishes them across Twitter, LinkedIn, Bluesky, Threads, Instagram, TikTok, and YouTube — in one command.

```bash
$ agentpost "shipped webhooks today 🎉"

Loading your accounts and capabilities...
Generating drafts for 3 accounts via Anthropic Claude (claude-opus-4-6)...

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

AgentPost is the third option: write once in your own voice, let an LLM rewrite it per platform, review the previews, and publish.

It is **not** a scheduler. It is **not** a content factory. It is a one-command CLI that respects your voice and your audience's intelligence. The default mode is interactive — you always see what's about to publish before it goes live.

## Installation

```bash
npm install -g @unipost/agentpost
```

Then:

```bash
agentpost init
```

`init` walks through three short prompts:

1. **A UniPost API key** — sign in at [app.unipost.dev](https://app.unipost.dev) and click **API Keys** in the sidebar to generate one. UniPost is the publishing API that handles the OAuth + multi-platform fan-out under the hood.
2. **An LLM provider** — pick one of:
   - `1` Anthropic Claude (default; the prompt was tuned against it)
   - `2` OpenAI (`gpt-4o`)
   - `3` Google Gemini (`gemini-1.5-pro`)
3. **An API key for the provider you picked** — get one at [console.anthropic.com](https://console.anthropic.com/settings/keys), [platform.openai.com](https://platform.openai.com/api-keys), or [aistudio.google.com](https://aistudio.google.com/app/apikey).

Both keys are stored locally at `~/.agentpost/config.json` (mode `0600`). They never touch AgentPost's servers — there are no AgentPost servers.

That's it. No accounts to create, no signup flow, no telemetry.

## Usage

```bash
# The headline use case — generate, preview, publish
agentpost "shipped webhooks today 🎉"

# Preview without publishing
agentpost "still figuring this one out" --dry-run

# Override the configured LLM provider for a single run
agentpost "we hit 1000 stars 🎉" --llm openai

# Only post to accounts in a specific Profile (see below)
agentpost "internal launch announcement" --profile work

# List your connected accounts, grouped by Profile
agentpost accounts

# List accounts in a single Profile
agentpost accounts --profile personal

# Re-run init to update keys or switch providers
agentpost init
```

All flags compose. `agentpost "msg" --dry-run --profile work --llm gemini` is valid.

## Profiles

A **Profile** in UniPost is a logical grouping of social accounts — for example, your personal handles vs. your company handles vs. a side project's handles. Every connected account belongs to exactly one Profile, and the AgentPost CLI surfaces this in two places:

- `agentpost accounts` groups its output by Profile
- The interactive preview groups draft cards by Profile so you can see at a glance which identity each post will go out under
- `--profile <name>` (case-insensitive, matched against the Profile name) filters every command to a single Profile, so you don't accidentally cross-post a personal-tone update from your company handle

If you only have one Profile (the default for new accounts), the grouping is invisible and the `--profile` flag is unnecessary.

## Connecting your social accounts

AgentPost itself doesn't do OAuth. The accounts you publish to are connected through UniPost's dashboard. Two paths:

- **For your own accounts** — visit [app.unipost.dev](https://app.unipost.dev) → Quickstart Mode → Connect Account. One-click OAuth for Twitter, LinkedIn, Threads, Instagram, TikTok, YouTube. Bluesky uses an app password.
- **For your end users' accounts** (if you're building a SaaS on top of UniPost) — use the Connect API. See [UniPost docs](https://app.unipost.dev/docs#connect).

## Choosing an LLM provider

AgentPost supports three providers as of v0.2:

| Provider | Default model | Pick this if... |
|---|---|---|
| Anthropic Claude | `claude-opus-4-6` | You want the experience the prompt was tuned against. This is the default. |
| OpenAI | `gpt-4o` | You already pay for OpenAI and don't want a second AI bill. |
| Google Gemini | `gemini-1.5-pro` | You already pay for Gemini, or you want the cheapest option for high-volume use. |

You can switch providers in two ways:
- **Permanently:** re-run `agentpost init` and pick a different option
- **For one invocation:** pass `--llm anthropic|openai|gemini` to override the configured provider

The model strings can be edited directly in `~/.agentpost/config.json` if you want to pin a specific snapshot (e.g. `claude-opus-4-5`, `gpt-4o-2024-11-20`).

## How the prompt works

The single most important file in AgentPost is `src/lib/prompt.ts`. It's the system prompt the LLM reads on every invocation. The core rules:

- Match the user's energy. If they wrote `🎉`, the output should be similarly upbeat.
- Per-platform style: Twitter is punchy and short, LinkedIn is professional and longer, Bluesky is casual and lowercase-friendly, Threads is conversational.
- Hard limits enforced: never exceed the character cap, never use buzzword openers, never invent facts not in the input, never hashtag-spam LinkedIn.
- Eight hand-curated few-shot examples covering ship updates, bug fixes, milestones, and link shares.

The same prompt is used for all three providers — the per-provider modules in `src/lib/llm/` only differ in how they call the SDK and handle JSON-mode quirks.

If the output isn't to your taste, the prompt is a single file you can fork and tune. PRs to improve it are welcome.

## Built on UniPost

AgentPost is the open-source frontend. The actual publishing — OAuth, token refresh, per-platform API quirks, retry logic, scheduling — happens on [UniPost](https://unipost.dev), a paid SaaS API for multi-platform publishing. AgentPost talks to UniPost through the official [`@unipost/sdk`](https://www.npmjs.com/package/@unipost/sdk) package.

Why split it this way? Because the CLI should be free, hackable, and yours. The infrastructure that handles 47 different OAuth flows and rate limits should be a managed service that you don't have to maintain. Use AgentPost without UniPost? Not really — the CLI is a thin client. But you can use UniPost without AgentPost (it has its own dashboard, MCP server, and REST API).

If you want to understand the split: **UniPost is the rails, AgentPost is the train.**

## What it's NOT

- A scheduler — AgentPost publishes immediately. If you want to schedule, use UniPost's `scheduled_at` field directly.
- An analytics dashboard — UniPost has analytics; AgentPost is publish-only.
- A content generator — AgentPost rewrites your input per platform. It will not invent posts from nothing.
- A media-attachment tool (yet) — v0.2 is text-only. Image and video uploads are planned but not implemented; platforms that *require* media (Instagram, TikTok, YouTube) will fail at publish time until that lands.
- A growth hacking tool — there are no engagement loops, no auto-replies, no follower bots. AgentPost helps you post; it does not help you "win."

## Roadmap

- ✅ `v0.1` — CLI with Claude, interactive preview, publish to Twitter / LinkedIn / Bluesky / Threads / Instagram / TikTok / YouTube via UniPost
- ✅ `v0.2` — OpenAI + Gemini providers (`--llm` flag), Workspace+Profile support (`--profile` flag), migration to `@unipost/sdk` with structured error handling
- `v0.3` — Media attachments (`--image`, `--video`), `--web` preview hosted on UniPost, Slack frontend, team configurations

## Contributing

Issues and PRs welcome. The most useful contributions right now are:

1. **Prompt improvements** — `src/lib/prompt.ts`. Better few-shot examples or better tone calibration directly improves the launch quality of the project.
2. **New example agents** — `examples/changelog-bot/` is the template. Each example imports `src/lib/` and exposes a small wrapper.
3. **Bug reports** — try edge cases (very short messages, very long messages, messages in non-English languages, messages with code blocks) and file what breaks.

## License

MIT. Do whatever you want with it.

---

Built with [UniPost](https://unipost.dev). Made by indie developers who got tired of writing the same announcement four times.
