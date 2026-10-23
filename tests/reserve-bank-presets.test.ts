import test from 'node:test';
import assert from 'node:assert/strict';
import { findReserveBankPresets, applyReserveBankPreset, reserveBankPresets } from '../src/lib/reserve-bank-presets';
import { sanitizeReserveYield } from '../src/lib/reserves';
test('bank search supports accents, spaces and aliases, without guessing unknown banks', () => {
  assert.equal(findReserveBankPresets(' mércado pago ')[0]?.id, 'mercado-pago-base');
  assert.equal(findReserveBankPresets('pic pay')[0]?.id, 'picpay-standard');
  assert.equal(findReserveBankPresets('Nu')[0]?.id, 'nubank-emergency');
  assert.deepEqual(findReserveBankPresets('Banco desconhecido'), []);
  assert.deepEqual(findReserveBankPresets(''), []);
});
test('Inter offers separate products and identifies the variable upper limit', () => {
  const matches = findReserveBankPresets('Inter');
  assert.equal(matches.length, 2);
  assert.equal(matches[0].percent, 80);
  assert.equal(matches[1].upTo, true);
});
test('applying a suggestion preserves the manual annual reference and horizon', () => {
  const settings = { enabled: false, cdiPercent: 115, annualCdi: 10, months: 6 };
  const result = applyReserveBankPreset(settings, reserveBankPresets[0]);
  assert.deepEqual(result, { enabled: true, cdiPercent: 100, annualCdi: 10, months: 6, bankPresetId: 'nubank-emergency' });
  assert.equal(settings.cdiPercent, 115);
});
test('custom rate and source survive normalization without applying preset again', () => {
  const saved = sanitizeReserveYield({ enabled: true, cdiPercent: 112, annualCdi: 12, months: 3, bankPresetId: 'nubank-emergency' });
  assert.equal(saved.cdiPercent, 112);
  assert.equal(saved.bankPresetId, 'nubank-emergency');
  assert.equal(applyReserveBankPreset(sanitizeReserveYield(null), reserveBankPresets[0]).annualCdi, null);
});
