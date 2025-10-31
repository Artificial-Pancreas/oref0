#!/usr/bin/env node
'use strict';
/*
  Insulin On Board (IOB) calculations.

  IOB is also known as "Bolus on Board", "Active Insulin", or "Insulin Remaining"

  Released under MIT license. See the accompanying LICENSE.txt file for
  full terms and conditions

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
  THE SOFTWARE.

*/

var generate = require('../lib/iob');
var fs = require('fs');
function usage ( ) {
    console.log('usage: ', process.argv.slice(0, 2), '<pumphistory-zoned.json> <profile.json> <clock-zoned.json> [autosens.json] [pumphistory-24h-zoned.json]');

}



var oref0_calculate_iob = function oref0_calculate_iob(argv_params) {  
  var argv = require('yargs')(argv_params)
    .usage("$0 <pumphistory-zoned.json> <profile.json> <clock-zoned.json> [<autosens.json>] [<pumphistory-24h-zoned.json>]")
    .strict(true)
    .help('help');

  var params = argv.argv;
  var inputs = params._

  if (inputs.length < 3 || inputs.length > 5) {
    argv.showHelp()
    console.error('Incorrect number of arguments');
    process.exit(1);
  }

  var pumphistory_input = inputs[0];
  var profile_input = inputs[1];
  var time_from = typeof inputs[2] === 'string' ? new Date(Date.parse(inputs[2])) : undefined;
  var time_until = typeof inputs[3] === 'string' ? new Date(Date.parse(inputs[3])) : undefined;
  var autosens_input = inputs[4];
  var pumphistory_24_input = inputs[5];

  if (!time_from || !time_until) {
    console.error("time_from and time_until are required")
    return
  }

  var cwd = process.cwd();
  var pumphistory_data = JSON.parse(fs.readFileSync(pumphistory_input));
  var profile_data = JSON.parse(fs.readFileSync(profile_input));

  var autosens_data = null;
  if (autosens_input && autosens_input !== '') {
    try {
        autosens_data = JSON.parse(fs.readFileSync(autosens_input));
    } catch (e) {}
    //console.error(autosens_input, JSON.stringify(autosens_data));
  }
  var pumphistory_24_data = null;
  if (pumphistory_24_input) {
    try {
        pumphistory_24_data = JSON.parse(fs.readFileSync(cwd + '/' + pumphistory_24_input));
    } catch (e) {}
  }

  // pumphistory_data.sort(function (a, b) { return a.date > b.date });

  var now = time_until
  var all_iob = []
  while (now >= time_from) {
    inputs = {
      history: pumphistory_data
      , history24: pumphistory_24_data
      , profile: profile_data
      , clock: now.toISOString()
    };
    if (autosens_data) {
      inputs.autosens = autosens_data;
    }

    var iob = generate(inputs);
    if (iob.length > 0) {
      if (now === time_until) {
        all_iob = iob
      } else {
        all_iob.unshift(iob[0])
      }
    }
    now = new Date(now.getTime() - 5 * 60 * 1000)
  }
  return(JSON.stringify(all_iob));
}

if (!module.parent) {
   // remove the first parameter.
   var command = process.argv;
   command.shift();
   command.shift();
   var result = oref0_calculate_iob(command)
   console.log(result);
}

exports = module.exports = oref0_calculate_iob