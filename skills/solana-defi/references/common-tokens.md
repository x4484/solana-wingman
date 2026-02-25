# Common Solana Token Mints

## Major Tokens

| Token | Symbol | Mint Address | Decimals |
|-------|--------|--------------|----------|
| Wrapped SOL | SOL | `So11111111111111111111111111111111111111112` | 9 |
| USD Coin | USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 6 |
| Tether | USDT | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | 6 |

## DeFi / Exchange Tokens

| Token | Symbol | Mint Address | Decimals |
|-------|--------|--------------|----------|
| Jupiter | JUP | `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN` | 6 |
| Raydium | RAY | `4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R` | 6 |
| Orca | ORCA | `orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE` | 6 |
| Serum | SRM | `SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt` | 6 |

## Liquid Staking Tokens

| Token | Symbol | Mint Address | Decimals |
|-------|--------|--------------|----------|
| Marinade SOL | mSOL | `mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So` | 9 |
| Lido SOL | stSOL | `7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj` | 9 |
| Jito SOL | JitoSOL | `J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn` | 9 |
| bSOL | bSOL | `bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1` | 9 |

## Popular Meme/Community Tokens

| Token | Symbol | Mint Address | Decimals |
|-------|--------|--------------|----------|
| Bonk | BONK | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` | 5 |
| dogwifhat | WIF | `EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm` | 6 |
| POPCAT | POPCAT | `7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr` | 9 |

## Wrapped Assets

| Token | Symbol | Mint Address | Decimals |
|-------|--------|--------------|----------|
| Wrapped ETH (Wormhole) | WETH | `7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs` | 8 |
| Wrapped BTC (Wormhole) | WBTC | `3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh` | 8 |

## TypeScript Constants

```typescript
export const TOKENS = {
  // Major
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  
  // DeFi
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  ORCA: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
  
  // LSTs
  mSOL: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
  stSOL: '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj',
  JitoSOL: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
  bSOL: 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1',
  
  // Meme
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
} as const;

export const DECIMALS: Record<string, number> = {
  [TOKENS.SOL]: 9,
  [TOKENS.USDC]: 6,
  [TOKENS.USDT]: 6,
  [TOKENS.JUP]: 6,
  [TOKENS.RAY]: 6,
  [TOKENS.ORCA]: 6,
  [TOKENS.mSOL]: 9,
  [TOKENS.stSOL]: 9,
  [TOKENS.JitoSOL]: 9,
  [TOKENS.bSOL]: 9,
  [TOKENS.BONK]: 5,
  [TOKENS.WIF]: 6,
};
```

## Finding Token Mints

### Jupiter Search API
```bash
curl "https://api.jup.ag/ultra/v1/search?query=bonk" | jq
```

### Solscan
https://solscan.io/token/MINT_ADDRESS

### Birdeye
https://birdeye.so/token/MINT_ADDRESS
