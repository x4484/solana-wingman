# Challenge 7: Oracle Integration (Pyth)

## TLDR

Integrate real-world price data into your Solana programs using Pyth Network. Learn to read price feeds, handle staleness, and build a simple liquidation checker.

## Core Concepts

### What You're Building

A program that:
1. Reads SOL/USD price from Pyth
2. Checks price staleness and confidence
3. Calculates collateral values
4. Triggers actions based on price thresholds

### Why Oracles Matter

```
On-chain programs can't access external data directly.

❌ Can't do:
   let price = fetch("https://api.coinbase.com/price/SOL");

✅ Must use:
   Oracles bring external data on-chain via trusted price feeds
```

### Pyth Network Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    PYTH NETWORK                          │
├─────────────────────────────────────────────────────────┤
│  Data Providers (exchanges, market makers)              │
│         ↓                                               │
│  Pyth Publishers aggregate prices                       │
│         ↓                                               │
│  On-chain Price Accounts (one per asset)                │
│         ↓                                               │
│  Your Program reads price accounts                      │
└─────────────────────────────────────────────────────────┘

Price Account Structure:
┌─────────────────────────────────────────────────────────┐
│  Price Feed Account                                      │
├─────────────────────────────────────────────────────────┤
│  price: i64           │  Current price (scaled)         │
│  conf: u64            │  Confidence interval            │
│  expo: i32            │  Price exponent (e.g., -8)      │
│  publish_time: i64    │  When price was published       │
│  ema_price: i64       │  Exponential moving average     │
│  ema_conf: u64        │  EMA confidence                 │
└─────────────────────────────────────────────────────────┘

Example: SOL/USD = $150.25
- price: 15025000000 (scaled integer)
- expo: -8 (divide by 10^8)
- Actual price = 15025000000 × 10^-8 = $150.25
```

### Key Pyth Concepts

1. **Price Feed**: Account storing current price for an asset pair
2. **Confidence Interval**: How certain Pyth is about the price (±conf)
3. **Staleness**: How old the price data is
4. **EMA**: Exponential moving average for smoother price

## Project Setup

```bash
# Add Pyth dependencies
cargo add pyth-solana-receiver-sdk

# Cargo.toml
[dependencies]
anchor-lang = "0.30.0"
pyth-solana-receiver-sdk = "0.3"
```

## Code Walkthrough

### 1. Read Price from Pyth

```rust
use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{
    get_feed_id_from_hex,
    PriceUpdateV2,
};

declare_id!("YOUR_PROGRAM_ID");

// Pyth feed IDs (mainnet)
// Find more at: https://pyth.network/developers/price-feed-ids
const SOL_USD_FEED_ID: &str = "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
const ETH_USD_FEED_ID: &str = "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";
const BTC_USD_FEED_ID: &str = "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";

#[program]
pub mod oracle_example {
    use super::*;

    /// Read SOL/USD price from Pyth
    pub fn get_sol_price(ctx: Context<GetPrice>) -> Result<()> {
        let price_update = &ctx.accounts.price_update;
        
        // Get the price, checking staleness (max 60 seconds old)
        let max_age_seconds = 60;
        let feed_id = get_feed_id_from_hex(SOL_USD_FEED_ID)?;
        
        let price = price_update.get_price_no_older_than(
            &Clock::get()?,
            max_age_seconds,
            &feed_id,
        )?;

        // Price is scaled by 10^|expo|
        let price_value = price.price;           // e.g., 15025000000
        let confidence = price.conf;             // e.g., 10000000 (±$0.10)
        let exponent = price.exponent;           // e.g., -8
        
        // Calculate actual price
        let scale = 10_i64.pow((-exponent) as u32);
        let actual_price = price_value as f64 / scale as f64;
        
        msg!("SOL/USD Price: ${:.2}", actual_price);
        msg!("Confidence: ±${:.4}", confidence as f64 / scale as f64);
        msg!("Published: {} seconds ago", 
            Clock::get()?.unix_timestamp - price.publish_time);

        Ok(())
    }

