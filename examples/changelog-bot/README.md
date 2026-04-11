# changelog-bot

> Auto-post your release notes to every social platform when you tag a new version.

`changelog-bot` is the simplest example AgentPost agent. It reads your `CHANGELOG.md`, extracts the most recent release section, asks Claude to translate the user-facing changes into platform-specific launch posts, and publishes them via UniPost.

Drop the GitHub Action into your own repo and tag a release — within a minute, every connected social account has a fresh launch post.

## What you get

When you push a tag like `v1.4.0`, the bot:

1. Reads `CHANGELOG.md`
2. Finds the most recent release section (skipping `## [Unreleased]`)
3. Sends it to Claude with each connected account
4. Generates one platform-perfect post per account
5. Publishes via UniPost's `POST /v1/social-posts/bulk` in one call

Total cost per release: ~$0.01 in Claude tokens + your normal X / LinkedIn / Bluesky API quotas.

## Setup (5 minutes)

### 1. Connect your social accounts

If you haven't already, sign up for UniPost at [app.unipost.dev](https://app.unipost.dev) and connect at least one social account in the Quickstart Mode tab.

### 2. Add secrets to your GitHub repo

Settings → Secrets and variables → Actions → New repository secret:

| Name | Value |
|---|---|
| `UNIPOST_API_KEY` | A `up_live_...` key — sign in at [app.unipost.dev](https://app.unipost.dev) and click **API Keys** in the sidebar |
| `ANTHROPIC_API_KEY` | An `sk-ant-...` key from [console.anthropic.com](https://console.anthropic.com/settings/keys) |

### 3. Drop the workflow into your repo

Copy `.github/workflows/post-on-release.yml` from this example into your own repo. That's it.

### 4. Tag a release

```bash
git tag v1.4.0
git push origin v1.4.0
```

Or use GitHub's "Create release" UI. The workflow fires on `release: published`, generates posts, and publishes them within ~30 seconds.

## What the prompt cares about

The prompt tells Claude to:

- Skip internal refactors and dependency bumps — only highlight user-facing changes
- Use platform-appropriate tone (Twitter punchy, LinkedIn professional, Bluesky casual)
- Never use buzzword openers ("Excited to announce...")
- Never invent features that aren't in the changelog

If you want to customize the prompt, fork `src/index.ts` and edit the `system` and `userMessage` strings. The prompt is intentionally short and inline so you can iterate without learning a config DSL.

## Local testing

Before tagging a release, you can dry-run against your local working copy:

```bash
cd examples/changelog-bot
npm install
DRY_RUN=1 \
  UNIPOST_API_KEY=up_live_... \
  ANTHROPIC_API_KEY=sk-ant-... \
  npx tsx src/index.ts ../../CHANGELOG.md
```

`DRY_RUN=1` calls Claude but skips the publish step, so you can review the drafts before committing to publishing them.

## Customization

The `index.ts` script is ~200 lines and intentionally hackable. Common customizations:

- **Change the prompt** — edit the `system` and `userMessage` strings
- **Change which CHANGELOG section is used** — edit `extractLatestSection`
- **Filter by tag pattern** — wrap the `main()` call in a check on `process.env.GITHUB_REF`
- **Add image attachments** — extend the `Draft` type to include `media_urls` and pass them through to UniPost
- **Use a different LLM** — swap the `Anthropic` client for OpenAI or Gemini (the prompt format is portable)

## License

MIT — same as the parent AgentPost repo.
