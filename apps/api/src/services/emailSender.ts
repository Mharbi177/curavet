export class EmailSender {
  private readonly apiUrl = 'https://api.sendgrid.com/v3/mail/send';
  private readonly timeoutMs: number;

  constructor(apiKey: string, timeoutMs = 10000) {
    this.timeoutMs = timeoutMs;
    this.apiKey = apiKey;
  }

  private readonly apiKey: string;

  async sendEmail(to: string, subject: string, text: string, html: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: to }]
          }],
          from: { email: 'no-reply@glambot.io' },
          subject,
          content: [
            { type: 'text/plain', text },
            { type: 'text/html', html }
          ]
        }),
      });

      if (!response.ok) {
        let errorBody: unknown = null;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = await response.text().catch(() => null);
        }
        console.error('Failed to send email:', JSON.stringify(errorBody));
        throw new Error(`SendGrid API error: ${response.status}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}