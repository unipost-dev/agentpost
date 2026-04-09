// Ink TUI: render per-platform preview cards with character counts.
//
// One card per draft. Color-coded character counter:
//   green   < 80% of platform max
//   yellow  80–95%
//   red     > 95% (or over the cap)
//
// The card is read-only — interaction happens in confirm.tsx.

import React from "react";
import { Box, Text } from "ink";

import type { PlatformDraft, CapabilitiesResponse } from "../types.js";

const PLATFORM_LABEL: Record<string, string> = {
  twitter: "Twitter / X",
  linkedin: "LinkedIn",
  bluesky: "Bluesky",
  threads: "Threads",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

interface PreviewProps {
  drafts: PlatformDraft[];
  capabilities: CapabilitiesResponse;
}

export function Preview({ drafts, capabilities }: PreviewProps) {
  return (
    <Box flexDirection="column" marginY={1}>
      {drafts.map((draft, i) => (
        <PreviewCard
          key={draft.account_id + i}
          draft={draft}
          capabilities={capabilities}
        />
      ))}
    </Box>
  );
}

interface PreviewCardProps {
  draft: PlatformDraft;
  capabilities: CapabilitiesResponse;
}

function PreviewCard({ draft, capabilities }: PreviewCardProps) {
  const cap = capabilities.platforms[draft.platform];
  const max = cap?.text.max_length ?? 0;
  const used = countChars(draft.platform, draft.caption);
  const ratio = max > 0 ? used / max : 0;

  let counterColor: "green" | "yellow" | "red" = "green";
  if (ratio > 0.95) counterColor = "red";
  else if (ratio > 0.8) counterColor = "yellow";

  const label = PLATFORM_LABEL[draft.platform] ?? draft.platform;
  const handle = draft.account_name ? `@${draft.account_name}` : draft.account_id;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      marginBottom={1}
    >
      <Box justifyContent="space-between">
        <Text bold>
          {label} <Text color="gray">{handle}</Text>
        </Text>
        <Text color={counterColor}>
          {used}/{max || "∞"}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text>{draft.caption}</Text>
      </Box>
    </Box>
  );
}

// countChars approximates the per-platform character count using
// the same per-platform rules as the dashboard preview page from
// Sprint 3 PR9. Twitter URLs collapse to 23 chars (t.co weighting),
// Bluesky uses grapheme count, others use UTF-16 code units.
function countChars(platform: string, text: string): number {
  if (platform === "twitter") {
    return twitterCount(text);
  }
  if (platform === "bluesky") {
    return blueskyCount(text);
  }
  return text.length;
}

const URL_REGEX =
  /\bhttps?:\/\/[^\s]+|\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|dev|app|co|ai|xyz|me)\b[^\s]*/gi;
const TWITTER_URL_WEIGHT = 23;

function twitterCount(text: string): number {
  const urlMatches = text.match(URL_REGEX) ?? [];
  const bodyWithoutURLs = text.replace(URL_REGEX, "");
  const bodyCodePoints = [...bodyWithoutURLs].length;
  return bodyCodePoints + urlMatches.length * TWITTER_URL_WEIGHT;
}

function blueskyCount(text: string): number {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
    let n = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _ of seg.segment(text)) n++;
    return n;
  }
  return [...text].length;
}
