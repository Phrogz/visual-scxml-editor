'use strict';

import * as fs from 'fs';
import { Disposable, TextEditor, WebviewPanel} from 'vscode';
import * as vscode from 'vscode';

export class EditorPanel {
	public panel: WebviewPanel;
	private readonly extensionURI: vscode.Uri;
	private readonly editor: TextEditor;
	private readonly resourceMap: Map<string, string> = new Map();
	private disposables: Disposable[] = [];
	private disposed: boolean = false;

	public constructor(panel: WebviewPanel, extensionURI: vscode.Uri, editor: TextEditor) {
		this.panel = panel;
		this.extensionURI = extensionURI;
		this.editor = editor;

		const selectionDecorator = vscode.window.createTextEditorDecorationType({
			border:'2px dashed',
			borderRadius: '6px',
			fontWeight: 'bold',
			// This theme color should match the color used in scxmleditor.html CSS for #selectors fill
			borderColor: new vscode.ThemeColor('button.background')
		});

		const wv = this.panel.webview;
		this.resourceMap = new Map([
			['neatXMLJS',     this.webviewURI('neatxml.js')],
			['scxmlDOMJS',    this.webviewURI('scxmldom.js')],
			['scxmlEditorJS', this.webviewURI('scxmleditor.js')],
			['editorGlueJS',  this.webviewURI('editorglue.js')],
			['baseEditorCSS', this.webviewURI('baseeditorstyles.css')],
			['mutableCSS',    this.webviewURI('mutable.css')],
			['themeCSS',      this.webviewURI('theme.css')],
		]);

		this.panel.iconPath = vscode.Uri.file(this.resourcePath('icon.svg').toString());
		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
		this.panel.onDidChangeViewState(() => this._update(), null, this.disposables);

		wv.onDidReceiveMessage(message => {
			const doc = editor.document;
			switch (message.command) {
				case 'SCXMLParseErrors':
					// TODO: Show these errors in the PROBLEMS panel
					// Presumably using a DiagnosticCollection https://code.visualstudio.com/docs/extensionAPI/vscode-api#languages.createDiagnosticCollection
					message.errors.forEach((error: any) => {
						console.error(`Error parsing SCXML: Line ${error.line}, col ${error.col}: ${error.msg}`);
					});
				break;

				case 'replaceDocument':
					const fullRange = doc.validateRange(new vscode.Range(0, 0, doc.lineCount, 0));
					editor.edit(edit => edit.replace(fullRange, message.xml));
				break;

				case 'selectedItems':
					const scxml = doc.getText();
					const selections: vscode.DecorationOptions[] = [];
					message.selection.forEach((item: any) => {
						// TODO: use information from serialization to find where a given node is placed, instead of regex
						if (item.name==='transition') {
							const parentMatcher = new RegExp(`^(\\s*)<${item.parentName}[^\n>]+?id=["']${item.parentId}["'][^>]+>`, 'm');
							const match = parentMatcher.exec(scxml);
							if (match) {
								// FIXME: we assume that serialization indentation is using tabs, and so add a tab to find only child transitions of the parent
								const transitionMatcher = new RegExp(`^${match[1]}\\t(<transition.+?>)`, 'gm');
								// Start searching at the index of the parent
								transitionMatcher.lastIndex = match.index+match[0].length;
								let transitionMatch, transitionIndex = -1;
								while (transitionMatch=transitionMatcher.exec(scxml)) {
									if (++transitionIndex===item.indexInParent) {
										selections.push({
											range: new vscode.Range(
												// Start decoration after the leading indentation
												doc.positionAt(transitionMatch.index + match[1].length + 1),
												doc.positionAt(transitionMatch.index + transitionMatch[0].length)
											)
										});
										break;
									}
								}
							}
						} else {
							const matcher = new RegExp(`<${item.name}[^\\n>]+?id=["']${item.id}["'][^>]+>`, 'm');
							const match = matcher.exec(scxml);
							if (match) {
								selections.push({
									range: new vscode.Range(
										doc.positionAt(match.index),
										doc.positionAt(match.index + match[0].length)
									)
								});
							}
						}
					});
					editor.setDecorations(selectionDecorator, selections);

					if (selections.length) {
						// Construct a union of all selection ranges and scroll to it
						editor.revealRange(selections.reduce<vscode.Range>((sum,r) => sum.union(r.range), selections[0].range), vscode.TextEditorRevealType.InCenter);
					}
				break;
			}
		});

		// TODO: is this needed? Maybe not?
		this._update();
	}

	public dispose()
	{
		this.disposables.forEach(disposable => disposable && disposable.dispose());
		this.disposables = [];
		this.disposed = true;
	}

	private async _update(): Promise<void> {
		// TODO: prevent this from getting called twice when first opened
		if (!this.disposed && this.panel.visible) {
			const editorHTMLPath = this.resourcePath('scxmleditor.html');
			let html = fs.readFileSync(editorHTMLPath, 'utf8');

			const nonce = generateNonce();
			html = html.replace('${nonce}', nonce);
			html = html.replace(/<script /g, `<script nonce="${nonce}" `);
			html = html.replace('${cspSource}', this.panel.webview.cspSource);

			// Replace ${resource} placeholders with proper paths
			this.panel.webview.html = html.replace(/\$\{([^}]+)\}/g, (_, p) => this.resourceMap.get(p) || '');

			this.panel.webview.postMessage({command:'document', document:this.editor.document.getText()});
		}
	}

	private resourceURI(file: string) {
		return vscode.Uri.joinPath(this.extensionURI, 'resources', file);
	}

	private webviewURI(file: string) {
		return this.panel.webview.asWebviewUri(this.resourceURI(file)).toString();
	}

	private resourcePath(file: string) {
		return this.resourceURI(file).fsPath;
	}
}

function generateNonce() {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	return [...Array(32)].map(_ => chars.charAt(~~(Math.random()*chars.length))).join('');
}