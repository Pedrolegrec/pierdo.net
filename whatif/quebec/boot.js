// One page, two scenarios: ?s=drawback loads the pull-back scenario, anything else the rise scenario (play.js, unchanged). Also labels the chooser.
const qs = new URLSearchParams(location.search), hs = new URLSearchParams(location.hash.slice(1)), DB = qs.get('s') === 'drawback';
const L = { en: ['The sea rises', 'The sea pulls back', 'Scenario'], fr: ['La mer monte', 'La mer se retire', 'Scénario'] };
const $ = (id) => document.getElementById(id);
function labels() {
  const l = document.documentElement.lang === 'fr' ? 'fr' : 'en';
  $('sc-rise').textContent = L[l][0]; $('sc-db').textContent = L[l][1]; $('choose').setAttribute('aria-label', L[l][2]);
  $('sc-rise').href = './#l=' + l; $('sc-db').href = './?s=drawback#l=' + l;
}
$('sc-rise').setAttribute('aria-current', DB ? 'false' : 'page'); $('sc-db').setAttribute('aria-current', DB ? 'page' : 'false');
const l0 = hs.get('l') || qs.get('l') || ((navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en');
document.documentElement.lang = l0 === 'fr' ? 'fr' : 'en'; labels();
new MutationObserver(labels).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
import(DB ? './drawback/play-db.js' : './play.js');
