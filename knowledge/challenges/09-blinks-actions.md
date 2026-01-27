# Challenge 9: Blinks & Actions

## TLDR

Create shareable transaction links using Solana Actions and Blinks. Learn to build "executable URLs" that let users sign transactions directly from Twitter, Discord, or any website.

## Core Concepts

### What You're Building

A Solana Action that:
1. Returns transaction metadata via GET request
2. Builds transactions via POST request
3. Works with Blinks (blockchain links) in social media
4. Enables one-click token purchases, NFT mints, tips, etc.

### What Are Solana Actions?

```
Traditional Flow:
1. User visits dApp website
2. Connects wallet
3. Navigates to feature
4. Clicks button
5. Signs transaction
(5 steps, high friction)

Actions Flow:
1. User sees Blink on Twitter/Discord
2. Clicks "Buy" button
3. Signs transaction
(2 steps, low friction!)
```

### How Blinks Work

```
┌─────────────────────────────────────────────────────────┐
│  Twitter Post                                           │
│  ─────────────────                                      │
│  "Just launched my token! Mint here:"                   │
│  https://dial.to/?action=solana-action:                │
│         https://myapp.com/api/actions/mint             │
│                                                         │
│  ┌─────────────────────────────────────────────┐       │
│  │  🖼️  [Token Image]                          │       │
│  │                                              │       │
│  │  My Cool Token                               │       │
│  │  Mint your tokens now!                       │       │
│  │                                              │       │
│  │  [====== Mint 100 Tokens ======]            │       │
│  │  [ 500 ]  [ 1000 ]  [ Custom ]              │       │
│  └─────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
         │
         ▼ User clicks button
┌─────────────────────────────────────────────────────────┐
│  1. Client fetches GET /api/actions/mint                │
│     → Returns metadata (title, icon, buttons)           │
│                                                         │
│  2. Client sends POST /api/actions/mint                 │
│     → Returns unsigned transaction                      │
│                                                         │
│  3. User's wallet signs transaction                     │
│                                                         │
│  4. Client submits to Solana                           │
└─────────────────────────────────────────────────────────┘
```

### Actions Specification

**GET Request** returns metadata:
```json
{
  "icon": "https://myapp.com/token-icon.png",
  "title": "Mint Cool Token",
  "description": "Get your tokens directly from this link!",
  "label": "Mint",
  "links": {
    "actions": [
      {
        "label": "Mint 100",
        "href": "/api/actions/mint?amount=100"
      },
      {
        "label": "Mint 500",
        "href": "/api/actions/mint?amount=500"
      },
      {
        "label": "Custom Amount",
        "href": "/api/actions/mint?amount={amount}",
        "parameters": [
          {
            "name": "amount",
            "label": "Enter amount",
            "type": "number"
          }
        ]
      }
    ]
  }
}
```

**POST Request** returns transaction:
```json
{
  "transaction": "base64-encoded-transaction",
  "message": "Minting 100 tokens..."
}
```

## Code Walkthrough

### 1. Action Server (Next.js API Route)

