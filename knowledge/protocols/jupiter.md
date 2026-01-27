# Jupiter Aggregator

## TLDR

Jupiter is Solana's leading swap aggregator - routes trades across 20+ DEXs to get the best price. Use it whenever you need to swap tokens; don't build your own routing.

## Why Jupiter?

| Feature | Benefit |
|---------|---------|
| Best price | Aggregates Raydium, Orca, Phoenix, etc. |
| Split routes | Can split across multiple DEXs |
| Low slippage | Optimized routing algorithm |
| DCA | Built-in dollar-cost averaging |
| Limit orders | On-chain limit order book |

## Integration

### Installation

```bash
npm install @jup-ag/api
# or
yarn add @jup-ag/api
```

### Basic Swap (TypeScript)

```typescript
import { createJupiterApiClient } from "@jup-ag/api";
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";

const jupiterApi = createJupiterApiClient();
const connection = new Connection("https://api.mainnet-beta.solana.com");

async function swap(
  inputMint: string,
  outputMint: string,
  amount: number,
  wallet: Keypair
) {
  // 1. Get quote
  const quote = await jupiterApi.quoteGet({
    inputMint,
    outputMint,
    amount,
    slippageBps: 50, // 0.5% slippage
  });

  // 2. Get swap transaction
  const swapResult = await jupiterApi.swapPost({
    swapRequest: {
      quoteResponse: quote,
      userPublicKey: wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
    },
  });

  // 3. Deserialize and sign
  const swapTxBuf = Buffer.from(swapResult.swapTransaction, "base64");
  const tx = VersionedTransaction.deserialize(swapTxBuf);
  tx.sign([wallet]);

  // 4. Send
  const txid = await connection.sendTransaction(tx);
  await connection.confirmTransaction(txid);

  return txid;
}

// Example: Swap 1 SOL to USDC
const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

await swap(SOL, USDC, 1_000_000_000, wallet); // 1 SOL in lamports
```

### Quote Parameters

```typescript
const quote = await jupiterApi.quoteGet({
  inputMint: "So11111111111111111111111111111111111111112",
  outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  amount: 1_000_000_000,
  
  // Optional parameters
  slippageBps: 50,              // 0.5% slippage tolerance
  onlyDirectRoutes: false,      // Allow multi-hop routes
  asLegacyTransaction: false,   // Use versioned transactions
  maxAccounts: 64,              // Max accounts in transaction
  excludeDexes: ["Raydium"],    // Exclude specific DEXs
});
```

### Swap with Priority Fee

```typescript
const swapResult = await jupiterApi.swapPost({
  swapRequest: {
    quoteResponse: quote,
    userPublicKey: wallet.publicKey.toBase58(),
    wrapAndUnwrapSol: true,
    
    // Priority fee for faster inclusion
    prioritizationFeeLamports: "auto", // or specific amount
    // or
    computeUnitPriceMicroLamports: 1000,
  },
});
```

### DCA (Dollar Cost Average)

```typescript
import { DCA, Network } from "@jup-ag/dca-sdk";

const dca = new DCA(connection, Network.MAINNET);

// Create DCA: Buy BONK with 10 USDC every hour for 24 hours
const { txid } = await dca.createDCA({
  payer: wallet.publicKey,
  user: wallet.publicKey,
  inAmount: 10_000_000,        // 10 USDC (6 decimals)
  inAmountPerCycle: 10_000_000, // All at once each cycle
  cycleFrequency: 3600,         // 1 hour in seconds
  minOutAmount: null,           // No minimum (market order)
  maxOutAmount: null,
  startAt: null,                // Start immediately
  inputMint: USDC,
  outputMint: BONK,
});
```

## Key Addresses

### Mainnet

```typescript
const JUPITER = {
  // V6 (current)
  PROGRAM_ID: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  
  // Lookup table for efficient transactions
  LOOKUP_TABLE: "GxS6FiQ3mNnAar9HGQ6mxP7t6FcwmHkU7peSeQDUHmpN",
  
  // DCA Program
  DCA_PROGRAM: "DCA265Vj8a9CEuX1eb1LWRnDT7uK6q1xMipnNyatn23M",
  
  // Limit Order Program
  LIMIT_ORDER: "jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu",
};
```

### Devnet

```typescript
const JUPITER_DEVNET = {
  PROGRAM_ID: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", // Same as mainnet
};
```

## Common Mistakes

### ❌ Not Handling Quote Expiry

```typescript
// WRONG: Using old quote
const quote = await jupiterApi.quoteGet({...});
// ... time passes ...
await jupiterApi.swapPost({ quoteResponse: quote }); // ❌ Quote expired!

// RIGHT: Get fresh quote right before swap
const quote = await jupiterApi.quoteGet({...});
const swap = await jupiterApi.swapPost({ quoteResponse: quote }); // ✅ Immediate
```

### ❌ Ignoring Slippage

```typescript
// WRONG: No slippage tolerance
const quote = await jupiterApi.quoteGet({
  inputMint, outputMint, amount,
  // slippageBps not set - defaults to 0!
});

// RIGHT: Set appropriate slippage
const quote = await jupiterApi.quoteGet({
  inputMint, outputMint, amount,
  slippageBps: 50, // 0.5% - adjust based on token liquidity
});
```

### ❌ Hardcoding Amounts Without Decimals

```typescript
// WRONG: "1 USDC" as 1
const amount = 1; // ❌ This is 0.000001 USDC!

// RIGHT: Account for decimals
const USDC_DECIMALS = 6;
const amount = 1 * 10 ** USDC_DECIMALS; // ✅ 1_000_000
```

### ❌ Not Using Versioned Transactions

```typescript
// WRONG: Legacy transactions (limited accounts)
const quote = await jupiterApi.quoteGet({
  ...params,
  asLegacyTransaction: true, // ❌ Limits routing options
});

// RIGHT: Versioned transactions (more accounts = better routes)
const quote = await jupiterApi.quoteGet({
  ...params,
  asLegacyTransaction: false, // ✅ Default
});
```

## CPI Integration (Anchor)

For on-chain programs that need to swap:

```rust
use anchor_lang::prelude::*;
use jupiter_cpi::{self, Jupiter};

pub fn swap_via_jupiter(ctx: Context<SwapViaJupiter>, data: Vec<u8>) -> Result<()> {
    // Jupiter handles the swap logic
    // You just pass the instruction data from the API
    jupiter_cpi::cpi::route(
        CpiContext::new(
            ctx.accounts.jupiter_program.to_account_info(),
            jupiter_cpi::cpi::accounts::Route {
                // ... accounts from Jupiter API response
            },
        ),
        data,
    )?;
    Ok(())
}
```

**Note:** On-chain Jupiter CPI is complex. For most use cases, use the TypeScript SDK to build transactions client-side.

## Resources

- **API Docs**: https://station.jup.ag/docs/apis/swap-api
- **SDK**: https://github.com/jup-ag/jupiter-quote-api-node
- **DCA SDK**: https://github.com/jup-ag/dca-sdk
- **Discord**: https://discord.gg/jup

## Related

- **[../challenges/08-amm-swap.md](../challenges/08-amm-swap.md)** - Build your own AMM
- **[../foundations/05-cpis.md](../foundations/05-cpis.md)** - CPI patterns
