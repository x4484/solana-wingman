---
name: solana-defi
description: Build Solana DeFi apps with Jupiter aggregator, limit orders, DCA, and liquidity provision. Unified interface for swaps, trading strategies, and LP management.
metadata: {"clawdbot":{"emoji":"🪐","category":"solana"}}
triggers:
  - jupiter swap
  - solana defi
  - token swap solana
  - limit order jupiter
  - dca solana
  - dollar cost average
  - jupiter ultra
---

# Jupiter DeFi Integrator

Build DeFi applications on Solana. Covers token swaps, limit orders, DCA strategies, and liquidity provision through a unified interface.

## API Key Requirement

All Jupiter API calls now require an `x-api-key` header. Get a free key from [portal.jup.ag](https://portal.jup.ag).

```typescript
const JUPITER_API_KEY = process.env.JUPITER_API_KEY;

const headers: Record<string, string> = {
  'x-api-key': JUPITER_API_KEY,
};

// For POST requests, also include Content-Type:
const postHeaders: Record<string, string> = {
  'x-api-key': JUPITER_API_KEY,
  'Content-Type': 'application/json',
};
```

Include the `x-api-key` header in every `fetch` call to Jupiter endpoints.

## Quick Start

### Execute a Swap (30 seconds)

```bash
# Swap 0.1 SOL to USDC using Jupiter Ultra API
curl -s -H "x-api-key: YOUR_API_KEY" "https://api.jup.ag/ultra/v1/order?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=100000000&taker=YOUR_WALLET" | jq
```

### Check Token Price

```bash
curl -s -H "x-api-key: YOUR_API_KEY" "https://api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112" | jq
```

### Get Wallet Holdings

```bash
curl -s -H "x-api-key: YOUR_API_KEY" "https://api.jup.ag/ultra/v1/holdings/YOUR_WALLET" | jq
```

## Architecture: Ultra vs Swap API

Jupiter offers two APIs. **Use Ultra by default.**

| Feature | Ultra API | Swap API |
|---------|-----------|----------|
| RPC Required | No | Yes |
| MEV Protection | Built-in | Build yourself |
| Gasless Support | Automatic | Build yourself |
| CPI Support | No | Yes |
| Custom Instructions | No | Yes |
| Integration Time | Hours | Days/Weeks |

**Choose Swap API only when you need:**
- CPI (calling Jupiter from your own Solana program)
- Custom instructions in the transaction
- Full control over execution infrastructure

## Core Operations

### 1. Token Swaps (Ultra API)

**Two-step flow:** Get order → Sign → Execute

```typescript
import { VersionedTransaction, Keypair } from '@solana/web3.js';

const JUPITER_ULTRA = 'https://api.jup.ag/ultra/v1';
const API_KEY = process.env.JUPITER_API_KEY!;

async function swap(
  inputMint: string,
  outputMint: string,
  amount: string,
  wallet: Keypair
): Promise<{ signature: string; inputAmount: string; outputAmount: string }> {

  // 1. Get quote and unsigned transaction
  const orderUrl = new URL(`${JUPITER_ULTRA}/order`);
  orderUrl.searchParams.set('inputMint', inputMint);
  orderUrl.searchParams.set('outputMint', outputMint);
  orderUrl.searchParams.set('amount', amount);
  orderUrl.searchParams.set('taker', wallet.publicKey.toBase58());

  const orderRes = await fetch(orderUrl, {
    headers: { 'x-api-key': API_KEY },
  });
  const order = await orderRes.json();

  if (order.error) {
    throw new Error(`Order failed: ${order.error}`);
  }

  // 2. Sign the transaction
  const txBuffer = Buffer.from(order.transaction, 'base64');
  const transaction = VersionedTransaction.deserialize(txBuffer);
  transaction.sign([wallet]);

  // 3. Execute via Jupiter (handles MEV protection + landing)
  const executeRes = await fetch(`${JUPITER_ULTRA}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({
      signedTransaction: Buffer.from(transaction.serialize()).toString('base64'),
      requestId: order.requestId,
    }),
  });

  const result = await executeRes.json();

  if (result.status !== 'Success') {
    throw new Error(`Execution failed: ${result.error || 'Unknown error'}`);
  }

  return {
    signature: result.signature,
    inputAmount: result.inputAmount,
    outputAmount: result.outputAmount,
  };
}

