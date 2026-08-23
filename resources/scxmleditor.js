/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable curly */
'use strict';

import { loadFromString as loadSCXML } from 'scxmlDOM';
import VisualEditor from 'visualEditor';
import { parseRoutingPoints } from 'visualDOM';
import neatXML from 'neatXML';

const visualNS = 'http://phrogz.net/visual-scxml';
const vscode = acquireVsCodeApi();
const visualEditor = new VisualEditor(document.querySelector('svg'));
window.vse = visualEditor;

visualEditor.onSelectionChanged = (sel) => {
	console.info('scxmleditor.js is notified that the visual selection changed');
	notifyDocumentOfSelection(sel);
	notifyInspectorData(sel);
};
visualEditor.onUndo = () => vscode.postMessage({command:'undo'});

let actionSchema;
const baseActionSchemaText = JSON.parse(document.getElementById('baseActionSchemaText')?.textContent || '""');

// Wait a short time before updating the document once only, so that quick changes (e.g. dragging) do not keep dirtying the document until done
const serializationOptions = {strip:true, indent:'\t', sort:true, cdata:true, tightcdata:false};
let handleChangeTimer;
const changeDelayMS = 250;
function onSCXMLDocChanged() {
	vscode.postMessage({command:'validIDs', ids:visualEditor.scxmlDoc.ids});
	clearTimeout(handleChangeTimer);
	handleChangeTimer = setTimeout(sendXMLToTextEditor, changeDelayMS);
}

function sendXMLToTextEditor() {
	if (visualEditor.scxmlDoc) {
		console.info('scxmleditor sending replaceDocument into the glue');
		const xml = neatXML(visualEditor.scxmlDoc, serializationOptions);
		vscode.postMessage({command:'replaceDocument', xml});
	}
}

window.addEventListener('message', event => {
	const message = event.data;
	console.info(`scxmleditor.js received message '${message.command}'`);
	switch (message.command) {
		case 'updateFromText': {
			const xmlString = message.document;
			const scxmlDocOrErrors = loadSCXML(xmlString);
			if (Array.isArray(scxmlDocOrErrors)) {
				vscode.postMessage({command:'showErrors', errors:scxmlDocOrErrors});
			} else {
				vscode.postMessage({command:'showErrors', errors:routingWarnings(scxmlDocOrErrors, xmlString)});
				if (visualEditor.scxmlDoc) visualEditor.scxmlDoc.removeEventListener('changed', onSCXMLDocChanged, false);
				visualEditor.useSCXML(scxmlDocOrErrors);
				vscode.postMessage({command:'validIDs', ids:scxmlDocOrErrors.ids});
				visualEditor.scxmlDoc.addEventListener('changed', onSCXMLDocChanged, false);
				actionSchema = readActionSchema(scxmlDocOrErrors);
				notifyInspectorData(visualEditor.selection || []);
				return true;
			}
			break;
		}

		case 'createState':
		case 'createChildState':
			if (visualEditor.scxmlDoc) {
				const parentElements = visualEditor.selection?.filter(el => el.canHaveChildStates);
				if (!parentElements.length) parentElements.push(visualEditor.scxmlDoc.root);
				const newElements = parentElements.map(parent => parent.addChild());
				visualEditor.setSelection(newElements);
			} else {
				console.error('Visual editor does not have a valid SCXML Doc to create a state in');
			}
		break;

		case 'fitChildren': {
			const parents = visualEditor.selection.filter(el => el.isState && el.isParent);
			for (const el of parents) el.expandToFitChildren();
			break;
		}

		case 'createTransition':
		case 'layoutDiagram':
		case 'zoomToExtents':
		case 'zoomTo100':
		case 'zoomToSelected':
		case 'toggleEventDisplay':
		case 'deleteSelectionOnly':
		case 'deleteSelectionAndMore':
		case 'removeVisualization':
		case 'addVerticalWayline':
		case 'addHorizontalWayline':
		case 'setInitial':
		case 'inspectorSetProperty':
		case 'inspectorAddAction':
		case 'inspectorDeleteAction':
		case 'inspectorSetActionType':
		case 'inspectorSetActionAttr':
		case 'inspectorSetActionText':
			if (visualEditor[message.command] instanceof Function) {
				visualEditor[message.command](message);
			} else if (message.command==='inspectorSetProperty') {
				applyInspectorPropertyChange(message.property, message.value);
			} else if (message.command==='inspectorAddAction') {
				applyInspectorAddAction(message.location);
			} else if (message.command==='inspectorDeleteAction') {
				applyInspectorDeleteAction(message.location, message.index);
			} else if (message.command==='inspectorSetActionType') {
				applyInspectorSetActionType(message.location, message.index, message.ns, message.name);
			} else if (message.command==='inspectorSetActionAttr') {
				applyInspectorSetActionAttr(message.location, message.index, message.name, message.value);
			} else if (message.command==='inspectorSetActionText') {
				applyInspectorSetActionText(message.location, message.index, message.text);
			} else {
				console.error(`scxmleditor.js unable to handle message ${message.command}`);
			}
		break;
	}
});

