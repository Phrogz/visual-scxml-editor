/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable curly */
'use strict';

import { loadFromString as loadSCXML } from 'scxmlDOM';
import VisualEditor from 'visualEditor';
import neatXML from 'neatXML';

const NS = 'http://www.w3.org/2005/07/scxml';
const visualNS  = 'http://phrogz.net/visual-scxml';
const vscode = acquireVsCodeApi();
const visualEditor = new VisualEditor(document.querySelector('svg'));
inspector.addEventListener('mousedown', evt => evt.stopPropagation(), false);
visualEditor.onSelectionChanged = (sel) => {
	console.info('scxmleditor.js is notified that the visual selection changed');
	notifyDocumentOfSelection(sel);
	updateInspectorForSelection(sel);
};
visualEditor.onUndo = () => vscode.postMessage({command:'undo'});

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

// Wait a short time before updating the document once only, so that quick changes (e.g. dragging) do not keep dirtying the document until done
const serializationOptions = {strip:true, indent:'\t', sort:true, cdata:true, tightcdata:true};
let handleChangeTimer, changeDelayMS = 250;
function onSCXMLDocChanged() {
	// This does not error if the timer has never been set
	clearTimeout(handleChangeTimer);
	handleChangeTimer = setTimeout(sendXMLToTextEditor, changeDelayMS);
}

function sendXMLToTextEditor() {
	if (visualEditor.scxmlDoc) {
		const xml = neatXML(visualEditor.scxmlDoc, serializationOptions);
		vscode.postMessage({command:'replaceDocument', xml});
	}
}

window.addEventListener('message', event => {
	const message = event.data;
	console.info(`scxmleditor.js received message '${message.command}'`);
	switch (message.command) {
		case 'updateFromText':
			const xmlString = message.document;
			const scxmlDocOrErrors = loadSCXML(xmlString);
			if (Array.isArray(scxmlDocOrErrors)) {
				vscode.postMessage({ command:'SCXMLParseErrors', errors:scxmlDocOrErrors });
			} else {
				if (visualEditor.scxmlDoc) visualEditor.scxmlDoc.removeEventListener('changed', onSCXMLDocChanged, false);
				visualEditor.useSCXML(scxmlDocOrErrors);
				visualEditor.scxmlDoc.addEventListener('changed', onSCXMLDocChanged, false);
				actionSchema = readActionSchema(scxmlDocOrErrors);
				return true;
			}
		break;
		case 'createState':
			if (visualEditor.scxmlDoc) {
				const parentElements = visualEditor.selection?.filter(el => el.canHaveChildStates);
				if (!parentElements.length) parentElements.push(visualEditor.scxmlDoc.root);
				const newElements = parentElements.map(parent => parent.addChild());
				visualEditor.setSelection(newElements);
			} else {
				// TODO: show this to user?
				console.error("Visual editor does not have a valid SCXML Doc to create a state in");
			}
		break;

		case 'fitChildren':
			const parents = visualEditor.selection.filter(el => el.isState && el.isParent);
			for (const el of parents) el.expandToFitChildren();
		break;

		case 'zoomToExtents':
		case 'zoomTo100':
		case 'toggleEventDisplay':
		case 'deleteSelectionOnly':
		case 'deleteSelectionAndMore':
			visualEditor[message.command]();
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
					case 'float':
						defaultValue = 0;
						if (defaultValue < a.max) defaultValue = a.max;
						if (defaultValue > a.min) defaultValue = a.min;
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
		}).concat([
			{ns:NS, name:'assign', attrs:[{name:'location', type:'string'},{name:'expr', type:'string'}]},
			{ns:NS, name:'raise', attrs:[{name:'event', type:'string'}]},
			{ns:NS, name:'log', attrs:[{name:'label', type:'string'}, {name:'expr', type:'string'}]},
		]);
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
		const tbody = table.tBodies[0] || addEl('tbody', table);
		executables.forEach(ex => {
			const schema = actionSchema?.find(a => a.name===ex.localName && a.ns===ex.namespaceURI);
			const tr = addEl('tr', tbody);
			let td = addEl('td', tr);
			if (schema) {
				// we know how to edit this action
				const sel = addEl('select', td);
				populateType(sel, ex);
				sel.addEventListener('input', _ => changeAction(ex, sel.value, sel.options[sel.selectedIndex].text));

				td = addEl('td', tr);
				populateAttributes(td, schema, ex);
			} else {
				// show a read-only, delete-only version
				td.innerText = ex.localName;
				td = addEl('td', tr, {_text: Array.from(ex.attributes)
				                                  .map(a => [a.localName, `"${a.value}"`].join('='))
				                                  .join(' ')});
			}
			td = addEl('td', tr, {'class':'button'});
			const del = addEl('button', td, {
				'class': 'deleteAction',
				_text:   '×',
				title:   'remove action'
			});
			del.addEventListener('click', _ => ex.delete());
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
				const val = executable.getAttribute(attr.name);
				switch (attr.type) {
					case 'int':
						var inp = addEl('input', label, {
							type:  'number',
							name:  attr.name,
							min:   attr.min,
							max:   attr.max,
							value: val
						});
						inp.addEventListener('keydown', evt => evt.stopPropagation(), false);
					break;
					case 'float':
						var inp = addEl('input', label, {
							type:  'number',
							name:  attr.name,
							min:   attr.min,
							max:   attr.max,
							step:  attr.step || 'any',
							value: val
						});
						inp.addEventListener('keydown', evt => evt.stopPropagation(), false);
					break;
					case 'boolean':
						var inp = addEl('input', label, {
							type:  'checkbox',
							name:  attr.name,
							value: 'true',
							checked: val==='true'
						});
					break;
					case 'choice':
						var inp = addEl('select', label, {name:attr.name});
						attr.values.split(/,\s*/).forEach(v => {
							const opt = inp.appendChild(new Option(v));
							opt.selected = val===v;
						});
					break;
					case 'string':
						var inp = addEl('input', label, {type:'text', name:attr.name, value:val || ""});
						inp.addEventListener('keydown', evt => evt.stopPropagation(), false);
					break;
				}
				inp.addEventListener('change', _ => executable.setAttribute(attr.name, inp.type==='checkbox' ? inp.checked : inp.value));
			});
		}
	}
}

