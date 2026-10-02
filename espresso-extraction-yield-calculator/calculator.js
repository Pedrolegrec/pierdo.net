/* Wires the calculator page to EspressoMath. Reads the fields, shows messages,
   fills the results. Keeps nothing: no cookies, no storage, no network. */
(function () {
  'use strict';
  var M = window.EspressoMath;
  if (!M) return;

  var $ = function (id) { return document.getElementById(id); };
  var KEYS = ['dose', 'beverage', 'tds', 'targetEy'];
  var inputs = { dose: $('dose'), beverage: $('beverage'), tds: $('tds'), targetEy: $('target-ey') };
  var msgs = { dose: $('dose-msg'), beverage: $('beverage-msg'), tds: $('tds-msg'), targetEy: $('target-ey-msg') };
  var LABELS = { dose: 'dose', beverage: 'beverage weight', tds: 'TDS' };

  var fmt = function (x, digits) { return x.toFixed(digits); };
  var signed = function (x) { return (x < 0 ? '−' : '+') + fmt(Math.abs(x), 1); };

  function setHidden(el, hidden) { if (hidden) el.setAttribute('hidden', ''); else el.removeAttribute('hidden'); }

  function showMessage(key, result) {
    var el = msgs[key];
    var input = inputs[key];
    if (result.status === 'error') {
      el.className = 'msg error';
      el.textContent = 'Error: ' + result.error;
      setHidden(el, false);
      input.setAttribute('aria-invalid', 'true');
    } else if (result.status === 'ok' && result.warning) {
      el.className = 'msg warn';
      el.textContent = 'Check: ' + result.warning;
      setHidden(el, false);
      input.removeAttribute('aria-invalid');
    } else {
      el.textContent = '';
      setHidden(el, true);
      input.removeAttribute('aria-invalid');
    }
  }

  // Replace an element's content with text and <strong> pieces; no innerHTML.
  function setLine(el, parts) {
    el.textContent = '';
    parts.forEach(function (p) {
      if (typeof p === 'string') el.appendChild(document.createTextNode(p));
      else { var s = document.createElement('strong'); s.textContent = p.strong; el.appendChild(s); }
    });
  }

  function renderResult(r) {
    var eyEl = $('ey-value'), ratioEl = $('ratio-value'), note = $('ey-note');
    var working = $('working'), check = $('check'), marker = $('marker');
    var base = [r.dose, r.beverage, r.tds];
    var anyError = base.some(function (x) { return x.status === 'error'; });
    var allOk = base.every(function (x) { return x.status === 'ok'; });

    setHidden(working, true); setHidden(check, true); setHidden(marker, true);

    if (!allOk) {
      eyEl.textContent = '—';
      ratioEl.textContent = '—';
      if (anyError) {
        note.textContent = 'Fix the marked fields to see your result.';
      } else {
        var missing = ['dose', 'beverage', 'tds'].filter(function (k) { return r[k].status === 'empty'; })
          .map(function (k) { return LABELS[k]; });
        note.textContent = missing.length === 3
          ? 'Enter dose, beverage weight and TDS to see your result.'
          : 'Still needed: ' + missing.join(' and ') + '.';
      }
      return;
    }

    var dose = r.dose.value, bev = r.beverage.value, tds = r.tds.value;
    var ey = M.extractionYield(dose, bev, tds);
    var ratio = M.brewRatio(dose, bev);

    eyEl.textContent = fmt(ey, 1) + '%';
    ratioEl.textContent = '1 : ' + fmt(ratio, 2);

    var where = M.classifyEy(ey);
    note.textContent = where === 'within'
      ? 'Inside the 17% to 23% range where coffee most often tastes best.'
      : where === 'below'
        ? 'Below 17%. Coffee extracted this little often tastes sour.'
        : 'Above 23%. Coffee extracted this far often tastes bitter.';

    working.textContent = bev + ' g × ' + tds + '% ÷ ' + dose + ' g = ' + fmt(ey, 1) + '%';
    setHidden(working, false);

    var span = Math.min(30, Math.max(10, ey));
    marker.style.left = ((span - 10) / 20 * 100) + '%';
    setHidden(marker, false);

    var notes = [];
    if (ratio < 0.5 || ratio > 6) {
      notes.push('Check: dose and beverage weight make a 1 : ' + fmt(ratio, 2) +
        ' ratio, far from typical espresso recipes. Check both numbers.');
    }
    if (ey < 8 || ey > 35) {
      notes.push('Check: this yield is outside what coffee normally gives. TDS should be a percent, and beverage weight the liquid in the cup.');
    }
    if (notes.length) { check.textContent = notes.join(' '); setHidden(check, false); }
  }

  function renderTarget(r) {
    var tdsLine = $('target-tds'), yieldLine = $('target-yield'), caveat = $('target-caveat');
    var target = r.targetEy;
    var haveTarget = target.status === 'ok';
    var haveMasses = r.dose.status === 'ok' && r.beverage.status === 'ok';
    var haveTds = r.dose.status === 'ok' && r.tds.status === 'ok';

    if (haveTarget && haveMasses) {
      var needed = M.tdsForTargetEy(r.dose.value, r.beverage.value, target.value);
      setLine(tdsLine, ['With ' + r.dose.value + ' g in and ' + r.beverage.value + ' g out, a reading of ',
        { strong: fmt(needed, 2) + '% TDS' }, ' would mean ' + fmt(target.value, 1) + '% EY.']);
    } else {
      tdsLine.textContent = haveTarget
        ? 'Enter dose and beverage weight to see the TDS you would need.'
        : 'Enter a target to see the TDS you would need.';
    }

    if (haveTarget && haveTds) {
      var grams = M.yieldForTargetEy(r.dose.value, r.tds.value, target.value);
      var tail = '.';
      if (r.beverage.status === 'ok') {
        var delta = M.round(grams - r.beverage.value, 1);
        tail = delta === 0 ? ', about what you have now.' : ', ' + signed(delta) + ' g from your current beverage weight.';
      }
      setLine(yieldLine, ['If TDS stayed at ' + r.tds.value + '%, ' + fmt(target.value, 1) + '% EY would be about ',
        { strong: fmt(grams, 1) + ' g' }, ' in the cup' + tail]);
      setHidden(caveat, false);
    } else {
      yieldLine.textContent = haveTarget
        ? 'Enter dose and TDS to see a first guess at the yield.'
        : 'Enter a target to see a first guess at the yield.';
      setHidden(caveat, true);
    }
  }

  function update() {
    var r = {};
    KEYS.forEach(function (key) {
      r[key] = M.validate(key, inputs[key].value);
      showMessage(key, r[key]);
    });
    renderResult(r);
    renderTarget(r);
  }

  KEYS.forEach(function (key) { inputs[key].addEventListener('input', update); });
  $('calc').addEventListener('submit', function (e) { e.preventDefault(); update(); });
  $('target').addEventListener('submit', function (e) { e.preventDefault(); update(); });
  $('calc').addEventListener('reset', function () { setTimeout(update, 0); });
  $('example').addEventListener('click', function () {
    inputs.dose.value = '18';
    inputs.beverage.value = '36';
    inputs.tds.value = '9.5';
    update();
    inputs.dose.focus();
  });

  update();
})();
