#!/bin/bash
# Scaffold a new Solana Action project

set -euo pipefail

PROJECT_NAME="${1:-my-blink}"

echo "🔗 Creating Solana Action project: $PROJECT_NAME"

# Create Next.js app
npx create-next-app@latest "$PROJECT_NAME" --typescript --app --tailwind --eslint --no-src-dir --import-alias "@/*"

cd "$PROJECT_NAME"

# Install dependencies
echo "📦 Installing Solana dependencies..."
npm install @solana/actions @solana/web3.js @solana/spl-token

# Create actions.json
echo "📄 Creating actions.json..."
mkdir -p public
cat > public/actions.json << 'EOF'
{
  "rules": [
    {
      "pathPattern": "/api/actions/**",
      "apiPath": "/api/actions/**"
    }
  ]
}
EOF

# Create example action
echo "⚡ Creating example tip action..."
mkdir -p app/api/actions/tip

cat > app/api/actions/tip/route.ts << 'EOF'
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

// TODO: Replace with your wallet address
const RECIPIENT = new PublicKey('11111111111111111111111111111111');
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export const OPTIONS = async () => {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
};

export async function GET(req: Request) {
  const baseUrl = new URL(req.url).origin;
  
  const response: ActionGetResponse = {
    icon: `${baseUrl}/icon.png`,
    title: 'Send a Tip',
    description: 'Support the creator with SOL',
    label: 'Tip',
    links: {
      actions: [
        { label: '0.1 SOL', href: `${baseUrl}/api/actions/tip?amount=0.1` },
        { label: '0.5 SOL', href: `${baseUrl}/api/actions/tip?amount=0.5` },
        { label: '1 SOL', href: `${baseUrl}/api/actions/tip?amount=1` },
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
    const amount = parseFloat(url.searchParams.get('amount') || '0.1');
    
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
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { error: { message } },
      { status: 500, headers: ACTIONS_CORS_HEADERS }
    );
  }
}
EOF

# Add your own icon at public/icon.png (256x256 PNG recommended)

# Create .env.local
echo "🔐 Creating .env.local..."
cat > .env.local << 'EOF'
# Solana RPC URL (use a paid provider for production)
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
EOF

echo ""
echo "✅ Project created successfully!"
echo ""
echo "Next steps:"
echo "  1. cd $PROJECT_NAME"
echo "  2. Add your icon at public/icon.png (256x256 recommended)"
echo "  3. Update RECIPIENT in app/api/actions/tip/route.ts"
echo "  4. npm run dev"
echo "  5. Test at http://localhost:3000/api/actions/tip"
echo "  6. Deploy with: vercel deploy"
echo "  7. Test blink at: https://www.blinks.xyz/inspector"
echo ""