function applyInspectorPropertyChange(property, value) {
	if (property==='stateKind') {
		const previousSelection = visualEditor.selection.concat();
		visualEditor.setSelection([]);

		const nextSelection = [];
		for (const node of previousSelection) {
			const replacement = mutateStateKind(node, value);
			if (replacement && replacement!==node) {
				nextSelection.push(replacement);
			} else if (node?.parentNode) {
				nextSelection.push(node);
			}
		}

		visualEditor.setSelection(nextSelection);
		notifyInspectorData(visualEditor.selection);
		return;
	}

	let anyChanged = false;
	for (const o of visualEditor.selection) {
		if (!(property in o)) continue;
		let v = value;
		if (v==='(none)' || v==='(auto)') v = '';
		if (property==='isInternal') v = value===true || value==='true';
		if (property==='w' || property==='h' || property==='radius' || property==='sourceAnchorOffset' || property==='targetAnchorOffset' || property==='labelMainOffset' || property==='labelCrossOffset') {
			v = (v==='') ? '' : Number(v);
		}
		anyChanged = true;
		o[property] = v;
	}
	if (anyChanged && visualEditor.selection.length) {
		// Reapply the same selection to force selector handles to recompute geometry.
		visualEditor.setSelection(visualEditor.selection.concat());
	}
	notifyInspectorData(visualEditor.selection);
}

function mutateStateKind(node, kind) {
	if (!node?.isState || node.isSCXML) return null;
	if (!(kind==='state' || kind==='parallel')) return null;
	if (!(node.nodeName==='state' || node.nodeName==='parallel')) return null;
	if (node.nodeName===kind) return null;

	const replacement = node.ownerDocument.createElementNS(node.namespaceURI, kind);
	for (const attr of Array.from(node.attributes)) {
		if (attr.namespaceURI) replacement.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
		else replacement.setAttribute(attr.name, attr.value);
	}

	if (kind==='parallel') {
		replacement.removeAttribute('initial');
	}

	while (node.firstChild) {
		replacement.appendChild(node.firstChild);
	}

	node.replaceWith(replacement);
	replacement.initialize?.(visualEditor);
	replacement.parentNode?.updateStyleForDescendants?.();
	replacement.updateStyleForContainment?.();
	replacement.updateStyleForDescendants?.();

	return replacement;
}

function applyInspectorAddAction(location) {
	const sel = visualEditor.selection;
	if (sel.length!==1) return;
	addNewAction(location);
	notifyInspectorData(sel);
}

function applyInspectorDeleteAction(location, index) {
	const ex = getInspectorExecutable(location, index);
	if (!ex) return;
	ex.delete();
	notifyInspectorData(visualEditor.selection);
}

function applyInspectorSetActionType(location, index, ns, name) {
	const ex = getInspectorExecutable(location, index);
	if (!ex) return;
	changeAction(ex, ns, name);
	notifyInspectorData(visualEditor.selection);
}

function applyInspectorSetActionAttr(location, index, attrName, value) {
	const ex = getInspectorExecutable(location, index);
	if (!ex) return;
	const schema = findActionSchema(ex.namespaceURI, ex.localName);
	const attr = schema?.attrs?.find(a => a.name===attrName);
	if (!attr) {
		if (value==='') ex.removeAttribute(attrName);
		else ex.setAttribute(attrName, value);
	} else {
		const normalized = normalizeAttrValue(attr, value);
		if (normalized===undefined || normalized==='') ex.removeAttribute(attrName);
		else ex.setAttribute(attrName, normalized);
	}
}

function applyInspectorSetActionText(location, index, text) {
	const ex = getInspectorExecutable(location, index);
	if (!ex) return;
	const normalized = normalizeActionText(text);
	ex.textContent = normalized;
}

function normalizeActionText(text) {
	if (text===undefined || text===null) return '';
	return String(text).trim();
}

function getInspectorExecutable(location, index) {
	const sel = visualEditor.selection;
	if (sel.length!==1) return null;
	const item = sel[0];
	if (location==='transition' && item.isTransition) return item.executables[index] || null;
	if (item.isState && location==='entry') return item.enterExecutables[index] || null;
	if (item.isState && location==='exit') return item.exitExecutables[index] || null;
	return null;
}

