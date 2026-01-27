# Raydium

## TLDR

Raydium is Solana's largest AMM (Automated Market Maker). It offers standard AMM pools, concentrated liquidity (CLMM), and a launchpad (AcceleRaytor). Use it for swaps, LP positions, or launching tokens.

## Why Raydium?

| Feature | Benefit |
|---------|---------|
| Deep liquidity | Largest TVL on Solana |
| CLMM | Concentrated liquidity like Uniswap v3 |
| Standard AMM | Simple constant-product pools |
| AcceleRaytor | Token launchpad |
| OpenBook integration | Hybrid AMM + orderbook |

## Pool Types

### Standard AMM (v4)
- Classic x*y=k constant product
- 0.25% swap fee (adjustable)
- Simple to LP, no range management

### Concentrated Liquidity (CLMM)
- Set price ranges for your liquidity
- Higher capital efficiency
- More complex position management

```
┌─────────────────────────────────────────────────────────┐
│              Concentrated vs Standard AMM               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Standard AMM:                                          │
│  Liquidity spread 0 → ∞                                │
│  ████████████████████████████████ (uniform)            │
│                                                         │
│  CLMM (Concentrated):                                  │
│  Liquidity in your chosen range                        │
│           ████████████                                  │
│           ↑        ↑                                   │
│       $1.90    $2.10                                   │
│                                                         │
│  Same capital, 10x more effective in-range             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Integration

### Installation

```bash
npm install @raydium-io/raydium-sdk-v2
```

### Initialize SDK

```typescript
import { Raydium } from "@raydium-io/raydium-sdk-v2";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const owner = Keypair.fromSecretKey(/* your key */);

const raydium = await Raydium.load({
  connection,
  owner,
  disableLoadToken: false,
});
```

### Swap (AMM)

```typescript
async function swap(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippage: number = 0.01 // 1%
) {
  // Get pool info
  const poolInfo = await raydium.api.fetchPoolByMints({
    mint1: inputMint,
    mint2: outputMint,
  });
  
  if (!poolInfo.data.length) throw new Error("No pool found");
  
  const pool = poolInfo.data[0];

  // Calculate swap
  const { execute } = await raydium.liquidity.swap({
    poolInfo: pool,
    amountIn: amount,
    amountOut: 0, // Calculate automatically
    fixedSide: "in",
    slippage,
  });

  // Execute
  const txId = await execute();
  console.log("Swap tx:", txId);
  return txId;
}

// Swap 1 SOL for RAY
const SOL = "So11111111111111111111111111111111111111112";
const RAY = "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R";
await swap(SOL, RAY, 1_000_000_000);
```

### Add Liquidity (Standard Pool)

```typescript
async function addLiquidity(
  poolId: string,
  amountA: number,
  amountB: number
) {
  const poolInfo = await raydium.api.fetchPoolById({ ids: poolId });
  const pool = poolInfo[0];

  const { execute } = await raydium.liquidity.addLiquidity({
    poolInfo: pool,
    amountInA: amountA,
    amountInB: amountB,
    fixedSide: "a", // Fix amount A, calculate B
  });

  const txId = await execute();
  console.log("Add liquidity tx:", txId);
  return txId;
}
```

### Remove Liquidity

```typescript
async function removeLiquidity(poolId: string, lpAmount: number) {
  const poolInfo = await raydium.api.fetchPoolById({ ids: poolId });
  const pool = poolInfo[0];

  const { execute } = await raydium.liquidity.removeLiquidity({
    poolInfo: pool,
    lpAmount,
  });

  const txId = await execute();
  return txId;
}
```

### CLMM Position

```typescript
// Open concentrated liquidity position
async function openClmmPosition(
  poolId: string,
  tickLower: number,
  tickUpper: number,
  liquidity: number
) {
  const poolInfo = await raydium.clmm.getPoolInfoFromRpc(poolId);

  const { execute } = await raydium.clmm.openPosition({
    poolInfo,
    tickLower,
    tickUpper,
    liquidity,
    slippage: 0.01,
  });

  const txId = await execute();
  return txId;
}

