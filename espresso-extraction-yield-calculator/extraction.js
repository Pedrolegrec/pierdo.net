/* Espresso extraction maths for the calculator page. Plain functions, no DOM.
   Loaded as a classic script in the browser (window.EspressoMath) and with
   require() in Node for extraction.test.js, so there is no build step.

   EY (%) = beverage mass (g) x TDS (%) / dose (g)
   Sources are listed on the page; the formula and the worked example appear in
   Wikipedia's "Coffee extraction" and Coffee ad Astra's "Measuring and Reporting
   Extraction Yields" (E = C x B / D). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EspressoMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Range the Specialty Coffee Association advises, as quoted by Cameron et al.,
  // Matter 2(3), 2020: best-tasting coffee is usually 17% to 23% extracted.
  var EY_RANGE = { low: 17, high: 23 };

  // Hard limits stop nonsense from producing a result. Soft limits only add a
  // "check this" note next to a result that is still shown.
  var FIELDS = {
    dose: { name: 'Dose', unit: 'g', max: 1000, softMin: 5, softMax: 30,
      softText: 'That is an unusual dose for espresso. Check that it is in grams.' },
    beverage: { name: 'Beverage weight', unit: 'g', max: 5000, softMin: 5, softMax: 150,
      softText: 'That is an unusual beverage weight for espresso. Check that it is in grams.' },
    tds: { name: 'TDS', unit: '%', max: 99.99, softMin: 4, softMax: 20,
      softText: 'TDS is a percentage, for example 9.5 rather than 0.095. This reading is outside the range espresso normally gives.' },
    targetEy: { name: 'Target EY', unit: '%', max: 99.99, softMin: 15, softMax: 25,
      softText: 'Most references put espresso extraction between about 15% and 25%.' }
  };

  /** Read a number a person typed. Accepts 18, 18.5, 18,5 and .5; nothing else. */
  function parseDecimal(text) {
    var t = String(text == null ? '' : text).replace(/\s+/g, '');
    if (t === '') return { status: 'empty' };
    if (!/^(\d+([.,]\d*)?|[.,]\d+)$/.test(t)) return { status: 'invalid' };
    var value = Number(t.replace(',', '.'));
    if (!isFinite(value)) return { status: 'invalid' };
    return { status: 'ok', value: value };
  }

  /** Check one typed value for one field.
      Returns { status: 'empty' } | { status: 'error', error } |
              { status: 'ok', value, warning? } */
  function validate(field, text) {
    var spec = FIELDS[field];
    if (!spec) throw new Error('Unknown field: ' + field);
    var parsed = parseDecimal(text);
    if (parsed.status === 'empty') return { status: 'empty' };
    if (parsed.status === 'invalid') {
      return { status: 'error', error: 'Type a plain number such as 18 or 18.5.' };
    }
    var v = parsed.value;
    if (v <= 0) return { status: 'error', error: spec.name + ' must be more than 0.' };
    if (v > spec.max) {
      return { status: 'error', error: spec.name + ' must be ' + (spec.unit === '%' ? 'below 100%.' : spec.max + ' ' + spec.unit + ' or less.') };
    }
    var out = { status: 'ok', value: v };
    if (v < spec.softMin || v > spec.softMax) out.warning = spec.softText;
    return out;
  }

  /** Extraction yield in percent from dose (g), beverage mass (g) and TDS (%). */
  function extractionYield(dose, beverage, tds) {
    return (beverage * tds) / dose;
  }

  /** Beverage weight per gram of dose: 2 means a 1:2 ratio. */
  function brewRatio(dose, beverage) {
    return beverage / dose;
  }

  /** Cup TDS (%) that gives targetEy at this dose and beverage weight. */
  function tdsForTargetEy(dose, beverage, targetEy) {
    return (targetEy * dose) / beverage;
  }

  /** Beverage weight (g) that gives targetEy if TDS stayed at this reading.
      A first guess only: TDS falls as the yield grows. */
  function yieldForTargetEy(dose, tds, targetEy) {
    return (targetEy * dose) / tds;
  }

  function round(x, digits) {
    var f = Math.pow(10, digits);
    return Math.round((x + Number.EPSILON) * f) / f;
  }

  /** 'below' | 'within' | 'above' for the SCA 17-23% range, judged on the
      one-decimal figure the page shows so the label never disagrees with it. */
  function classifyEy(ey) {
    var shown = round(ey, 1);
    if (shown < EY_RANGE.low) return 'below';
    if (shown > EY_RANGE.high) return 'above';
    return 'within';
  }

  return {
    EY_RANGE: EY_RANGE,
    FIELDS: FIELDS,
    parseDecimal: parseDecimal,
    validate: validate,
    extractionYield: extractionYield,
    brewRatio: brewRatio,
    tdsForTargetEy: tdsForTargetEy,
    yieldForTargetEy: yieldForTargetEy,
    classifyEy: classifyEy,
    round: round
  };
});
