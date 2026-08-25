/**
 * Exercises the two pieces of cryptography the paywall rests on:
 * the session JWT, and Stripe's webhook signature.
 *
 * Node 18+ exposes the same WebCrypto API Workers do, so this runs the real
 * implementation rather than a stand-in.
 *
 *   node tools/test-crypto.mjs
 */
import { sign, verify, decodeUnverified } from '../worker/src/jwt.js';
import { verifyWebhook } from '../worker/src/stripe.js';

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok   ' : 'FAIL '} ${name}${ok || !detail ? '' : '\n          ' + detail}`);
  if (!ok) failures++;
};

const SECRET = 'test-secret-value-do-not-use';

console.log('session JWT\n');

const token = await sign({ uid: 'u1', email: 'a@b.com' }, SECRET);
const payload = await verify(token, SECRET);
check('a signed token verifies', !!payload && payload.uid === 'u1' && payload.email === 'a@b.com');

check('a token signed with another secret is rejected', (await verify(token, 'different-secret')) === null);

// Flip one character of the signature.
const parts = token.split('.');
const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -1)}${parts[2].slice(-1) === 'A' ? 'B' : 'A'}`;
check('a tampered signature is rejected', (await verify(tampered, SECRET)) === null);

// Re-sign a modified payload with no secret — the classic forgery attempt.
const forgedBody = Buffer.from(JSON.stringify({ uid: 'u1', email: 'sameek4@gmail.com', exp: 9999999999 }))
  .toString('base64url');
check('a re-encoded payload without a valid signature is rejected', (await verify(`${parts[0]}.${forgedBody}.${parts[2]}`, SECRET)) === null);

const expired = await sign({ uid: 'u1' }, SECRET, -10);
check('an expired token is rejected', (await verify(expired, SECRET)) === null);

check('garbage is rejected', (await verify('not.a.token', SECRET)) === null);
check('empty is rejected', (await verify('', SECRET)) === null);
check('alg=none style token is rejected', (await verify(`${parts[0]}.${parts[1]}.`, SECRET)) === null);

check('decodeUnverified reads a payload', decodeUnverified(token)?.email === 'a@b.com');

console.log('\nStripe webhook signature\n');

const WH_SECRET = 'whsec_test_secret';
const body = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } });

async function stripeSig(rawBody, secret, timestamp) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${rawBody}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const now = Math.floor(Date.now() / 1000);
const good = await stripeSig(body, WH_SECRET, now);

const okEvent = await verifyWebhook(body, `t=${now},v1=${good}`, WH_SECRET);
check('a correctly signed event is accepted', okEvent?.id === 'evt_1');

check('a wrong signature is rejected', (await verifyWebhook(body, `t=${now},v1=${'0'.repeat(64)}`, WH_SECRET)) === null);

check(
  'a signature made with another secret is rejected',
  (await verifyWebhook(body, `t=${now},v1=${await stripeSig(body, 'whsec_wrong', now)}`, WH_SECRET)) === null
);

// The signature covers the body, so altering the body must invalidate it.
const evilBody = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated', data: { object: { id: 'sub_HACKED' } } });
check('a modified body is rejected', (await verifyWebhook(evilBody, `t=${now},v1=${good}`, WH_SECRET)) === null);

// Replay of a genuinely-signed but old event.
const old = now - 4000;
check(
  'an old timestamp is rejected (replay)',
  (await verifyWebhook(body, `t=${old},v1=${await stripeSig(body, WH_SECRET, old)}`, WH_SECRET)) === null
);

check('a missing header is rejected', (await verifyWebhook(body, null, WH_SECRET)) === null);
check('a malformed header is rejected', (await verifyWebhook(body, 'garbage', WH_SECRET)) === null);
check('a header with no v1 is rejected', (await verifyWebhook(body, `t=${now}`, WH_SECRET)) === null);

// Stripe sends several v1 signatures during a secret rotation; any valid one counts.
check(
  'one valid signature among several is accepted',
  (await verifyWebhook(body, `t=${now},v1=${'0'.repeat(64)},v1=${good}`, WH_SECRET))?.id === 'evt_1'
);

if (failures) {
  console.error(`\n${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log('\ncrypto checks passed.');
