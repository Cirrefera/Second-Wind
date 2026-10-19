import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentConfig,paymentReadiness} from '../src/contracts.js';
const address = '0x1234567890123456789012345678901234567890';
test('recipient verification is distinct from configuration and fails on mismatch', () => {
 assert.deepEqual(paymentReadiness({X402_PAY_TO:address}), {payment_recipient_configured:true,payment_recipient_verified:false});
 assert.equal(paymentReadiness({X402_PAY_TO:address,X402_EXPECTED_PAY_TO:address}).payment_recipient_verified,true);
 assert.throws(()=>paymentConfig({X402_PAY_TO:address,X402_EXPECTED_PAY_TO:'0x2234567890123456789012345678901234567890'}), /payment_recipient_unverified/);
});
test('known dead destinations cannot become payment recipients', () => {
 for(const X402_PAY_TO of ['0x0000000000000000000000000000000000000000','0x000000000000000000000000000000000000dEaD','0x0000000000000000000000000000000000000001','0xdead000000000000000042069420694206942069']) {
  assert.throws(()=>paymentConfig({X402_PAY_TO}),/payment_rail_not_configured/);
  assert.equal(paymentReadiness({X402_PAY_TO,X402_EXPECTED_PAY_TO:X402_PAY_TO}).payment_recipient_verified,false);
 }
});