function findActionSchema(ns, name) {
	return actionSchema?.find(a => a.ns===ns && a.name===name) || null;
}

function normalizeAttrValue(attr, rawValue) {
	switch (attr.type) {
		case 'boolean':
			return (rawValue===true || rawValue==='true') ? 'true' : 'false';

		case 'int': {
			if (rawValue==='') return undefined;
			let n = Math.round(Number(rawValue));
			if (Number.isNaN(n)) return undefined;
			if (attr.max!==undefined && n > +attr.max) n = +attr.max;
			if (attr.min!==undefined && n < +attr.min) n = +attr.min;
			return String(n);
		}

		case 'float': {
			if (rawValue==='') return undefined;
			let n = Number(rawValue);
			if (Number.isNaN(n)) return undefined;
			if (attr.max!==undefined && n > +attr.max) n = +attr.max;
			if (attr.min!==undefined && n < +attr.min) n = +attr.min;
			return String(n);
		}

		case 'choice': {
			const legal = attr.values?.split(/,\s*/).filter(Boolean) || [];
			if (!legal.length) return undefined;
			return legal.includes(rawValue) ? rawValue : legal[0];
		}

		default:
			return rawValue;
	}
}

function routingWarnings(scxmlDoc, xmlString) {
	let searchIndex = 0;
	return scxmlDoc.transitions.flatMap(transition => {
		const attr = transition.getAttributeNodeNS(visualNS, 'pts');
		if (!attr) return [];

		const attrName = attr.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const matcher = new RegExp(`${attrName}\\s*=\\s*(["'])`, 'g');
		matcher.lastIndex = searchIndex;
		const match = matcher.exec(xmlString);
		const valueIndex = match ? matcher.lastIndex : 0;
		searchIndex = valueIndex + attr.value.length;
		const invalid = parseRoutingPoints(attr.value).invalid;
		if (!invalid.length) return [];

		const precedingText = xmlString.slice(0, valueIndex);
		return [{
			line: precedingText.split('\n').length,
			col: valueIndex - precedingText.lastIndexOf('\n'),
			severity: 'warning',
			msg: `Ignored malformed transition routing token${invalid.length===1 ? '' : 's'}: ${invalid.join(', ')}`
		}];
	});
}

function readActionSchema(scxmlDoc) {
	const schemaByKey = new Map();

	for (const action of parseActionSchemaDoc(parseXMLString(baseActionSchemaText))) {
		schemaByKey.set(`${action.ns}|${action.name}`, action);
	}

	for (const action of parseActionSchemaDoc(scxmlDoc)) {
		schemaByKey.set(`${action.ns}|${action.name}`, action);
	}

	return Array.from(schemaByKey.values());
}

function parseXMLString(str) {
	if (!str) return null;
	const xmldoc = (new DOMParser()).parseFromString(str, 'text/xml');
	return xmldoc.querySelector('parsererror') ? null : xmldoc;
}

function parseActionSchemaDoc(scxmlDoc) {
	const wrapper = scxmlDoc?.querySelector?.('actions');
	if (wrapper?.namespaceURI !== visualNS) return [];

	return Array.from(wrapper.children).map(el => {
		const action = {
			ns: el.namespaceURI,
			name: el.localName,
			tip: el.getAttributeNS(visualNS, 'tip') || '',
			cdata: el.getAttributeNS(visualNS, 'cdata') === 'true',
			cdataTip: el.getAttributeNS(visualNS, 'cdataTip') || '',
			attrs: Array.from(el.querySelectorAll('attribute'))
				.filter(a => a.namespaceURI===visualNS)
				.map(a => Object.fromEntries(Array.from(a.attributes).map(n => [n.name, n.value])))
		};
		action.attrs.forEach(a => {
			let defaultValue;
			switch (a.type) {
				case 'int':
					defaultValue = 0;
					if (a.max!==undefined && defaultValue > +a.max) defaultValue = +a.max;
					if (a.min!==undefined && defaultValue < +a.min) defaultValue = +a.min;
				break;
				case 'float':
					defaultValue = 0;
					if (a.max!==undefined && defaultValue > +a.max) defaultValue = +a.max;
					if (a.min!==undefined && defaultValue < +a.min) defaultValue = +a.min;
				break;
				case 'boolean':
					defaultValue = false;
				break;
				case 'choice':
					defaultValue = a.values?.split(/,\s*/)[0];
				break;
			}
			a.defaultValue = defaultValue;
		});
		return action;
	});
}

