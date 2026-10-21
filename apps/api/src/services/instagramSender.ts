/**
 * Instagram Messaging sender (Meta Graph API).
 *
 * Instagram DM replies are sent through the same Graph endpoint as WhatsApp
 * (`/{ig-user-id}/messages`) but with `recipient` instead of `to`.
 */
export class InstagramSender {
  private readonly apiUrl = 'https://graph.facebook.com/v22.0';
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(token: string, timeoutMs = 10000) {
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  async sendTextMessage(instagramUserId: string, recipientId: string, text: string) {
    const url = `${this.apiUrl}/${instagramUserId}/messages`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: text.slice(0, 1000) },
        }),
      });

      if (!response.ok) {
        let errorBody: unknown = null;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = await response.text().catch(() => null);
        }
        console.error('Failed to send Instagram message:', JSON.stringify(errorBody));
        throw new Error(`Instagram API error: ${response.status}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}
