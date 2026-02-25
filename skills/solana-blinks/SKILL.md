---
name: solana-blinks-builder
description: Build Solana Actions v2 (blinks) with action chaining, rich inputs, and multi-step workflows. Create tip links, token purchases, and shareable transaction URLs that unfurl on X, Discord, and the web.
triggers: ["solana action", "solana blink", "blinks", "actions.json", "solana-action:", "ActionGetResponse", "ActionPostResponse", "ACTIONS_CORS_HEADERS", "LinkedAction", "action chaining", "solana shareable link"]
metadata: {"clawdbot":{"emoji":"🔗","homepage":"https://github.com/x4484/solana-blinks-builder"}}
---

# Solana Blinks Builder

Build shareable transaction links that work everywhere. Blinks turn Solana Actions into buttons on X, Discord, and any web surface.

## What Are Blinks?

**Actions** = API endpoints that return signable transactions
**Blinks** = Shareable URLs that unfurl Actions into interactive buttons

When someone posts a blink URL on X, wallets like Phantom render it as a button. One click → sign → done. No dApp needed.

## Quick Start (5 minutes)

### 1. Create Next.js App
```bash
npx create-next-app@latest my-blink --typescript --app
cd my-blink
npm install @solana/actions @solana/web3.js
```

### 2. Add CORS Headers
Create `app/api/actions/route.ts`:
```typescript
import { ACTIONS_CORS_HEADERS } from '@solana/actions';

export const OPTIONS = async () => {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
};
```

### 3. Create Your First Action
See templates below for tip links or token purchases.

### 4. Add actions.json
Create `public/actions.json`:
```json
{
  "rules": [
    { "pathPattern": "/api/actions/**", "apiPath": "/api/actions/**" }
  ]
}
```

### 5. Deploy & Test
```bash
vercel deploy
```
Test at: https://www.blinks.xyz/inspector

## Actions Lifecycle

```
User clicks blink → Client GETs metadata → Shows UI
                 → Client POSTs account → Gets transaction
                 → Wallet signs → Sends to chain
```

### GET Request
Returns metadata for the UI (icon, title, buttons):
```typescript
interface ActionGetResponse {
  icon: string;         // Square image URL (recommended 256x256)
  title: string;        // Bold title text
  description: string;  // Description below title
  label: string;        // Default button text
  disabled?: boolean;   // Gray out if action unavailable
  links?: {
    actions: LinkedAction[];  // Multiple button options
  };
}

interface LinkedAction {
  label: string;        // Button text
  href: string;         // Action URL (can include query params)
  type?: 'transaction' | 'message' | 'post' | 'external-link';
  parameters?: ActionParameter[];  // User input fields
}
```

### POST Request
Client sends user's wallet, you return a response:
```typescript
// Request body
interface ActionPostRequest {
  account: string;      // User's wallet public key (base58)
  type?: string;        // Request type (e.g. "transaction", "message")
  data?: unknown;       // Additional data for the request
}

// Response - union type depending on what the action does
type ActionPostResponse =
  | TransactionResponse
  | PostResponse
  | ExternalLinkResponse
  | SignMessageResponse;

interface TransactionResponse {
  type?: 'transaction';
  transaction: string;  // Base64 serialized transaction
  message?: string;     // Optional success message
  links?: { next: NextAction };  // Action chaining
}

interface PostResponse {
  type: 'post';
  message?: string;     // Message to show user
  links?: { next: NextAction };
}

interface ExternalLinkResponse {
  type: 'external-link';
  externalLink: string; // URL to open in browser
  links?: { next: NextAction };
}

interface SignMessageResponse {
  type: 'message';
  data: string;         // Message for wallet to sign (not a tx)
  state?: string;       // State token to pass back
  links?: { next: NextAction };
}
```

Most blinks use `TransactionResponse` (the default when `type` is omitted).

### Action Chaining (Multi-Step Workflows)

Actions can chain into follow-up steps using `links.next` in the POST response. This is a flagship v2 feature for multi-step workflows (e.g., approve then swap, fill form then confirm).

```typescript
// Two forms of next action:
type NextAction = PostNextActionLink | InlineNextActionLink;

// Server provides a URL to GET the next action from
interface PostNextActionLink {
  type: 'post';
  href: string;  // URL to POST to for next action
}

// Server provides the next action inline (no extra request)
interface InlineNextActionLink {
  type: 'inline';
  action: ActionGetResponse;  // Full action metadata inline
}

// Terminal state - signals the workflow is complete
interface CompletedAction {
  type: 'completed';
  icon: string;
  title: string;
  description: string;
  label: string;        // Final button text (disabled)
}
```

Example: a two-step swap that first approves, then swaps:
```typescript
// POST /api/actions/swap (step 1: approve)
return Response.json({
  transaction: approvalTxBase64,
  message: 'Approve token spending',
  links: {
    next: {
      type: 'post',
      href: '/api/actions/swap/execute',
    },
  },
});
```

