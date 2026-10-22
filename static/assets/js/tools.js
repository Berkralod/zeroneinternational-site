/* Free tools (/tools/): the missed call cost calculator and the checklist print button.
   Everything runs in the browser; nothing is stored or sent. Without JavaScript the pages still show
   the default example and the formula. */
(function () {
  "use strict";

  var WEEKS_PER_MONTH = 4.33;

  // Same formula as the page text: calls/week × booking % × 4.33 = jobs/month; × job value = $/month; × 12.
  function estimate(callsPerWeek, percentBooked, jobValue) {
    var calls = Math.max(0, Number(callsPerWeek) || 0);
    var rate = Math.min(100, Math.max(0, Number(percentBooked) || 0)) / 100;
    var value = Math.max(0, Number(jobValue) || 0);
    var jobs = calls * rate * WEEKS_PER_MONTH;
    var month = jobs * value;
    return { jobs: jobs, month: month, year: month * 12 };
  }

  var money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  function setUpCalculator(root) {
    var calls = root.querySelector("#calc-calls");
    var rate = root.querySelector("#calc-rate");
    var value = root.querySelector("#calc-value");
    var jobsOut = root.querySelector("#calc-jobs");
    var monthOut = root.querySelector("#calc-month");
    var yearOut = root.querySelector("#calc-year");
    function update() {
      var r = estimate(calls.value, rate.value, value.value);
      jobsOut.textContent = r.jobs.toFixed(1);
      monthOut.textContent = money.format(r.month);
      yearOut.textContent = money.format(r.year);
    }
    [calls, rate, value].forEach(function (input) { input.addEventListener("input", update); });
    update();
  }

  var calc = document.getElementById("missed-call-calc");
  if (calc) setUpCalculator(calc);

  Array.prototype.forEach.call(document.querySelectorAll("[data-print]"), function (button) {
    button.addEventListener("click", function () { window.print(); });
  });

  window.zeroneTools = { estimate: estimate };
})();
