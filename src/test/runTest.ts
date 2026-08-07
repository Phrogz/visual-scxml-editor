import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

const testDirectory = path.resolve(__dirname, '../../test/unit');
const testFiles = fs.readdirSync(testDirectory)
	.filter(file => file.endsWith('.test.mjs'))
	.map(file => path.join(testDirectory, file));

if (!testFiles.length) {
	throw new Error(`No test files found in ${testDirectory}`);
}

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
	stdio: 'inherit'
});

if (result.error) { throw result.error; }
process.exitCode = result.status ?? 1;
