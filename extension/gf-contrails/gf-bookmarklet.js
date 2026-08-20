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
  // Set by the extension's auto.js: suppress alerts and re-run on a timer
  var AUTO = !!window.__sslContrailAuto;
  var say = AUTO ? function () {} : function (m) { alert(m); };
  var run = async (retries) => {
  try {
    var API = 'https://sustainablesolutions.vercel.app/api/contrails';
    if (!/\/travel\/flights/.test(location.pathname)) {
      say('Run this on a Google Flights results page.');
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
      // results render after page load (matters when run as an Arc Boost
      // or userscript): keep polling quietly before giving up
      if (retries > 0) { setTimeout(function () { run(retries - 1); }, 2000); return; }
      say('No flight results found — run a search first, then click the bookmarklet again.');
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
    if (!items.length) { say('Could not parse any flight rows — the page format may have changed.'); return; }
    var r = await fetch(API + '?batch=1&sv=4&q=' + encodeURIComponent(JSON.stringify({ air: air, f: items })));
    var j = await r.json();
    if (!r.ok || !j.results) { say('Contrails API error: ' + (j.error || r.status)); return; }
    // Google-style inline line under their emissions text: "+x% contrail
    // warming" as a share of the CO2 Google shows, with our own info popover.
    var popover = function () {
      var pop = document.getElementById('ssl-contrail-pop');
      if (pop) return pop;
      pop = document.createElement('div');
      pop.id = 'ssl-contrail-pop';
      pop.style.cssText = 'position:fixed;display:none;z-index:99999;width:330px;background:#fff;color:#3c4043;border-radius:12px;box-shadow:0 1px 3px rgba(60,64,67,.3),0 4px 8px 3px rgba(60,64,67,.15);padding:18px 20px;font:400 13px/1.5 Roboto,Arial,sans-serif;text-align:left;';
      document.body.appendChild(pop);
      document.addEventListener('click', function (ev) {
        if (!pop.contains(ev.target) && !(ev.target.closest && ev.target.closest('.ssl-contrail-info'))) pop.style.display = 'none';
      }, true);
      return pop;
    };
    // text-safe Spectral ramp graded by warming percentile
    var grade = function (p) {
      return p >= 90 ? '#9E0142' : p >= 75 ? '#D53E4F' : p >= 50 ? '#E06D1F'
        : p >= 25 ? '#B08C00' : p >= 10 ? '#5da26b' : '#2c8767';
    };
    j.results.forEach(function (res, i) {
      var li = rows[i];
      // Google's per-passenger CO2 figure for this row, if displayed
      var leaf = Array.prototype.slice.call(li.querySelectorAll('div,span')).filter(function (el) {
        return el.children.length === 0 && /kg CO2e/.test(el.textContent || '');
      })[0];
      var gkg = null;
      if (leaf) {
        var gm = (leaf.textContent || '').match(/([\d,]+)\s*kg CO2e/);
        if (gm) gkg = +gm[1].replace(/,/g, '');
      }
      var line = li.querySelector('.ssl-contrail-line');
      if (!line) {
        line = document.createElement('div');
        line.className = 'ssl-contrail-line';
        // appended LAST inside the row so it paints (and receives events)
        // above Google's transparent row-expansion overlay; positioned to
        // sit just under the emissions cell, in the row's bottom padding
        li.style.position = 'relative';
        li.appendChild(line);
      }
      li.appendChild(line); // keep it after any re-rendered overlay
      if (leaf) {
        // anchor just below Google's "+x% emissions" sub-line (the most
        // compact element containing that text); fall back to the kg line
        var sub = Array.prototype.slice.call(li.querySelectorAll('div,span'))
          .filter(function (el) {
            var r = el.getBoundingClientRect();
            return /(%\s*emissions|Avg emissions)/.test(el.textContent || '') &&
              r.height > 0 && r.height < 40;
          })
          .sort(function (a, b) {
            return (a.textContent || '').length - (b.textContent || '').length;
          })[0];
        var lr = (sub || leaf).getBoundingClientRect();
        var lf = leaf.getBoundingClientRect();
        var br = li.getBoundingClientRect();
        line.style.cssText = 'position:absolute;z-index:2;white-space:nowrap;' +
          'left:' + Math.round(lf.left - br.left) + 'px;' +
          'top:' + Math.round(lr.bottom - br.top - 4) + 'px;';
      } else {
        line.style.cssText = 'position:absolute;z-index:2;white-space:nowrap;right:14px;bottom:8px;';
      }
      var kg = Math.round(res.kg_pax);
      var pc = (!res.error && gkg) ? Math.round((100 * res.kg_pax) / gkg) : null;
      var txt, color;
      if (res.error) {
        txt = 'contrails n/a';
        color = '#9aa0a6';
      } else if (pc !== null) {
        txt = (pc > 0 ? '+' : '') + pc + '% contrail warming';
        color = grade(res.p);
      } else {
        txt = (kg > 0 ? '+' : '') + kg + ' kg contrails';
        color = grade(res.p);
      }
      line.textContent = '';
      var span = document.createElement('span');
      span.textContent = txt;
      span.style.cssText = 'font:400 12px Roboto,Arial,sans-serif;white-space:nowrap;color:' + color + ';';
      var info = document.createElement('span');
      info.className = 'ssl-contrail-info';
      info.textContent = 'ⓘ';
      info.setAttribute('role', 'button');
      info.setAttribute('aria-label', 'About contrail warming');
      info.style.cssText = 'margin-left:4px;color:#70757a;cursor:pointer;font:400 12px Roboto,Arial,sans-serif;';
      // pointerdown in the capture phase: Google's row-expansion click
      // handler would otherwise swallow the event before we see it
      info.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); }, true);
      info.addEventListener('pointerdown', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var pop = popover();
        var mk = function (tag, css, text) {
          var e = document.createElement(tag);
          if (css) e.style.cssText = css;
          if (text) e.textContent = text;
          return e;
        };
        pop.textContent = '';
        var valColor = res.error ? '#5f6368' : grade(res.p);
        // caret pointing up at the info icon (positioned after layout below)
        var caret = mk('div', 'position:absolute;top:-6px;width:12px;height:12px;background:#fff;transform:rotate(45deg);box-shadow:-2px -2px 2px rgba(60,64,67,.06);');
        pop.appendChild(caret);
        // title row with close
        var head = mk('div', 'display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px;');
        head.appendChild(mk('div', 'font:400 16px Roboto,Arial,sans-serif;color:#202124;', 'Contrail warming'));
        var x = mk('div', 'color:#5f6368;cursor:pointer;font:400 18px/1 Roboto,Arial,sans-serif;padding:2px 2px 2px 10px;', '\u00d7');
        x.setAttribute('role', 'button');
        x.setAttribute('aria-label', 'Close');
        x.addEventListener('pointerdown', function (e2) { e2.stopPropagation(); pop.style.display = 'none'; }, true);
        head.appendChild(x);
        pop.appendChild(head);
        // shaded results box: label left, colored figures right
        var box = mk('div', 'display:flex;align-items:flex-start;justify-content:space-between;gap:12px;background:#f8f9fa;border-radius:12px;padding:14px 16px;margin-bottom:12px;');
        box.appendChild(mk('div', 'font:400 14px Roboto,Arial,sans-serif;color:#202124;', 'Contrails'));
        var vals = mk('div', 'text-align:right;');
        if (res.error) {
          vals.appendChild(mk('div', 'font:500 14px Roboto,Arial,sans-serif;color:#5f6368;', 'No prediction'));
          vals.appendChild(mk('div', 'font:400 12px Roboto,Arial,sans-serif;color:#5f6368;margin-top:2px;', res.error));
        } else {
          vals.appendChild(mk('div', 'font:500 15px Roboto,Arial,sans-serif;color:' + valColor + ';',
            (kg > 0 ? '+' : '') + kg + ' kg CO\u2082e' + (kg < 0 ? ' (cooling)' : '')));
          vals.appendChild(mk('div', 'font:400 12px Roboto,Arial,sans-serif;color:' + valColor + ';margin-top:2px;',
            Math.round(res.p) + '/100 contrail-warming percentile'));
        }
        box.appendChild(vals);
        pop.appendChild(box);
        // where the number comes from
        pop.appendChild(mk('div', 'color:#5f6368;margin-bottom:10px;',
          'Predicted warming from this itinerary\u2019s condensation trails, per passenger, estimated from its schedule (route, timing, season' +
          (res.error ? '' : (res.ac_estimated ? ', assumed ' : ', ') + res.ac) +
          ') by a model trained on 22 million flight simulations.'));
        var att = mk('div', 'color:#5f6368;');
        att.appendChild(document.createTextNode('Prediction from the '));
        var a = mk('a', 'color:#1a73e8;text-decoration:none;white-space:nowrap;', 'Stanford Sustainable Solutions Lab');
        a.href = 'https://sustainablesolutions.vercel.app/tools/contrails';
        a.target = '_blank';
        a.rel = 'noopener';
        att.appendChild(a);
        pop.appendChild(att);
        var rct = info.getBoundingClientRect();
        pop.style.display = 'block';
        var left = Math.max(8, Math.min(rct.left + rct.width / 2 - 165, window.innerWidth - 346));
        pop.style.left = left + 'px';
        pop.style.top = Math.min(rct.bottom + 10, window.innerHeight - 240) + 'px';
        caret.style.left = Math.max(14, Math.min(rct.left + rct.width / 2 - left - 6, 304)) + 'px';
      }, true);
      line.appendChild(span);
      line.appendChild(info);
    });
  } catch (e) {
    say('Contrails bookmarklet error: ' + e);
  }
  if (AUTO) setTimeout(function () { run(0); }, 5000);
  };
  run(30);
})();
