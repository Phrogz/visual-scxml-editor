/* eslint-disable curly */
'use strict';

import * as fs from 'fs';
import * as vscode from 'vscode';
import * as path from 'path';
import { Disposable, TextEditor, WebviewPanel} from 'vscode';
import { window, ViewColumn } from 'vscode';
import { SCXMLEditorManager, SelectionTypes } from './extension';

export class EditorGlue {
	public panel: WebviewPanel;
	public selectedTypes: SelectionTypes;
	public readonly editor: TextEditor;
	private readonly resourceMap: Map<string, string> = new Map();
	private disposables: Disposable[] = [];
	private disposed: boolean = false;
	private manager: SCXMLEditorManager;
	private selectionDecorator: vscode.TextEditorDecorationType;

	public constructor(manager: SCXMLEditorManager, editor: TextEditor) {
		this.editor = editor;
		this.manager = manager;
		this.selectedTypes = {
			anySelected: false,
			stateSelected: false,
			transitionSelected: false,
			parentStateSelected: false,
			parallelSelected: false
		};

		this.selectionDecorator = window.createTextEditorDecorationType({
			border: '2px dashed',
			borderRadius: '6px',
			fontWeight: 'bold',
			// This theme color should match the color used in scxmleditor.html CSS for #selectors fill
			borderColor: new vscode.ThemeColor('button.background')
		});

		this.panel = vscode.window.createWebviewPanel(
			'scxml', `SCXML ${path.basename(editor.document.fileName)}`,
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				localResourceRoots: [vscode.Uri.joinPath(this.manager.context.extensionUri, 'resources')]
			}
		);
		this.panel.onDidDispose(() => {
			this.manager.glueByURI.delete(this.editor.document.uri);
			this.dispose();
		});

		this.resourceMap = new Map([
			['neatXMLJS',      this.webviewURI('neatxml.js')],
			['scxmlDOMJS',     this.webviewURI('scxmldom.js')],
			['visualEditorJS', this.webviewURI('visualeditor.js')],
			['scxmlEditorJS',  this.webviewURI('scxmleditor.js')],
			['baseCSS',        this.webviewURI('base.css')],
			['scxmlEditorCSS', this.webviewURI('scxmleditor.css')],
			['mutableCSS',     this.webviewURI('mutable.css')],
			['themeCSS',       this.webviewURI('theme.css')],
		]);

		this.panel.iconPath = vscode.Uri.file(this.resourcePath('icon.svg').toString());
		this.panel.onDidDispose(this.dispose.bind(this), null, this.disposables);
		this.panel.onDidChangeViewState(this._update.bind(this), null, this.disposables);