```typescript
// app/api/actions/mint/route.ts

import {
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
  ACTIONS_CORS_HEADERS,
  createPostResponse,
} from "@solana/actions";
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const connection = new Connection(process.env.RPC_URL!);
const MINT = new PublicKey(process.env.TOKEN_MINT!);
const TREASURY = new PublicKey(process.env.TREASURY_WALLET!);
const PRICE_PER_TOKEN = 0.001 * LAMPORTS_PER_SOL; // 0.001 SOL per token

// GET: Return action metadata
export async function GET(request: Request) {
  const response: ActionGetResponse = {
    icon: "https://myapp.com/token-icon.png",
    title: "Buy Cool Token",
    description: "Purchase tokens directly from this Blink!",
    label: "Buy Tokens",
    links: {
      actions: [
        {
          label: "Buy 100 Tokens (0.1 SOL)",
          href: `/api/actions/mint?amount=100`,
        },
        {
          label: "Buy 500 Tokens (0.5 SOL)",
          href: `/api/actions/mint?amount=500`,
        },
        {
          label: "Buy 1000 Tokens (1 SOL)",
          href: `/api/actions/mint?amount=1000`,
        },
        {
          label: "Custom Amount",
          href: `/api/actions/mint?amount={amount}`,
          parameters: [
            {
              name: "amount",
              label: "Number of tokens",
              type: "number",
              required: true,
              min: 1,
              max: 10000,
            },
          ],
        },
      ],
    },
  };

  return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
}

// Required for CORS preflight
export async function OPTIONS() {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
}

// POST: Build and return transaction
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const amount = parseInt(url.searchParams.get("amount") || "100");
    
    const body: ActionPostRequest = await request.json();
    const userPubkey = new PublicKey(body.account);

    // Calculate cost
    const cost = amount * PRICE_PER_TOKEN;

    // Get or create user's token account
    const userAta = await getAssociatedTokenAddress(MINT, userPubkey);
    const treasuryAta = await getAssociatedTokenAddress(MINT, TREASURY);

    // Build transaction
    const transaction = new Transaction();
    
    // Check if user has ATA, if not create it
    const userAtaInfo = await connection.getAccountInfo(userAta);
    if (!userAtaInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          userPubkey,  // payer
          userAta,     // ata
          userPubkey,  // owner
          MINT         // mint
        )
      );
    }

    // Transfer SOL payment
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: userPubkey,
        toPubkey: TREASURY,
        lamports: cost,
      })
    );

    // Transfer tokens to user
    transaction.add(
      createTransferInstruction(
        treasuryAta,   // from
        userAta,       // to
        TREASURY,      // authority (needs to sign on backend or use PDA)
        amount * 1e9   // amount (assuming 9 decimals)
      )
    );

    // Set recent blockhash and fee payer
    transaction.recentBlockhash = (
      await connection.getLatestBlockhash()
    ).blockhash;
    transaction.feePayer = userPubkey;

    // Create response
    const response = await createPostResponse({
      fields: {
        transaction,
        message: `Purchasing ${amount} tokens for ${cost / LAMPORTS_PER_SOL} SOL`,
      },
    });

    return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
    
  } catch (error) {
    console.error("Error:", error);
    return Response.json(
      { error: "Failed to create transaction" },
      { status: 500, headers: ACTIONS_CORS_HEADERS }
    );
  }
}
```

### 2. actions.json Configuration

Host at `/.well-known/actions.json`:

```json
{
  "rules": [
    {
      "pathPattern": "/api/actions/**",
      "apiPath": "/api/actions/**"
    },
    {
      "pathPattern": "/mint",
      "apiPath": "/api/actions/mint"
    },
    {
      "pathPattern": "/tip/*",
      "apiPath": "/api/actions/tip?recipient=*"
    }
  ]
}
```

### 3. Tip Action Example

```typescript
// app/api/actions/tip/route.ts

import {
  ActionGetResponse,
  ActionPostRequest,
  ACTIONS_CORS_HEADERS,
  createPostResponse,
} from "@solana/actions";
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

const connection = new Connection(process.env.RPC_URL!);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const recipient = url.searchParams.get("recipient");

  if (!recipient) {
    return Response.json(
      { error: "Recipient required" },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }

  const response: ActionGetResponse = {
    icon: `https://api.dicebear.com/7.x/identicon/svg?seed=${recipient}`,
    title: `Tip ${recipient.slice(0, 8)}...`,
    description: "Send a tip to this creator!",
    label: "Send Tip",
    links: {
      actions: [
        { label: "0.01 SOL", href: `/api/actions/tip?recipient=${recipient}&amount=0.01` },
        { label: "0.1 SOL", href: `/api/actions/tip?recipient=${recipient}&amount=0.1` },
        { label: "1 SOL", href: `/api/actions/tip?recipient=${recipient}&amount=1` },
        {
          label: "Custom",
          href: `/api/actions/tip?recipient=${recipient}&amount={amount}`,
          parameters: [
            { name: "amount", label: "SOL amount", type: "number", required: true }
          ],
        },
      ],
    },
  };

  return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
}

export async function OPTIONS() {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const recipient = url.searchParams.get("recipient")!;
  const amount = parseFloat(url.searchParams.get("amount") || "0.1");

  const body: ActionPostRequest = await request.json();
  const sender = new PublicKey(body.account);
  const recipientPubkey = new PublicKey(recipient);

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: sender,
      toPubkey: recipientPubkey,
      lamports: amount * LAMPORTS_PER_SOL,
    })
  );

  transaction.recentBlockhash = (
    await connection.getLatestBlockhash()
  ).blockhash;
  transaction.feePayer = sender;

  const response = await createPostResponse({
    fields: {
      transaction,
      message: `Sending ${amount} SOL tip!`,
    },
  });

  return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
}
```

### 4. Testing Your Action

```bash
# Test GET request
curl https://yourapp.com/api/actions/mint

# Test with Solana Actions Inspector
# Visit: https://dial.to/devnet?action=solana-action:https://yourapp.com/api/actions/mint

