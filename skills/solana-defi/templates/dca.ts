/**
 * Jupiter DCA (Dollar Cost Averaging) Template
 * 
 * Automatically buy/sell tokens on a schedule.
 * Great for accumulating positions over time.
 */

import { Connection, VersionedTransaction, Keypair, PublicKey } from '@solana/web3.js';

const JUPITER_RECURRING = 'https://api.jup.ag/recurring/v1';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const API_KEY = process.env.JUPITER_API_KEY!;

const TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

// Common cycle frequencies in seconds
export const CYCLE = {
  HOURLY: 3600,
  EVERY_4_HOURS: 14400,
  EVERY_12_HOURS: 43200,
  DAILY: 86400,
  WEEKLY: 604800,
};

interface DCAPosition {
  id: string;
  user: string;
  inputMint: string;
  outputMint: string;
  totalAmount: string;
  amountPerCycle: string;
  cycleFrequency: number;
  remainingCycles: number;
  nextCycleAt: number;
  createdAt: string;
  status: 'active' | 'completed' | 'cancelled';
}

/**
 * Create a DCA position
 * 
 * @param inputMint - Token you're spending
 * @param outputMint - Token you're buying
 * @param totalAmount - Total amount to spend (in smallest units)
 * @param amountPerCycle - Amount per purchase (in smallest units)
 * @param cycleFrequency - Seconds between purchases
 * @param wallet - Signer wallet
 * @param options - Optional price bounds
 */
export async function createDCA(
  inputMint: string,
  outputMint: string,
  totalAmount: string,
  amountPerCycle: string,
  cycleFrequency: number,
  wallet: Keypair,
  options?: {
    minPrice?: string;  // Min output per input (stops buying if price too high)
    maxPrice?: string;  // Max output per input (stops buying if price too low)
  }
): Promise<string> {
  
  const connection = new Connection(RPC_URL);
  
  // 1. Request DCA creation transaction
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
      minPrice: options?.minPrice ?? null,
      maxPrice: options?.maxPrice ?? null,
    }),
  });
  
  const data = await res.json();
  
  if (data.error) {
    throw new Error(`Failed to create DCA: ${data.error}`);
  }
  
  // 2. Sign the transaction
  const txBuffer = Buffer.from(data.transaction, 'base64');
  const transaction = VersionedTransaction.deserialize(txBuffer);
  transaction.sign([wallet]);

  // 3. Send to network
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  await connection.confirmTransaction(signature, 'confirmed');

  return signature;
}

/**
 * Get all DCA positions for a wallet
 */
export async function getDCAPositions(wallet: string): Promise<DCAPosition[]> {
  const res = await fetch(
    `${JUPITER_RECURRING}/getRecurringOrders?user=${wallet}&orderStatus=active`,
    { headers: { 'x-api-key': API_KEY } }
  );
  const data = await res.json();
  return data.positions || [];
}

/**
 * Close a DCA position (withdraws remaining funds)
 */
export async function closeDCA(
  dcaAddress: string,
  wallet: Keypair
): Promise<string> {
  
  const connection = new Connection(RPC_URL);
  
  const res = await fetch(`${JUPITER_RECURRING}/cancelOrder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({
      user: wallet.publicKey.toBase58(),
      dca: dcaAddress,
    }),
  });

  const data = await res.json();

  if (data.error) {
    throw new Error(`Failed to close DCA: ${data.error}`);
  }

  const txBuffer = Buffer.from(data.transaction, 'base64');
  const transaction = VersionedTransaction.deserialize(txBuffer);
  transaction.sign([wallet]);
  
  const signature = await connection.sendRawTransaction(transaction.serialize());
  await connection.confirmTransaction(signature, 'confirmed');
  
  return signature;
}

/**
 * Calculate DCA parameters
 */
export function calculateDCAParams(
  totalUsd: number,
  numPurchases: number,
  cycleFrequency: number,
  tokenDecimals: number = 6
): { totalAmount: string; amountPerCycle: string; durationDays: number } {
  const totalAmount = Math.floor(totalUsd * Math.pow(10, tokenDecimals));
  const amountPerCycle = Math.floor(totalAmount / numPurchases);
  const durationDays = (numPurchases * cycleFrequency) / 86400;
  
  return {
    totalAmount: totalAmount.toString(),
    amountPerCycle: amountPerCycle.toString(),
    durationDays,
  };
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
  
  // Check existing positions
  const positions = await getDCAPositions(wallet.publicKey.toBase58());
  console.log('Active DCA positions:', positions.length);
  
  // Example: DCA into SOL with $100 USDC over 10 days ($10/day)
  const params = calculateDCAParams(100, 10, CYCLE.DAILY, 6);
  console.log('DCA params:', params);
  
  const signature = await createDCA(
    TOKENS.USDC,           // Spend USDC
    TOKENS.SOL,            // Buy SOL
    params.totalAmount,    // 100 USDC total
    params.amountPerCycle, // ~10 USDC per purchase
    CYCLE.DAILY,           // Once per day
    wallet
  );
  
  console.log('DCA created:', signature);
  console.log(`Will buy SOL daily for ${params.durationDays} days`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
