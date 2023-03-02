/* eslint-disable @typescript-eslint/naming-convention */
'use strict';

import * as vscode from 'vscode';

import { EditorGlue } from './editorglue';

export interface SelectionTypes {
	anySelected: Boolean,
	stateSelected: Boolean,
	transitionSelected: Boolean,
	parentStateSelected: Boolean,
	parallelSelected: Boolean
}

let manager: SCXMLEditorManager;

export function activate(context: vscode.ExtensionContext) {
	manager = new SCXMLEditorManager(context);
}

export function deactivate() {}

const PassAlongCommands = ['createState','createChildState','fitChildren','layoutDiagram','zoomToExtents','zoomTo100','zoomToSelected',
                           'toggleEventDisplay','deleteSelectionOnly','deleteSelectionAndMore'];
export class SCXMLEditorManager {
	public glueByURI: Map<vscode.Uri, EditorGlue> = new Map();
	private _glueWithActiveWebView: EditorGlue | null = null;
	public context: vscode.ExtensionContext;
	public diagnostics: vscode.DiagnosticCollection;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		vscode.workspace.onDidChangeTextDocument((evt: vscode.TextDocumentChangeEvent) => {
			const glue = this.glueByURI.get(evt.document.uri);
			glue?.maybeUpdateVisualsFromText();
		});

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
	}

	public showErrors(doc: vscode.TextDocument, errors: any[]) {
		const diags: vscode.Diagnostic[] = errors.map(error => {
			return new vscode.Diagnostic(
				new vscode.Range(error.line-1, error.col-1, error.line-1, error.col),
				`Error parsing SCXML: ${error.msg}`,
				vscode.DiagnosticSeverity.Error
			);
		});
		this.diagnostics.set(doc.uri, diags);
	}

	public showEditor() {
		const editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
		const doc = editor?.document;

		if (doc && doc.languageId === "xml") {
			const scxmlURI = doc.uri;

			let glueForDoc = this.glueByURI.get(scxmlURI);
			if (glueForDoc) {
				glueForDoc.panel.reveal();
			} else {
				const glueForDoc = new EditorGlue(this, editor);
				this.glueByURI.set(scxmlURI, glueForDoc);
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
			parallelSelected: false
		};
		for (const [scope, active] of Object.entries(selectedTypes)) {
			vscode.commands.executeCommand('setContext', `visual-scxml-editor.${scope}`, active);
		}
	}

	public dispose() {
	}
}
