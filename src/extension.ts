import * as vscode from 'vscode';
import * as path from 'path';

import { EditorPanel } from './editorpanel';

export function activate(context: vscode.ExtensionContext) {
	let manager = new SCXMLEditorManager();
	context.subscriptions.push(vscode.commands.registerCommand('visual-scxml-editor.showEditor', () => {
		manager.showEditor(context.extensionUri);
	}));
}

export function deactivate() {}

class SCXMLEditorManager {
	private editorPanelByURI: Map<vscode.Uri, EditorPanel> = new Map();

	constructor() {
		vscode.workspace.onDidChangeTextDocument((evt: vscode.TextDocumentChangeEvent) => {
			let editorPanel = this.editorPanelByURI.get(evt.document.uri);
			if (editorPanel) {
				editorPanel.panel.webview.postMessage({command:'updateFromText', document:evt.document.getText()});
			}
		});
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
				const panel = vscode.window.createWebviewPanel(
					'scxml', `SCXML ${path.basename(doc.fileName)}`,
					vscode.ViewColumn.Beside,
					{
						enableScripts: true,
						localResourceRoots: [vscode.Uri.joinPath(extensionURI, 'resources')]
                    }
				);
				panel.onDidDispose(() => {
					this.editorPanelByURI.delete(scxmlURI);
				});
				editorPanelForDoc = new EditorPanel(panel, extensionURI, editor);
				this.editorPanelByURI.set(scxmlURI, editorPanelForDoc);
			}
		}
	}

	public dispose() {
	}
}
