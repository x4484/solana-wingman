# Dialect Registry & Verification

How to get your blinks verified so they unfurl on X.

## Why Register?

Unverified blinks:
- Show warning badges on X
- May not unfurl in some wallets
- Users see "unverified" warnings

Verified blinks:
- Unfurl cleanly on X timeline
- Trusted by wallets
- Professional appearance

## Registration Process

### Step 1: Prepare Your Action

Before applying, ensure:
- [ ] Action is deployed to production (HTTPS)
- [ ] actions.json is at domain root
- [ ] GET endpoint returns valid metadata
- [ ] POST endpoint returns valid transactions
- [ ] Passes Blinks Inspector validation

### Step 2: Apply

Go to: https://dial.to/register

You'll need:
- Action URL(s)
- Brief description of what your action does
- Contact info (Twitter/email)
- Your website/project info

### Step 3: Review

Dialect team reviews your submission:
- Validates technical implementation
- Checks for malicious behavior
- Verifies legitimate use case

**Timeline:** Usually 1-3 business days

### Step 4: Approval

Once approved:
- Your blinks unfurl on X automatically
- Listed in Dialect's registry
- Can use "Verified" badge in marketing

## What They Check

### Technical Requirements
- Valid actions.json configuration
- Proper CORS headers
- GET returns correct schema
- POST returns valid serialized transaction
- Transaction doesn't do anything suspicious

### Content Requirements
- Clear description of what action does
- Not misleading or deceptive
- Legitimate use case
- No phishing or scams

### Transaction Safety
- Reasonable transaction contents
- No hidden transfers
- User can understand what they're signing
- Amounts match what's displayed

## Common Rejection Reasons

### "Invalid actions.json"
- File not at domain root
- Malformed JSON
- Missing required fields

### "CORS Issues"
- Missing headers on OPTIONS
- Incomplete header set

### "Transaction Concerns"
- Transactions do more than described
- Hidden fee extraction
- Unclear what user is signing

### "Incomplete Application"
- Missing contact info
- No description
- Broken links

## Testing Before Applying

### Blinks Inspector
https://www.blinks.xyz/inspector

Test everything:
1. Enter your Action URL
2. Verify GET response
3. Test POST with real wallet
4. Check transaction contents
5. Complete a test transaction

### dial.to Interstitial
Even unverified, you can test on:
https://dial.to/?action=solana-action:YOUR_ACTION_URL

This shows how your blink will render.

## After Verification

### Promote Your Blinks
- Tweet about your verified blink
- Add to your website
- Share the direct URL

### Monitor Usage
- Track how many people use your blink
- Watch for errors in your logs
- Iterate on UX

### Stay Verified
- Don't break your endpoints
- Don't change behavior maliciously
- Keep actions.json up to date

## Appeals

If rejected, you can:
1. Fix the issues mentioned
2. Re-apply with explanation
3. Contact Dialect support

## Alternative: Self-Hosted Interstitial

If you can't get verified or need more control:
- Build your own blink renderer
- Host at your domain
- Users click through your site

But verified registry is better for distribution.

## Resources

- Registry: https://dial.to/register
- Inspector: https://www.blinks.xyz/inspector
- Dialect Docs: https://docs.dialect.to
- Dialect Twitter: @dialectlabs
