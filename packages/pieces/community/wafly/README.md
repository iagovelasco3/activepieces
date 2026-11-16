# Wafly

WhatsApp API built for automations and AI agents.

Nobody writes a paragraph on WhatsApp. People send `hi`, then `you there?`, then
`how much is it?` — three separate webhooks, so an agent replies three times and
the first two replies were written before the person finished asking. Half the
time the real question arrives as a voice note, which an LLM cannot hear at all.

Wafly solves both in the pipe: consecutive messages from the same person are
delivered as **one** event, and voice notes arrive already transcribed.

## Actions

| Action | What it does |
|---|---|
| Send Text Message | Text to a number or group |
| Send Media | Image, video, audio or PDF |
| Send Poll | Poll with two or more options |
| Create Group | New group with participants |
| Check Numbers on WhatsApp | Which numbers in a list have WhatsApp |
| Get Instance Status | Whether the instance is connected |
| Configure Message Buffer | Group split messages into one event |
| Configure Audio Transcription | Transcribe incoming voice notes |

The last two are **instance-level settings** — run once, not per message.

## Trigger

**New Message Received** — fires on every inbound message, already grouped and
transcribed when those settings are on.

> Wafly exposes a webhook configuration API. Setup stays manual so enabling a
> flow cannot replace an existing callback. After enabling the trigger, copy
> the webhook URL from Activepieces and paste it in the Wafly dashboard under
> **Instance → Webhooks**. It is a one-time step.

### Securing the trigger

The flow webhook URL is a public endpoint. Anyone who learns it can POST a body
and drive the rest of your flow. Two layers, and it is worth being clear about
what each one is worth:

- **Webhook Secret** (optional field on the trigger). When filled, every
  delivery is verified with HMAC-SHA256 against the `X-Hub-Signature-256`
  header, compared in constant time. This is real authentication — a forged
  request without the secret is dropped.
- **Instance match** (always on). Events with a missing, invalid, conflicting or different `instanceId`/`instance`
  are discarded. The ID must exactly match the connection. This is *not* authentication: someone who knows your
  public instance ID still gets through. It only removes stray traffic.

**With no secret configured, the URL itself is the only thing protecting the
trigger — treat it as a credential.** If your Wafly deployment does not yet
expose a per-instance webhook secret, leave the field empty and keep the URL
private.

## Connection

Get these from [wafly.com.br](https://wafly.com.br):

| Field | Where |
|---|---|
| Base URL | `https://wafly.com.br/api-bridge-whats` (default) |
| Client Token | Dashboard → Security |
| Instance | Public Instance ID from the dashboard |
| Instance Token | That instance's token |
| OpenAI API Key | Optional — only for Configure Audio Transcription |

The OpenAI key sits on the connection rather than on the action so it is stored
encrypted and shown masked. Leave it empty if you do not use transcription.

Free 3-day trial, no card. Connect by QR Code.

## Audio transcription uses your own OpenAI key

The cost lands on your own OpenAI account and Wafly charges nothing on top. The
key is stored encrypted and never returned by the API. Set a monthly cap so it
cannot run away — and if the cap is hit or the provider refuses, **the message
still arrives**, only without the transcript. Nothing is dropped.

## Connection validation and version 0.1.1

Connection validation reads saved webhook configuration, without querying the
WhatsApp session. This checks the instance ID/token and the presence of the
Client-Token header; the current endpoint does **not** verify that header value
against the account. A saved connection is not proof of complete account
authentication or of message delivery.

Version 0.1.1 rejects events missing the exact configured instance identifier.
Existing installations need to upgrade to receive the correction. Requests keep
TLS verification enabled, do not follow redirects or retry automatically, and
redact provider errors. This package is independently distributed on npm;
publication does not place it in the standard Activepieces Cloud catalog.
