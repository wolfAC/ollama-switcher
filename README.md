# ollama-switcher

Juggle several free [ollama.com](https://ollama.com) cloud accounts so you can keep
using cloud models (e.g. `gemma3:27b-cloud`) after one account hits its quota.

It checks each account's remaining quota via its API key, tells you which one to
use, and signs the `ollama` CLI into it — using your **real Firefox** so the
ollama.com Cloudflare check passes (automated browsers get blocked).

## Setup

1. Put your accounts in `key.ts` (gitignored):

   ```ts
   const accounts: Account[] = [
     { email: "you@example.com", key: "your-api-key", password: "your-password" },
   ];
   export default accounts;
   ```

   - `key` — from ollama.com → Settings → API keys. Used to read quota.
   - `password` — optional; only used to copy to your clipboard during the
     one-time login so you can paste instead of typing.

2. Log in once per account (opens a Firefox window per account):

   ```sh
   pnpm login
   ```

   Sign in (paste the password from your clipboard, solve the human check),
   then close the window. Each account gets its own persistent Firefox profile,
   so it stays logged in.

## Daily use

| Command       | What it does |
|---------------|--------------|
| `pnpm status` | Show every account's quota and which one is the best pick. |
| `pnpm auto`   | If the active account is exhausted, switch to the best available one. |
| `pnpm switch <email>` | Force-switch to a specific account. |
| `pnpm watch`  | Re-run `auto` every few minutes (`WATCH_INTERVAL_MIN`, default 5). |

When a switch happens, a Firefox window opens on the device-approval page —
just click **Continue**. If that account was already logged in (the usual case),
that single click is all it takes; the CLI detects the sign-in and finishes.

## How it works

- Quota is read over HTTP with each account's API key (`src/api.ts`).
- Switching runs `ollama signout` + `ollama signin`, grabs the device-connect
  URL, and opens it in that account's Firefox profile (`src/switch.ts`). The
  approval page is on an already-authenticated domain, so there's no Cloudflare
  challenge there — only the one-time login form has one, which real Firefox clears.
- `.ollama-active.json` records which account the current ollama session belongs to.
