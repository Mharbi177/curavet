export class SmsSender {
  private readonly apiUrl = 'https://api.twilio.com/2010-04-01/Accounts';
  private readonly timeoutMs: number;

  constructor(authToken: string, timeoutMs = 10000) {
    this.timeoutMs = timeoutMs;
    this.apiUrl += ''; // Will be constructed per request
  }

  async sendTextMessage(to: string, message: string) {
    const url = `${this.apiUrl}/Messages.json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        auth: {
          username: 'AC${process.env.TWILIO_ACCOUNT_SID}',
          password: this.token,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: to,
          Body: message.slice(0, 1600), // SMS character limit
        }),
      });

      if (!response.ok) {
        let errorBody: unknown = null;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = await response.text().catch(() => null);
        }
        console.error('Failed to send SMS:', JSON.stringify(errorBody));
        throw new Error(`Twilio SMS error: ${response.status}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}