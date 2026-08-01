import {
  createTrigger,
  Property,
  TriggerStrategy,
} from '@activepieces/pieces-framework';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { waflyAuth, WaflyAuthValue } from '../common';

export const newMessage = createTrigger({
  auth: waflyAuth,
  name: 'new_message',
  displayName: 'New Message Received',
  description:
    'Fires when the instance receives a WhatsApp message — already grouped and with voice notes transcribed.',
  type: TriggerStrategy.WEBHOOK,
  aiMetadata: {
    description:
      'Fires when a connected Wafly WhatsApp instance receives an inbound message. If the message buffer is enabled, consecutive messages from the same person arrive as one event with a "buffered" field; if transcription is enabled, voice notes arrive with their text under "transcription". The payload carries the sender phone, the message body and the instance identifier.',
  },
  props: {
    webhookSecret: Property.ShortText({
      displayName: 'Webhook Secret',
      description:
        'Optional. If your Wafly deployment signs webhooks, paste the secret here and every delivery is verified against the X-Hub-Signature-256 header. Leave empty and no signature check is performed — the flow URL is then the only thing protecting this trigger, so treat it as a secret.',
      required: false,
    }),
  },
  sampleData: {
    instanceId: 'my-instance',
    phone: '5511999999999',
    senderName: 'Maria',
    fromMe: false,
    isGroup: false,
    momment: 1754006400000,
    messageId: '3EB0C767D26B8A3B1F2A',
    text: {
      message: 'hi\nyou there?\nhow much is it?',
    },
    buffered: {
      count: 3,
      messageIds: [
        '3EB0C767D26B8A3B1F2A',
        '3EB0C767D26B8A3B1F2B',
        '3EB0C767D26B8A3B1F2C',
      ],
      waitedMs: 8012,
    },
    transcription: {
      status: 'ok',
      text: "I'd like two units, please",
      latency_ms: 1180,
    },
  },
  /**
   * Wafly has no public endpoint to register a webhook URL — it is set in the
   * dashboard, under Instance -> Webhooks. So there is nothing to subscribe or
   * unsubscribe here, and the URL is pasted by hand once. Doing it silently in
   * onEnable would be worse than doing nothing: the flow would look armed and
   * never fire.
   */
  async onEnable(context) {
    // Intentionally empty — see the note above. `context` is kept so the
    // generic parameters stay inferable from this literal.
    void context;
  },
  async onDisable(context) {
    void context;
  },
  async run(context) {
    const body = context.payload.body as Record<string, unknown> | undefined;
    if (!body) {
      return [];
    }

    // The flow webhook URL is a public endpoint: anyone who learns it can POST
    // an arbitrary body and drive the rest of the flow. Two checks, in order of
    // how much they are actually worth.

    // 1. Signature. Wafly signs every delivery with HMAC-SHA256 over the raw
    //    body, in X-Hub-Signature-256. This is the only real authentication
    //    here, and it only runs when the secret was provided.
    const secret = (context.propsValue.webhookSecret ?? '').trim();
    if (secret) {
      const headers = (context.payload.headers ?? {}) as Record<string, string>;
      const received =
        headers['x-hub-signature-256'] ?? headers['X-Hub-Signature-256'];
      const raw = context.payload.rawBody;

      // The HMAC covers the bytes as they arrived. Re-serializing the parsed
      // body reorders keys and drops whitespace, so the digest would never
      // match — and the trigger would go quiet with no explanation. Better to
      // say so than to silently drop every event.
      if (typeof raw !== 'string') {
        throw new Error(
          'Cannot verify the webhook signature: the raw request body is not available. Clear the Webhook Secret field to accept events without verification.'
        );
      }

      const expected =
        'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');

      if (!received || !timingSafeEqualString(received, expected)) {
        return [];
      }
    }

    // 2. Instance match. Not authentication — someone who knows the instance
    //    name still gets through — but it costs nothing and drops traffic that
    //    was never meant for this connection.
    const payloadInstance = body['instanceId'] ?? body['instance'];
    const connectionInstance = (context.auth as WaflyAuthValue).props.instance;
    if (
      typeof payloadInstance === 'string' &&
      payloadInstance !== connectionInstance
    ) {
      return [];
    }

    return [body];
  },
});

/** Constant-time compare, so a wrong signature cannot be guessed byte by byte. */
function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
