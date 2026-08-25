'use strict';

// Delta window bounds, kept in sync with AndroidAPS DeltaCalculator.kt (openAPS/DeltaCalculator.kt),
// which is where this calculation is still actively maintained. The oref0 copy has not changed
// since 2019.
var MIN_BG_VALUE = 39.0;
var MIN_SHORT_DELTA_MINUTES = 2.5;
var MAX_SHORT_DELTA_MINUTES = 17.5;
var MIN_LAST_DELTA_MINUTES = 2.5;
var MAX_LAST_DELTA_MINUTES = 7.5;
var MIN_LONG_DELTA_MINUTES = 17.5;
var MAX_LONG_DELTA_MINUTES = 42.5;

function getDateFromEntry(entry) {
  return entry.date || Date.parse(entry.display_time) || Date.parse(entry.dateString);
}

var getLastGlucose = function (data) {
    data = data.filter(function(obj) {
      return obj.glucose || obj.sgv;
    }).map(function prepGlucose (obj) {
        //Support the NS sgv field to avoid having to convert in a custom way
        obj.glucose = obj.glucose || obj.sgv;
        if ( obj.glucose !== null ) {
            return obj;
        }
    });

    var now = data[0];
    var now_date = getDateFromEntry(now);
    var change;
    var last_deltas = [];
    var short_deltas = [];
    var long_deltas = [];
    var last_cal = 0;

    //console.error(now.glucose);
    for (var i=1; i < data.length; i++) {
        // if we come across a cal record, don't process any older SGVs
        if (typeof data[i] !== 'undefined' && data[i].type === "cal") {
            last_cal = i;
            break;
        }
        // only use data from the same device as the most recent BG data point
        if (typeof data[i] !== 'undefined' && data[i].glucose > MIN_BG_VALUE && data[i].device === now.device) {
            var then = data[i];
            var then_date = getDateFromEntry(then);
            var avgdelta = 0;
            var minutesago;
            if (typeof then_date !== 'undefined' && typeof now_date !== 'undefined') {
                // not rounded to whole minutes: at a 1-minute cadence rounding the divisor
                // distorts avgdelta by up to ~13% near the window bounds, and makes which side
                // of 2.5 / 7.5 / 17.5 a reading falls on depend on timestamp jitter
                minutesago = ( now_date - then_date ) / (1000 * 60);
                // multiply by 5 to get the same units as delta, i.e. mg/dL/5m
                change = now.glucose - then.glucose;
                avgdelta = change/minutesago * 5;
            } else {
                console.error("Error: date field not found: cannot calculate avgdelta");
                continue;
            }

            // Readings newer than MIN_*_DELTA_MINUTES are skipped, not folded into `now`.
            //
            // This used to run `now.glucose = (now.glucose + then.glucose) / 2` for every reading
            // less than 2.5 minutes old. At a 5-minute cadence that branch is unreachable, but on a
            // 1-minute stream it never terminates: each pass moves now_date back to the midpoint, so
            // the gap to the next reading re-converges to just under 2.5 minutes and the branch
            // re-fires. It consumes the whole array, all three delta windows stay empty, and
            // glucose_status.date ends up over an hour in the past.
            //
            // AndroidAPS commented the same line out of its shared DeltaCalculator; we inherited the
            // live copy. The autoISF fork of this file dropped it separately.

            // last_deltas are calculated from everything ~5 minutes ago
            if (MIN_LAST_DELTA_MINUTES < minutesago && minutesago < MAX_LAST_DELTA_MINUTES) {
                last_deltas.push(avgdelta);
            }
            // short_deltas are calculated from everything ~5-15 minutes ago
            if (MIN_SHORT_DELTA_MINUTES < minutesago && minutesago < MAX_SHORT_DELTA_MINUTES) {
                short_deltas.push(avgdelta);
            }
            // long_deltas are calculated from everything ~20-40 minutes ago
            if (MIN_LONG_DELTA_MINUTES < minutesago && minutesago < MAX_LONG_DELTA_MINUTES) {
                long_deltas.push(avgdelta);
            } else if (minutesago > MAX_LONG_DELTA_MINUTES) {
                // nothing older can land in any window
                break;
            }
        }
    }
    var last_delta = 0;
    var short_avgdelta = 0;
    var long_avgdelta = 0;
    if (short_deltas.length > 0) {
        short_avgdelta = short_deltas.reduce(function(a, b) { return a + b; }) / short_deltas.length;
    }
    if (last_deltas.length > 0) {
        last_delta = last_deltas.reduce(function(a, b) { return a + b; }) / last_deltas.length;
    } else {
        // no reading in the last-delta window (a CGM gap, typically): reporting 0 tells
        // determine-basal that glucose is flat, which is not what we know. AndroidAPS falls back
        // to the short average here.
        last_delta = short_avgdelta;
    }
    if (long_deltas.length > 0) {
        long_avgdelta = long_deltas.reduce(function(a, b) { return a + b; }) / long_deltas.length;
    }

    return {
        delta: Math.round( last_delta * 100 ) / 100
        , glucose: Math.round( now.glucose * 100 ) / 100
        , noise: Math.round(now.noise)
        , short_avgdelta: Math.round( short_avgdelta * 100 ) / 100
        , long_avgdelta: Math.round( long_avgdelta * 100 ) / 100
        , date: now_date
        , last_cal: last_cal
        , device: now.device
    };
};

module.exports = getLastGlucose;