    /// Check if position should be liquidated
    pub fn check_liquidation(
        ctx: Context<CheckLiquidation>,
        collateral_amount: u64,      // SOL deposited (in lamports)
        borrowed_amount: u64,        // USD borrowed (scaled by 10^6)
        liquidation_threshold: u64,  // e.g., 8000 = 80%
    ) -> Result<()> {
        let price_update = &ctx.accounts.price_update;
        let feed_id = get_feed_id_from_hex(SOL_USD_FEED_ID)?;
        
        // Get price with staleness check
        let price = price_update.get_price_no_older_than(
            &Clock::get()?,
            30,  // Stricter for liquidations: max 30 seconds
            &feed_id,
        )?;

        // Use conservative price (price - confidence) for liquidations
        let conservative_price = price.price
            .checked_sub(price.conf as i64)
            .ok_or(OracleError::MathOverflow)?;

        // Calculate collateral value in USD (scaled by 10^6)
        // collateral_amount is in lamports (10^9)
        // price is scaled by 10^|expo|
        let expo_adjustment = 10_i128.pow((-price.exponent) as u32);
        let collateral_value_usd = (collateral_amount as i128)
            .checked_mul(conservative_price as i128)
            .ok_or(OracleError::MathOverflow)?
            .checked_div(expo_adjustment)
            .ok_or(OracleError::MathOverflow)?
            .checked_div(1_000_000_000)  // Convert lamports to SOL
            .ok_or(OracleError::MathOverflow)?
            .checked_mul(1_000_000)      // Scale to 10^6 for USD
            .ok_or(OracleError::MathOverflow)? as u64;

        // Check health factor: collateral_value / borrowed >= threshold
        let health_factor = collateral_value_usd
            .checked_mul(10000)
            .ok_or(OracleError::MathOverflow)?
            .checked_div(borrowed_amount)
            .ok_or(OracleError::MathOverflow)?;

        msg!("Collateral value: ${}", collateral_value_usd as f64 / 1_000_000.0);
        msg!("Borrowed amount: ${}", borrowed_amount as f64 / 1_000_000.0);
        msg!("Health factor: {}%", health_factor as f64 / 100.0);

        if health_factor < liquidation_threshold {
            msg!("⚠️ LIQUIDATION TRIGGERED!");
            // In a real program, perform liquidation here
            return err!(OracleError::Liquidatable);
        }

        msg!("✅ Position is healthy");
        Ok(())
    }

    /// Use EMA price for less volatile calculations
    pub fn get_ema_price(ctx: Context<GetPrice>) -> Result<()> {
        let price_update = &ctx.accounts.price_update;
        let feed_id = get_feed_id_from_hex(SOL_USD_FEED_ID)?;
        
        let price = price_update.get_price_no_older_than(
            &Clock::get()?,
            60,
            &feed_id,
        )?;

        // EMA is smoother, good for:
        // - Funding rate calculations
        // - Less manipulation-prone valuations
        // - Gradual liquidation triggers
        let ema_price = price.ema_price;
        let ema_conf = price.ema_conf;

        msg!("EMA Price: {}", ema_price);
        msg!("EMA Confidence: ±{}", ema_conf);

        Ok(())
    }
}

#[derive(Accounts)]
pub struct GetPrice<'info> {
    /// Pyth price update account
    #[account(
        constraint = price_update.verification_level == pyth_solana_receiver_sdk::price_update::VerificationLevel::Full
            @ OracleError::InvalidPriceUpdate
    )]
    pub price_update: Account<'info, PriceUpdateV2>,
}

#[derive(Accounts)]
pub struct CheckLiquidation<'info> {
    #[account(
        constraint = price_update.verification_level == pyth_solana_receiver_sdk::price_update::VerificationLevel::Full
            @ OracleError::InvalidPriceUpdate
    )]
    pub price_update: Account<'info, PriceUpdateV2>,
    
    // Add your position/vault accounts here
}

#[error_code]
pub enum OracleError {
    #[msg("Price is stale")]
    StalePrice,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Position is liquidatable")]
    Liquidatable,
    #[msg("Invalid price update")]
    InvalidPriceUpdate,
}
```

### 2. Client-Side: Fetching Pyth Prices

```typescript
import { Connection, PublicKey } from "@solana/web3.js";
import { PriceServiceConnection } from "@pythnetwork/price-service-client";

// Pyth Price Service (Hermes)
const priceServiceConnection = new PriceServiceConnection(
    "https://hermes.pyth.network",
    { priceFeedRequestConfig: { binary: true } }
);

// Get latest price
async function getSolPrice() {
    const SOL_USD_FEED = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
    
    const priceFeeds = await priceServiceConnection.getLatestPriceFeeds([SOL_USD_FEED]);
    const solPrice = priceFeeds[0];
    
    console.log("SOL/USD:", solPrice.getPriceUnchecked().price);
    console.log("Confidence:", solPrice.getPriceUnchecked().conf);
    console.log("Publish Time:", solPrice.getPriceUnchecked().publishTime);
}

