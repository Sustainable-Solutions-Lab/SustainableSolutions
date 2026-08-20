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
    var r = await fetch(API + '?batch=1&sv=3&q=' + encodeURIComponent(JSON.stringify({ air: air, f: items })));
    var j = await r.json();
    if (!r.ok || !j.results) { say('Contrails API error: ' + (j.error || r.status)); return; }
    // Google-style inline line under their emissions text: "+x% contrail
    // warming" as a share of the CO2 Google shows, with our own info popover.
    var popover = function () {
      var pop = document.getElementById('ssl-contrail-pop');
      if (pop) return pop;
      pop = document.createElement('div');
      pop.id = 'ssl-contrail-pop';
      pop.style.cssText = 'position:fixed;display:none;z-index:99999;max-width:340px;background:#fff;color:#3c4043;border:1px solid #dadce0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.2);padding:14px 16px;font:400 13px/1.5 Roboto,Arial,sans-serif;text-align:left;';
      document.body.appendChild(pop);
      document.addEventListener('click', function (ev) {
        if (!pop.contains(ev.target) && !(ev.target.closest && ev.target.closest('.ssl-contrail-info'))) pop.style.display = 'none';
      }, true);
      return pop;
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
        line.style.cssText = 'position:absolute;z-index:99;white-space:nowrap;' +
          'left:' + Math.round(lf.left - br.left) + 'px;' +
          'top:' + Math.round(lr.bottom - br.top + 1) + 'px;';
      } else {
        line.style.cssText = 'position:absolute;z-index:99;white-space:nowrap;right:14px;bottom:8px;';
      }
      var kg = Math.round(res.kg_pax);
      var pc = (!res.error && gkg) ? Math.round((100 * res.kg_pax) / gkg) : null;
      var txt, color;
      if (res.error) {
        txt = 'contrails n/a';
        color = '#9aa0a6';
      } else if (pc !== null) {
        txt = (pc > 0 ? '+' : '') + pc + '% contrail warming';
        color = pc > 0 ? '#c5221f' : pc < 0 ? '#137333' : '#5f6368';
      } else {
        txt = (kg > 0 ? '+' : '') + kg + ' kg contrails';
        color = kg > 0 ? '#c5221f' : '#137333';
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
        pop.appendChild(mk('div', 'font-weight:500;margin-bottom:6px;color:#202124', 'Predicted contrail warming'));
        var head = mk('div', 'margin-bottom:8px');
        if (res.error) {
          head.textContent = 'No prediction for this itinerary (' + res.error + ').';
        } else {
          head.appendChild(document.createTextNode(
            kg > 0 ? 'Contrails from this itinerary are predicted to add '
                   : 'Contrails from this itinerary are predicted to produce a net cooling of '));
          head.appendChild(mk('b', '', Math.abs(kg) + ' kg CO₂e'));
          head.appendChild(document.createTextNode(
            (kg > 0 ? ' of warming' : '') + ' per passenger' +
            (pc !== null ? ' — ' + (pc > 0 ? '+' : '') + pc + '% on top of the CO₂ estimate shown.' : '.')));
        }
        pop.appendChild(head);
        if (!res.error) {
          pop.appendChild(mk('div', 'margin-bottom:8px',
            'Condensation trails can warm the climate as much as aviation\u2019s CO\u2082. ' +
            'This estimate comes from a schedule-only model (route, timing, season, aircraft) trained on ' +
            '22 million simulated flights; this itinerary ranks warmer than ' + Math.round(res.p) +
            '% of 2021 flights. ' + (res.ac_estimated ? 'Aircraft assumed: ' : 'Aircraft: ') + res.ac + '.'));
        }
        var a = mk('a', 'color:#1a73e8;text-decoration:none', 'Compare lower-warming flights \u2192');
        a.href = 'https://sustainablesolutions.vercel.app/tools/contrails';
        a.target = '_blank';
        a.rel = 'noopener';
        pop.appendChild(a);
        pop.appendChild(mk('div', 'margin-top:8px;color:#80868b;font-size:11px',
          'Climatological estimate, not a weather forecast \u00b7 Sustainable Solutions Lab, Stanford'));
        var rct = info.getBoundingClientRect();
        pop.style.display = 'block';
        pop.style.left = Math.max(8, Math.min(rct.left - 40, window.innerWidth - 360)) + 'px';
        pop.style.top = Math.min(rct.bottom + 8, window.innerHeight - 260) + 'px';
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
