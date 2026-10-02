// Run from this folder with: node --test extraction.test.js
// Checks the formulas against worked examples from the published references
// and the input handling the page relies on. No dependencies.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('./extraction.js');

const close = (actual, expected, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${actual} is not within ${eps} of ${expected}`);

test('EY matches the worked example in Wikipedia "Coffee extraction" (18 g, 36 g, 10 % TDS = 20 %)', () => {
  close(M.extractionYield(18, 36, 10), 20);
});

test('EY follows E = C x B / D (Coffee ad Astra), with C as a fraction', () => {
  const dose = 15.5, beverage = 33.2, tdsPercent = 8.7;
  const fraction = (tdsPercent / 100 * beverage) / dose; // C x B / D
  close(M.extractionYield(dose, beverage, tdsPercent), fraction * 100);
});

test('EY example used on the page: 18.5 g, 37 g, 9.4 % is 18.8 %', () => {
  assert.equal(M.round(M.extractionYield(18.5, 37, 9.4), 1), 18.8);
});

test('brew ratio is beverage weight per gram of dose', () => {
  close(M.brewRatio(18, 36), 2);
  close(M.brewRatio(20, 30), 1.5);
});

test('target helpers invert the EY formula', () => {
  const dose = 18, beverage = 36, tds = 9.5;
  const ey = M.extractionYield(dose, beverage, tds);
  close(M.tdsForTargetEy(dose, beverage, ey), tds);
  close(M.yieldForTargetEy(dose, tds, ey), beverage);
  close(M.tdsForTargetEy(18, 36, 20), 10);
  close(M.yieldForTargetEy(18, 9, 21), 42);
});

test('17 % to 23 % is the SCA range quoted by Cameron et al. (2020)', () => {
  assert.equal(M.classifyEy(16.94), 'below'); // shows as 16.9
  assert.equal(M.classifyEy(16.96), 'within'); // shows as 17.0
  assert.equal(M.classifyEy(17), 'within');
  assert.equal(M.classifyEy(23), 'within');
  assert.equal(M.classifyEy(23.04), 'within'); // shows as 23.0
  assert.equal(M.classifyEy(23.06), 'above'); // shows as 23.1
});

test('parseDecimal accepts plain numbers and a decimal comma, nothing else', () => {
  assert.deepEqual(M.parseDecimal('18'), { status: 'ok', value: 18 });
  assert.deepEqual(M.parseDecimal(' 18.5 '), { status: 'ok', value: 18.5 });
  assert.deepEqual(M.parseDecimal('18,5'), { status: 'ok', value: 18.5 });
  assert.deepEqual(M.parseDecimal('.5'), { status: 'ok', value: 0.5 });
  assert.deepEqual(M.parseDecimal('18.'), { status: 'ok', value: 18 });
  assert.deepEqual(M.parseDecimal(''), { status: 'empty' });
  assert.deepEqual(M.parseDecimal('   '), { status: 'empty' });
  for (const bad of ['abc', '-5', '+5', '1e2', '1,234.5', '1.2.3', '18g', '0x10', 'Infinity', 'NaN', '--']) {
    assert.equal(M.parseDecimal(bad).status, 'invalid', bad);
  }
});

test('validate rejects zero, negative, absurd and non-numeric input', () => {
  assert.equal(M.validate('dose', '').status, 'empty');
  assert.equal(M.validate('dose', 'abc').status, 'error');
  assert.equal(M.validate('dose', '-18').status, 'error');
  assert.equal(M.validate('dose', '0').status, 'error');
  assert.equal(M.validate('dose', '0.0').status, 'error');
  assert.equal(M.validate('dose', '1001').status, 'error');
  assert.equal(M.validate('beverage', '5001').status, 'error');
  assert.equal(M.validate('tds', '100').status, 'error');
  assert.equal(M.validate('tds', '150').status, 'error');
  assert.equal(M.validate('targetEy', '100').status, 'error');
  assert.throws(() => M.validate('nope', '1'));
});

test('validate accepts normal espresso values without a warning', () => {
  for (const [field, text] of [['dose', '18'], ['dose', '18,5'], ['beverage', '36'], ['tds', '9.5'], ['targetEy', '20']]) {
    const r = M.validate(field, text);
    assert.equal(r.status, 'ok', field);
    assert.equal(r.warning, undefined, field);
  }
});

test('validate keeps unusual values but flags them (for example TDS typed as a fraction)', () => {
  const r = M.validate('tds', '0.095');
  assert.equal(r.status, 'ok');
  assert.equal(r.value, 0.095);
  assert.match(r.warning, /percentage/);
  assert.ok(M.validate('dose', '4.9').warning);
  assert.ok(M.validate('dose', '31').warning);
  assert.ok(M.validate('tds', '21').warning);
});
