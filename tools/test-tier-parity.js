'use strict';

/**
 * The tier rule exists twice — CommonJS for Node/Electron, ESM for the Worker.
 * If they ever disagree the paywall becomes inconsistent, so compare them here
 * rather than trusting that both copies got edited.
 */
const fs = require('fs');
const path = require('path');
const node = require('../src/core/tiers');

const workerSrc = fs.readFileSync(path.join(__dirname, '..', 'worker', 'src', 'tiers.js'), 'utf8');

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok   ' : 'FAIL '} ${name}${ok || !detail ? '' : '\n          ' + detail}`);
  if (!ok) failures++;
};

const freeMax = Number((workerSrc.match(/FREE_MAX_GB\s*=\s*(\d+)/) || [])[1]);
check('FREE_MAX_GB matches', freeMax === node.FREE_MAX_GB, `worker=${freeMax} node=${node.FREE_MAX_GB}`);

const admins = (workerSrc.match(/ADMIN_EMAILS\s*=\s*\[([^\]]*)\]/) || [])[1] || '';
const workerAdmins = admins.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
check(
  'ADMIN_EMAILS match',
  JSON.stringify(workerAdmins) === JSON.stringify(node.ADMIN_EMAILS),
  `worker=${JSON.stringify(workerAdmins)} node=${JSON.stringify(node.ADMIN_EMAILS)}`
);

const paidStatuses = (workerSrc.match(/PAID_STATUSES\s*=\s*new Set\(\[([^\]]*)\]/) || [])[1] || '';
check('PAID_STATUSES include active + trialing', /active/.test(paidStatuses) && /trialing/.test(paidStatuses), paidStatuses);

// Behavioural spot-checks on the Node copy.
const { tierFor, TIERS } = node;
check('anonymous visitor is anon', tierFor(null, null) === TIERS.ANON);
check('signed-in with no subscription is free', tierFor({ email: 'a@b.com' }, null) === TIERS.FREE);
check('active subscriber is paid', tierFor({ email: 'a@b.com' }, { status: 'active' }) === TIERS.PAID);
check('admin is paid without subscription', tierFor({ email: 'sameek4@gmail.com' }, null) === TIERS.PAID);
check('admin match is case-insensitive', tierFor({ email: 'Sameek4@Gmail.com' }, null) === TIERS.PAID);
check(
  'cancelled but still inside paid period is paid',
  tierFor({ email: 'a@b.com' }, { status: 'canceled', current_period_end: Math.floor(Date.now() / 1000) + 86400 }) === TIERS.PAID
);
check(
  'cancelled and expired is free',
  tierFor({ email: 'a@b.com' }, { status: 'canceled', current_period_end: Math.floor(Date.now() / 1000) - 86400 }) === TIERS.FREE
);
check('past_due is free', tierFor({ email: 'a@b.com' }, { status: 'past_due' }) === TIERS.FREE);
check('unpaid is free', tierFor({ email: 'a@b.com' }, { status: 'unpaid' }) === TIERS.FREE);

if (failures) {
  console.error(`\n${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log('\ntier rules agree.');
