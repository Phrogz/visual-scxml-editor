import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourcePath = new URL('../../resources/visualdom.js', import.meta.url);
const sourceText = fs.readFileSync(sourcePath, 'utf8');

test('wayline guide lines are clamped to viewport during selector placement', () => {
	assert.match(
		sourceText,
		/sel\.guide\.setAttribute\('x1', viewport\.x\);/,
		'Expected horizontal wayline guide to start at viewport x'
	);
	assert.match(
		sourceText,
		/sel\.guide\.setAttribute\('x2', viewport\.x \+ viewport\.width\);/,
		'Expected horizontal wayline guide to end at viewport right edge'
	);
	assert.match(
		sourceText,
		/sel\.guide\.setAttribute\('y1', viewport\.y\);/,
		'Expected vertical wayline guide to start at viewport y'
	);
	assert.match(
		sourceText,
		/sel\.guide\.setAttribute\('y2', viewport\.y \+ viewport\.height\);/,
		'Expected vertical wayline guide to end at viewport bottom edge'
	);
});
