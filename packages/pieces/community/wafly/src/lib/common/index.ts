import { PieceAuth, Property } from '@activepieces/pieces-framework';
import {
  HttpMethod,
  HttpMessageBody,
  QueryParams,
} from '@activepieces/pieces-common';

/** Kept in sync with package.json by hand; see the note in the n8n node. */
const PIECE_VERSION = '0.1.1';

/**
 * The four fields as configured in the connection. Note that a CustomAuth
 * connection hands them over nested under `.props`, never at the top level.
 */
export type WaflyCredentials = {
  baseUrl: string;
  clientToken: string;
  instance: string;
  token: string;
  openaiApiKey?: string;
};

export type WaflyAuthValue = { props: WaflyCredentials };

export const waflyAuth = PieceAuth.CustomAuth({
  description: `Get these from the Wafly dashboard at https://wafly.com.br — **Client Token** lives under Security, and **Instance** and **Token** under the instance you want to use.`,
  required: true,
  props: {
    baseUrl: Property.ShortText({
      displayName: 'Base URL',
      description: 'Leave the default unless you run a dedicated Wafly host.',
      required: true,
      defaultValue: 'https://wafly.com.br/api-bridge-whats',
    }),
    clientToken: PieceAuth.SecretText({
      displayName: 'Client Token',
      description: 'Account-wide token, sent as the Client-Token header.',
      required: true,
    }),
    instance: Property.ShortText({
      displayName: 'Instance',
      description: 'Public Instance ID from the Wafly dashboard.',
      required: true,
    }),
    token: PieceAuth.SecretText({
      displayName: 'Instance Token',
      description: 'Token of that specific instance.',
      required: true,
    }),
    // Only the transcription action uses this, but the framework has no secret
    // field for action props — secrets belong to the connection, where the
    // value is stored encrypted and shown masked. A plain text prop would put
    // an OpenAI key in the clear inside the flow.
    openaiApiKey: PieceAuth.SecretText({
      displayName: 'OpenAI API Key (optional)',
      description:
        'Only needed for Configure Audio Transcription. The cost lands on your own OpenAI account; Wafly adds nothing. Leave empty if you do not use transcription, or to keep the key already stored in Wafly.',
      required: false,
    }),
  },
  validate: async ({ auth }) => {
    try {
      // Asymmetry in the framework worth knowing about: `validate` receives the
      // connection fields flat, while `run` receives them nested under `.props`.
      // Wrapping here keeps waflyApiCall with a single shape to reason about.
      await waflyApiCall({
        auth: { props: auth },
        method: HttpMethod.GET,
        resourceUri: '/webhook',
      });
      return { valid: true };
    } catch {
      return {
        valid: false,
        error:
          'Could not read the instance configuration. Check the public instance ID and instance token, and provide the Client Token header.',
      };
    }
  },
});

/**
 * Every instance-scoped Wafly route lives under
 * /instances/{instance}/token/{token}, with the account-wide Client-Token in
 * the header. Keeping the URL assembly here means no action can accidentally
 * leak the instance token into a log line or an error message.
 */
export async function waflyApiCall<T extends HttpMessageBody>({
  auth,
  method,
  resourceUri,
  body,
  queryParams,
}: {
  auth: WaflyAuthValue;
  method: HttpMethod;
  resourceUri: string;
  body?: unknown;
  queryParams?: QueryParams;
}): Promise<T> {
  const { baseUrl, instance, token, clientToken } = auth.props;
  const root = baseUrl.replace(/\/$/, '');
  const basePath = `/instances/${encodeURIComponent(
    instance
  )}/token/${encodeURIComponent(token)}`;

  // Use native fetch: the monorepo HTTP helper changes process-wide TLS
  // verification and logs provider error bodies. Neither belongs in a connector.
  try {
    const url = new URL(`${root}${basePath}${resourceUri}`);
    for (const [key, value] of Object.entries(queryParams ?? {})) {
      url.searchParams.set(key, value);
    }
    const response = await fetch(url, {
      method,
      headers: {
        'Client-Token': clientToken,
        'Content-Type': 'application/json',
        'User-Agent': `activepieces-piece-wafly/${PIECE_VERSION}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      throw new Error('Wafly request failed. Check credentials and instance configuration.');
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  } catch {
    // Never expose token-bearing URLs, provider bodies or credentials in errors.
    throw new Error('Wafly request failed. Check credentials and instance configuration.');
  }
}

/**
 * Group identifiers travel in the same field as phone numbers and must survive
 * untouched: either the JID form ("120363...@g.us") or the legacy form, which
 * is a long creator-number-plus-timestamp pair joined by a hyphen.
 *
 * A hyphen alone cannot mean "group" — "+55 11 99999-9999" is how people
 * actually type a Brazilian number, and stripping that check is what makes the
 * difference between a delivered message and a rejected recipient.
 */
const GROUP_ID = /@|^\d{15,}-\d+$/;

/**
 * Wafly wants a plain international number (e.g. 5511999999999), so a pasted
 * "+55 (11) 99999-9999" is cleaned up before sending.
 */
export function normalizePhone(recipient: string): string {
  const value = recipient.trim();
  if (GROUP_ID.test(value)) {
    return value;
  }
  return value.replace(/\D/g, '');
}
