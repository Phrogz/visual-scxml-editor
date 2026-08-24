import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function createMockVscode() {
	class Range {
		constructor(a, b, c, d) {
			if (typeof a === 'number') {
				this.start = {line: a, character: b};
				this.end = {line: c, character: d};
			} else {
				this.start = a;
				this.end = b;
			}
		}

		union(other) {
			const start =
				(this.start.line < other.start.line ||
				(this.start.line === other.start.line && this.start.character <= other.start.character))
					? this.start
					: other.start;

			const end =
				(this.end.line > other.end.line ||
				(this.end.line === other.end.line && this.end.character >= other.end.character))
					? this.end
					: other.end;

			return new Range(start, end);
		}
	}

	return {
		Range,
		window: {
			activeTextEditor: null,
			createTextEditorDecorationType: () => ({})
		},
		TextEditorRevealType: {
			InCenter: 0
		}
	};
}

function loadEditorGlueClass(mockVscode) {
	const compiledPath = new URL('../../out/editorglue.js', import.meta.url);
	const code = fs.readFileSync(compiledPath, 'utf8');

	const mod = {exports: {}};
	const sandbox = {
		module: mod,
		exports: mod.exports,
		require: spec => {
			if (spec === 'vscode') return mockVscode;
			if (spec === 'path') return {basename: value => value.split('/').pop()};
			if (spec === 'fs') return {readFileSync: () => ''};
			throw new Error(`Unexpected dependency in test: ${spec}`);
		},
		console
	};

	vm.runInNewContext(code, sandbox, {filename: 'out/editorglue.js'});
	return mod.exports.EditorGlue;
}

function createTextDocument(text) {
	const lines = text.split('\n');
	const starts = [];
	let offset = 0;
	for (const line of lines) {
		starts.push(offset);
		offset += line.length + 1;
	}

	function positionAt(index) {
		if (index <= 0) return {line: 0, character: 0};
		if (index >= text.length) {
			const lastLine = lines.length - 1;
			return {line: lastLine, character: lines[lastLine].length};
		}

		let line = 0;
		while (line + 1 < starts.length && starts[line + 1] <= index) {
			line++;
		}
		return {line, character: index - starts[line]};
	}

	function lineAt(line) {
		const value = lines[line] ?? '';
		const match = value.match(/\S/);
		return {
			text: value,
			firstNonWhitespaceCharacterIndex: match ? match.index : value.length
		};
	}

	return {
		getText: () => text,
		lineCount: lines.length,
		positionAt,
		lineAt
	};
}

test('repro: inspector typing path still triggers revealRange when activeTextEditor remains the SCXML doc', () => {
	const vscode = createMockVscode();
	const EditorGlue = loadEditorGlueClass(vscode);

	const xml = [
		'<scxml>',
		'  <state id="on">',
		'    <transition event="turn_off" target="off"/>',
		'  </state>',
		'</scxml>'
	].join('\n');

	const doc = createTextDocument(xml);
	let revealCalls = 0;
	const editor = {
		document: doc,
		setDecorations: () => {},
		revealRange: () => { revealCalls++; }
	};

	const manager = {
		activeGlue: null,
		updateSelectionScopes: () => {},
		updateInspectorSelection: () => {}
	};

	const glue = Object.create(EditorGlue.prototype);
	glue.editor = editor;
	glue.manager = manager;
	glue.selectionDecorator = {};
	glue.selectedTypes = {
		anySelected: false,
		stateSelected: false,
		transitionSelected: false,
		parentStateSelected: false,
		parallelSelected: false,
		initialCandidateSelected: false
	};
	glue.selectedItems = [];
	glue.inspectorData = {items: []};

	// Simulate webview/inspector-driven activity where VS Code still reports
	// the XML editor as the active text editor.
	manager.activeGlue = glue;
	vscode.window.activeTextEditor = {document: doc};

	glue.showSelection([
		{
			name: 'transition',
			id: '',
			parentName: 'state',
			parentId: 'on',
			indexInParent: 0,
			hasChildren: false
		}
	]);

	assert.equal(
		revealCalls,
		1,
		'Regression repro: revealRange is called and can steal focus while typing in inspector'
	);
});
