# Jupiter DeFi Troubleshooting Guide

## Common Errors

### "No route found"

**Cause:** Jupiter can't find a trading path between the tokens.

**Solutions:**
1. Token may have very low liquidity - try smaller amounts
2. Token might not be indexed - check if it exists:
   ```bash
   curl "https://api.jup.ag/ultra/v1/search?query=TOKEN_SYMBOL"
   ```
3. Try routing through a common intermediate (SOL or USDC):
   ```
   TOKEN_A → SOL → TOKEN_B
   ```

### "Slippage exceeded"

**Cause:** Price moved too much between quote and execution.

**Solutions:**
1. Increase slippage tolerance:
   ```typescript
   orderUrl.searchParams.set('slippageBps', '100'); // 1%
   ```
2. Trade during lower volatility periods
3. Use smaller trade sizes
4. For volatile tokens, use 3-5% slippage

### "Transaction expired"

**Cause:** Blockhash expired before transaction landed.

**Solutions:**
1. Ultra API handles this automatically - just retry
2. If using Metis API, get a fresh blockhash:
   ```typescript
   const { blockhash } = await connection.getLatestBlockhash();
   ```

### "Insufficient balance"

**Cause:** Not enough tokens or SOL for fees.

**Solutions:**
1. Check you have enough of the input token
2. Ensure you have ~0.01 SOL for transaction fees
3. Account for token account rent (~0.002 SOL) if creating new accounts

### "Transaction simulation failed"

**Cause:** Transaction would fail on-chain.

**Common reasons:**
- Stale quote (price moved)
- Insufficient balance
- Wrong account addresses
- Program constraints violated

**Solutions:**
1. Get a fresh quote immediately before signing
2. Check all account balances
3. Verify mint addresses are correct

## API Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Process response |
| 400 | Bad request | Check parameters |
| 404 | Not found | Token/route doesn't exist |
| 429 | Rate limited | Wait and retry |
| 500 | Server error | Retry after delay |
| 503 | Service unavailable | System overloaded, retry |

## Rate Limits

Jupiter APIs have dynamic rate limits based on usage:

- **Basic usage:** ~60 requests/minute
- **Heavy usage:** May be throttled
- **Best practice:** Cache quotes for 10-30 seconds

```typescript
// Simple rate limiter
const lastRequest = new Map<string, number>();
const MIN_INTERVAL = 1000; // 1 second

async function rateLimitedFetch(url: string) {
  const now = Date.now();
  const last = lastRequest.get(url) || 0;
  const wait = Math.max(0, MIN_INTERVAL - (now - last));
  
  if (wait > 0) {
    await new Promise(r => setTimeout(r, wait));
  }
  
  lastRequest.set(url, Date.now());
  return fetch(url);
}
```

## Transaction Debugging

### Check Transaction Status

```typescript
import { Connection } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');

async function checkTransaction(signature: string) {
  const status = await connection.getSignatureStatus(signature);
  console.log('Status:', status);
  
  if (status.value?.err) {
    // Get detailed logs
    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
    console.log('Logs:', tx?.meta?.logMessages);
  }
}
```

### Decode Transaction

```typescript
import { VersionedTransaction } from '@solana/web3.js';

function inspectTransaction(base64Tx: string) {
  const buffer = Buffer.from(base64Tx, 'base64');
  const tx = VersionedTransaction.deserialize(buffer);
  
  console.log('Version:', tx.version);
  console.log('Signatures required:', tx.message.header.numRequiredSignatures);
  console.log('Account keys:', tx.message.staticAccountKeys.length);
  console.log('Instructions:', tx.message.compiledInstructions.length);
}
```

## Common Mistakes

### 1. Using Legacy Transaction Class

```typescript
// ❌ Wrong - Jupiter returns versioned transactions
import { Transaction } from '@solana/web3.js';
const tx = Transaction.from(buffer);

// ✅ Correct
import { VersionedTransaction } from '@solana/web3.js';
const tx = VersionedTransaction.deserialize(buffer);
```

### 2. Not Setting Fee Payer

```typescript
// ❌ Wrong - no fee payer
const transaction = new Transaction();

// ✅ Correct (for custom transactions)
transaction.feePayer = wallet.publicKey;
```

### 3. Forgetting to Confirm

```typescript
// ❌ Wrong - fire and forget
await connection.sendRawTransaction(tx.serialize());

// ✅ Correct - wait for confirmation
const sig = await connection.sendRawTransaction(tx.serialize());
await connection.confirmTransaction(sig, 'confirmed');
```

### 4. Wrong Decimal Handling

```typescript
// ❌ Wrong - using raw numbers
const amount = 1; // 1 what? SOL? lamports?

// ✅ Correct - explicit conversion
const SOL_DECIMALS = 9;
const amount = 1 * Math.pow(10, SOL_DECIMALS); // 1 SOL in lamports
```

## Getting Help

- **Jupiter Discord:** https://discord.gg/jup (#dev-support)
- **Solana Stack Exchange:** https://solana.stackexchange.com
- **Jupiter GitHub:** https://github.com/jup-ag

## Useful Tools

- **Solscan:** https://solscan.io - Transaction explorer
- **Solana FM:** https://solana.fm - Alternative explorer
- **Helius:** https://helius.dev - RPC + APIs
- **Jupiter Terminal:** https://jup.ag - Test swaps in UI
