// Ink TUI: render per-platform preview cards with character counts,
// grouped by Profile.
//
// Color-coded character counter:
//   green   < 80% of platform max
//   yellow  80–95%
//   red     > 95% (or over the cap)

import React from "react";
import { Box, Text } from "ink";

import type { DraftWithMeta, CapabilitiesResponse } from "../types.js";

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
  drafts: DraftWithMeta[];
  capabilities: CapabilitiesResponse;
}

export function Preview({ drafts, capabilities }: PreviewProps) {
  // Group drafts by profile_name for display
  const byProfile = new Map<string, DraftWithMeta[]>();
  for (const draft of drafts) {
    const key = draft.profile_name ?? "Default";
    if (!byProfile.has(key)) byProfile.set(key, []);
    byProfile.get(key)!.push(draft);
  }

  const showProfileHeaders = byProfile.size > 1 ||
    (byProfile.size === 1 && !byProfile.has("Default"));

  return (
    <Box flexDirection="column" marginY={1}>
      {[...byProfile.entries()].map(([profileName, profileDrafts]) => (
        <Box key={profileName} flexDirection="column">
          {showProfileHeaders && (
            <Box marginBottom={1}>
              <Text color="gray">{"─── "}</Text>
              <Text bold>Profile: {profileName}</Text>
              <Text color="gray">{" ───────────────────────────────"}</Text>
            </Box>
          )}
          {profileDrafts.map((draft, i) => (
            <PreviewCard
              key={draft.accountId + i}
              draft={draft}
              capabilities={capabilities}
            />
          ))}
        </Box>
      ))}
    </Box>
  );
}

interface PreviewCardProps {
  draft: DraftWithMeta;
  capabilities: CapabilitiesResponse;
}

function PreviewCard({ draft, capabilities }: PreviewCardProps) {
  const cap = capabilities.platforms[draft.platform];
  const max = cap?.text.max_length ?? 0;
  const used = countChars(draft.platform, draft.caption ?? "");
  const ratio = max > 0 ? used / max : 0;

  let counterColor: "green" | "yellow" | "red" = "green";
  if (ratio > 0.95) counterColor = "red";
  else if (ratio > 0.8) counterColor = "yellow";

  const label = PLATFORM_LABEL[draft.platform] ?? draft.platform;
  const handle = draft.account_name ? `@${draft.account_name}` : draft.accountId;

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

function countChars(platform: string, text: string): number {
  if (platform === "twitter") return twitterCount(text);
  if (platform === "bluesky") return blueskyCount(text);
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
