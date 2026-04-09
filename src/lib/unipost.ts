// Thin REST client for the UniPost API. Three endpoints land here:
//
//   GET  /v1/social-accounts                    — list connected accounts
//   GET  /v1/platforms/capabilities             — per-platform rules for the prompt
//   POST /v1/social-posts                       — publish
//
// Designed to be a single file. If we ever extract this into an
// official @unipost/sdk package, the surface stays the same.

import type {
  ConnectedAccount,
  CapabilitiesResponse,
  PlatformDraft,
  PublishResult,
} from "../types.js";

export class UniPostClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseURL: string = "https://api.unipost.dev",
  ) {}

  async listAccounts(): Promise<ConnectedAccount[]> {
    const res = await this.request<{ data: ConnectedAccount[] }>("/v1/social-accounts");
    return res.data;
  }

  async getCapabilities(): Promise<CapabilitiesResponse> {
    const res = await this.request<{ data: CapabilitiesResponse }>("/v1/platforms/capabilities");
    return res.data;
  }

  async createPost(drafts: PlatformDraft[]): Promise<{ id: string; status: string; results: PublishResult[] }> {
    // Strip the display-only fields (platform, account_name) before
    // sending — UniPost doesn't expect them on the platform_posts[]
    // wire shape.
    const platform_posts = drafts.map((d) => {
      const wire: Record<string, unknown> = {
        account_id: d.account_id,
        caption: d.caption,
      };
      if (d.first_comment) wire.first_comment = d.first_comment;
      if (d.thread_position) wire.thread_position = d.thread_position;
      return wire;
    });
    const res = await this.request<{ data: { id: string; status: string; results: PublishResult[] } }>(
      "/v1/social-posts",
      {
        method: "POST",
        body: JSON.stringify({ platform_posts }),
      },
    );
    return res.data;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "User-Agent": "agentpost-cli",
        ...options.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      let message = `${res.status} ${res.statusText}`;
      try {
        const body = JSON.parse(text);
        if (body.error?.message) message = body.error.message;
      } catch {
        message = text || message;
      }
      throw new Error(`UniPost API error (${path}): ${message}`);
    }
    return (await res.json()) as T;
  }
}
