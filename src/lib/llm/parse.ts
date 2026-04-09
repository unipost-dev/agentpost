// Shared draft parser for every LLM provider.
//
// Every provider (Anthropic, OpenAI, Gemini) is asked for the same
// JSON shape via the prompt. The shape is:
//
//   { "drafts": [{"account_id": "<id>", "caption": "<text>"}, ...] }
//
// Some providers wrap their output in markdown code fences even
// when told not to. Some return the JSON inside a longer prose
// reply (Gemini in particular). The parser here is the single
// place that handles all of those quirks so the per-provider
// modules stay focused on the API call itself.
//
// Validation rules (enforced here, not at the API level):
//
//   1. The response must parse as JSON after fence-stripping.
//   2. The top-level object must have a "drafts" array.
//   3. Every active account in the request must have a draft —
//      models occasionally skip platforms despite the prompt
//      saying "DO NOT skip". We catch that here and surface a
//      clear error so the CLI can suggest "regenerate".
//   4. Every draft must reference a valid account_id from the
//      input — models occasionally hallucinate id-shaped strings.
//
// Throwing here is fine: the CLI catches the error in post.tsx
// and renders a single-line failure message.

import type { ConnectedAccount, PlatformDraft } from "../../types.js";

export function parseDraftsResponse(
  raw: string,
  accounts: ConnectedAccount[],
): PlatformDraft[] {
  // Strip markdown fences belt-and-suspenders. The prompt tells the
  // model NOT to wrap output in fences, but every provider has been
  // observed to do it anyway under certain conditions:
  //   - Anthropic: rare, only when the user message contains code
  //   - OpenAI: rare, mostly avoided by JSON mode
  //   - Gemini: common — Gemini wraps almost everything in ```json
  const fenced = raw.trim();
  let cleaned = fenced
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  // Gemini also sometimes prefixes the JSON with a sentence like
  // "Here's the JSON you requested:" — find the first { and trim
  // anything before it as a fallback. Only do this if direct parse
  // fails so we don't mangle a perfectly valid response.
  let parsed: { drafts?: Array<{ account_id?: string; caption?: string }> };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      } catch (e) {
        throw new Error(
          `LLM returned non-JSON output. First 200 chars: ${cleaned.slice(0, 200)}`,
        );
      }
    } else {
      throw new Error(
        `LLM returned non-JSON output. First 200 chars: ${cleaned.slice(0, 200)}`,
      );
    }
  }

  if (!parsed.drafts || !Array.isArray(parsed.drafts)) {
    throw new Error('LLM response missing "drafts" array');
  }

  // Build a quick id → account lookup for both validation and the
  // display decoration step below.
  const accountIndex = new Map<string, ConnectedAccount>();
  for (const a of accounts) {
    accountIndex.set(a.id, a);
  }

  // Reject drafts that reference unknown account_ids — models
  // occasionally invent id-shaped strings that don't match anything
  // we asked about. Better to fail loudly than to silently send a
  // post to nowhere.
  for (const d of parsed.drafts) {
    if (!d.account_id || !accountIndex.has(d.account_id)) {
      throw new Error(
        `LLM hallucinated unknown account_id "${d.account_id ?? "(missing)"}". Try regenerating.`,
      );
    }
    if (typeof d.caption !== "string" || d.caption.length === 0) {
      throw new Error(
        `LLM returned an empty caption for account_id "${d.account_id}". Try regenerating.`,
      );
    }
  }

  // Active-account coverage check. The prompt says "DO NOT skip
  // platforms" but the model occasionally does anyway, particularly
  // when the user input is ambiguous about which platform fits.
  const activeAccounts = accounts.filter((a) => a.status === "active");
  const draftIDs = new Set(parsed.drafts.map((d) => d.account_id!));
  const missing = activeAccounts
    .filter((a) => !draftIDs.has(a.id))
    .map((a) => `${a.platform}/${a.account_name ?? a.id}`);
  if (missing.length > 0) {
    throw new Error(
      `LLM skipped these accounts: ${missing.join(", ")}. Try regenerating.`,
    );
  }

  // Decorate with display fields the preview UI needs.
  return parsed.drafts.map((d) => {
    const acc = accountIndex.get(d.account_id!)!;
    return {
      account_id: d.account_id!,
      caption: d.caption!,
      platform: acc.platform,
      account_name: acc.account_name ?? undefined,
    };
  });
}
