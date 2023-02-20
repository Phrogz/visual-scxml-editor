/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable curly */
'use strict';

import { loadFromString as loadSCXML } from 'scxmlDOM';
import SCXMLEditor from 'scxmlEditor';
import neatXML from 'neatXML';

const visualNS  = 'http://phrogz.net/visual-scxml';
const vscode = acquireVsCodeApi();
const visualEditor = new SCXMLEditor(document.querySelector('svg'));
inspector.addEventListener('mousedown', evt => evt.stopPropagation(), false);
visualEditor.onSelectionChanged = (sel) => {
	notifyDocumentOfSelection(sel);
	updateInspectorForSelection(sel);
};

// Inspector inputs
watchInput(insParent, 'parentId');
watchInput(insId, 'id');
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

insAddEntry.addEventListener('click', _ => addNewAction('entry'));
insAddExit.addEventListener('click', _ => addNewAction('exit'));
insAddTransitionExecutable.addEventListener('click', _ => addNewAction('transition'));

let actionSchema;

function loadXML(xmlString) {
	const scxmlDocOrErrors = loadSCXML(xmlString);
	if (Array.isArray(scxmlDocOrErrors)) {
		vscode.postMessage({ command:'SCXMLParseErrors', errors:scxmlDocOrErrors });
	} else {
		if (visualEditor.scxmlDoc) visualEditor.scxmlDoc.removeEventListener('changed', handleDocumentChanged, false);
		visualEditor.useSCXML(scxmlDocOrErrors);
		visualEditor.scxmlDoc.addEventListener('changed', handleDocumentChanged, false);
		actionSchema = readActionSchema(scxmlDocOrErrors);
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
	return visualEditor.scxmlDoc && neatXML(visualEditor.scxmlDoc, {strip:true, indent:'\t', sort:true, cdata:true, tightcdata:true});
}

window.addEventListener('message', event => {
	const message = event.data;
	switch (message.command) {
		case 'document':
			loadXML(message.document);
		break;
	}
});

function setOptions(sel, values, selectedValue) {
	sel.options.length = 0;
	for (const val of values) sel.appendChild(new Option(val));
	if (selectedValue) sel.value = selectedValue;
}

function watchInput(input, propertyName) {
	input.addEventListener('input', evt => {
		visualEditor.selection.forEach(o => {
			if (propertyName in o) {
				o[propertyName] = (input.value==='(none)' || input.value==='(auto)') ? '' : input.value;
			}
		});
		// TODO: is this needed, or already covered by mutation observer?
		if (visualEditor.scxmlDoc) visualEditor.scxmlDoc.dispatchEvent(new CustomEvent('changed'));
	}, false);
	// Prevent typing 'e' from getting eaten by the editor's body keydown handler
	input.addEventListener('keydown', evt => evt.stopPropagation(), false);
}

function readActionSchema(scxmlDoc) {
	const wrapper = scxmlDoc.querySelector('actions');
	if (wrapper?.namespaceURI === visualNS) {
		return Array.from(wrapper.children).map(el => {
			const action = {
				ns:    el.namespaceURI,
				name:  el.localName,
				attrs: Array.from(el.querySelectorAll('attribute'))
				            .filter(a => a.namespaceURI === visualNS)
				            .map(a => Object.fromEntries(Array.from(a.attributes)
				                                              .map(n => [n.name, n.value])))
			};
			action.attrs.forEach(a => {
				let defaultValue;
				switch (a.type) {
					case 'int':
						defaultValue = 0;
						if (defaultValue < a.max) defaultValue = a.max;
						if (defaultValue > a.min) defaultValue = a.min;
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
}

function updateInspectorForSelection(sel) {
	inspector.style.display = sel.length ? 'table' : 'none';
	if (sel.length) {
		const multipleSelected = sel.length>1;
		const states=[], transitions=[];
		for (const o of sel) {
			(o.tagName==='transition' ? transitions : states).push(o);
		}

		const stateIds = visualEditor.scxmlDoc.ids.sort();
		const sourceIds = ['(scxml)', ...stateIds];
		const targetIds = ['(none)', ...stateIds];
		if (multipleSelected) {
			sourceIds.unshift('-');
			targetIds.unshift('-');
		}

		stateProperties.style.display = states.length ? '' : 'none';
		if (states.length) {
			insId.readOnly = multipleSelected;
			entryExecutables.tBodies[0]?.replaceWith(document.createElement('tbody'));
			exitExecutables.tBodies[0]?.replaceWith(document.createElement('tbody'));
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
				showActions(entryExecutables, sel.enterExecutables);
				showActions(exitExecutables,  sel.exitExecutables);
				insWidth.value = sel.w;
				insHeight.value = sel.h;
			}
		}

		transProperties.style.display = transitions.length ? '' : 'none';
		if (transitions.length) {
			transitionExecutables.tBodies[0]?.replaceWith(document.createElement('tbody'));
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
				insTargetAnchorSide.value = sel.targetAnchorSide || '';
				insTargetAnchorOffset.value = sel.targetAnchorOffset || '';
				showActions(transitionExecutables, sel.executables);

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

	function showActions(table, executables) {
		const tbody = table.tBodies[0] || table.appendChild(document.createElement('tbody'));
		executables.forEach(ex => {
			const schema = actionSchema?.find(a => a.name===ex.localName && a.ns===ex.namespaceURI);
			const tr = addEl('tr', tbody);
			let td = addEl('td', tr);
			if (schema) {
				// we know how to edit this action
				const sel = addEl('select', td);
				populateType(sel, ex);
				sel.addEventListener('input', _ => setupAction(sel.value, sel.options[sel.selectedIndex].text, ex.parentNode, ex), false);

				td = addEl('td', tr);
				populateAttributes(td, schema, ex);
			} else {
				// show a read-only, delete-only version
				td.innerText = ex.localName;
				td = tr.appendChild(document.createElement('td'));
				td.innerText = Array.from(ex.attributes)
				                    .map(a => [a.localName, a.value].join('='))
									.join(' ');
			}
			td = tr.appendChild(document.createElement('td'));
			const del = td.appendChild(document.createElement('button'));
			del.className = 'deleteAction';
			del.innerText = '×';
			del.title = 'remove action';
			// TODO: the following should use ex.delete() to clean up empty onentry/onexit, but some executable elements are not getting wrapped properly
			del.addEventListener('click', _ => ex.remove(), false);
		});

		function populateType(sel, el=null) {
			actionSchema.forEach(ca => {
				const opt = sel.appendChild(new Option(ca.name, ca.ns));
				opt.selected = el?.namespaceURI===ca.ns && el?.localName===ca.name;
			});
		}

		function populateAttributes(td, schema, executable) {
			td.innerHTML = '';
			schema.attrs.forEach(attr => {
				const label = addEl('label', td, {_text:`${attr.name} `});
				switch (attr.type) {
					case 'int':
						var inp = addEl('input', label, {
							type:  'number',
							name:  attr.name,
							min:   attr.min,
							max:   attr.max,
							value: executable.getAttribute(attr.name)
						});
					break;
					case 'choice':
						var inp = addEl('select', label, {name:attr.name});
						attr.values.split(/,\s*/).forEach(v => {
							const opt = inp.appendChild(new Option(v));
							opt.selected = executable.getAttribute(attr.name)===v;
						});
					break;
				}
				inp.addEventListener('change', _ => executable.setAttribute(attr.name, inp.value), false);
			});
		}
	}
}

function setupAction(actionNS, actionName, wrapper, oldExec) {
	const schema = actionSchema?.find(a => a.name===actionName && a.ns===actionNS);
	if (!schema) return console.error(`Cannot find custom action schema for ${actionName} in namespace ${actionNS}`);

	const previousValues = oldExec ? Object.fromEntries(oldExec.getAttributeNames().map(n => [n, oldExec.getAttribute(n)])) : {};
	const newExec = wrapper.ownerDocument.createElementNS(actionNS, actionName);
	schema.attrs.forEach(attr => {
		let value = previousValues[attr.name];
		switch (attr.type) {
			case 'int':
				value ||= attr.defaultValue;
				if (attr.max < value) value = attr.max;
				if (attr.min > value) value = attr.min;
			break;
			case 'choice':
				const legal = attr.values?.split(/,\s*/);
				if (!legal.includes(value)) value = legal[0] || '';
			break;
		}
		newExec.setAttribute(attr.name, value);
	});
	if (oldExec) oldExec.replaceWith(newExec);
	else wrapper.appendChild(newExec);
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

function addEl(name, parent, opts={}) {
    const el = parent.appendChild(document.createElement(name));
    for (const k of Object.keys(opts)){
        switch(k){
            case '_text':
                el.appendChild(document.createTextNode(opts[k]));
            break;

            default:
                el.setAttribute(k, opts[k]);
        }
    }
    return el;
}

function addNewAction(location) {
	const firstAction = actionSchema?.[0];
	if (!firstAction) return;
	const attrs = Object.fromEntries(firstAction.attrs.map(attr => [attr.name, attr.defaultValue]))
	visualEditor.selection.forEach(o => {
		switch (location) {
			case 'entry':
			case 'exit':
				if (o.isState) {
					o.addExecutable(location==='exit', firstAction.ns, firstAction.name, attrs);
				}
			break;
			case 'transition':
				if (o.isTransition) {
					o.addExecutable(firstAction.ns, firstAction.name, attrs);
				}
			break;
		}
	});
}

window.ed = visualEditor;