### Rich Input Types

Actions support typed input fields beyond plain text. Use `ActionParameterType` to
specify the input kind, and `options` for select/radio/checkbox:

```typescript
type ActionParameterType =
  | 'text' | 'email' | 'url' | 'number'
  | 'date' | 'datetime-local' | 'textarea'
  | 'select' | 'radio' | 'checkbox';

interface TypedActionParameter {
  name: string;
  label: string;
  required?: boolean;
  type?: ActionParameterType;  // Defaults to 'text'
  // For select, radio, checkbox:
  options?: ActionParameterOption[];
}

interface ActionParameterOption {
  label: string;  // Display text
  value: string;  // Value sent in query param
  selected?: boolean;  // Pre-selected default
}
```

Example with a dropdown:
```typescript
{
  label: 'Donate',
  href: '/api/actions/donate?token={token}&amount={amount}',
  parameters: [
    {
      name: 'token',
      label: 'Token',
      type: 'select',
      required: true,
      options: [
        { label: 'SOL', value: 'SOL', selected: true },
        { label: 'USDC', value: 'USDC' },
      ],
    },
    {
      name: 'amount',
      label: 'Amount',
      type: 'number',
      required: true,
    },
  ],
}
```

## Template: Tip Link

Send SOL to a creator with preset amounts.

**File:** `app/api/actions/tip/route.ts`

```typescript
import {
  ActionGetResponse,
  ActionPostResponse,
  ACTIONS_CORS_HEADERS,
} from '@solana/actions';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

// Configure these
const RECIPIENT = new PublicKey('YOUR_WALLET_ADDRESS');
const RPC_URL = 'https://api.mainnet-beta.solana.com';

export const OPTIONS = async () => {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
};

export async function GET(req: Request) {
  const response: ActionGetResponse = {
    icon: 'https://yoursite.com/avatar.png',
    title: 'Tip the Creator',
    description: 'Send SOL to support this creator',
    label: 'Send Tip',
    links: {
      actions: [
        { label: '0.1 SOL', href: '/api/actions/tip?amount=0.1' },
        { label: '0.5 SOL', href: '/api/actions/tip?amount=0.5' },
        { label: '1 SOL', href: '/api/actions/tip?amount=1' },
      ],
    },
  };
  return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
}

export async function POST(req: Request) {
  const body = await req.json();
  const sender = new PublicKey(body.account);
  
  const url = new URL(req.url);
  const amount = parseFloat(url.searchParams.get('amount') || '0.1');
  
  const connection = new Connection(RPC_URL);
  const { blockhash } = await connection.getLatestBlockhash();
  
  const transaction = new Transaction({
    recentBlockhash: blockhash,
    feePayer: sender,
  }).add(
    SystemProgram.transfer({
      fromPubkey: sender,
      toPubkey: RECIPIENT,
      lamports: Math.floor(amount * LAMPORTS_PER_SOL),
    })
  );
  
  const response: ActionPostResponse = {
    transaction: transaction.serialize({ 
      requireAllSignatures: false 
    }).toString('base64'),
    message: `Sending ${amount} SOL tip!`,
  };
  
  return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
}
```

## Template: Token Purchase

Let users buy your SPL token with SOL.

**File:** `app/api/actions/buy/route.ts`

```typescript
import {
  ActionGetResponse,
  ActionPostResponse,
  ACTIONS_CORS_HEADERS,
} from '@solana/actions';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
} from '@solana/spl-token';

// Configure these
const TOKEN_MINT = new PublicKey('YOUR_TOKEN_MINT');
const TREASURY = new PublicKey('YOUR_TREASURY_WALLET');
const PRICE_PER_TOKEN = 0.001; // SOL per token
const RPC_URL = 'https://api.mainnet-beta.solana.com';

export const OPTIONS = async () => {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
};

export async function GET(req: Request) {
  const response: ActionGetResponse = {
    icon: 'https://yoursite.com/token-logo.png',
    title: 'Buy $TOKEN',
    description: `Purchase tokens at ${PRICE_PER_TOKEN} SOL each`,
    label: 'Buy Tokens',
    links: {
      actions: [
        { label: '100 tokens', href: '/api/actions/buy?amount=100' },
        { label: '500 tokens', href: '/api/actions/buy?amount=500' },
        { label: '1000 tokens', href: '/api/actions/buy?amount=1000' },
      ],
    },
  };
  return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
}

export async function POST(req: Request) {
  const body = await req.json();
  const buyer = new PublicKey(body.account);
  
  const url = new URL(req.url);
  const tokenAmount = parseInt(url.searchParams.get('amount') || '100');
  const solCost = tokenAmount * PRICE_PER_TOKEN;
  
  const connection = new Connection(RPC_URL);
  const { blockhash } = await connection.getLatestBlockhash();
  
  // Get ATAs
  const buyerAta = await getAssociatedTokenAddress(TOKEN_MINT, buyer);
  const treasuryAta = await getAssociatedTokenAddress(TOKEN_MINT, TREASURY);
  
  const transaction = new Transaction({
    recentBlockhash: blockhash,
    feePayer: buyer,
  });
  
  // Create buyer's ATA if needed
  try {
    await getAccount(connection, buyerAta);
  } catch {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        buyer,      // payer
        buyerAta,   // ata
        buyer,      // owner
        TOKEN_MINT  // mint
      )
    );
  }
  
  // Payment: SOL from buyer to treasury
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: buyer,
      toPubkey: TREASURY,
      lamports: Math.floor(solCost * LAMPORTS_PER_SOL),
    })
  );
  
  // Token transfer: tokens from treasury to buyer
  // Note: Treasury must pre-sign or use a PDA
  // This example assumes treasury is a hot wallet that will co-sign
  transaction.add(
    createTransferInstruction(
      treasuryAta,
      buyerAta,
      TREASURY,
      tokenAmount * (10 ** 9), // Assuming 9 decimals
    )
  );
  
  const response: ActionPostResponse = {
    transaction: transaction.serialize({ 
      requireAllSignatures: false 
    }).toString('base64'),
    message: `Purchasing ${tokenAmount} tokens for ${solCost} SOL`,
  };
  
  return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
}
```

