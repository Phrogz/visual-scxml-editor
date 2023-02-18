/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable curly */
'use strict';

console.log('glue up');

import { loadFromString as loadSCXML } from 'scxmlDOM';
import SCXMLEditor from 'scxmlEditor';
import neatXML from 'neatXML';
console.log({loadSCXML, SCXMLEditor, neatXML});

const vscode = acquireVsCodeApi();
const editor = new SCXMLEditor(document.querySelector('svg'));
inspector.addEventListener('mousedown', evt => evt.stopPropagation(), false);
editor.onSelectionChanged = (sel) => {
	notifyDocumentOfSelection(sel);
	inspector.style.display = sel.length ? 'table' : 'none';
	if (sel.length) {
		const multipleSelected = sel.length>1;
		const states=[], transitions=[];
		for (const o of sel) {
			(o.tagName==='transition' ? transitions : states).push(o);
		}
		stateProperties.style.display = states.length ? '' : 'none';
		transProperties.style.display = transitions.length ? '' : 'none';

		const stateIds = editor.scxmlDoc.ids.sort();
		const sourceIds = ['(scxml)', ...stateIds];
		const targetIds = ['(none)', ...stateIds];
		if (multipleSelected) {
			sourceIds.unshift('-');
			targetIds.unshift('-');
		}
		if (states.length) {
			insId.readOnly = multipleSelected;
			if (multipleSelected) {
				setOptions(insParent, sourceIds, getCommonValue(states, 'parentId'));
				insId.value = '-';
				let commonKind = getCommonValue(states, 'tagName');
				if (commonKind==='history') {
					const allDeep = getCommonValue(states, 'deep');
					commonKind = allDeep ? 'deep history' : allDeep===false ? 'shallow history' : '-';
				}
				insKindState.value = commonKind;
				insColor.value = getCommonValue(states, 'rgbhex') || '#000000';
				insEnterScript.value = getCommonValue(states, 'enterScriptCode') || '';
				insExitScript.value = getCommonValue(states, 'exitScriptCode') || '';
				insWidth.value = getCommonValue(states, 'w');
				insHeight.value = getCommonValue(states, 'h');
			} else {
				sel = sel[0];
				setOptions(insParent, sourceIds, sel.parent.id);
				insId.value = sel.id;
				insKindState.value = sel.tagName!=='history' ? sel.tagName : sel.isDeep ? 'deep history' : 'shallow history';
				insColor.value = sel.rgbhex || '#808080';
				insEnterScript.value = sel.enterScriptCode;
				insExitScript.value = sel.exitScriptCode;
				insWidth.value = sel.w;
				insHeight.value = sel.h;
			}
		}

		if (transitions.length) {
			if (multipleSelected) {
				setOptions(insSource, sourceIds, getCommonValue(transitions, 'sourceId'));
				setOptions(insTarget, targetIds, getCommonValue(transitions, 'targetId'));
				insRadius.value = getCommonValue(transitions, 'radius');
				insLabelAlign.value = getCommonValue(transitions, 'align');
				insLabelOffset.value = getCommonValue(transitions, 'labelMainOffset');
				insLabelCrossOffset.value = getCommonValue(transitions, 'labelCrossOffset');

				insEvent.value = getCommonValue(transitions, 'event');
				insCondition.value = getCommonValue(transitions, 'condition');

				insSourceAnchorSide.value   = getCommonValue(transitions, 'sourceAnchorSide');
				insSourceAnchorOffset.value = getCommonValue(transitions, 'sourceAnchorOffset');
				insTargetAnchorSide.value   = getCommonValue(transitions, 'targetAnchorSide');
				insTargetAnchorOffset.value = getCommonValue(transitions, 'targetAnchorOffset');
			} else {
				sel = sel[0];
				setOptions(insSource, sourceIds, sel.sourceId);
				insSourceAnchorSide.value = sel.sourceAnchorSide;
				insSourceAnchorOffset.value = sel.sourceAnchorOffset;

				insEvent.value = sel.event;
				insCondition.value = sel.condition;

				setOptions(insTarget, targetIds, sel.targetId);
				insTargetAnchorSide.value = sel.targetAnchorSide;
				insTargetAnchorOffset.value = sel.targetAnchorOffset;

				insRadius.value = sel.radius;
				insLabelAlign.value = sel.align;
				insLabelOffset.value = sel.labelMainOffset;
				insLabelCrossOffset.value = sel.labelCrossOffset;
			}
		}
	}

	function getCommonValue(collection, fieldName) {
		let value;
		for (const o of collection) {
			const v = o[fieldName];
			if (value===undefined) value = v;
			else if (v!==value) return;
		}
		return value;
	}

	function notifyDocumentOfSelection(sel) {
		vscode.postMessage({
			command:'selectedItems',
			selection:sel.map(node => ({
				name          : node.tagName,
				id            : node.id,
				parentName    : node.parentNode.tagName,
				parentId      : node.parentNode.id,
				indexInParent : node.parentNode.transitions.indexOf(node)
			}))
		});
	}
};

