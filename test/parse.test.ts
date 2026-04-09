// Tests for the shared LLM-response parser. Provider-agnostic — the
// same parser handles output from Anthropic, OpenAI, and Gemini, so
// every quirk one provider has to be tested here once and lives in
// the shared code path.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseDraftsResponse } from "../src/lib/llm/parse.ts";
import type { ConnectedAccount } from "../src/types.ts";

const accounts: ConnectedAccount[] = [
  { id: "t1", platform: "twitter", account_name: "@example", status: "active", connection_type: "managed" },
  { id: "l1", platform: "linkedin", account_name: "Example", status: "active", connection_type: "managed" },
];

describe("parseDraftsResponse", () => {
  it("parses a clean JSON response", () => {
    const raw = JSON.stringify({
      drafts: [
        { account_id: "t1", caption: "tweet text" },
        { account_id: "l1", caption: "longer post" },
      ],
    });
    const got = parseDraftsResponse(raw, accounts);
    assert.equal(got.length, 2);
    assert.equal(got[0]!.platform, "twitter");
    assert.equal(got[0]!.caption, "tweet text");
    assert.equal(got[1]!.platform, "linkedin");
  });

  it("strips markdown fences (Gemini quirk)", () => {
    const raw = '```json\n{"drafts":[{"account_id":"t1","caption":"a"},{"account_id":"l1","caption":"b"}]}\n```';
    const got = parseDraftsResponse(raw, accounts);
    assert.equal(got.length, 2);
  });

  it("strips fences without language tag", () => {
    const raw = '```\n{"drafts":[{"account_id":"t1","caption":"a"},{"account_id":"l1","caption":"b"}]}\n```';
    const got = parseDraftsResponse(raw, accounts);
    assert.equal(got.length, 2);
  });

  it("recovers when prose precedes the JSON (Gemini quirk)", () => {
    const raw = 'Here is your JSON:\n{"drafts":[{"account_id":"t1","caption":"a"},{"account_id":"l1","caption":"b"}]}';
    const got = parseDraftsResponse(raw, accounts);
    assert.equal(got.length, 2);
  });

  it("throws on completely non-JSON output", () => {
    assert.throws(
      () => parseDraftsResponse("I'm sorry, I can't help with that", accounts),
      /non-JSON/,
    );
  });

  it("throws when drafts array is missing", () => {
    assert.throws(
      () => parseDraftsResponse('{"foo":"bar"}', accounts),
      /missing "drafts" array/,
    );
  });

  it("throws when an account is skipped (model didn't follow DO NOT skip)", () => {
    const raw = JSON.stringify({
      drafts: [{ account_id: "t1", caption: "only twitter" }],
    });
    assert.throws(
      () => parseDraftsResponse(raw, accounts),
      /skipped these accounts/,
    );
  });

  it("throws when the model invents an unknown account_id", () => {
    const raw = JSON.stringify({
      drafts: [
        { account_id: "t1", caption: "ok" },
        { account_id: "l1", caption: "ok" },
        { account_id: "fake-id", caption: "hallucinated" },
      ],
    });
    assert.throws(
      () => parseDraftsResponse(raw, accounts),
      /hallucinated unknown account_id/,
    );
  });

  it("throws when a caption is empty", () => {
    const raw = JSON.stringify({
      drafts: [
        { account_id: "t1", caption: "" },
        { account_id: "l1", caption: "ok" },
      ],
    });
    assert.throws(
      () => parseDraftsResponse(raw, accounts),
      /empty caption/,
    );
  });

  it("decorates drafts with the account platform and name for the preview UI", () => {
    const raw = JSON.stringify({
      drafts: [
        { account_id: "t1", caption: "tweet" },
        { account_id: "l1", caption: "post" },
      ],
    });
    const got = parseDraftsResponse(raw, accounts);
    assert.equal(got[0]!.account_name, "@example");
    assert.equal(got[1]!.account_name, "Example");
  });

  it("ignores disconnected accounts in the coverage check", () => {
    const mixed: ConnectedAccount[] = [
      ...accounts,
      { id: "b1", platform: "bluesky", account_name: null, status: "disconnected", connection_type: "managed" },
    ];
    // Only t1 + l1 are active, so the model only needs to draft those.
    const raw = JSON.stringify({
      drafts: [
        { account_id: "t1", caption: "tweet" },
        { account_id: "l1", caption: "post" },
      ],
    });
    const got = parseDraftsResponse(raw, mixed);
    assert.equal(got.length, 2);
  });
});
