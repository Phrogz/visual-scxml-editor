import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourcePath = new URL('../../resources/visualdom.js', import.meta.url);
const sourceText = fs.readFileSync(sourcePath, 'utf8');

test('anchors serializer emits explicit auto endpoint token', () => {
	assert.match(
		sourceText,
		/if \(anchor\.auto\) return 'a';/,
		'Auto endpoints must serialize as explicit "a" tokens'
	);
});

test('anchors serializer no longer drops auto endpoints', () => {
	assert.doesNotMatch(
		sourceText,
		/anchors\.filter\(a => !a\.auto\)/,
		'Dropping auto endpoints causes target-only edits to serialize as source anchors'
	);
});

test('anchors serializer omits pts only when no explicit points remain', () => {
	assert.match(
		sourceText,
		/const hasExplicitPoint = pointTokens\.some\(token => token!=='a'\);/,
		'Pure auto endpoints should clear viz:pts'
	);
});
