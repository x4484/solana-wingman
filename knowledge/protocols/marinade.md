# Marinade Finance

## TLDR

Marinade is Solana's largest liquid staking protocol. Stake SOL, get mSOL (a liquid receipt token that accrues staking rewards). Use it when you want staking yield without locking your SOL.

## Why Marinade?

| Feature | Benefit |
|---------|---------|
| Liquid staking | mSOL is tradeable, usable in DeFi |
| Auto-compounding | Rewards compound automatically |
| Decentralization | Stakes across 400+ validators |
| No lockup | Instant unstake available (small fee) |
| Native staking | Delayed unstake (no fee, ~2 days) |

## How mSOL Works

```
┌─────────────────────────────────────────────────────────┐
│                    mSOL Economics                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Day 0: Deposit 100 SOL → Get 95 mSOL                  │
│         (mSOL price = 1.05 SOL)                        │
│                                                         │
│  Day 365: Your 95 mSOL = 102 SOL                       │
│           (mSOL price increased to ~1.07 SOL)          │
│                                                         │
│  The mSOL/SOL exchange rate increases over time        │
│  as staking rewards accrue to the pool.                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Integration

### Installation

```bash
npm install @marinade.finance/marinade-ts-sdk
```

### Stake SOL → mSOL

```typescript
import { Marinade, MarinadeConfig } from "@marinade.finance/marinade-ts-sdk";
import { Connection, Keypair, sendAndConfirmTransaction } from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const wallet = Keypair.fromSecretKey(/* your key */);

// Initialize Marinade
const config = new MarinadeConfig({ connection });
const marinade = new Marinade(config);

async function stakeSOL(amountLamports: number) {
  // Build deposit transaction
  const { transaction } = await marinade.deposit(amountLamports);

  // Sign and send
  const txid = await sendAndConfirmTransaction(connection, transaction, [wallet]);
  
  console.log(`Staked ${amountLamports / 1e9} SOL, tx: ${txid}`);
  return txid;
}

// Stake 10 SOL
await stakeSOL(10_000_000_000);
```

### Unstake mSOL → SOL

**Option 1: Instant Unstake (small fee, immediate)**

```typescript
async function instantUnstake(msolAmount: number) {
  const { transaction } = await marinade.liquidUnstake(msolAmount);
  const txid = await sendAndConfirmTransaction(connection, transaction, [wallet]);
  return txid;
}
```

**Option 2: Delayed Unstake (no fee, ~2 days)**

```typescript
async function delayedUnstake(msolAmount: number) {
  // 1. Order the unstake
  const { transaction: orderTx, ticketAccount } = await marinade.orderUnstake(msolAmount);
  await sendAndConfirmTransaction(connection, orderTx, [wallet]);

  // 2. Wait for epoch to end (~2 days)
  // ...

  // 3. Claim the unstaked SOL
  const { transaction: claimTx } = await marinade.claim(ticketAccount);
  await sendAndConfirmTransaction(connection, claimTx, [wallet]);
}
```

### Get mSOL Price

```typescript
async function getMsolPrice() {
  const state = await marinade.getMarinadeState();
  
  // mSOL price in SOL
  const msolPrice = state.mSolPrice; // e.g., 1.05
  
  // How much mSOL you get for 1 SOL
  const solToMsol = 1 / msolPrice; // e.g., 0.952
  
  return { msolPrice, solToMsol };
}
```

### Check User Balance

```typescript
async function getBalances(walletPubkey: PublicKey) {
  const msolMint = new PublicKey("mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So");
  
  // Get mSOL token account
  const msolAta = await getAssociatedTokenAddress(msolMint, walletPubkey);
  
  try {
    const account = await getAccount(connection, msolAta);
    return Number(account.amount) / 1e9; // mSOL has 9 decimals
  } catch {
    return 0; // No mSOL account
  }
}
```

## Key Addresses

### Mainnet

```typescript
const MARINADE = {
  // Main program
  PROGRAM_ID: "MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD",
  
  // State account
  STATE: "8szGkuLTAux9XMgZ2vtY39jVSowEcpBfFfD8hXSEqdGC",
  
  // mSOL token
  MSOL_MINT: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
  
  // Treasury
  TREASURY: "B1aLzaNMeFVAyQ6f3XbbUyKcH2YPHu2fqiEagmiF23VR",
  
  // LP Token (for mSOL-SOL liquidity)
  LP_MINT: "LPmSozJJ8Jh69ut2WP3XmVohTjL4ipR18yiCzxrUmVj",
};
```

### Devnet

```typescript
const MARINADE_DEVNET = {
  PROGRAM_ID: "MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD", // Same
  STATE: "8szGkuLTAux9XMgZ2vtY39jVSowEcpBfFfD8hXSEqdGC", // Different on devnet
  MSOL_MINT: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", // Same
};
```

## Common Mistakes

### ❌ Confusing mSOL Amount with SOL Value

```typescript
// WRONG: Assuming 1 mSOL = 1 SOL
const solValue = msolBalance; // ❌ mSOL appreciates!

// RIGHT: Convert using current price
const state = await marinade.getMarinadeState();
const solValue = msolBalance * state.mSolPrice; // ✅
```

### ❌ Not Handling Instant Unstake Fee

```typescript
// Instant unstake has a fee (~0.3%)
// If you need exact amounts, calculate the fee:

const fee = await marinade.liquidUnstakeFee(msolAmount);
const expectedSol = msolAmount * msolPrice - fee;
```

### ❌ Forgetting mSOL Has 9 Decimals

```typescript
// WRONG: Assuming 6 decimals like USDC
const msolAmount = 1 * 10 ** 6; // ❌ Wrong!

// RIGHT: mSOL has 9 decimals (like SOL)
const msolAmount = 1 * 10 ** 9; // ✅
```

## DeFi Composability

mSOL can be used across Solana DeFi:

```typescript
// Use mSOL as collateral on MarginFi
// Provide mSOL-SOL liquidity on Orca
// Lend mSOL on Kamino
// Trade mSOL/SOL on Jupiter

// Example: Swap mSOL to USDC via Jupiter
const quote = await jupiterApi.quoteGet({
  inputMint: MARINADE.MSOL_MINT,
  outputMint: USDC_MINT,
  amount: msolAmount,
});
```

## Native Staking vs Liquid Staking

| Aspect | Native Staking | Marinade (Liquid) |
|--------|---------------|-------------------|
| Lockup | Yes (~2 days to unstake) | No (instant available) |
| DeFi | Cannot use staked SOL | mSOL usable everywhere |
| Yield | ~7% APY | ~7% APY (same source) |
| Decentralization | You choose validator | Auto-distributed |
| Complexity | Manage stake accounts | Just hold mSOL |

## Resources

- **Docs**: https://docs.marinade.finance/
- **SDK**: https://github.com/marinade-finance/marinade-ts-sdk
- **Dashboard**: https://marinade.finance/app/staking
- **Discord**: https://discord.gg/marinade

## Related

- **[../challenges/04-staking-program.md](../challenges/04-staking-program.md)** - Build your own staking
- **[../foundations/05-cpis.md](../foundations/05-cpis.md)** - CPI patterns