function changeAction(oldExec, actionNS, actionName) {
	const schema = actionSchema?.find(a => a.name===actionName && a.ns===actionNS);
	if (!schema) return console.error(`Cannot find custom action schema for ${actionName} in namespace ${actionNS}`);

	const oldValues = oldExec ? Object.fromEntries(oldExec.getAttributeNames().map(n => [n, oldExec.getAttribute(n)])) : {};
	const newValues = Object.fromEntries(schema.attrs.map(attr => {
		let value = oldValues[attr.name];
		switch (attr.type) {
			case 'int':
				if (value===undefined) value = attr.defaultValue;
				if (attr.max < value) value = attr.max;
				if (attr.min > value) value = attr.min;
			break;
			case 'choice': {
				const legal = attr.values?.split(/,\s*/);
				if (!legal.includes(value)) value = legal[0] || '';
				break;
			}
		}
		return [attr.name, value];
	}).filter(([,value]) => value!==undefined && value!==''));
	const cdata = schema.cdata ? normalizeActionText(oldExec.textContent || '') : null;
	oldExec.mutateInto(actionNS, actionName, newValues, cdata);
}

function notifyDocumentOfSelection(sel) {
	vscode.postMessage({
		command:'selectedItems',
		selection:sel.map(node => ({
			name: node.tagName,
			id: node.id,
			parentName: node.parentNode.tagName,
			parentId: node.parentNode.id,
			indexInParent: node.parentNode.transitions.indexOf(node),
			hasChildren: node.isState && node.isParent
		}))
	});
}

function notifyInspectorData(sel) {
	vscode.postMessage({
		command:'inspectorData',
		payload: {
			items: sel.map(serializeInspectorItem),
			stateIds: visualEditor.scxmlDoc?.ids || [],
			actionTypes: serializeActionTypes(actionSchema)
		}
	});
}

function serializeActionTypes(schemaList=[]) {
	return schemaList.map(s => ({
		ns: s.ns,
		name: s.name,
		tip: s.tip,
		cdata: !!s.cdata,
		cdataTip: s.cdataTip,
		attrs: s.attrs.map(a => ({
			name: a.name,
			type: a.type,
			min: a.min,
			max: a.max,
			step: a.step,
			values: a.values,
			tip: a.tip
		}))
	}));
}

function serializeInspectorItem(node) {
	const base = {
		type: node.isTransition ? 'transition' : 'state',
		tagName: node.tagName,
		id: node.id || '',
		parentId: node.parentNode?.id || ''
	};

	if (node.isTransition) {
		return {
			...base,
			sourceId: node.sourceId,
			targetId: node.targetId,
			isInternal: !!node.isInternal,
			event: node.event || '',
			condition: node.condition || '',
			radius: node.radius,
			align: node.align || '',
			labelMainOffset: node.labelMainOffset,
			labelCrossOffset: node.labelCrossOffset,
			sourceAnchorSide: node.sourceAnchorSide || '',
			sourceAnchorOffset: node.sourceAnchorOffset,
			targetAnchorSide: node.targetAnchorSide || '',
			targetAnchorOffset: node.targetAnchorOffset,
			executables: node.executables.map(serializeExecutable)
		};
	}

	return {
		...base,
		rgbhex: node.rgbhex || '',
		w: node.w,
		h: node.h,
		enterExecutables: node.enterExecutables.map(serializeExecutable),
		exitExecutables: node.exitExecutables.map(serializeExecutable)
	};
}

function serializeExecutable(ex) {
	return {
		namespaceURI: ex.namespaceURI,
		localName: ex.localName,
		attrs: Object.fromEntries(Array.from(ex.attributes).map(a => [a.name, a.value])),
		textContent: normalizeActionText(ex.textContent || '')
	};
}

function addNewAction(location) {
	const firstAction = actionSchema?.[0];
	if (!firstAction) return;
	const attrs = Object.fromEntries(firstAction.attrs
		.map(attr => [attr.name, attr.defaultValue])
		.filter(([,value]) => value!==undefined && value!==''));
	let anyAdded = false;
	visualEditor.selection.forEach(o => {
		switch (location) {
			case 'entry':
			case 'exit':
				if (o.isState) {
					o.addExecutable(location==='exit', firstAction.ns, firstAction.name, attrs);
					anyAdded = true;
				}
			break;
			case 'transition':
				if (o.isTransition) {
					o.addExecutable(firstAction.ns, firstAction.name, attrs);
					anyAdded = true;
				}
			break;
		}
	});
	if (anyAdded) notifyInspectorData(visualEditor.selection);
}
