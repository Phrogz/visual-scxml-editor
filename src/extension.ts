'use strict';

import * as vscode from 'vscode';
import * as path from 'path';

import { EditorPanel } from './editorpanel';

interface SelectionTypes {
	anyStateSelected: Boolean,
	anyTransitionSelected: Boolean,
	anyParentStateSelected: Boolean,
	anyParallelStateSelected: Boolean
}

export function activate(context: vscode.ExtensionContext) {
	let manager = new SCXMLEditorManager();

	context.subscriptions.push(vscode.commands.registerCommand('visual-scxml-editor.showEditor', () => {
		manager.showEditor(context.extensionUri);
	}));

	for (const cmd of 'createState fitChildren undo zoomToExtents zoomTo100 toggleEventDisplay deleteNonDestructive deleteDestructive'.split(' ')) {
		context.subscriptions.push(vscode.commands.registerCommand(`visual-scxml-editor.${cmd}`, () => {
			manager.sendToActiveEditor(cmd);
		}));
	}
}

export function deactivate() {}

export class SCXMLEditorManager {
	private editorPanelByURI: Map<vscode.Uri, EditorPanel> = new Map();
	private _editorPanelWithActiveWebView: EditorPanel | null = null;

	constructor() {
		vscode.workspace.onDidChangeTextDocument((evt: vscode.TextDocumentChangeEvent) => {
			let editorPanel = this.editorPanelByURI.get(evt.document.uri);
			if (editorPanel) {
				editorPanel.panel.webview.postMessage({command:'updateFromText', document:evt.document.getText()});
			}
		});
	}

	// If any webview was last active, use that
	// Otherwise, see if the active text editor is associated with a panel
	public get activeEditorPanel() {
		if (this._editorPanelWithActiveWebView) {
			return this._editorPanelWithActiveWebView;
		} else if (vscode.window.activeTextEditor) {
			return this.editorPanelByURI.get(vscode.window.activeTextEditor.document.uri) || null;
		} else {
			return null;
		}
	}

	public set activeEditorPanel(newValue: EditorPanel | null) {
		this._editorPanelWithActiveWebView = newValue;
		vscode.commands.executeCommand('setContext', 'visual-scxml-editor.anyVisualEditorIsActive', !!newValue);

		// FIXME: if a webview is focused, then an editor is focused, then the editor loses focus, this will be incorrectly left as true
		// Need to track when editor views gain and lose focus
		vscode.commands.executeCommand('setContext', 'visual-scxml-editor.anyEditorIsActive', !!this.activeEditorPanel);
		this.updateSelection(newValue);
	}

	public showEditor(extensionURI: vscode.Uri) {
		const editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
		const doc = editor?.document;

		if (doc && doc.languageId === "xml") {
			const scxmlURI = doc.uri;

			let editorPanelForDoc = this.editorPanelByURI.get(scxmlURI);
			if (editorPanelForDoc) {
				editorPanelForDoc.panel.reveal();
			} else {
				// TODO: why doesn't the editor instance create this itself?
				const webviewPanel = vscode.window.createWebviewPanel(
					'scxml', `SCXML ${path.basename(doc.fileName)}`,
					vscode.ViewColumn.Beside,
					{
						enableScripts: true,
						localResourceRoots: [vscode.Uri.joinPath(extensionURI, 'resources')]
                    }
				);
				webviewPanel.onDidDispose(() => {
					this.editorPanelByURI.delete(scxmlURI);
				});
				editorPanelForDoc = new EditorPanel(extensionURI, editor, webviewPanel, this);
				this.editorPanelByURI.set(scxmlURI, editorPanelForDoc);
			}
		}
	}

	public sendToActiveEditor(command: String) {
		if (this.activeEditorPanel) {
			this.activeEditorPanel.panel.webview.postMessage({command});
		} else {
			console.info(`Visual SCXML Editor not sending command '${command} to anyone because there is no active editor panel'`);
		}
	}

	public updateSelection(editor: EditorPanel | null) {
		const selectedTypes: SelectionTypes = editor ? editor.selectedTypes : {
			anyStateSelected: false,
			anyTransitionSelected: false,
			anyParentStateSelected: false,
			anyParallelStateSelected: false
		};
		for (const [scope, active] of Object.entries(selectedTypes)) {
			vscode.commands.executeCommand('setContext', `visual-scxml-editor.${scope}`, active);
		}
	}

	public dispose() {
	}
}
