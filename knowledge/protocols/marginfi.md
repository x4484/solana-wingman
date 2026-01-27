# MarginFi

## TLDR

MarginFi is a decentralized lending protocol on Solana. Deposit assets to earn yield, borrow against collateral. Think Aave/Compound but on Solana with better UX and cross-margin positions.

## Why MarginFi?

| Feature | Benefit |
|---------|---------|
| Lending/borrowing | Earn yield or leverage up |
| Cross-margin | All collateral in one account |
| Risk tiers | Isolated pools for risky assets |
| Liquidation engine | Efficient liquidations |
| Points program | mrgnlend points for usage |

## Core Concepts

### Margin Accounts

```
┌─────────────────────────────────────────────────────────┐
│                   MarginFi Account                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Deposits (Collateral):                                │
│  ├── 10 SOL ($2,000)     @ 80% weight = $1,600        │
│  ├── 1000 USDC ($1,000)  @ 95% weight = $950          │
│  └── Total Weighted: $2,550                            │
│                                                         │
│  Borrows (Liabilities):                                │
│  ├── 500 USDC borrowed   @ 100% weight = $500         │
│  └── Total Liability: $500                             │
│                                                         │
│  Health Factor: $2,550 / $500 = 5.1x (healthy)        │
│  Liquidation at: < 1.0x                                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Risk Tiers

| Tier | Assets | Use Case |
|------|--------|----------|
| **Isolated** | New/volatile tokens | Can only borrow in isolated pool |
| **Cross** | Blue chips (SOL, USDC) | Full cross-margin capability |

## Integration

### Installation

```bash
npm install @mrgnlabs/marginfi-client-v2
```

### Initialize Client

```typescript
import { MarginfiClient, getConfig } from "@mrgnlabs/marginfi-client-v2";
import { Connection, Keypair } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const wallet = new Wallet(Keypair.fromSecretKey(/* your key */));

// Get client
const config = getConfig("production");
const client = await MarginfiClient.fetch(config, wallet, connection);
```

### Create Margin Account

```typescript
// Each user needs a margin account to interact
const marginfiAccount = await client.createMarginfiAccount();
console.log("Account:", marginfiAccount.address.toBase58());
```

### Deposit Collateral

```typescript
async function deposit(bankMint: PublicKey, amount: number) {
  // Find the bank for this asset
  const bank = client.getBankByMint(bankMint);
  if (!bank) throw new Error("Bank not found");

  // Get user's margin account
  const accounts = await client.getMarginfiAccountsForAuthority();
  const account = accounts[0];

  // Deposit
  await account.deposit(amount, bank.address);
  
  console.log(`Deposited ${amount} to ${bank.label}`);
}

// Deposit 1 SOL
const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
await deposit(SOL_MINT, 1_000_000_000);
```

### Borrow Assets

```typescript
async function borrow(bankMint: PublicKey, amount: number) {
  const bank = client.getBankByMint(bankMint);
  if (!bank) throw new Error("Bank not found");

  const accounts = await client.getMarginfiAccountsForAuthority();
  const account = accounts[0];

  // Check if we can borrow (health factor)
  // ...

  await account.borrow(amount, bank.address);
  
  console.log(`Borrowed ${amount} from ${bank.label}`);
}

// Borrow 100 USDC against SOL collateral
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
await borrow(USDC_MINT, 100_000_000); // 100 USDC (6 decimals)
```

### Repay Loan

```typescript
async function repay(bankMint: PublicKey, amount: number) {
  const bank = client.getBankByMint(bankMint);
  const accounts = await client.getMarginfiAccountsForAuthority();
  const account = accounts[0];

  // Repay (use amount = -1 to repay all)
  await account.repay(amount, bank.address, amount === -1);
}