# Local testing with ngrok
ngrok http 3000
# Then use the ngrok URL in dial.to
```

### 5. Creating Blink URLs

```typescript
// Generate shareable Blink URL
function createBlinkUrl(actionUrl: string, cluster: "mainnet" | "devnet" = "mainnet") {
  const encodedAction = encodeURIComponent(`solana-action:${actionUrl}`);
  const base = cluster === "devnet" 
    ? "https://dial.to/devnet" 
    : "https://dial.to";
  return `${base}?action=${encodedAction}`;
}

// Examples
const mintBlink = createBlinkUrl("https://myapp.com/api/actions/mint");
// https://dial.to?action=solana-action%3Ahttps%3A%2F%2Fmyapp.com%2Fapi%2Factions%2Fmint

const tipBlink = createBlinkUrl(
  "https://myapp.com/api/actions/tip?recipient=7xyz...",
  "devnet"
);
```

## Advanced: On-Chain Actions with Anchor

```rust
use anchor_lang::prelude::*;

declare_id!("YOUR_PROGRAM_ID");

/// This program can be called directly from Actions
#[program]
pub mod blink_program {
    use super::*;

    /// Mint tokens - designed for Actions
    pub fn mint_via_action(
        ctx: Context<MintViaAction>,
        amount: u64,
    ) -> Result<()> {
        // Transfer SOL payment
        let price = amount.checked_mul(PRICE_PER_TOKEN).unwrap();
        
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            price,
        )?;

        // Mint tokens to buyer
        let seeds = &[b"mint_authority", &[ctx.bumps.mint_authority]];
        let signer_seeds = &[&seeds[..]];

        anchor_spl::token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.buyer_ata.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        msg!("Minted {} tokens via Blink!", amount);
        Ok(())
    }
}
```

## Security Considerations

1. **Input Validation**: Always validate amounts, recipients, parameters
2. **Rate Limiting**: Prevent spam/abuse of your Action endpoints
3. **Transaction Simulation**: Wallets should simulate before signing
4. **HTTPS Required**: Actions must be served over HTTPS
5. **CORS Headers**: Required for cross-origin requests from wallets

## Common Gotchas

### 1. Missing CORS Headers
```typescript
// ❌ Wrong: no CORS headers
return Response.json(response);

// ✅ Correct: include Actions CORS headers
return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
```

### 2. Forgetting OPTIONS Handler
```typescript
// ❌ Missing: preflight requests fail
// No OPTIONS handler

// ✅ Required: handle CORS preflight
export async function OPTIONS() {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
}
```

### 3. Wrong Transaction Serialization
```typescript
// ❌ Wrong: sending transaction object
return Response.json({ transaction: tx });

// ✅ Correct: use createPostResponse helper
const response = await createPostResponse({
  fields: { transaction, message: "..." }
});
```

### 4. Not Setting Fee Payer
```typescript
// ❌ Wrong: fee payer not set
const tx = new Transaction().add(instruction);
return tx;

// ✅ Correct: set fee payer to user
tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
tx.feePayer = userPubkey;
```

## Supported Platforms

Blinks are supported on:
- ✅ Twitter/X (via browser extension)
- ✅ Discord (via browser extension)
- ✅ Telegram (via browser extension)
- ✅ Any website embedding the Blink
- ✅ Phantom, Solflare, Backpack wallets

**Browser Extensions:**
- [Dialect Blinks](https://www.dialect.to/blinks)
- Native wallet support

## What You've Learned

- [x] Solana Actions specification
- [x] Building GET/POST handlers
- [x] Creating shareable Blink URLs
- [x] actions.json configuration
- [x] Multi-button Actions
- [x] Parameter inputs
- [x] Security best practices

## Builder Checklist

- [ ] Created GET handler returning metadata
- [ ] Created POST handler returning transaction
- [ ] Added actions.json configuration
- [ ] Implemented CORS headers
- [ ] Added OPTIONS handler
- [ ] Tested with dial.to inspector
- [ ] Created shareable Blink URL
- [ ] Tested in Twitter/Discord
- [ ] (Bonus) Added multiple action buttons
- [ ] (Bonus) Added custom parameter inputs
- [ ] (Bonus) Implemented on-chain program

---

## 🎉 Congratulations!

You've completed all 10 Solana Wingman challenges! You now understand:

1. **Fundamentals**: Accounts, PDAs, Anchor basics
2. **Tokens**: SPL Token, Token-2022, NFTs
3. **Advanced**: Escrow, Staking, Compressed NFTs
4. **DeFi**: Oracles, AMM mechanics
5. **Distribution**: Blinks for viral adoption

**Keep building!** 🚀
