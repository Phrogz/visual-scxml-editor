/* eslint-disable curly */
'use strict';

import * as fs from 'fs';
import * as vscode from 'vscode';
import * as path from 'path';
import { SelectionTypes } from './extension';

interface SelectedItem {
	name          : string,
	id            : string,
	parentName    : string,
	parentId      : string,
	indexInParent : number,
	hasChildren   : boolean
}

interface InspectorPayload {
	documentLabel: string,
	documentUri: string,
	selectedTypes: SelectionTypes,
	selectedItems: SelectedItem[],
	inspectorData?: any
}

export class InspectorViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'visual-scxml-editor.inspectorView';
	private view: vscode.WebviewView | null = null;
	private payload: InspectorPayload | null = null;
	private messageHandler: ((message: any) => void) | null = null;

	public constructor(private readonly context: vscode.ExtensionContext) {}

	resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
		const webview = webviewView.webview;
		webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'resources')]
		};
		webview.html = this.buildHtml(webview);

		if (this.payload) this.postPayload(this.payload);

		webview.onDidReceiveMessage(message => {
			this.messageHandler?.(message);
		});

		webviewView.onDidDispose(() => {
			this.view = null;
		});
	}

	public onMessage(handler: (message: any) => void): void {
		this.messageHandler = handler;
	}

	public setSelection(payload: InspectorPayload | null): void {
		this.payload = payload;
		if (payload) this.postPayload(payload);
		else this.view?.webview.postMessage({command:'clearSelection'});
	}

	private postPayload(payload: InspectorPayload): void {
		this.view?.webview.postMessage({command:'updateSelection', payload});
	}

	private buildHtml(webview: vscode.Webview): string {
		const htmlPath = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'inspectorview.html').fsPath;
		let html = fs.readFileSync(htmlPath, 'utf8');
		const nonce = generateNonce();
		html = html.replace('${nonce}', nonce);
		html = html.replace(/<script /g, `<script nonce="${nonce}" `);
		html = html.replace('${cspSource}', webview.cspSource);
		return html.replace(/\$\{([^}]+)\}/g, (_match: string, key: string) => {
			switch (key) {
				case 'inspectorViewJS':
					return webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'inspectorview.js')).toString();
				case 'inspectorViewCSS':
					return webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'inspectorview.css')).toString();
				default:
					return '';
			}
		});
	}
}

function generateNonce() {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	return [...Array(32)].map(_ => chars.charAt(~~(Math.random()*chars.length))).join('');
}