// Usage
const SOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const result = await swap(SOL, USDC, '100000000', wallet); // 0.1 SOL
console.log(`Swapped! TX: ${result.signature}`);
```

### 2. Limit Orders

Create orders that execute when price hits your target.

```typescript
const JUPITER_TRIGGER = 'https://api.jup.ag/trigger/v1';
const API_KEY = process.env.JUPITER_API_KEY!;

// Create a limit order: Sell 1 SOL when price hits $200
async function createLimitOrder(
  inputMint: string,
  outputMint: string,
  makingAmount: string,  // Amount you're selling
  takingAmount: string,  // Amount you want to receive
  wallet: Keypair,
  expiredAt?: number     // Unix timestamp, null = never expires
) {
  const res = await fetch(`${JUPITER_TRIGGER}/createOrder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({
      maker: wallet.publicKey.toBase58(),
      payer: wallet.publicKey.toBase58(),
      inputMint,
      outputMint,
      makingAmount,
      takingAmount,
      expiredAt: expiredAt || null,
    }),
  });

  const { transaction } = await res.json();

  // Sign and send
  const tx = VersionedTransaction.deserialize(Buffer.from(transaction, 'base64'));
  tx.sign([wallet]);

  // Send to network (need RPC for limit orders)
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(sig);

  return sig;
}

// Query active orders
async function getOpenOrders(wallet: string) {
  const res = await fetch(
    `${JUPITER_TRIGGER}/getTriggerOrders?user=${wallet}&orderStatus=active`,
    { headers: { 'x-api-key': API_KEY } }
  );
  return res.json();
}

// Cancel an order
async function cancelOrder(orderId: string, wallet: Keypair) {
  const res = await fetch(`${JUPITER_TRIGGER}/cancelOrder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({
      maker: wallet.publicKey.toBase58(),
      orders: [orderId],
    }),
  });

  const { txs } = await res.json();
  // Sign and send each cancel transaction...
}
```

### 3. DCA (Dollar Cost Averaging)

Automatically buy/sell tokens on a schedule.

```typescript
const JUPITER_RECURRING = 'https://api.jup.ag/recurring/v1';
const API_KEY = process.env.JUPITER_API_KEY!;

// Create DCA: Buy SOL with 100 USDC over 10 days
async function createDCA(
  inputMint: string,      // Token you're spending
  outputMint: string,     // Token you're buying
  totalAmount: string,    // Total to spend
  amountPerCycle: string, // Amount per purchase
  cycleFrequency: number, // Seconds between purchases
  wallet: Keypair
) {
  const res = await fetch(`${JUPITER_RECURRING}/createOrder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({
      user: wallet.publicKey.toBase58(),
      inputMint,
      outputMint,
      totalAmount,
      amountPerCycle,
      cycleFrequency,
      minPrice: null,  // Optional price bounds
      maxPrice: null,
    }),
  });

  const { transaction } = await res.json();
  // Sign and send...
}

// Example: Buy SOL daily with $10 USDC for 10 days
await createDCA(
  USDC,                    // Spend USDC
  SOL,                     // Buy SOL
  '100000000',             // 100 USDC total (6 decimals)
  '10000000',              // 10 USDC per buy
  86400,                   // Daily (24 * 60 * 60 seconds)
  wallet
);
```

### 4. Token Information

```typescript
const API_KEY = process.env.JUPITER_API_KEY!;

// Search for tokens
async function searchToken(query: string) {
  const res = await fetch(
    `https://api.jup.ag/ultra/v1/search?query=${query}`,
    { headers: { 'x-api-key': API_KEY } }
  );
  return res.json();
}

// Get token price
async function getPrice(mint: string) {
  const res = await fetch(
    `https://api.jup.ag/price/v3?ids=${mint}`,
    { headers: { 'x-api-key': API_KEY } }
  );
  const data = await res.json();
  return data.data[mint]?.price;
}

// Get wallet holdings
async function getHoldings(wallet: string) {
  const res = await fetch(
    `https://api.jup.ag/ultra/v1/holdings/${wallet}`,
    { headers: { 'x-api-key': API_KEY } }
  );
  return res.json();
}

