export class WhatsAppSender {
  private readonly apiUrl = 'https://graph.facebook.com/v22.0';
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(token: string, timeoutMs = 10000) {
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  async sendTextMessage(phoneNumberId: string, to: string, text: string) {
    const url = `${this.apiUrl}/${phoneNumberId}/messages`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: { body: text.slice(0, 4096) },
        }),
      });

      if (!response.ok) {
        let errorBody: unknown = null;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = await response.text().catch(() => null);
        }
        console.error('Failed to send WhatsApp message:', JSON.stringify(errorBody));
        throw new Error(`WhatsApp API error: ${response.status}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}
