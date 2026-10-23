import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPrivateAmount, balancePrivacyKey } from '../src/lib/balance-privacy';
test('privacy never formats an amount or sign into the hidden display',()=>{
 for(const value of [1234.56,-125.50,0,999999999]) {assert.equal(formatPrivateAmount(value,true),'••••');assert.equal(formatPrivateAmount(value,true,true),'••••');}
 assert.match(formatPrivateAmount(1234.56,false),/1\.234,56/);
 assert.notEqual(balancePrivacyKey('personal'),balancePrivacyKey('business'));
});