// Token security check (Jupiter Shield)
async function checkTokenSafety(mint: string) {
  const res = await fetch(
    `https://api.jup.ag/ultra/v1/shield?mints=${mint}`,
    { headers: { 'x-api-key': API_KEY } }
  );
  const data = await res.json();

  return {
    isMintable: data.isMintable,      // Can supply increase?
    isFreezable: data.isFreezable,    // Can accounts be frozen?
    hasRenounced: data.hasRenounced,  // Authority renounced?
    liquidityScore: data.liquidityScore,
    topHolders: data.topHolders,      // Concentration risk
  };
}
```

## Common Token Mints

```typescript
const TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',   // Wrapped SOL
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  ORCA: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
  mSOL: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
  stSOL: '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj',
  JitoSOL: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
};
```

## Slippage & Settings

### Manual Mode (Override Defaults)

By default, Ultra API uses its Real-Time Slippage Estimator (RTSE). Override with:

```typescript
const orderUrl = new URL('https://api.jup.ag/ultra/v1/order');
orderUrl.searchParams.set('inputMint', SOL);
orderUrl.searchParams.set('outputMint', USDC);
orderUrl.searchParams.set('amount', '100000000');
orderUrl.searchParams.set('taker', wallet);

// Manual overrides
orderUrl.searchParams.set('slippageBps', '50');         // 0.5% max slippage
orderUrl.searchParams.set('priorityFee', 'high');       // auto, low, medium, high, turbo
orderUrl.searchParams.set('priorityFeeExact', '10000'); // Or exact lamports
```

### Slippage Guidelines

| Token Type | Recommended Slippage |
|------------|---------------------|
| Majors (SOL, USDC) | 0.1% - 0.3% |
| Mid-caps | 0.5% - 1% |
| Low-cap / Meme | 1% - 5% |
| New launches | 5% - 15% |

## Error Handling

```typescript
async function safeSwap(inputMint: string, outputMint: string, amount: string, wallet: Keypair) {
  try {
    // Get order
    const orderRes = await fetch(`https://api.jup.ag/ultra/v1/order?...`, {
      headers: { 'x-api-key': API_KEY },
    });
    const order = await orderRes.json();
    
    if (order.error) {
      if (order.error.includes('insufficient')) {
        throw new Error('Insufficient balance');
      }
      if (order.error.includes('route')) {
        throw new Error('No route found - token may have low liquidity');
      }
      throw new Error(order.error);
    }
    
    // Sign and execute...
    const executeRes = await fetch(`https://api.jup.ag/ultra/v1/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ signedTransaction: '...', requestId: order.requestId }),
    });
    const result = await executeRes.json();
    
    if (result.status === 'Failed') {
      if (result.error?.includes('slippage')) {
        throw new Error('Slippage exceeded - price moved too much');
      }
      if (result.error?.includes('expired')) {
        throw new Error('Transaction expired - try again');
      }
      throw new Error(result.error || 'Execution failed');
    }
    
    return result;
    
  } catch (err) {
    console.error('Swap failed:', err.message);
    throw err;
  }
}
```

## API Reference

### Jupiter Ultra API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ultra/v1/order` | GET | Get quote + unsigned transaction |
| `/ultra/v1/execute` | POST | Execute signed transaction |
| `/ultra/v1/holdings/{address}` | GET | Get wallet token balances |
| `/ultra/v1/search` | GET | Search tokens by name/symbol/mint |
| `/ultra/v1/shield?mints=X` | GET | Token security information |

### Jupiter Trigger Order API (Limit Orders)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/trigger/v1/createOrder` | POST | Create limit order |
| `/trigger/v1/cancelOrder` | POST | Cancel an order |
| `/trigger/v1/getTriggerOrders?user=X&orderStatus=active` | GET | Get active orders for wallet |
| `/trigger/v1/getTriggerOrders?user=X&orderStatus=history` | GET | Get order history |

### Jupiter Recurring Order API (DCA)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/recurring/v1/createOrder` | POST | Create DCA / recurring position |
| `/recurring/v1/cancelOrder` | POST | Cancel a recurring position |
| `/recurring/v1/getRecurringOrders?user=X&orderStatus=active` | GET | Get active recurring positions |

### Jupiter Price API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/price/v3?ids=X,Y` | GET | Get token prices |

## Troubleshooting

### "No route found"
- Token may have very low liquidity
- Check if token is listed: `https://api.jup.ag/ultra/v1/search?query=TOKEN`
- Try smaller amounts

### "Slippage exceeded"
- Price moved between quote and execution
- Increase slippage tolerance
- Try during lower volatility periods

### "Transaction expired"
- Blockhash expired before landing
- Retry immediately
- Ultra API handles this better than the Swap API

### "Insufficient balance"
- Check SOL for fees (need ~0.01 SOL)
- Verify token balance matches amount

## Resources

- [Jupiter Developer Portal](https://dev.jup.ag/docs)
- [Jupiter Discord](https://discord.gg/jup)
- [Solana Web3.js Docs](https://solana-labs.github.io/solana-web3.js/)
- [Jupiter GitHub](https://github.com/jup-ag)
