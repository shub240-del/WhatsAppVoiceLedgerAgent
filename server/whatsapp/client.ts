import type { WhatsAppConfig } from "../config";
import { UnusableAudio } from "../agent/errors";
import { MAX_AUDIO_BYTES } from "../audio";

export interface WhatsAppGateway {
  fetchMedia(mediaId: string): Promise<{ bytes: Uint8Array; mimeType: string }>;
  sendText(to: string, body: string, options?: { replyTo?: string }): Promise<{ messageId: string }>;
}

export class WhatsAppHttpError extends Error {
  constructor(public status: number, public code: number | null, public retryable: boolean) {
    super(`WhatsApp API error ${status}${code ? ` (code ${code})` : ""}`);
    this.name = "WhatsAppHttpError";
  }
}

type FetchFn = typeof fetch;
// Meta serves media from these hosts; never send the bearer token anywhere else.
const MEDIA_HOSTS = [".fbsbx.com", ".facebook.com", ".fbcdn.net", ".whatsapp.net"];

export class MetaWhatsAppClient implements WhatsAppGateway {
  private base: string;
  constructor(private config: WhatsAppConfig, private fetchImpl: FetchFn = fetch, private timeoutMs = 10_000) {
    this.base = `https://graph.facebook.com/${config.graphVersion}`;
  }

  private async request(url: string, init: RequestInit = {}) {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        ...init,
        headers: { Authorization: `Bearer ${this.config.accessToken}`, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new WhatsAppHttpError(0, null, true);
    }
    if (!response.ok) {
      let code: number | null = null;
      try { code = ((await response.json()) as { error?: { code?: number } }).error?.code ?? null; } catch { /* non-JSON error */ }
      // 429, 5xx and Meta throughput code 130429 are transient; everything else is permanent.
      throw new WhatsAppHttpError(response.status, code, response.status === 429 || response.status >= 500 || code === 130429);
    }
    return response;
  }

  async fetchMedia(mediaId: string) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(mediaId)) throw new UnusableAudio("invalid_media_id");
    const meta = (await (await this.request(`${this.base}/${mediaId}`)).json()) as { url?: string; mime_type?: string; file_size?: number };
    if (!meta.url || !meta.mime_type) throw new UnusableAudio("missing_media");
    if ((meta.file_size ?? 0) > MAX_AUDIO_BYTES) throw new UnusableAudio("too_large");
    const url = new URL(meta.url);
    if (url.protocol !== "https:" || !MEDIA_HOSTS.some((h) => url.hostname.endsWith(h))) throw new UnusableAudio("untrusted_media_host");
    const response = await this.request(url.toString());
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_AUDIO_BYTES) throw new UnusableAudio("too_large");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_AUDIO_BYTES) throw new UnusableAudio("too_large");
    return { bytes, mimeType: meta.mime_type };
  }

  private async send(payload: Record<string, unknown>) {
    const response = await this.request(`${this.base}/${this.config.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...payload }),
    });
    const body = (await response.json()) as { messages?: { id?: string }[] };
    const messageId = body.messages?.[0]?.id;
    if (!messageId) throw new WhatsAppHttpError(response.status, null, false);
    return { messageId };
  }

  sendText(to: string, text: string, options: { replyTo?: string } = {}) {
    return this.send({
      to: to.replace(/^\+/, ""), type: "text", text: { preview_url: false, body: text.slice(0, 4096) },
      ...(options.replyTo ? { context: { message_id: options.replyTo } } : {}),
    });
  }

  sendTemplate(to: string, name: string, languageCode: string, components: unknown[] = []) {
    return this.send({ to: to.replace(/^\+/, ""), type: "template", template: { name, language: { code: languageCode }, components } });
  }

  async uploadMedia(bytes: Uint8Array, mimeType: string) {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mimeType);
    form.append("file", new Blob([bytes], { type: mimeType }), "audio.ogg");
    const response = await this.request(`${this.base}/${this.config.phoneNumberId}/media`, { method: "POST", body: form });
    const id = ((await response.json()) as { id?: string }).id;
    if (!id) throw new WhatsAppHttpError(response.status, null, false);
    return { mediaId: id };
  }

  sendAudio(to: string, mediaId: string) {
    return this.send({ to: to.replace(/^\+/, ""), type: "audio", audio: { id: mediaId } });
  }
}
