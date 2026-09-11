const fs = require('fs');
const path = require('path');
const { evaluateRecords } = require('../utils/plannerEvaluation');
const { DEFAULT_PATH } = require('../utils/learningRecorder');

const input = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_PATH;
if (!fs.existsSync(input)) {
  console.error('No planner learning records found at ' + input);
  process.exit(1);
}
const records = fs.readFileSync(input, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line, index) => {
    try { return JSON.parse(line); } catch { throw new Error('Invalid JSONL at line ' + (index + 1)); }
  });
console.log(JSON.stringify(evaluateRecords(records), null, 2));
