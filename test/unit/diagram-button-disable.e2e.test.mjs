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
	const listeners = {
		onDidChangeActiveTextEditor: [],
		onDidChangeTabs: []
	};

	const disposables = [];
	const commands = new Map();

	const workspace = {
		textDocuments: [],
		findFiles: async () => [],
		getWorkspaceFolder: () => null,
		onDidCreateFiles: cb => (disposables.push(cb), {dispose() {}}),
		onDidDeleteFiles: cb => (disposables.push(cb), {dispose() {}}),
		onDidRenameFiles: cb => (disposables.push(cb), {dispose() {}}),
		onDidChangeTextDocument: cb => (disposables.push(cb), {dispose() {}}),
		openTextDocument: async () => ({languageId: 'xml'}),
		asRelativePath: uri => uri.fsPath
	};

	const window = {
		activeTextEditor: null,
		tabGroups: {
			activeTabGroup: {activeTab: undefined, tabs: []},
			all: [],
			onDidChangeTabs: cb => {
				listeners.onDidChangeTabs.push(cb);
				return {dispose() {}};
			}
		},
		onDidChangeActiveTextEditor: cb => {
			listeners.onDidChangeActiveTextEditor.push(cb);
			return {dispose() {}};
		},
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
			joinPath: (...parts) => ({fsPath: parts.map(p => (typeof p === 'string' ? p : p.fsPath || '')).join('/') , toString() { return this.fsPath; }}),
			parse: value => ({scheme: 'file', fsPath: value.replace(/^file:\/\//, ''), toString() { return value; }})
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

	return {vscode, listeners};
}

function loadManagerClass(vscodeMock) {
	const sourcePath = new URL('../../out/extension.js', import.meta.url);
	const code = fs.readFileSync(sourcePath, 'utf8');
	const module = {exports: {}};

	class InspectorViewProviderStub {
		static viewType = 'visual-scxml-editor.inspectorView';
		constructor() {
			this.calls = [];
		}
		onMessage() {}
		setSelection() {}
		setScxmlFiles(files, activeUri, diagramActiveUri) {
			this.calls.push({files, activeUri, diagramActiveUri});
		}
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
	return {SCXMLEditorManager: module.exports.SCXMLEditorManager, InspectorViewProviderStub};
}

function tick() {
	return new Promise(resolve => setTimeout(resolve, 0));
}

test('e2e: diagram button state should refresh when tab focus changes to a diagram', async () => {
	const {vscode, listeners} = createVscodeMock();
	const {SCXMLEditorManager} = loadManagerClass(vscode);

	const uri = makeUri('/workspace/microwave-02.scxml');
	vscode.workspace.findFiles = async () => [uri];
	vscode.workspace.textDocuments = [{uri}];

	const context = {
		extensionUri: {fsPath: '/workspace'},
		subscriptions: []
	};

	const manager = new SCXMLEditorManager(context);
	const inspectorView = manager.inspectorView;

	const glue = {
		editor: {document: {uri, fileName: '/workspace/microwave-02.scxml'}},
		panel: {active: false, webview: {postMessage() {}}},
		selectedTypes: {
			anySelected: false,
			stateSelected: false,
			transitionSelected: false,
			parentStateSelected: false,
			parallelSelected: false,
			initialCandidateSelected: false
		},
		selectedItems: [],
		inspectorData: {items: []}
	};
	manager.glueByURI.set(uri, glue);

	// Initial state: selected SCXML exists, but no active diagram tracked yet.
	await manager.refreshInspectorScxmlFiles(uri);
	await tick();

	const initialCalls = inspectorView.calls.length;
	assert.ok(initialCalls > 0, 'Expected initial inspector file sync');
	assert.equal(inspectorView.calls[initialCalls - 1].diagramActiveUri, null);

	// Simulate diagram becoming the focused tab/document.
	glue.panel.active = true;
	manager._glueWithActiveWebView = glue;
	for (const cb of listeners.onDidChangeTabs) {
		cb({});
	}
	await tick();

	// Desired behavior: tab focus change should trigger another sync with diagramActiveUri.
	assert.equal(
		inspectorView.calls.length,
		initialCalls + 1,
		'Expected inspector to resync when tab focus changes to the diagram'
	);
	assert.equal(inspectorView.calls.at(-1).diagramActiveUri, uri.toString());
});

test('e2e: requestScxmlFiles uses active tab when activeTextEditor is unavailable', async () => {
	const {vscode} = createVscodeMock();
	const {SCXMLEditorManager} = loadManagerClass(vscode);

	const launcherUri = makeUri('/workspace/launcher.scxml');
	const microwaveUri = makeUri('/workspace/microwave-02.scxml');
	vscode.workspace.findFiles = async () => [launcherUri, microwaveUri];
	vscode.workspace.textDocuments = [{uri: launcherUri}, {uri: microwaveUri}];
	vscode.window.activeTextEditor = null;
	vscode.window.tabGroups.activeTabGroup.activeTab = {
		input: new vscode.TabInputText(microwaveUri)
	};

	const context = {
		extensionUri: {fsPath: '/workspace'},
		subscriptions: []
	};

	const manager = new SCXMLEditorManager(context);
	const inspectorView = manager.inspectorView;

	await manager.refreshInspectorScxmlFiles(manager.inspectorActiveScxmlUri());

	assert.ok(inspectorView.calls.length > 0, 'Expected inspector file sync');
	assert.equal(
		inspectorView.calls.at(-1).activeUri,
		microwaveUri.toString(),
		'Expected active SCXML to come from active tab when no active editor exists'
	);
});
