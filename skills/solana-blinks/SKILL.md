---
name: solana-blinks-builder
description: Build Solana Actions (blinks) that unfurl into interactive transactions on X, Discord, and the web. Create tip links, token purchase buttons, and shareable transaction URLs. For intermediate Solana devs who know web3.js but are new to the Actions spec.
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
    actions: Array<{
      label: string;    // Button text
      href: string;     // URL with params
    }>;
  };
}
```

### POST Request
Client sends user's wallet, you return a transaction:
```typescript
// Request body
{ "account": "UserWalletPublicKey..." }

// Response
interface ActionPostResponse {
  transaction: string;  // Base64 serialized transaction
  message?: string;     // Optional success message
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

**⚠️ Important:** The token purchase example requires the treasury to co-sign. For production, use a PDA-controlled treasury or a separate signing service.

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

## References

- [Solana Actions Docs](https://solana.com/docs/advanced/actions)
- [@solana/actions SDK](https://www.npmjs.com/package/@solana/actions)
- [Official Examples](https://github.com/solana-developers/solana-actions)
- [Blinks Inspector](https://www.blinks.xyz/inspector)
- [Dialect Registry](https://dial.to/register)
- [Awesome Blinks](https://github.com/solana-developers/awesome-blinks)
