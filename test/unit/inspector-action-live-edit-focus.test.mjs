import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourcePath = new URL('../../resources/scxmleditor.js', import.meta.url);

function getFunctionBody(sourceText, functionName) {
	const marker = `function ${functionName}(`;
	const start = sourceText.indexOf(marker);
	assert.notEqual(start, -1, `${functionName} should exist`);

	const bodyStart = sourceText.indexOf('{', start);
	assert.notEqual(bodyStart, -1, `${functionName} should have a body`);

	let depth = 0;
	let end = -1;
	for (let i = bodyStart; i < sourceText.length; i++) {
		const ch = sourceText[i];
		if (ch === '{') depth++;
		if (ch === '}') {
			depth--;
			if (depth === 0) {
				end = i;
				break;
			}
		}
	}
	assert.notEqual(end, -1, `${functionName} body should be balanced`);
	return sourceText.slice(bodyStart + 1, end);
}

test('applyInspectorSetActionText does not force inspector refresh while typing', () => {
	const sourceText = fs.readFileSync(sourcePath, 'utf8');
	const body = getFunctionBody(sourceText, 'applyInspectorSetActionText');

	assert.match(body, /ex\.textContent\s*=\s*normalized/, 'Expected action text mutation to still occur');
	assert.doesNotMatch(
		body,
		/notifyInspectorData\(/,
		'Per-keystroke action text edits must not rerender inspector action cards'
	);
});

test('applyInspectorSetActionAttr does not force inspector refresh while typing', () => {
	const sourceText = fs.readFileSync(sourcePath, 'utf8');
	const body = getFunctionBody(sourceText, 'applyInspectorSetActionAttr');

	assert.match(body, /setAttribute\(|removeAttribute\(/, 'Expected action attribute mutation to still occur');
	assert.doesNotMatch(
		body,
		/notifyInspectorData\(/,
		'Per-keystroke action attribute edits must not rerender inspector action cards'
	);
});
