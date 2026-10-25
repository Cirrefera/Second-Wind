import { synthesize } from './product.mjs';
import { readFileSync } from 'node:fs';
const config = JSON.parse(readFileSync(process.argv[2] || './config.example.json', 'utf8'));
const assembly = synthesize(config);
process.stdout.write(`Synthesized ${assembly.stacks.length} stack(s) to ${assembly.directory}\n`);
