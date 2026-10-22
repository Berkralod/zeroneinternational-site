---
title: Missed Call Cost Calculator for Small Businesses
heading: How much do missed calls cost your business?
description: Free calculator: estimate how much revenue missed calls may cost your small business each month and year. No sign-up, nothing is stored or sent.
nav: Missed call calculator
updated: 2026-10-22
script: /assets/js/tools.js
---

Every missed call is a customer who might have booked, or might have called someone else. Enter three numbers to get a rough estimate. Nothing you type is stored or sent anywhere; the math happens in your browser.

<div class="calc" id="missed-call-calc" role="group" aria-labelledby="calc-title">
<h2 id="calc-title">Your estimate</h2>
<div class="calc__field">
<label for="calc-calls">Calls you miss in a typical week</label>
<input id="calc-calls" type="number" min="0" step="1" value="5" inputmode="numeric" aria-describedby="calc-calls-hint">
<p class="calc__hint" id="calc-calls-hint">Check your phone's call log or carrier app for last week.</p>
</div>
<div class="calc__field">
<label for="calc-rate">How many of those callers would have booked? (%)</label>
<input id="calc-rate" type="number" min="0" max="100" step="1" value="30" inputmode="numeric" aria-describedby="calc-rate-hint">
<p class="calc__hint" id="calc-rate-hint">Think about how many of your answered calls turn into a job or appointment.</p>
</div>
<div class="calc__field">
<label for="calc-value">Average value of a job or visit ($)</label>
<input id="calc-value" type="number" min="0" step="1" value="250" inputmode="numeric">
</div>
<div class="calc__result" aria-live="polite">
<p>Missed jobs per month: <strong id="calc-jobs">6.5</strong></p>
<p>Estimated lost revenue: <strong id="calc-month">$1,624</strong> a month, about <strong id="calc-year">$19,485</strong> a year.</p>
</div>
</div>

This is a rough estimate, not a prediction. Some callers leave a voicemail or call back, and some would never have booked. But if the number surprises you, it is worth looking at how your calls are answered.

## How the estimate works

- Missed jobs per month = calls per week × (percent ÷ 100) × 4.33
- Estimated lost revenue per month = missed jobs per month × average job value
- Per year = monthly × 12

Example with the defaults: 5 × 0.30 × 4.33 ≈ 6.5 jobs a month × $250 ≈ **$1,624 a month**, about **$19,485 a year**.

## Next steps

- Try a 10-minute test: call your own business after hours from another phone, check last week's missed calls, and count how many were called back. See [our guide to missed calls](/blog/missed-calls-small-business/).
- Free fixes first: a better voicemail greeting and call forwarding cost nothing.
- If you'd like calls answered 24/7, see [Ava, our AI phone assistant](/services/ai-phone-assistant/).

## FAQ

### Is this accurate?

It is a simple estimate based only on the numbers you enter. Real results depend on your business, your customers and how quickly you call back.

### Do you save my numbers?

No. Nothing is stored or sent; you can use it offline once the page has loaded.

### What counts as a missed call?

Any call that wasn't answered by a person or a system that could help the caller, including calls that went to voicemail.
