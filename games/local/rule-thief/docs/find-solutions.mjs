import { initial, solve } from '../rules.js';
import { writeFileSync } from 'node:fs';
const results = [0, 1, 2].map(i => solve(initial(i)));
console.log(JSON.stringify(results, null, 2));
if (results.every(r => r.status === 'solved')) writeFileSync(new URL('./solutions.json', import.meta.url), JSON.stringify(results.map(r => r.path), null, 2));
