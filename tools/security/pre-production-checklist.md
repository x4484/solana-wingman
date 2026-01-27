# Pre-Production Security Checklist

## TLDR

Before deploying to mainnet, work through this checklist. Each item has cost hundreds of projects thousands (or millions) of dollars. A few hours of verification now prevents disasters later.

## Quick Reference

```
┌─────────────────────────────────────────────────────────┐
│             Pre-Mainnet Launch Checklist                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🔴 BLOCKERS (Must fix before launch)                  │
│  ├── Security audit complete                           │
│  ├── All critical findings resolved                    │
│  ├── Upgrade authority secured (multisig)              │
│  └── Admin keys in cold storage                        │
│                                                         │
│  🟡 HIGH PRIORITY (Fix within 24h of launch)           │
│  ├── Monitoring dashboards live                        │
│  ├── Incident response plan documented                 │
│  ├── Circuit breakers tested                           │
│  └── Rate limits configured                            │
│                                                         │
│  🟢 RECOMMENDED (Ongoing improvement)                  │
│  ├── Bug bounty program                                │
│  ├── Formal verification (for critical math)           │
│  └── Insurance coverage                                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 1. Access Controls

### Upgrade Authority

- [ ] **Upgrade authority set to multisig** (at least 2-of-3)
  ```bash
  # Check current authority
  solana program show <PROGRAM_ID>
  
  # Transfer to multisig (use Squads or similar)
  solana program set-upgrade-authority <PROGRAM_ID> --new-upgrade-authority <MULTISIG>
  ```

- [ ] **Consider making program immutable** (if appropriate)
  ```bash
  # WARNING: Permanent! No upgrades ever!
  solana program set-upgrade-authority <PROGRAM_ID> --final
  ```

- [ ] **Document upgrade process** - Who approves? What's the timelock?

### Admin Functions

- [ ] **Admin keys stored securely**
  - Not in .env files on servers
  - Hardware wallet or multisig
  - Cold storage for high-privilege keys

- [ ] **Timelocks on sensitive operations**
  ```rust
  #[account]
  pub struct TimelockAction {
      pub action_type: ActionType,
      pub execute_after: i64,  // Unix timestamp
      pub executed: bool,
  }
  
  pub fn execute_action(ctx: Context<Execute>) -> Result<()> {
      let clock = Clock::get()?;
      require!(
          clock.unix_timestamp >= ctx.accounts.action.execute_after,
          ErrorCode::TimelockNotExpired
      );
      // ... execute
  }
  ```

- [ ] **Role-based access control**
  ```rust
  #[account]
  pub struct Config {
      pub super_admin: Pubkey,     // Can change config
      pub operator: Pubkey,        // Can pause/unpause
      pub fee_collector: Pubkey,   // Can withdraw fees only
  }
  ```

---

## 2. Input Validation

### Account Validation

- [ ] **All accounts have appropriate constraints**
  ```rust
  #[derive(Accounts)]
  pub struct Process<'info> {
      #[account(
          mut,
          seeds = [b"vault", authority.key().as_ref()],
          bump = vault.bump,
          has_one = authority,
          constraint = !vault.is_frozen @ ErrorCode::Frozen,
      )]
      pub vault: Account<'info, Vault>,
  }
  ```

- [ ] **No duplicate account vulnerabilities**
  ```rust
  #[account(constraint = account_a.key() != account_b.key())]
  ```

- [ ] **Token account ownership verified**
  ```rust
  #[account(
      token::mint = mint,
      token::authority = expected_authority,
  )]
  ```

### Amount Validation

- [ ] **Minimum amounts enforced**
  ```rust
  require!(amount >= MIN_DEPOSIT, ErrorCode::BelowMinimum);
  ```

- [ ] **Maximum amounts enforced**
  ```rust
  require!(amount <= MAX_SINGLE_TX, ErrorCode::ExceedsLimit);
  ```

- [ ] **Zero amount rejected**
  ```rust
  require!(amount > 0, ErrorCode::ZeroAmount);
  ```

### Arithmetic Safety

- [ ] **All arithmetic uses checked operations**
  ```rust
  let result = a.checked_add(b).ok_or(ErrorCode::Overflow)?;
  let result = a.checked_sub(b).ok_or(ErrorCode::Underflow)?;
  let result = a.checked_mul(b).ok_or(ErrorCode::Overflow)?;
  let result = a.checked_div(b).ok_or(ErrorCode::DivByZero)?;
  ```

- [ ] **Precision handling for percentages/rates**
  ```rust
  // Use basis points (1% = 100 bps) or higher precision
  const BPS_DENOMINATOR: u64 = 10_000;
  let fee = amount.checked_mul(fee_bps)?.checked_div(BPS_DENOMINATOR)?;
  ```

---

## 3. Economic Security

### Oracle Integration

- [ ] **Multiple oracle sources or TWAP**
  ```rust
  let pyth_price = get_pyth_price(&ctx.accounts.pyth_feed)?;
  let switchboard_price = get_switchboard_price(&ctx.accounts.sb_feed)?;
  
  // Use median or require agreement
  require!(
      (pyth_price - switchboard_price).abs() < MAX_DEVIATION,
      ErrorCode::OracleDisagreement
  );
  ```

- [ ] **Stale price protection**
  ```rust
  let price_data = ctx.accounts.price_feed.load()?;
  let age = Clock::get()?.unix_timestamp - price_data.timestamp;
  require!(age < MAX_PRICE_AGE_SECONDS, ErrorCode::StalePrice);
  ```

- [ ] **Price band validation**
  ```rust
  require!(
      price >= MIN_VALID_PRICE && price <= MAX_VALID_PRICE,
      ErrorCode::PriceOutOfBounds
  );
  ```

### MEV Protection

- [ ] **Slippage parameters required**
  ```rust
  pub fn swap(
      ctx: Context<Swap>,
      amount_in: u64,
      minimum_amount_out: u64,  // User-specified slippage protection
  ) -> Result<()> {
      let amount_out = calculate_output(amount_in)?;
      require!(amount_out >= minimum_amount_out, ErrorCode::SlippageExceeded);
      // ...
  }
  ```

- [ ] **Deadline parameters for time-sensitive operations**
  ```rust
  pub fn swap(
      ctx: Context<Swap>,
      amount_in: u64,
      minimum_out: u64,
      deadline: i64,  // Unix timestamp
  ) -> Result<()> {
      require!(
          Clock::get()?.unix_timestamp <= deadline,
          ErrorCode::DeadlineExceeded
      );
      // ...
  }
  ```

---

## 4. Operational Security

### Circuit Breakers

- [ ] **Global pause mechanism**
  ```rust
  #[account]
  pub struct Config {
      pub is_paused: bool,
  }
  
  // In every instruction
  require!(!config.is_paused, ErrorCode::Paused);
  ```

- [ ] **Per-function pause capability**
  ```rust
  #[account]
  pub struct Config {
      pub deposits_paused: bool,
      pub withdrawals_paused: bool,
      pub swaps_paused: bool,
  }
  ```

- [ ] **Emergency withdrawal mechanism**
  ```rust
  // Even when paused, users can withdraw (no new deposits)
  pub fn emergency_withdraw(ctx: Context<EmergencyWithdraw>) -> Result<()> {
      // Doesn't check is_paused
      // Returns user's funds at current value
  }
  ```

### Rate Limiting

- [ ] **Per-user rate limits**
  ```rust
  #[account]
  pub struct UserState {
      pub last_action_timestamp: i64,
      pub actions_in_window: u32,
  }
  
  require!(
      user.actions_in_window < MAX_ACTIONS_PER_WINDOW,
      ErrorCode::RateLimited
  );
  ```

- [ ] **Global TVL limits** (start conservative)
  ```rust
  let current_tvl = calculate_tvl()?;
  require!(current_tvl + deposit <= MAX_TVL, ErrorCode::TvlLimitReached);
  ```

---

## 5. Monitoring & Incident Response

### Monitoring Setup

- [ ] **Event emission for all state changes**
  ```rust
  #[event]
  pub struct DepositEvent {
      pub user: Pubkey,
      pub amount: u64,
      pub timestamp: i64,
  }
  
  emit!(DepositEvent { ... });
  ```

- [ ] **Dashboard tracking key metrics**
  - TVL
  - Daily volume
  - Unique users
  - Failed transactions
  - Large transactions (whale alerts)

- [ ] **Alerting thresholds configured**
  - Unusual volume spikes
  - Large single transactions
  - Repeated failures from same address
  - Oracle price deviations

### Incident Response Plan

- [ ] **Documented runbook** including:
  1. How to pause the protocol
  2. Who to contact (internal team, auditors, legal)
  3. Communication templates (Twitter, Discord)
  4. Fund recovery procedures

- [ ] **War room contact list**
  - Core team phone numbers
  - Security partner contacts
  - Legal counsel
  - Communications lead

- [ ] **Practiced incident drills**
  - Run tabletop exercises
  - Test pause mechanisms on devnet

---

## 6. Audit & Verification

### Security Audit

- [ ] **Audit completed by reputable firm**
  - Neodyme
  - OtterSec
  - Sec3
  - Trail of Bits (for high-value)

- [ ] **All critical/high findings resolved**

- [ ] **Medium findings addressed or accepted with rationale**

- [ ] **Audit report published** (builds trust)

### Additional Verification

- [ ] **Fuzzing completed**
  ```bash
  # Using Trident
  trident fuzz run
  ```

- [ ] **Formal verification for critical math** (optional but recommended for DeFi)

- [ ] **Bug bounty program launched**
  - Immunefi
  - HackerOne
  - Self-hosted with clear scope and rewards

---

## 7. Deployment

### Pre-Deploy

- [ ] **Verified on devnet** with real-ish conditions
- [ ] **Verified on testnet** with extended soak time
- [ ] **Program verified on block explorer**
  ```bash
  anchor verify <PROGRAM_ID> --provider.cluster mainnet
  ```

### Deploy Day

- [ ] **Low TVL cap initially** (can increase after confidence)
- [ ] **Monitoring dashboards active**
- [ ] **Team on standby** for first 24-48 hours
- [ ] **Communication channels ready** (Discord, Twitter)

### Post-Deploy

- [ ] **Monitor for 1 week minimum** before relaxing
- [ ] **Gradual TVL increase**
- [ ] **User feedback collection**
- [ ] **Regular security reviews scheduled**

---

## Quick Security Audit Self-Check

Run through these questions for each instruction:

1. **Who can call this?** (Signer requirements)
2. **What accounts are passed?** (All validated?)
3. **What state changes?** (Before or after CPIs?)
4. **Can this overflow?** (Checked math?)
5. **What external data is used?** (Oracles validated?)
6. **Can this be called repeatedly?** (Reentrancy safe?)
7. **What if accounts are duplicated?** (Checked?)
8. **What's the worst case?** (Max loss scenario?)

---

## Related Resources

- **[historical-hacks.md](../gotchas/historical-hacks.md)** - Learn from past exploits
- **[07-anchor-framework](../foundations/07-anchor-framework.md)** - Secure Anchor patterns
- **[08-testing-patterns](../foundations/08-testing-patterns.md)** - Test coverage