// For on-chain use: get price update account
async function getPriceUpdateAccount(connection: Connection) {
    // Pyth uses a push oracle model on Solana
    // Price updates are posted to temporary accounts
    
    // Option 1: Use Pyth's sponsored feeds (free)
    const PYTH_SPONSORED_FEED = new PublicKey("7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE");
    
    // Option 2: Post your own price update (costs ~0.00001 SOL)
    // Using @pythnetwork/pyth-solana-receiver
    const priceUpdateData = await priceServiceConnection.getLatestVaas([SOL_USD_FEED]);
    // ... post to chain
}
```

### 3. Handling Multiple Price Feeds

```rust
/// Get multiple prices for portfolio valuation
pub fn get_portfolio_value(
    ctx: Context<GetPortfolioValue>,
    sol_amount: u64,
    eth_amount: u64,
    btc_amount: u64,
) -> Result<u64> {
    let price_update = &ctx.accounts.price_update;
    let clock = Clock::get()?;
    let max_age = 60;

    // Get all prices
    let sol_feed = get_feed_id_from_hex(SOL_USD_FEED_ID)?;
    let eth_feed = get_feed_id_from_hex(ETH_USD_FEED_ID)?;
    let btc_feed = get_feed_id_from_hex(BTC_USD_FEED_ID)?;

    let sol_price = price_update.get_price_no_older_than(&clock, max_age, &sol_feed)?;
    let eth_price = price_update.get_price_no_older_than(&clock, max_age, &eth_feed)?;
    let btc_price = price_update.get_price_no_older_than(&clock, max_age, &btc_feed)?;

    // Calculate total value
    let sol_value = calculate_value(sol_amount, &sol_price)?;
    let eth_value = calculate_value(eth_amount, &eth_price)?;
    let btc_value = calculate_value(btc_amount, &btc_price)?;

    let total = sol_value
        .checked_add(eth_value)
        .and_then(|v| v.checked_add(btc_value))
        .ok_or(OracleError::MathOverflow)?;

    msg!("Portfolio value: ${}", total as f64 / 1_000_000.0);
    Ok(total)
}

fn calculate_value(amount: u64, price: &Price) -> Result<u64> {
    let expo_adjustment = 10_i128.pow((-price.exponent) as u32);
    
    let value = (amount as i128)
        .checked_mul(price.price as i128)
        .ok_or(OracleError::MathOverflow)?
        .checked_div(expo_adjustment)
        .ok_or(OracleError::MathOverflow)? as u64;
    
    Ok(value)
}
```

## Security Considerations

### 1. Always Check Staleness
```rust
// ❌ DANGEROUS: Using any price regardless of age
let price = price_update.get_price_unchecked(&feed_id)?;

// ✅ SAFE: Require recent price
let max_age = 30;  // seconds
let price = price_update.get_price_no_older_than(&clock, max_age, &feed_id)?;
```

### 2. Use Confidence Intervals
```rust
// For liquidations/borrows: use conservative price
let conservative_price = price.price - price.conf as i64;

// For deposits/collateral valuation: use aggressive price
let aggressive_price = price.price + price.conf as i64;
```

### 3. Verify Price Feed
```rust
// Ensure you're reading the correct feed
#[account(
    constraint = price_update.feed_id == expected_feed_id @ OracleError::WrongFeed
)]
```

## Common Gotchas

### 1. Wrong Exponent Handling
```rust
// ❌ Wrong: ignoring exponent
let price_usd = price.price;  // This is NOT the actual price!

// ✅ Correct: apply exponent
let scale = 10_i64.pow((-price.exponent) as u32);
let price_usd = price.price as f64 / scale as f64;
```

### 2. Not Checking Verification Level
```rust
// ❌ Wrong: accepting unverified prices
pub price_update: Account<'info, PriceUpdateV2>,

// ✅ Correct: require full verification
#[account(
    constraint = price_update.verification_level == VerificationLevel::Full
)]
pub price_update: Account<'info, PriceUpdateV2>,
```

### 3. Using Spot Price for Liquidations
```rust
// ❌ Risky: spot price can be manipulated
let price = price.price;

// ✅ Safer: use EMA or conservative bound
let safe_price = price.price.min(price.ema_price);
// Or: price.price - price.conf
```

### 4. Hardcoding Feed Addresses
```rust
// ❌ Wrong: different on devnet vs mainnet
const PRICE_FEED: Pubkey = pubkey!("mainnet_address");

// ✅ Correct: use feed IDs (same across networks)
const SOL_USD_FEED_ID: &str = "ef0d8b6fda...";
```

## Available Price Feeds

Popular Pyth feeds on Solana:

| Asset | Feed ID (hex) |
|-------|--------------|
| SOL/USD | `ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` |
| ETH/USD | `ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace` |
| BTC/USD | `e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43` |
| USDC/USD | `eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a` |
| BONK/USD | `72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419` |

Full list: https://pyth.network/developers/price-feed-ids

## What You've Learned

- [x] Pyth Network architecture
- [x] Reading price feeds on-chain
- [x] Handling price exponents
- [x] Staleness checks
- [x] Confidence intervals
- [x] EMA prices for stability
- [x] Liquidation logic with oracles

## Next Steps

**Challenge 8: AMM Swap** - Build a decentralized exchange!

## Builder Checklist

- [ ] Read SOL/USD price from Pyth
- [ ] Implemented staleness check
- [ ] Used confidence intervals
- [ ] Built liquidation checker
- [ ] Handled multiple price feeds
- [ ] Used EMA for stable calculations
- [ ] Tested on devnet with real feeds
- [ ] (Bonus) Built a simple lending protocol
- [ ] (Bonus) Implemented TWAP oracle
