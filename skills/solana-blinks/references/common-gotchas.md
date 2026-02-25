# Common Gotchas

Problems you'll hit and how to fix them.

## CORS Errors

**Symptom:** Browser console shows CORS errors, blink won't load.

**Cause:** Missing or incorrect CORS headers.

**Fix:** Return headers on ALL responses including OPTIONS:
```typescript
import { ACTIONS_CORS_HEADERS } from '@solana/actions';

export const OPTIONS = async () => {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
};

export async function GET(req: Request) {
  return Response.json(data, { headers: ACTIONS_CORS_HEADERS });
}

export async function POST(req: Request) {
  return Response.json(data, { headers: ACTIONS_CORS_HEADERS });
}
```

## Transaction Fails to Serialize

**Symptom:** `Error: Signature verification failed`

**Cause:** Trying to serialize with signature verification enabled.

**Fix:**
```typescript
// Wrong
transaction.serialize()

// Right
transaction.serialize({ 
  requireAllSignatures: false,
  verifySignatures: false 
})
```

## Blockhash Expired

**Symptom:** Transaction fails with "blockhash not found" or "transaction too old"

**Cause:** Blockhash fetched too early or cached too long.

**Fix:** Fetch fresh blockhash in POST handler:
```typescript
export async function POST(req: Request) {
  const connection = new Connection(RPC_URL);
  const { blockhash } = await connection.getLatestBlockhash();
  
  const transaction = new Transaction({
    recentBlockhash: blockhash,  // Fresh!
    feePayer: userPubkey,
  });
}
```

## Fee Payer Not Set

**Symptom:** Transaction fails or wallet shows wrong fee payer.

**Cause:** Missing `feePayer` on transaction.

**Fix:**
```typescript
const transaction = new Transaction({
  recentBlockhash: blockhash,
  feePayer: new PublicKey(body.account),  // User pays fees
});
```

## Icon Not Loading

**Symptom:** Blink renders but shows broken image.

**Causes:**
- HTTP instead of HTTPS
- Image URL blocked by CORS
- Image too large or wrong format

**Fix:**
- Use HTTPS URLs only
- Host on same domain or reliable CDN (Cloudflare, Vercel)
- Use PNG or JPG, 256x256 recommended
- Keep file size under 100KB

## actions.json Not Found

**Symptom:** Blink inspector says "No actions.json found"

**Causes:**
- File in wrong location
- Wrong content type
- Routing issues

**Fix:**
- Next.js: Put in `public/actions.json`
- Must be at root: `https://yourdomain.com/actions.json`
- Content-Type must be `application/json`

## "Action Unavailable" on X

**Symptom:** URL posts but doesn't unfurl into a blink.

**Cause:** Not registered with Dialect.

**Fix:** Register at https://dial.to/register (takes 1-3 days)

Until verified, test on:
- https://dial.to (interstitial site)
- https://www.blinks.xyz/inspector

## Token Account Doesn't Exist

**Symptom:** SPL token transfer fails with "Account not found"

**Cause:** Recipient doesn't have an Associated Token Account.

**Fix:** Create ATA if needed:
```typescript
import { 
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount 
} from '@solana/spl-token';

const ata = await getAssociatedTokenAddress(mint, recipient);

try {
  await getAccount(connection, ata);
} catch {
  // ATA doesn't exist, create it
  transaction.add(
    createAssociatedTokenAccountInstruction(
      payer,     // Who pays for creation
      ata,       // The ATA address
      recipient, // Owner of the ATA
      mint       // Token mint
    )
  );
}
```

## Wrong Token Decimals

**Symptom:** Transfer sends wrong amount (way more or less than expected).

**Cause:** Not accounting for token decimals.

**Fix:** Multiply by 10^decimals:
```typescript
// If token has 9 decimals and you want to send 100 tokens:
const amount = 100 * (10 ** 9);  // 100000000000

// Or fetch decimals dynamically:
const mintInfo = await getMint(connection, mintAddress);
const amount = 100 * (10 ** mintInfo.decimals);
```

## POST Returns HTML Instead of JSON

**Symptom:** Client gets HTML error page instead of JSON response.

**Cause:** Unhandled exception in POST handler.

**Fix:** Wrap in try/catch, return JSON errors:
```typescript
export async function POST(req: Request) {
  try {
    // ... your logic
    return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
  } catch (error) {
    return Response.json(
      { error: { message: error.message } },
      { status: 500, headers: ACTIONS_CORS_HEADERS }
    );
  }
}
```

## Button Shows "Disabled"

**Symptom:** Buttons are grayed out even though action should work.

**Cause:** GET response has `disabled: true` or returns an error.

**Fix:** Check your GET response:
```typescript
// Don't do this unless action is actually unavailable
const response = {
  disabled: false,  // or just omit this field
  // ...
};
```

## Transaction Too Large

**Symptom:** Serialization fails with "Transaction too large"

**Cause:** Too many instructions (> ~1232 bytes).

**Fix:**
- Split into multiple transactions
- Use lookup tables for many accounts
- Reduce instruction count

## RPC Rate Limited

**Symptom:** Intermittent failures, "429 Too Many Requests"

**Cause:** Using public RPC with no rate limits.

**Fix:**
- Use a paid RPC provider (Helius, QuickNode, Triton)
- Add retry logic with backoff
- Cache blockhash for a few seconds (but not too long!)