// Close position
async function closeClmmPosition(positionNft: PublicKey) {
  const { execute } = await raydium.clmm.closePosition({
    positionNft,
  });
  return await execute();
}
```

### Create Pool

```typescript
async function createPool(
  mintA: PublicKey,
  mintB: PublicKey,
  initialPriceX: number // Price of A in terms of B
) {
  const { execute, extInfo } = await raydium.liquidity.createPool({
    programId: RAYDIUM.AMM_V4,
    marketId: /* OpenBook market ID */,
    baseMint: mintA,
    quoteMint: mintB,
    baseAmount: /* initial A amount */,
    quoteAmount: /* initial B amount */,
  });

  const txId = await execute();
  console.log("Pool created:", extInfo.address);
  return extInfo.address;
}
```

## Key Addresses

### Mainnet

```typescript
const RAYDIUM = {
  // Programs
  AMM_V4: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
  CLMM: "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
  
  // Authority
  AMM_AUTHORITY: "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
  
  // Common pools
  POOLS: {
    SOL_USDC: "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
    RAY_SOL: "AVs9TA4nWDzfPJE9gGVNJMVhcQy3V9PGazuz33BfG2RA",
    RAY_USDC: "6UmmUiYoBjSrhakAobJw8BvkmJtDVxaeBtbt7rxWo1mg",
  },
  
  // Tokens
  RAY_MINT: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
};
```

## Common Mistakes

### ❌ Using Wrong Pool Type

```typescript
// WRONG: Using AMM SDK for CLMM pool
await raydium.liquidity.swap({ poolInfo: clmmPool }); // ❌ Different interface!

// RIGHT: Use correct SDK method
await raydium.clmm.swap({ poolInfo: clmmPool }); // ✅ For CLMM
await raydium.liquidity.swap({ poolInfo: ammPool }); // ✅ For AMM v4
```

### ❌ Ignoring Price Impact

```typescript
// WRONG: Large swap without checking impact
await swap(SOL, RAY, 1000_000_000_000); // ❌ 1000 SOL will move price!

// RIGHT: Check price impact first
const quote = await raydium.api.fetchSwapQuote({...});
if (quote.priceImpact > 0.03) { // 3%
  console.warn("High price impact!");
}
```

### ❌ Not Refreshing Pool Data

```typescript
// WRONG: Using stale pool info
const poolInfo = await raydium.api.fetchPoolById({ ids: poolId });
// ... time passes ...
await raydium.liquidity.swap({ poolInfo }); // ❌ Stale reserves!

// RIGHT: Fetch fresh data before swap
const freshPoolInfo = await raydium.api.fetchPoolById({ ids: poolId });
await raydium.liquidity.swap({ poolInfo: freshPoolInfo[0] }); // ✅
```

### ❌ CLMM Range Too Narrow

```typescript
// WRONG: Tiny range (will go out of range immediately)
const tickLower = currentTick - 1;
const tickUpper = currentTick + 1;

// RIGHT: Reasonable range based on expected volatility
const tickSpacing = 60; // Depends on pool
const range = 100; // ±5% range approximately
const tickLower = currentTick - range * tickSpacing;
const tickUpper = currentTick + range * tickSpacing;
```

## LP Economics

### Impermanent Loss

```
If you LP SOL/USDC at $100/SOL:
- SOL goes to $150: You have less SOL, more USDC than if you held
- SOL goes to $50: You have more SOL, less USDC than if you held

IL = 2 * sqrt(price_ratio) / (1 + price_ratio) - 1

At 2x price move: ~5.7% IL
At 3x price move: ~13.4% IL
```

### When to LP

| Scenario | Good for LPing? |
|----------|----------------|
| Stable pairs (USDC/USDT) | ✅ Low IL |
| Trending asset | ❌ High IL |
| Range-bound asset | ✅ Farm fees |
| High volume, low TVL | ✅ High APR |

## Resources

- **Docs**: https://docs.raydium.io/
- **SDK**: https://github.com/raydium-io/raydium-sdk-V2
- **App**: https://raydium.io/
- **Discord**: https://discord.gg/raydium

## Related

- **[../challenges/08-amm-swap.md](../challenges/08-amm-swap.md)** - Build your own AMM
- **[./jupiter.md](./jupiter.md)** - Jupiter routes through Raydium
