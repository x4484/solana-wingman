# Solana Actions Specification

Quick reference for the Actions API spec.

## URL Scheme

Actions use the `solana-action:` protocol:
```
solana-action:https://yoursite.com/api/actions/tip
```

Or just use HTTPS URLs with a valid `actions.json`.

## GET Response

```typescript
interface ActionGetResponse {
  // Required
  icon: string;         // Image URL (square, recommended 256x256)
  title: string;        // Bold headline
  description: string;  // Supporting text
  label: string;        // Default button text
  
  // Optional
  disabled?: boolean;   // If true, buttons are grayed out
  error?: ActionError;  // Error to display
  links?: {
    actions: LinkedAction[];  // Multiple button options
  };
}

interface LinkedAction {
  label: string;        // Button text
  href: string;         // Action URL (can include query params)
  parameters?: ActionParameter[];  // User input fields
}

interface ActionParameter {
  name: string;         // Query param name
  label: string;        // Input label
  required?: boolean;   // Default false
}
```

## POST Request

Client sends:
```typescript
interface ActionPostRequest {
  account: string;      // User's wallet public key (base58)
}
```

## POST Response

Server returns:
```typescript
interface ActionPostResponse {
  transaction: string;  // Base64 encoded serialized transaction
  message?: string;     // Optional message to show user
}
```

## Error Response

```typescript
interface ActionError {
  message: string;      // Human readable error
}
```

Return with appropriate HTTP status (400, 500, etc).

## Required Headers

Every response needs CORS headers:
```typescript
const ACTIONS_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 
    'Content-Type, Authorization, Content-Encoding, Accept-Encoding',
  'Content-Type': 'application/json',
};
```

## actions.json

Must be at domain root. Maps URL patterns to Action endpoints:
```json
{
  "rules": [
    {
      "pathPattern": "/donate",
      "apiPath": "/api/actions/donate"
    },
    {
      "pathPattern": "/api/actions/**",
      "apiPath": "/api/actions/**"
    }
  ]
}
```

## User Input Fields

For custom amounts or text:
```typescript
links: {
  actions: [
    {
      label: 'Custom Amount',
      href: '/api/actions/tip?amount={amount}',
      parameters: [
        {
          name: 'amount',
          label: 'SOL Amount',
          required: true,
        },
      ],
    },
  ],
}
```

Client renders an input field, substitutes `{amount}` in href.

## Transaction Requirements

1. **Unsigned** - User signs in their wallet
2. **Recent blockhash** - Must be fresh (< 60 seconds old)
3. **Fee payer** - Set to user's wallet
4. **Base64 encoded** - After serialization

```typescript
const tx = new Transaction({
  recentBlockhash: blockhash,
  feePayer: userPubkey,
});

// Add instructions...

const serialized = tx.serialize({ 
  requireAllSignatures: false,
  verifySignatures: false,
});

const base64 = serialized.toString('base64');
```

## Lifecycle

1. Client detects Action URL (via `solana-action:` or `actions.json`)
2. Client sends GET to fetch metadata
3. Client renders UI with buttons/inputs
4. User clicks button
5. Client sends POST with user's wallet
6. Server builds transaction, returns base64
7. Client passes to wallet for signing
8. Wallet signs and submits to chain
9. Client shows success/failure

## Validation Checklist

- [ ] GET returns valid JSON with icon, title, description, label
- [ ] POST accepts `{account}` and returns `{transaction}`
- [ ] CORS headers on all endpoints including OPTIONS
- [ ] actions.json at domain root
- [ ] Transaction has recent blockhash
- [ ] Transaction fee payer is user's wallet
- [ ] Transaction serialized without signatures