function changeAction(oldExec, actionNS, actionName) {
	const schema = actionSchema?.find(a => a.name===actionName && a.ns===actionNS);
	if (!schema) return console.error(`Cannot find custom action schema for ${actionName} in namespace ${actionNS}`);

	const oldValues = oldExec ? Object.fromEntries(oldExec.getAttributeNames().map(n => [n, oldExec.getAttribute(n)])) : {};
	const newValues = Object.fromEntries(schema.attrs.map(attr => {
		let value = oldValues[attr.name];
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
			case 'string':
				value ||= '';
			break;
		}
		return [attr.name, value];
	}));
	oldExec.mutateInto(actionNS, actionName, newValues);
}

function notifyDocumentOfSelection(sel) {
	vscode.postMessage({
		command:'selectedItems',
		selection:sel.map(node => ({
			name          : node.tagName,
			id            : node.id,
			parentName    : node.parentNode.tagName,
			parentId      : node.parentNode.id,
			indexInParent : node.parentNode.transitions.indexOf(node),
			hasChildren   : node.isState && node.isParent
		}))
	});
}

function addEl(name, parent, opts={}) {
    const el = parent.appendChild(document.createElement(name));
    for (const k of Object.keys(opts)){
		const val = opts[k];
		if (val!==undefined) {
			switch(k){
				case '_text':
					el.appendChild(document.createTextNode(val));
				break;

				default:
					el.setAttribute(k, val);
			}
		}
    }
    return el;
}

function addNewAction(location) {
	const firstAction = actionSchema?.[0];
	if (!firstAction) return;
	const attrs = Object.fromEntries(firstAction.attrs.map(attr => [attr.name, attr.defaultValue]));
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