		this.panel.webview.onDidReceiveMessage(message => {
			console.log(`EditorGlue received message ${message.command}`);
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
					this.replaceDocument(message.xml);
				break;

				case 'undo':
					this.undo();
				break;

				case 'save':
					this.save();
				break;

				case 'zoomToExtents':
				case 'zoomTo100':
				case 'toggleEventDisplay':
				case 'deleteSelectionOnly':
				case 'deleteSelectionAndMore':
					this.panel.webview.postMessage(message.command);
				break;

				case 'selectedItems':
					this.showSelection(message.selection);
				break;
			}
		});

		const editorHTMLPath = this.resourcePath('scxmleditor.html');
		let html = fs.readFileSync(editorHTMLPath, 'utf8');

		const nonce = generateNonce();
		html = html.replace('${nonce}', nonce);
		html = html.replace(/<script /g, `<script nonce="${nonce}" `);
		html = html.replace('${cspSource}', this.panel.webview.cspSource);

		// Replace ${resource} placeholders with proper paths
		this.panel.webview.html = html.replace(/\$\{([^}]+)\}/g, (_, p) => this.resourceMap.get(p) || '');
	}

	private async _update(): Promise<void> {
		if (this.panel.active && this.panel.visible) {
			this.manager.activeGlue = this;
		} else if (this.manager.activeGlue === this) {
			this.manager.activeGlue = null;
		}

		console.info(`EditorGlue reacting to webview.onDidChangeViewState by forcing it to reload from XML`);

		// Redocking the panel requires the webview to reload (why?)
		this.panel.webview.postMessage({command:'updateFromText', document:this.editor.document.getText()});
	}

	public sendCommandToTextEditor(command: string) {
		const column = this.findEditorTabCol();
		if (column) {
			const opts = {preserveFocus:false, preview:false, viewColumn:column};
			window.showTextDocument(this.editor.document, opts).then(() => {
				vscode.commands.executeCommand(command).then(() => {
					this.panel.reveal();
				});
			});
		} else {
			console.warn(`SCXML Editor could not perform "${command}" because the editor tab could not be found`);
		}
	}

	public undo() {
		this.sendCommandToTextEditor('undo');
	}

	public save() {
		this.sendCommandToTextEditor('workbench.action.files.save');
	}

	public replaceDocument(newXML: string) {
		const fullRange = this.editor.document.validateRange(new vscode.Range(0, 0, this.editor.document.lineCount, 0));
		const editorTabCol = this.findEditorTabCol();
		if (editorTabCol) {
			window.showTextDocument(this.editor.document, {preserveFocus:true, viewColumn:editorTabCol}).then(() => {
				this.editor.edit(edit => edit.replace(fullRange, newXML));
			});
		}
	}

	public showSelection(selectedItems: any[]) {
		this.selectedTypes.anySelected = false;
		this.selectedTypes.stateSelected = false;
		this.selectedTypes.transitionSelected = false;
		this.selectedTypes.parentStateSelected = false;
		this.selectedTypes.parallelSelected = false;

		const editor = this.editor;
		const doc = editor.document;

		const scxml = editor.document.getText();
		const decoratedRanges: vscode.DecorationOptions[] = [];
		for (const item of selectedItems) {
			this.selectedTypes.anySelected = true;

			// TODO: use information from serialization to find where a given node is placed, instead of regex
			if (item.name==='transition') {
				this.selectedTypes.transitionSelected = true;
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
							decoratedRanges.push({
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
				this.selectedTypes.stateSelected = true;
				if (item.hasChildren) this.selectedTypes.parentStateSelected = true;
				if (item.name==='parallel') this.selectedTypes.parallelSelected = true;
				const matcher = new RegExp(`<${item.name}[^\\n>]+?id=["']${item.id}["'][^>]+>`, 'm');
				const match = matcher.exec(scxml);
				if (match) {
					decoratedRanges.push({
						range: new vscode.Range(
							doc.positionAt(match.index),
							doc.positionAt(match.index + match[0].length)
						)
					});
				}
			}
		}

		editor.setDecorations(this.selectionDecorator, decoratedRanges);

		if (decoratedRanges.length) {
			// Construct a union of all selection ranges and scroll to it
			editor.revealRange(decoratedRanges.reduce<vscode.Range>((sum,r) => sum.union(r.range), decoratedRanges[0].range), vscode.TextEditorRevealType.InCenter);
		}

		this.manager.updateSelectionScopes(this);
	}

	public dispose() {
		this.disposables.forEach(disposable => disposable && disposable.dispose());
		this.disposables = [];
		this.disposed = true;
	}

	private resourceURI(file: string) {
		return vscode.Uri.joinPath(this.manager.context.extensionUri, 'resources', file);
	}

	private webviewURI(file: string) {
		return this.panel.webview.asWebviewUri(this.resourceURI(file)).toString();
	}

	private resourcePath(file: string) {
		return this.resourceURI(file).fsPath;
	}

	// Locate the tab column for the text editor
	private findEditorTabCol(): ViewColumn|undefined {
		const docPath = this.editor.document.uri.fsPath;
		for (const tab of window.tabGroups.all.flatMap(group => group.tabs)) {
			const inp = tab.input;
			if (inp instanceof vscode.TabInputText && inp.uri.fsPath===docPath) {
				return tab.group.viewColumn;
			}
		}
	}
}

function generateNonce() {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	return [...Array(32)].map(_ => chars.charAt(~~(Math.random()*chars.length))).join('');
}
