/**
 * Contrail-check bookmarklet for Google Flights results pages.
 *
 * Parses each result row's aria-label (far more stable than Google's
 * generated CSS classes), scores every itinerary in one batch call to the
 * lab's contrails API, and pins a colored kg-CO2e-per-passenger badge on
 * each row. Percentile color scale matches the booking tool. Re-running
 * refreshes badges in place (safe after Google re-renders the list).
 *
 * The instructions page URL-encodes this file into a javascript: link at
 * build time — keep it self-contained (Google's CSP would block loading a
 * remote <script>, but in-page fetch to our API is allowed).
 */
(async () => {
  try {
    var API = 'https://sustainablesolutions.vercel.app/api/contrails';
    if (!/\/travel\/flights/.test(location.pathname)) {
      alert('Run this on a Google Flights results page.');
      return;
    }
    var MON = { January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
      July: 6, August: 7, September: 8, October: 9, November: 10, December: 11 };
    // the full itinerary label lives on a descendant of the result <li>
    var FULL = /flight with .+\. Leaves .+ at \d/;
    var seen = [];
    var lis = [];
    Array.prototype.slice.call(document.querySelectorAll('li [aria-label], li[aria-label]')).forEach(function (el) {
      if (!FULL.test(el.getAttribute('aria-label') || '')) return;
      var li = el.closest('li');
      if (li && seen.indexOf(li) === -1) {
        seen.push(li);
        lis.push({ li: li, al: el.getAttribute('aria-label') });
      }
    });
    if (!lis.length) {
      alert('No flight results found — run a search first, then click the bookmarklet again.');
      return;
    }
    var air = [], airIdx = {}, items = [], rows = [];
    var idx = function (n) {
      n = n.trim();
      if (!(n in airIdx)) { airIdx[n] = air.length; air.push(n); }
      return airIdx[n];
    };
    var t24 = function (s) {
      var m = s.match(/(\d{1,2}):(\d{2})[\s ]*([AP]M)/);
      var h = (+m[1] % 12) + (m[3] === 'PM' ? 12 : 0);
      return (h < 10 ? '0' : '') + h + ':' + m[2];
    };
    lis.forEach(function (row) {
      var li = row.li;
      var al = row.al;
      var dep = al.match(/Leaves (.+?) at (\d{1,2}:\d{2}[\s ]*[AP]M) on ([A-Za-z]+), ([A-Za-z]+) (\d{1,2})/);
      var arr = al.match(/arrives at (.+?) at /);
      if (!dep || !arr) return;
      // the label omits the year; the weekday pins it
      var date = '';
      for (var y = new Date().getFullYear(); y <= new Date().getFullYear() + 2; y++) {
        var dt = new Date(y, MON[dep[4]], +dep[5]);
        if (dt.toLocaleDateString('en-US', { weekday: 'long' }) === dep[3]) {
          date = y + '-' + (MON[dep[4]] < 9 ? '0' : '') + (MON[dep[4]] + 1) + '-' + (+dep[5] < 10 ? '0' : '') + dep[5];
          break;
        }
      }
      if (!date) return;
      var vias = [], lays = [], vm;
      var viaRe = /is a (?:(\d+) hr[\s ]*)?(?:(\d+) min[\s ]*)?layover at (.+?) in [^.]*\./g;
      while ((vm = viaRe.exec(al)) !== null) {
        lays.push((+(vm[1] || 0)) * 60 + (+(vm[2] || 0)));
        vias.push(idx(vm[3]));
      }
      items.push({ o: idx(dep[1]), d: idx(arr[1]), via: vias, lay: lays, date: date, time: t24(dep[2]) });
      rows.push(li);
    });
    if (!items.length) { alert('Could not parse any flight rows — the page format may have changed.'); return; }
    var r = await fetch(API + '?batch=1&sv=3&q=' + encodeURIComponent(JSON.stringify({ air: air, f: items })));
    var j = await r.json();
    if (!r.ok || !j.results) { alert('Contrails API error: ' + (j.error || r.status)); return; }
    var col = function (p) {
      return p >= 90 ? '#9E0142' : p >= 75 ? '#D53E4F' : p >= 50 ? '#FDAE61' : p >= 25 ? '#5da26b' : '#2c8767';
    };
    j.results.forEach(function (res, i) {
      var li = rows[i];
      li.style.position = 'relative';
      var b = li.querySelector('.ssl-contrail-badge');
      if (!b) {
        b = document.createElement('span');
        b.className = 'ssl-contrail-badge';
        li.appendChild(b);
      }
      b.style.cssText = 'position:absolute;right:14px;bottom:8px;z-index:9;color:#fff;' +
        'font:600 11px/1.6 system-ui,sans-serif;padding:1px 8px;border-radius:10px;cursor:help;';
      if (res.error) {
        b.textContent = 'n/a';
        b.style.background = '#9A9AAE';
        b.title = 'Contrail prediction unavailable: ' + res.error;
      } else {
        var kg = Math.round(res.kg_pax);
        b.textContent = (kg > 0 ? '+' : '') + kg + ' kg';
        b.style.background = col(res.p);
        b.title = 'Predicted contrail warming: ' + kg + ' kg CO₂e per passenger — ' +
          'warmer than ' + Math.round(res.p) + '% of 22M flights (2021). ' +
          (res.ac_estimated ? 'Aircraft assumed: ' : 'Aircraft: ') + res.ac +
          '. Schedule-only climatology, not a weather forecast — sustainablesolutions.vercel.app/tools/contrails';
      }
    });
  } catch (e) {
    alert('Contrails bookmarklet error: ' + e);
  }
})();
