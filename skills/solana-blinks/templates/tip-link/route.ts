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

// ============================================
// CONFIGURE THESE VALUES
// ============================================
const RECIPIENT = new PublicKey('YOUR_WALLET_ADDRESS_HERE');
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const ICON_URL = 'https://yoursite.com/icon.png'; // 256x256 recommended
const TITLE = 'Tip the Creator';
const DESCRIPTION = 'Send SOL to support this creator';
// ============================================

export const OPTIONS = async () => {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
};

export async function GET(req: Request) {
  const baseUrl = new URL(req.url).origin;
  
  const response: ActionGetResponse = {
    icon: ICON_URL.startsWith('http') ? ICON_URL : `${baseUrl}${ICON_URL}`,
    title: TITLE,
    description: DESCRIPTION,
    label: 'Send Tip',
    links: {
      actions: [
        { label: '0.1 SOL', href: `${baseUrl}/api/actions/tip?amount=0.1` },
        { label: '0.5 SOL', href: `${baseUrl}/api/actions/tip?amount=0.5` },
        { label: '1 SOL', href: `${baseUrl}/api/actions/tip?amount=1` },
        {
          label: 'Custom',
          href: `${baseUrl}/api/actions/tip?amount={amount}`,
          parameters: [
            {
              name: 'amount',
              label: 'SOL Amount',
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
    const sender = new PublicKey(body.account);
    
    const url = new URL(req.url);
    const amountStr = url.searchParams.get('amount') || '0.1';
    const amount = parseFloat(amountStr);
    
    if (isNaN(amount) || amount <= 0) {
      return Response.json(
        { error: { message: 'Invalid amount' } },
        { status: 400, headers: ACTIONS_CORS_HEADERS }
      );
    }
    
    const connection = new Connection(RPC_URL);
    const { blockhash } = await connection.getLatestBlockhash();
    
    const transaction = new Transaction({
      recentBlockhash: blockhash,
      feePayer: sender,
    }).add(
      SystemProgram.transfer({
        fromPubkey: sender,
        toPubkey: RECIPIENT,
        lamports: Math.floor(amount * LAMPORTS_PER_SOL),
      })
    );
    
    const response: ActionPostResponse = {
      transaction: transaction.serialize({ 
        requireAllSignatures: false 
      }).toString('base64'),
      message: `Sending ${amount} SOL tip!`,
    };
    
    return Response.json(response, { headers: ACTIONS_CORS_HEADERS });
  } catch (error: any) {
    console.error('Tip action error:', error);
    return Response.json(
      { error: { message: error.message || 'Failed to create transaction' } },
      { status: 500, headers: ACTIONS_CORS_HEADERS }
    );
  }
}
