/**
 * Jupiter Limit Order Template
 * 
 * Create, query, and cancel limit orders on Jupiter.
 * Orders execute automatically when price hits your target.
 */

import { Connection, VersionedTransaction, Keypair } from '@solana/web3.js';

const JUPITER_LIMIT = 'https://api.jup.ag/limit/v2';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

const TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

interface LimitOrder {
  id: string;
  maker: string;
  inputMint: string;
  outputMint: string;
  makingAmount: string;
  takingAmount: string;
  expiredAt: number | null;
  createdAt: string;
  status: string;
}

/**
 * Create a limit order
 * 
 * @param inputMint - Token you're selling
 * @param outputMint - Token you want to receive
 * @param makingAmount - Amount you're selling (in smallest units)
 * @param takingAmount - Amount you want to receive (in smallest units)
 * @param wallet - Signer wallet
 * @param expiredAt - Unix timestamp when order expires (null = never)
 */
export async function createLimitOrder(
  inputMint: string,
  outputMint: string,
  makingAmount: string,
  takingAmount: string,
  wallet: Keypair,
  expiredAt?: number | null
): Promise<string> {
  
  const connection = new Connection(RPC_URL);
  
  // 1. Request order creation transaction
  const res = await fetch(`${JUPITER_LIMIT}/createOrder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      maker: wallet.publicKey.toBase58(),
      payer: wallet.publicKey.toBase58(),
      inputMint,
      outputMint,
      makingAmount,
      takingAmount,
      expiredAt: expiredAt ?? null,
    }),
  });
  
  const data = await res.json();
  
  if (data.error) {
    throw new Error(`Failed to create order: ${data.error}`);
  }
  
  // 2. Sign the transaction
  const txBuffer = Buffer.from(data.tx, 'base64');
  const transaction = VersionedTransaction.deserialize(txBuffer);
  transaction.sign([wallet]);
  
  // 3. Send to network
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  
  // 4. Confirm
  await connection.confirmTransaction(signature, 'confirmed');
  
  return signature;
}

/**
 * Get all open orders for a wallet
 */
export async function getOpenOrders(wallet: string): Promise<LimitOrder[]> {
  const res = await fetch(`${JUPITER_LIMIT}/openOrders?wallet=${wallet}`);
  const data = await res.json();
  return data.orders || [];
}

/**
 * Get order history for a wallet
 */
export async function getOrderHistory(wallet: string): Promise<LimitOrder[]> {
  const res = await fetch(`${JUPITER_LIMIT}/orderHistory?wallet=${wallet}`);
  const data = await res.json();
  return data.orders || [];
}

/**
 * Cancel one or more orders
 */
export async function cancelOrders(
  orderIds: string[],
  wallet: Keypair
): Promise<string[]> {
  
  const connection = new Connection(RPC_URL);
  
  // 1. Request cancel transactions
  const res = await fetch(`${JUPITER_LIMIT}/cancelOrders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      maker: wallet.publicKey.toBase58(),
      orders: orderIds,
    }),
  });
  
  const data = await res.json();
  
  if (data.error) {
    throw new Error(`Failed to cancel orders: ${data.error}`);
  }
  
  // 2. Sign and send each cancel transaction
  const signatures: string[] = [];
  
  for (const txBase64 of data.txs) {
    const txBuffer = Buffer.from(txBase64, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuffer);
    transaction.sign([wallet]);
    
    const signature = await connection.sendRawTransaction(transaction.serialize());
    await connection.confirmTransaction(signature, 'confirmed');
    signatures.push(signature);
  }
  
  return signatures;
}

/**
 * Calculate the effective price of an order
 */
export function calculateOrderPrice(
  makingAmount: string,
  takingAmount: string,
  makingDecimals: number,
  takingDecimals: number
): number {
  const making = parseFloat(makingAmount) / Math.pow(10, makingDecimals);
  const taking = parseFloat(takingAmount) / Math.pow(10, takingDecimals);
  return taking / making;
}

// Example usage
async function main() {
  const privateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!privateKey) {
    console.error('Set SOLANA_PRIVATE_KEY environment variable');
    process.exit(1);
  }
  
  const wallet = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(privateKey))
  );
  
  console.log('Wallet:', wallet.publicKey.toBase58());
  
  // Check existing orders
  const openOrders = await getOpenOrders(wallet.publicKey.toBase58());
  console.log('Open orders:', openOrders.length);
  
  // Create a limit order: Sell 0.1 SOL for 15 USDC (price: $150/SOL)
  // This will execute when SOL reaches $150
  const signature = await createLimitOrder(
    TOKENS.SOL,
    TOKENS.USDC,
    '100000000',   // 0.1 SOL (9 decimals)
    '15000000',    // 15 USDC (6 decimals)
    wallet,
    null           // Never expires
  );
  
  console.log('Order created:', signature);
  
  // Price calculation
  const price = calculateOrderPrice('100000000', '15000000', 9, 6);
  console.log('Order price: $', price.toFixed(2), 'per SOL');
}

if (require.main === module) {
  main().catch(console.error);
}
