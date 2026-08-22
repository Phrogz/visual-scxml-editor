/* eslint-disable @typescript-eslint/naming-convention */
'use strict';

import * as vscode from 'vscode';
import * as path from 'path';

import { EditorGlue } from './editorglue';
import { InspectorViewProvider } from './inspectorview';

export interface SelectionTypes {
	anySelected: Boolean,
	stateSelected: Boolean,
	transitionSelected: Boolean,
	parentStateSelected: Boolean,
	parallelSelected: Boolean,
	initialCandidateSelected: Boolean
}

export interface SelectedItem {
	name          : string,
	id            : string,
	parentName    : string,
	parentId      : string,
	indexInParent : number,
	hasChildren   : boolean
}

const BlankSCXML = `<?xml version="1.0" encoding="UTF-8"?>
<scxml version="1.0" xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://phrogz.net/visual-scxml">
	<state id="MyFirstState"/>
</scxml>`;

let manager: SCXMLEditorManager;

export function activate(context: vscode.ExtensionContext) {
	manager = new SCXMLEditorManager(context);
}

export function deactivate() {}

const PassAlongCommands = ['createState','createChildState','fitChildren','layoutDiagram','zoomToExtents','zoomTo100','zoomToSelected',
                           'toggleEventDisplay','deleteSelectionOnly','deleteSelectionAndMore','removeVisualization','addVerticalWayline','addHorizontalWayline',
                           'setInitial'];
export class SCXMLEditorManager {
	public glueByURI: Map<vscode.Uri, EditorGlue> = new Map();
	private _glueWithActiveWebView: EditorGlue | null = null;
	public context: vscode.ExtensionContext;
	public diagnostics: vscode.DiagnosticCollection;
	private inspectorView: InspectorViewProvider;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		this.inspectorView = new InspectorViewProvider(context);
		this.inspectorView.onMessage(this.handleInspectorMessage.bind(this));
		context.subscriptions.push(vscode.window.registerWebviewViewProvider(InspectorViewProvider.viewType, this.inspectorView));
		context.subscriptions.push(vscode.workspace.onDidCreateFiles(() => {
			void this.refreshInspectorScxmlFiles(vscode.window.activeTextEditor?.document.uri || null);
		}));
		context.subscriptions.push(vscode.workspace.onDidDeleteFiles(() => {
			void this.refreshInspectorScxmlFiles(vscode.window.activeTextEditor?.document.uri || null);
		}));
		context.subscriptions.push(vscode.workspace.onDidRenameFiles(() => {
			void this.refreshInspectorScxmlFiles(vscode.window.activeTextEditor?.document.uri || null);
		}));
		vscode.workspace.onDidChangeTextDocument((evt: vscode.TextDocumentChangeEvent) => {
			const glue = this.glueByURI.get(evt.document.uri);
			glue?.maybeUpdateVisualsFromText();
		});

		context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
			if (!editor) {
				this.activeGlue = null;
				void this.refreshInspectorScxmlFiles(null);
				return;
			}