// Repay all USDC debt
await repay(USDC_MINT, -1);
```

### Withdraw Collateral

```typescript
async function withdraw(bankMint: PublicKey, amount: number) {
  const bank = client.getBankByMint(bankMint);
  const accounts = await client.getMarginfiAccountsForAuthority();
  const account = accounts[0];

  // Withdraw (use amount = -1 to withdraw all available)
  await account.withdraw(amount, bank.address, amount === -1);
}
```

### Check Account Health

```typescript
async function getAccountHealth() {
  const accounts = await client.getMarginfiAccountsForAuthority();
  const account = accounts[0];

  // Get all balances
  const balances = account.activeBalances;
  
  let totalCollateral = 0;
  let totalLiabilities = 0;

  for (const balance of balances) {
    const bank = client.getBankByPk(balance.bankPk);
    const value = balance.computeUsdValue(bank, "equity").toNumber();
    
    if (balance.isLending) {
      totalCollateral += value;
    } else {
      totalLiabilities += value;
    }
  }

  const healthFactor = totalLiabilities > 0 
    ? totalCollateral / totalLiabilities 
    : Infinity;

  return {
    collateral: totalCollateral,
    liabilities: totalLiabilities,
    healthFactor,
    isHealthy: healthFactor > 1.0,
  };
}
```

## Key Addresses

### Mainnet

```typescript
const MARGINFI = {
  // Main program
  PROGRAM_ID: "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA",
  
  // Group (pool config)
  GROUP: "4qp6Fx6tnZkY5Wropq9wUYgtFxXKwE6viZxFHg3rdAG8",
  
  // Common banks (lending pools)
  BANKS: {
    SOL: "CCKtUs6Cgwo4aaQUmBPmyoApH2gUDErxNZCAntD6LYGh",
    USDC: "2s37akK2eyBbp8DZgCm7RtsaEz8eJP3Nxd4urLHQv7yB",
    USDT: "HmpMfL8942u22htC4EMiWgLX931g3sacXFR6KjuLgKLV",
    mSOL: "8Fv5CunL6qUbbrGLWSLcv5x8F7HQhvEbpHv5YQwL9Svr",
    JitoSOL: "Bohoc1ikHLD7xKJuzTyiTyCwzaL5N7ggJQu75A91sJwh",
  },
};
```

## Common Mistakes

### ❌ Not Checking Health Before Borrowing

```typescript
// WRONG: Borrow without checking
await account.borrow(hugeAmount, bank.address); // ❌ Might fail or liquidate

// RIGHT: Check health factor first
const health = await getAccountHealth();
if (health.healthFactor < 1.5) {
  throw new Error("Health too low to borrow more");
}
await account.borrow(amount, bank.address); // ✅
```

### ❌ Forgetting Interest Accrues

```typescript
// WRONG: Assuming debt is static
const debt = borrowedAmount; // ❌ Interest accrues!

// RIGHT: Get current balance from account
const account = await client.getMarginfiAccountsForAuthority()[0];
const balance = account.getBalance(usdcBank);
const currentDebt = balance.computeQuantityUi(usdcBank).liabilities; // ✅
```

### ❌ Withdrawing All Without Checking Borrows

```typescript
// WRONG: Withdraw everything
await account.withdraw(-1, bank.address, true); // ❌ Fails if you have borrows!

// RIGHT: Check outstanding borrows first
const health = await getAccountHealth();
if (health.liabilities > 0) {
  console.log("Repay borrows before withdrawing all");
}
```

## Liquidation

When health factor drops below 1.0:

```typescript
// Anyone can liquidate unhealthy accounts
async function liquidate(
  liquidateeAccount: PublicKey,
  assetBank: PublicKey,  // Collateral to seize
  liabilityBank: PublicKey,  // Debt to repay
  amount: number
) {
  const liquidatorAccount = await client.getMarginfiAccountsForAuthority()[0];
  
  await liquidatorAccount.liquidate(
    liquidateeAccount,
    assetBank,
    amount,
    liabilityBank
  );
}

// Liquidators get a bonus (typically 5%) for liquidating
```

## Resources

- **Docs**: https://docs.marginfi.com/
- **SDK**: https://github.com/mrgnlabs/mrgn-ts
- **App**: https://app.marginfi.com/
- **Discord**: https://discord.gg/mrgn

## Related

- **[../challenges/04-staking-program.md](../challenges/04-staking-program.md)** - Staking concepts
- **[../challenges/07-oracle-pyth.md](../challenges/07-oracle-pyth.md)** - Price feeds for liquidations