watchInput(insParent, 'parentId');
watchInput(insId, 'id');
watchInput(insEnterScript, 'enterScriptCode');
watchInput(insExitScript, 'exitScriptCode');
watchInput(insColor, 'rgbhex');
watchInput(insWidth, 'w');
watchInput(insHeight, 'h');

watchInput(insSource, 'sourceId');
watchInput(insSourceAnchorSide, 'sourceAnchorSide');
watchInput(insSourceAnchorOffset, 'sourceAnchorOffset');

watchInput(insEvent, 'event');
watchInput(insCondition, 'condition');

watchInput(insTarget, 'targetId');
watchInput(insTargetAnchorSide, 'targetAnchorSide');
watchInput(insTargetAnchorOffset, 'targetAnchorOffset');

watchInput(insRadius, 'radius');
watchInput(insLabelAlign, 'align');
watchInput(insLabelOffset, 'labelMainOffset');
watchInput(insLabelCrossOffset, 'labelCrossOffset');

function loadXML(xmlString) {
	const scxmlDocOrErrors = loadSCXML(xmlString);
	if (Array.isArray(scxmlDocOrErrors)) {
		vscode.postMessage({ command:'SCXMLParseErrors', errors:scxmlDocOrErrors });
	} else {
		if (editor.scxmlDoc) editor.scxmlDoc.removeEventListener('changed', handleDocumentChanged, false);
		editor.useSCXML(scxmlDocOrErrors);
		editor.scxmlDoc.addEventListener('changed', handleDocumentChanged, false);
		return true;
	}
}

// Wait a short time before updating the document once only, so that quick changes (e.g. dragging) do not keep dirtying the document until done
let handleChangeTimer, changeDelayMS = 250;
function handleDocumentChanged() {
	// This does not error if the timer has never been set
	clearTimeout(handleChangeTimer);
	handleChangeTimer = setTimeout(() => {
		vscode.postMessage({ command:'replaceDocument', xml:serialize() });
	}, changeDelayMS);
}

function serialize() {
	// Uses custom XML serializer to work around
	// https://bugs.chromium.org/p/chromium/issues/detail?id=906807
	return editor.scxmlDoc && neatXML(editor.scxmlDoc, {strip:true, indent:'\t', sort:true, cdata:true, tightcdata:true});
}

window.addEventListener('message', event => {
	const message = event.data;
	switch (message.command) {
		case 'document':
			loadXML(message.document);
		break;
	}
});

const sheetByTitle = {};
const rulesBySheetAndSelector = new Map;
function getStyle(sheetTitle, selectorText) { let sheet = sheetByTitle[sheetTitle];
	if (!sheet) {
		for (const s of document.styleSheets) {
			if (s.title === sheetTitle) {
				sheet = sheetByTitle[sheetTitle] = s;
				break;
			}
		}
	}

	if (sheet) {
		let rulesBySelector = rulesBySheetAndSelector.get(sheet);
		if (!rulesBySelector) {
			rulesBySheetAndSelector.set(sheet, rulesBySelector={});
		}

		let rule = ruleBySelector[selectorText];
		if (!rule) {
			for (const r of sheet.cssRules) {
				if (r.selectorText===selectorText) {
					rule = ruleBySelector[selectorText] = r;
					break;
				}
			}
		}
		return rule;
	}
}

function setOptions(sel, values, selectedValue) {
	sel.options.length = 0;
	for (const val of values) sel.appendChild(new Option(val));
	if (selectedValue) sel.value = selectedValue;
}

function watchInput(input, propertyName) {
	input.addEventListener('input', evt => {
		editor.selection.forEach(o => {
			if (propertyName in o) {
				o[propertyName] = (input.value==='(none)' || input.value==='(auto)') ? '' : input.value;
			}
		});
		if (editor.scxmlDoc) editor.scxmlDoc.dispatchEvent(new CustomEvent('changed'));
	}, false);
	// Prevent typing 'e' from getting eaten by the editor's body keydown handler
	input.addEventListener('keydown', evt => evt.stopPropagation(), false);
}

window.ed = editor;