			const glue = this.glueByURI.get(editor.document.uri) || null;
			this.activeGlue = glue;
			void this.refreshInspectorScxmlFiles(this.activeScxmlUriFromEditor(editor));
		}));

		context.subscriptions.push(vscode.window.tabGroups.onDidChangeTabs(() => {
			void this.refreshInspectorScxmlFiles(this.inspectorActiveScxmlUri());
		}));

		context.subscriptions.push(vscode.commands.registerCommand('visual-scxml-editor.createBlank', () => {
			vscode.commands.executeCommand('workbench.action.files.newUntitledFile').then(() => {
				const textEditor = vscode.window.activeTextEditor;
				if (textEditor) {
					vscode.languages.setTextDocumentLanguage(textEditor.document, 'xml').then(() => {
						this.showEditor()?.replaceDocument(BlankSCXML, true);
					});
				}
			});
		}));

		context.subscriptions.push(vscode.commands.registerCommand('visual-scxml-editor.showEditor', () => {
			console.info(`SCXML Editor showing editor for ${vscode.window.activeTextEditor?.document.uri.fsPath}`);
			this.showEditor();
		}));

		context.subscriptions.push(vscode.commands.registerCommand('visual-scxml-editor.undo', () => {
			this.activeGlue?.undo();
		}));

		context.subscriptions.push(vscode.commands.registerCommand('visual-scxml-editor.save', () => {
			this.activeGlue?.save();
		}));

		context.subscriptions.push(vscode.commands.registerCommand('visual-scxml-editor.createTransition', () => {
			this.activeGlue?.createTransition();
		}));

		for (const cmd of PassAlongCommands) {
			context.subscriptions.push(vscode.commands.registerCommand(`visual-scxml-editor.${cmd}`, () => {
				console.info(`SCXML Editor handling command ${cmd}`);
				this.sendToActiveEditor(cmd);
			}));
		}

		this.diagnostics = vscode.languages.createDiagnosticCollection("emoji");
		context.subscriptions.push(this.diagnostics);
	}

	// If any webview was last active, use that
	// Otherwise, see if the active text editor is associated with existing glue
	public get activeGlue() {
		if (this._glueWithActiveWebView) {
			return this._glueWithActiveWebView;
		} else if (vscode.window.activeTextEditor) {
			return this.glueByURI.get(vscode.window.activeTextEditor.document.uri) || null;
		} else {
			return null;
		}
	}

	public set activeGlue(newValue: EditorGlue | null) {
		this._glueWithActiveWebView = newValue;
		vscode.commands.executeCommand('setContext', 'visual-scxml-editor.visualEditorActive', !!newValue);

		// FIXME: if a webview is focused, then an editor is focused, then the editor loses focus, this will be incorrectly left as true
		// Need to track when editor views gain and lose focus
		vscode.commands.executeCommand('setContext', 'visual-scxml-editor.editorActive', !!this.activeGlue);
		this.updateSelectionScopes(newValue);
		this.updateInspectorSelection(newValue);
	}

	public showErrors(doc: vscode.TextDocument, errors: any[]) {
		const diags: vscode.Diagnostic[] = errors.map(error => {
			const warning = error.severity==='warning';
			return new vscode.Diagnostic(
				new vscode.Range(error.line-1, error.col-1, error.line-1, error.col),
				warning ? error.msg : `Error parsing SCXML: ${error.msg}`,
				warning ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error
			);
		});
		this.diagnostics.set(doc.uri, diags);
	}

	public showEditor() {
		const editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
		if (editor) {
			const doc = editor.document;

			if (doc?.languageId === "xml") {
				const scxmlURI = doc.uri;

				let glueForDoc = this.glueByURI.get(scxmlURI);
				if (glueForDoc) {
					glueForDoc.panel.reveal();
				} else {
					glueForDoc = new EditorGlue(this, editor);
					this.glueByURI.set(scxmlURI, glueForDoc);
				}
				return glueForDoc;
			}
		}
	}

	public sendToActiveEditor(command: String) {
		if (this.activeGlue) {
			this.activeGlue.panel.webview.postMessage({command});
		} else {
			console.info(`Visual SCXML Editor not sending command '${command}' to anyone because there is no active EditorGlue.`);
		}
	}

	public updateSelectionScopes(glue: EditorGlue | null) {
		const selectedTypes: SelectionTypes = glue ? glue.selectedTypes : {
			anySelected: false,
			stateSelected: false,
			transitionSelected: false,
			parentStateSelected: false,
			parallelSelected: false,
			initialCandidateSelected: false
		};
		for (const [scope, active] of Object.entries(selectedTypes)) {
			vscode.commands.executeCommand('setContext', `visual-scxml-editor.${scope}`, active);
		}
	}

	public updateInspectorSelection(glue: EditorGlue | null) {
		const activeUri = this.activeScxmlUriFromEditor(vscode.window.activeTextEditor)
			|| this.activeScxmlUri(glue?.editor.document.uri || null);
		void this.refreshInspectorScxmlFiles(activeUri);
		if (!glue) {
			this.inspectorView.setSelection(null);
			return;
		}

		this.inspectorView.setSelection({
			documentLabel: glue.editor.document.fileName.split('/').pop() || glue.editor.document.fileName,
			documentUri: glue.editor.document.uri.toString(),
			selectedTypes: glue.selectedTypes,
			selectedItems: glue.selectedItems,
			inspectorData: glue.inspectorData
		});
	}

	private async refreshInspectorScxmlFiles(activeUri: vscode.Uri | null): Promise<void> {
		const diskFiles = await vscode.workspace.findFiles('**/*.scxml', '**/{node_modules,.git,out,dist}/**');
		const openFiles = vscode.workspace.textDocuments
			.map(doc => doc.uri)
			.filter(uri => uri.scheme==='file' && uri.fsPath.toLowerCase().endsWith('.scxml'));

		const byUri = new Map<string, vscode.Uri>();
		for (const uri of [...diskFiles, ...openFiles]) {
			byUri.set(uri.toString(), uri);
		}

		const files = [...byUri.values()]
			.sort((a, b) => a.fsPath.localeCompare(b.fsPath))
			.map(uri => ({
				uri: uri.toString(),
				label: this.scxmlFileLabel(uri)
			}));

		const diagramActiveUri = this.activeDiagramUri();
		this.inspectorView.setScxmlFiles(files, activeUri?.toString() || null, diagramActiveUri?.toString() || null);
	}

	private activeDiagramUri(): vscode.Uri | null {
		for (const glue of this.glueByURI.values()) {
			if (glue.panel.active) {
				return glue.editor.document.uri;
			}
		}

		if (this._glueWithActiveWebView?.panel.active) {
			return this._glueWithActiveWebView.editor.document.uri;
		}

		return null;
	}

	private inspectorActiveScxmlUri(): vscode.Uri | null {
		return this.activeScxmlUriFromEditor(vscode.window.activeTextEditor)
			|| this.activeScxmlUriFromActiveTab()
			|| this.activeScxmlUri(this.activeGlue?.editor.document.uri || null);
	}

	private activeScxmlUriFromActiveTab(): vscode.Uri | null {
		const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
		if (!activeTab) {
			return null;
		}

		const input = activeTab.input;
		if (!(input instanceof vscode.TabInputText)) {
			return null;
		}

		return this.activeScxmlUri(input.uri);
	}

	private activeScxmlUri(uri: vscode.Uri | null | undefined): vscode.Uri | null {
		if (!uri) {
			return null;
		}
		if (uri.scheme!=='file') {
			return null;
		}
		if (!uri.fsPath.toLowerCase().endsWith('.scxml')) {
			return null;
		}
		return uri;
	}

	private activeScxmlUriFromEditor(editor: vscode.TextEditor | null | undefined): vscode.Uri | null {
		return this.activeScxmlUri(editor?.document.uri || null);
	}

	private scxmlFileLabel(uri: vscode.Uri): string {
		const folder = vscode.workspace.getWorkspaceFolder(uri);
		if (folder) {
			const rel = path.relative(folder.uri.fsPath, uri.fsPath);
			if (rel && !rel.startsWith('..')) {
				return rel.split(path.sep).join('/');
			}
		}

		return path.basename(uri.fsPath) || uri.toString();
	}

	private async openScxmlInVisualEditor(uriText: string): Promise<void> {
		try {
			const uri = vscode.Uri.parse(uriText, true);
			const doc = await vscode.workspace.openTextDocument(uri);
			const viewColumn = this.getPreferredTextEditorColumn();
			await vscode.window.showTextDocument(doc, {preserveFocus: false, preview: false, viewColumn});
			if (doc.languageId !== 'xml') {
				await vscode.languages.setTextDocumentLanguage(doc, 'xml');
			}
			this.showEditor();
			await this.refreshInspectorScxmlFiles(doc.uri);
		} catch (error) {
			vscode.window.showErrorMessage(`Could not open SCXML visual editor: ${String(error)}`);
		}
	}

	private getPreferredTextEditorColumn(): vscode.ViewColumn {
		if (vscode.window.activeTextEditor?.viewColumn) {
			return vscode.window.activeTextEditor.viewColumn;
		}

		for (const group of vscode.window.tabGroups.all) {
			if (group.tabs.some(tab => tab.input instanceof vscode.TabInputText)) {
				return group.viewColumn;
			}
		}

		return vscode.ViewColumn.One;
	}

	private handleInspectorMessage(message: any) {
		switch (message.command) {
			case 'requestScxmlFiles':
				void this.refreshInspectorScxmlFiles(this.inspectorActiveScxmlUri());
			return;

			case 'openScxmlInVisualEditor':
				if (typeof message.uri==='string' && message.uri.length) {
					void this.openScxmlInVisualEditor(message.uri);
				}
			return;
		}

		if (!this.activeGlue) {
			return;
		}

		switch (message.command) {
			case 'setProperty':
				this.activeGlue.panel.webview.postMessage({
					command: 'inspectorSetProperty',
					property: message.property,
					value: message.value
				});
			break;

			case 'addAction':
				this.activeGlue.panel.webview.postMessage({
					command: 'inspectorAddAction',
					location: message.location
				});
			break;

			case 'deleteAction':
				this.activeGlue.panel.webview.postMessage({
					command: 'inspectorDeleteAction',
					location: message.location,
					index: message.index
				});
			break;

			case 'setActionType':
				this.activeGlue.panel.webview.postMessage({
					command: 'inspectorSetActionType',
					location: message.location,
					index: message.index,
					ns: message.ns,
					name: message.name
				});
			break;

			case 'setActionAttr':
				this.activeGlue.panel.webview.postMessage({
					command: 'inspectorSetActionAttr',
					location: message.location,
					index: message.index,
					name: message.name,
					value: message.value
				});
			break;

			case 'setActionText':
				this.activeGlue.panel.webview.postMessage({
					command: 'inspectorSetActionText',
					location: message.location,
					index: message.index,
					text: message.text
				});
			break;
		}
	}

	public dispose() {
	}
}
