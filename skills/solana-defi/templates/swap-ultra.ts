/**
 * Jupiter Ultra API Swap Template
 * 
 * Managed execution with MEV protection, gasless support, and automatic slippage.
 * This is the recommended approach for most swap integrations.
 */

import { VersionedTransaction, Keypair } from '@solana/web3.js';

const JUPITER_ULTRA = 'https://api.jup.ag/ultra/v1';

// Common token mints
const TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
};

interface SwapResult {
  status: 'Success' | 'Failed';
  signature?: string;
  inputAmount?: string;
  outputAmount?: string;
  error?: string;
}

interface OrderResponse {
  transaction?: string;
  requestId?: string;
  error?: string;
}

/**
 * Execute a swap using Jupiter Ultra API
 */
export async function swapWithUltra(
  inputMint: string,
  outputMint: string,
  amount: string,
  wallet: Keypair,
  options?: {
    slippageBps?: number;      // Override automatic slippage (1 = 0.01%)
    priorityFee?: 'auto' | 'low' | 'medium' | 'high' | 'turbo';
  }
): Promise<SwapResult> {
  
  // 1. Build order request URL
  const orderUrl = new URL(`${JUPITER_ULTRA}/order`);
  orderUrl.searchParams.set('inputMint', inputMint);
  orderUrl.searchParams.set('outputMint', outputMint);
  orderUrl.searchParams.set('amount', amount);
  orderUrl.searchParams.set('taker', wallet.publicKey.toBase58());
  
  // Optional overrides
  if (options?.slippageBps) {
    orderUrl.searchParams.set('slippageBps', options.slippageBps.toString());
  }
  if (options?.priorityFee) {
    orderUrl.searchParams.set('priorityFee', options.priorityFee);
  }
  
  // 2. Get quote and unsigned transaction
  const orderRes = await fetch(orderUrl.toString());
  const order: OrderResponse = await orderRes.json();
  
  if (order.error || !order.transaction) {
    return {
      status: 'Failed',
      error: order.error || 'No transaction returned',
    };
  }
  
  // 3. Deserialize and sign
  const txBuffer = Buffer.from(order.transaction, 'base64');
  const transaction = VersionedTransaction.deserialize(txBuffer);
  transaction.sign([wallet]);
  
  // 4. Execute via Jupiter (handles MEV protection + transaction landing)
  const executeRes = await fetch(`${JUPITER_ULTRA}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signedTransaction: Buffer.from(transaction.serialize()).toString('base64'),
      requestId: order.requestId,
    }),
  });
  
  const result: SwapResult = await executeRes.json();
  return result;
}

/**
 * Get token holdings for a wallet
 */
export async function getHoldings(wallet: string) {
  const res = await fetch(`${JUPITER_ULTRA}/holdings?wallet=${wallet}`);
  return res.json();
}

/**
 * Search for a token by name, symbol, or mint
 */
export async function searchToken(query: string) {
  const res = await fetch(`${JUPITER_ULTRA}/search?query=${encodeURIComponent(query)}`);
  return res.json();
}

/**
 * Get token security information
 */
export async function getTokenSecurity(mint: string) {
  const res = await fetch(`${JUPITER_ULTRA}/shield?mint=${mint}`);
  return res.json();
}

// Example usage
async function main() {
  // Load wallet from environment or file
  const privateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!privateKey) {
    console.error('Set SOLANA_PRIVATE_KEY environment variable');
    process.exit(1);
  }
  
  const wallet = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(privateKey))
  );
  
  console.log('Wallet:', wallet.publicKey.toBase58());
  
  // Check holdings first
  const holdings = await getHoldings(wallet.publicKey.toBase58());
  console.log('Holdings:', holdings);
  
  // Swap 0.01 SOL to USDC
  const result = await swapWithUltra(
    TOKENS.SOL,
    TOKENS.USDC,
    '10000000', // 0.01 SOL (9 decimals)
    wallet
  );
  
  if (result.status === 'Success') {
    console.log('Swap successful!');
    console.log('Signature:', result.signature);
    console.log('Input:', result.inputAmount);
    console.log('Output:', result.outputAmount);
  } else {
    console.error('Swap failed:', result.error);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}
