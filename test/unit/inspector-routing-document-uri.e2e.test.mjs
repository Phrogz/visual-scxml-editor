import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function makeUri(pathname) {
	const encoded = pathname.replace(/ /g, '%20');
	return {
		scheme: 'file',
		fsPath: pathname,
		toString() {
			return `file://${encoded}`;
		}
	};
}

function createVscodeMock() {
	const commands = new Map();
	const workspace = {
		textDocuments: [],
		findFiles: async () => [],
		getWorkspaceFolder: () => null,
		onDidCreateFiles: () => ({dispose() {}}),
		onDidDeleteFiles: () => ({dispose() {}}),
		onDidRenameFiles: () => ({dispose() {}}),
		onDidChangeTextDocument: () => ({dispose() {}}),
		openTextDocument: async () => ({languageId: 'xml'}),
		asRelativePath: uri => uri.fsPath
	};

	const window = {
		activeTextEditor: null,
		tabGroups: {
			activeTabGroup: {activeTab: undefined, tabs: []},
			all: [],
			onDidChangeTabs: () => ({dispose() {}})
		},
		onDidChangeActiveTextEditor: () => ({dispose() {}}),
		registerWebviewViewProvider: () => ({dispose() {}}),
		showTextDocument: async () => ({edit: async () => true}),
		showErrorMessage: () => undefined
	};

	const vscode = {
		workspace,
		window,
		commands: {
			registerCommand: (id, fn) => {
				commands.set(id, fn);
				return {dispose() {}};
			},
			executeCommand: async () => undefined
		},
		languages: {
			createDiagnosticCollection: () => ({set() {}, dispose() {}}),
			setTextDocumentLanguage: async () => undefined
		},
		Uri: {
			joinPath: (...parts) => ({
				fsPath: parts.map(p => (typeof p === 'string' ? p : p.fsPath || '')).join('/'),
				toString() {
					return this.fsPath;
				}
			}),
			parse: value => ({
				scheme: 'file',
				fsPath: value.replace(/^file:\/\//, ''),
				toString() {
					return value;
				}
			})
		},
		Diagnostic: class {},
		DiagnosticSeverity: {Warning: 1, Error: 0},
		Range: class {
			constructor() {}
		},
		ViewColumn: {One: 1, Beside: 2},
		TabInputText: class {
			constructor(uri) {
				this.uri = uri;
			}
		}
	};

	return {vscode};
}

function loadManagerClass(vscodeMock) {
	const sourcePath = new URL('../../out/extension.js', import.meta.url);
	const code = fs.readFileSync(sourcePath, 'utf8');
	const module = {exports: {}};

	class InspectorViewProviderStub {
		static viewType = 'visual-scxml-editor.inspectorView';
		onMessage(handler) {
			this.handler = handler;
		}
		setSelection() {}
		setScxmlFiles() {}
	}

	const sandbox = {
		module,
		exports: module.exports,
		require: spec => {
			if (spec === 'vscode') return vscodeMock;
			if (spec === 'path') return {relative: (a, b) => b.replace(a, '').replace(/^\//, ''), basename: p => p.split('/').pop(), sep: '/'};
			if (spec === './editorglue') return {EditorGlue: class {}};
			if (spec === './inspectorview') return {InspectorViewProvider: InspectorViewProviderStub};
			throw new Error(`Unexpected dependency: ${spec}`);
		},
		console
	};

	vm.runInNewContext(code, sandbox, {filename: 'out/extension.js'});
	return module.exports.SCXMLEditorManager;
}

test('e2e: inspector edits route by documentUri when active glue is unavailable', () => {
	const {vscode} = createVscodeMock();
	const SCXMLEditorManager = loadManagerClass(vscode);

	const uri = makeUri('/workspace/microwave-02.scxml');
	const posted = [];
	const glue = {
		editor: {document: {uri, fileName: '/workspace/microwave-02.scxml'}},
		panel: {webview: {postMessage: message => posted.push(message)}}
	};

	const context = {
		extensionUri: {fsPath: '/workspace'},
		subscriptions: []
	};

	const manager = new SCXMLEditorManager(context);
	manager.glueByURI.set(uri, glue);
	manager._glueWithActiveWebView = null;
	vscode.window.activeTextEditor = null;

	manager.handleInspectorMessage({
		command: 'setProperty',
		property: 'targetAnchorSide',
		value: 'E',
		documentUri: uri.toString()
	});

	assert.equal(posted.length, 1, 'Expected property edit to be forwarded by document URI');
	assert.equal(posted[0].command, 'inspectorSetProperty');
	assert.equal(posted[0].property, 'targetAnchorSide');
	assert.equal(posted[0].value, 'E');
});
