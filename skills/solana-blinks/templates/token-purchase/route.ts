import {
  ActionGetResponse,
  ActionPostResponse,
  ACTIONS_CORS_HEADERS,
} from '@solana/actions';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  getMint,
} from '@solana/spl-token';

// ============================================
// CONFIGURE THESE VALUES
// ============================================
const TOKEN_MINT = new PublicKey('YOUR_TOKEN_MINT_ADDRESS');
const TREASURY = new PublicKey('YOUR_TREASURY_WALLET'); // Holds tokens to sell
const PAYMENT_RECEIVER = new PublicKey('YOUR_PAYMENT_WALLET'); // Receives SOL
const PRICE_PER_TOKEN = 0.001; // SOL per token
const TOKEN_SYMBOL = '$TOKEN';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const ICON_URL = 'https://yoursite.com/token-logo.png';
// ============================================

export const OPTIONS = async () => {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
};

export async function GET(req: Request) {
  const baseUrl = new URL(req.url).origin;
  
  const response: ActionGetResponse = {
    icon: ICON_URL.startsWith('http') ? ICON_URL : `${baseUrl}${ICON_URL}`,
    title: `Buy ${TOKEN_SYMBOL}`,
    description: `Purchase ${TOKEN_SYMBOL} tokens at ${PRICE_PER_TOKEN} SOL each`,
    label: 'Buy Tokens',
    links: {
      actions: [
        { label: '100 tokens', href: `${baseUrl}/api/actions/buy?amount=100` },
        { label: '500 tokens', href: `${baseUrl}/api/actions/buy?amount=500` },
        { label: '1000 tokens', href: `${baseUrl}/api/actions/buy?amount=1000` },
        {
          label: 'Custom',
          href: `${baseUrl}/api/actions/buy?amount={amount}`,
          parameters: [
            {
              name: 'amount',
              label: 'Token Amount',
              required: true,
            },
          ],
        },
      ],
    },
  };
  
  return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const buyer = new PublicKey(body.account);
    
    const url = new URL(req.url);
    const amountStr = url.searchParams.get('amount') || '100';
    const tokenAmount = parseInt(amountStr);
    
    if (isNaN(tokenAmount) || tokenAmount <= 0) {
      return Response.json(
        { error: { message: 'Invalid token amount' } },
        { status: 400, headers: ACTIONS_CORS_HEADERS }
      );
    }
    
    const solCost = tokenAmount * PRICE_PER_TOKEN;
    
    const connection = new Connection(RPC_URL);
    const { blockhash } = await connection.getLatestBlockhash();
    
    // Get token decimals
    const mintInfo = await getMint(connection, TOKEN_MINT);
    const tokenAmountWithDecimals = tokenAmount * (10 ** mintInfo.decimals);
    
    // Get Associated Token Accounts
    const buyerAta = await getAssociatedTokenAddress(TOKEN_MINT, buyer);
    const treasuryAta = await getAssociatedTokenAddress(TOKEN_MINT, TREASURY);
    
    const transaction = new Transaction({
      recentBlockhash: blockhash,
      feePayer: buyer,
    });
    
    // Create buyer's ATA if it doesn't exist
    try {
      await getAccount(connection, buyerAta);
    } catch {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          buyer,       // payer
          buyerAta,    // ata address
          buyer,       // ata owner
          TOKEN_MINT   // mint
        )
      );
    }
    
    // Payment: SOL from buyer to payment receiver
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: buyer,
        toPubkey: PAYMENT_RECEIVER,
        lamports: Math.floor(solCost * LAMPORTS_PER_SOL),
      })
    );
    
    // Token transfer: tokens from treasury to buyer
    // NOTE: This requires treasury to co-sign the transaction
    // For production, use a PDA-controlled treasury or signing service
    transaction.add(
      createTransferInstruction(
        treasuryAta,              // source
        buyerAta,                 // destination
        TREASURY,                 // owner (must sign)
        tokenAmountWithDecimals   // amount with decimals
      )
    );
    
    const response: ActionPostResponse = {
      transaction: transaction.serialize({ 
        requireAllSignatures: false 
      }).toString('base64'),
      message: `Purchasing ${tokenAmount} ${TOKEN_SYMBOL} for ${solCost} SOL`,
    };
    
    return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
  } catch (error: any) {
    console.error('Token purchase error:', error);
    return Response.json(
      { error: { message: error.message || 'Failed to create transaction' } },
      { status: 500, headers: ACTIONS_CORS_HEADERS }
    );
  }
}

/*
 * ⚠️ IMPORTANT: Treasury Signing
 * 
 * This template includes a token transfer from treasury to buyer,
 * which requires the treasury wallet to sign the transaction.
 * 
 * Options for production:
 * 
 * 1. PDA-Controlled Treasury
 *    - Store tokens in a PDA your program controls
 *    - Sign via CPI in your own program
 * 
 * 2. Signing Service
 *    - Treasury key held by secure backend service
 *    - Backend co-signs transactions before returning
 * 
 * 3. Two-Step Process
 *    - User pays SOL first
 *    - Backend monitors payments, sends tokens separately
 * 
 * 4. Jupiter/Raydium Integration
 *    - Use existing DEX pools instead of direct sales
 *    - See the DeFi integrations skill (coming soon)
 */