**WARNING: This template WILL NOT WORK as-is.** The `createTransferInstruction` requires the treasury wallet to sign the transaction, but in a blink only the user's wallet signs. The transaction will fail at submission. To make token purchases work, either:
- Use a **Jupiter swap** so the user swaps SOL for your token through a DEX pool (no treasury signing needed)
- Use a **PDA-based program** where tokens are held in a PDA your on-chain program controls, and the program signs via CPI
- Use a **co-signing backend** that holds the treasury key and partially signs before returning the transaction

## Configuration: actions.json

Place at your domain root (`public/actions.json` in Next.js):

```json
{
  "rules": [
    {
      "pathPattern": "/api/actions/tip",
      "apiPath": "/api/actions/tip"
    },
    {
      "pathPattern": "/api/actions/buy",
      "apiPath": "/api/actions/buy"
    }
  ]
}
```

This tells clients which URLs are Actions.

## Testing

### Blinks Inspector
https://www.blinks.xyz/inspector

1. Enter your Action URL
2. Check GET response renders correctly
3. Test POST with a wallet
4. Verify transaction structure

### Local Testing
```bash
# Test GET
curl http://localhost:3000/api/actions/tip

# Test POST
curl -X POST http://localhost:3000/api/actions/tip?amount=0.1 \
  -H "Content-Type: application/json" \
  -d '{"account": "YourWalletPublicKey"}'
```

## Deployment

### Vercel (Recommended)
```bash
npm install -g vercel
vercel deploy --prod
```

### Requirements
- HTTPS (required for Actions)
- Proper CORS headers
- `actions.json` at domain root

## Dialect Registry (Verification)

To unfurl on X without warnings, register at: https://dial.to/register

**What they check:**
- Valid actions.json
- Working GET/POST endpoints
- Reasonable transaction contents
- No malicious behavior

**Timeline:** Usually 1-3 business days

## Common Gotchas

### 1. CORS Errors
Always return `ACTIONS_CORS_HEADERS` on GET, POST, and OPTIONS.

### 2. Transaction Serialization
```typescript
// Wrong - requires signatures
transaction.serialize()

// Right - for unsigned transactions
transaction.serialize({ requireAllSignatures: false })
```

### 3. Missing Blockhash
Always fetch a recent blockhash:
```typescript
const { blockhash } = await connection.getLatestBlockhash();
transaction.recentBlockhash = blockhash;
```

### 4. Fee Payer Not Set
The user's wallet must be the fee payer:
```typescript
transaction.feePayer = new PublicKey(body.account);
```

### 5. Icon Not Loading
- Must be HTTPS
- Recommended: 256x256 PNG
- Host on same domain or reliable CDN

### 6. Actions.json Not Found
- Must be at domain root: `https://yourdomain.com/actions.json`
- In Next.js: `public/actions.json`

## Note on @solana/web3.js vs @solana/kit

The templates in this skill use `@solana/web3.js` v1, which is on **maintenance mode** (security fixes only). The successor is `@solana/kit` (formerly `@solana/web3.js` v2) -- a full rewrite with tree-shaking, smaller bundles, and modern APIs. The v1 code here still works and most tutorials reference it, but for new projects consider using `@solana/kit`.

## References

- [Solana Actions Docs](https://solana.com/docs/advanced/actions)
- [@solana/actions SDK](https://www.npmjs.com/package/@solana/actions)
- [Official Examples](https://github.com/solana-developers/solana-actions)
- [Blinks Inspector](https://www.blinks.xyz/inspector)
- [Dialect Registry](https://dial.to/register)
- [Awesome Blinks](https://github.com/solana-developers/awesome-blinks)
- [@solana/kit (web3.js v2)](https://www.npmjs.com/package/@solana/kit)
