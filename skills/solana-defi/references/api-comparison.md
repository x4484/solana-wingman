# Jupiter API Comparison: Ultra vs Swap API

## Quick Decision

```
Do you need CPI or custom instructions?
├── YES → Use Swap API
└── NO  → Use Ultra API (recommended)
```

## Feature Comparison

| Feature | Ultra API | Swap API |
|---------|-----------|----------|
| **Ease of Use** | High | Moderate |
| **RPC Required** | No | Yes |
| **MEV Protection** | Built-in (Jupiter Beam) | Build yourself |
| **Gasless Support** | Automatic | Build yourself |
| **Slippage Optimization** | RTSE (automatic) | Manual |
| **Transaction Landing** | Jupiter handles | You handle |
| **CPI Support** | No | Yes |
| **Custom Instructions** | No | Yes |
| **Integration Time** | Hours | Days/Weeks |
| **Maintenance** | None | Full stack |

## When to Use Ultra

✅ **Perfect for:**
- Trading bots
- Token swap UIs
- Portfolio rebalancers
- DeFi aggregator frontends
- Any app where you just need swaps

✅ **Benefits:**
- No RPC costs
- No infrastructure to maintain
- Automatic MEV protection
- Optimized slippage
- Sub-2s execution
- Customer support from Jupiter

## When to Use Swap API

Required for:
- Calling Jupiter from your own Solana program (CPI)
- Adding custom instructions to swap transactions
- Building your own execution infrastructure
- Full control over priority fees
- Custom fee monetization strategies

You will need:
- Your own RPC endpoint (paid)
- Transaction landing infrastructure
- MEV protection solution
- Slippage management
- Error handling and retries

## API Endpoints

### Ultra API
```
Base URL: https://api.jup.ag/ultra/v1

GET  /order              - Get quote + unsigned transaction
POST /execute            - Execute signed transaction
GET  /holdings/{address} - Get wallet balances
GET  /search             - Search tokens
GET  /shield?mints=X     - Token security info
```

### Swap API
```
Base URL: https://api.jup.ag/swap/v1

GET  /quote              - Get swap quote
POST /swap               - Get swap transaction
POST /swap-instructions  - Get swap as instructions (for CPI)
```

All endpoints require an `x-api-key` header. Get a free key from [portal.jup.ag](https://portal.jup.ag).

## Code Comparison

### Ultra API (Simple)

```typescript
const API_KEY = process.env.JUPITER_API_KEY!;

// 1. Get order
const order = await fetch(
  `https://api.jup.ag/ultra/v1/order?inputMint=${SOL}&outputMint=${USDC}&amount=1000000000&taker=${wallet}`,
  { headers: { 'x-api-key': API_KEY } }
).then(r => r.json());

// 2. Sign
const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, 'base64'));
tx.sign([wallet]);

// 3. Execute (Jupiter handles landing + MEV protection)
const result = await fetch('https://api.jup.ag/ultra/v1/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
  body: JSON.stringify({
    signedTransaction: Buffer.from(tx.serialize()).toString('base64'),
    requestId: order.requestId,
  })
}).then(r => r.json());

console.log('Done:', result.signature);
```

### Swap API (More Control)

```typescript
const API_KEY = process.env.JUPITER_API_KEY!;

// 1. Get quote
const quote = await fetch(
  `https://api.jup.ag/swap/v1/quote?inputMint=${SOL}&outputMint=${USDC}&amount=1000000000`,
  { headers: { 'x-api-key': API_KEY } }
).then(r => r.json());

// 2. Get swap transaction
const swap = await fetch('https://api.jup.ag/swap/v1/swap', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
  body: JSON.stringify({
    quoteResponse: quote,
    userPublicKey: wallet.publicKey.toBase58(),
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: 'auto',
  })
}).then(r => r.json());

// 3. Sign
const tx = VersionedTransaction.deserialize(Buffer.from(swap.swapTransaction, 'base64'));
tx.sign([wallet]);

// 4. Send to network (YOU handle this)
const connection = new Connection(RPC_URL);
const signature = await connection.sendRawTransaction(tx.serialize(), {
  skipPreflight: true,
  maxRetries: 2,
});

// 5. Confirm (YOU handle this)
await connection.confirmTransaction(signature, 'confirmed');
```

## Cost Comparison

| Cost Factor | Ultra | Swap API |
|-------------|-------|-------|
| RPC | $0 | $50-500/mo |
| Infrastructure | $0 | Variable |
| Engineering time | Low | High |
| Maintenance | None | Ongoing |
| Jupiter fees | Same | Same |

## Migration Path

If you start with Ultra and later need Swap API features:

1. Ultra API code is self-contained
2. Swap API requires new infrastructure
3. Can run both in parallel during migration
4. No breaking changes to swap logic

## Recommendation

**Start with Ultra API.** It covers 90%+ of use cases with minimal code and zero infrastructure. Only move to the Swap API when you have a specific technical requirement that Ultra can't meet.
