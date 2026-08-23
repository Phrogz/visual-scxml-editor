'use strict';

const vscode = acquireVsCodeApi();

const scxmlFileSelect = document.getElementById('scxmlFileSelect');
const openScxmlFileButton = document.getElementById('openScxmlFileButton');
const selectionSummary = document.getElementById('selectionSummary');
const editSection = document.getElementById('editSection');
const editHint = document.getElementById('editHint');
const stateKindRow = document.getElementById('stateKindRow');
const editStateKind = document.getElementById('editStateKind');
const idRow = document.getElementById('idRow');
const editId = document.getElementById('editId');
const editParentId = document.getElementById('editParentId');
const editColor = document.getElementById('editColor');
const clearColorButton = document.getElementById('clearColorButton');
const editWidth = document.getElementById('editWidth');
const editHeight = document.getElementById('editHeight');
const editSourceId = document.getElementById('editSourceId');
const editSourceAnchorSide = document.getElementById('editSourceAnchorSide');
const editSourceAnchorOffset = document.getElementById('editSourceAnchorOffset');
const editTransitionKind = document.getElementById('editTransitionKind');
const editEvent = document.getElementById('editEvent');
const editLabelAlign = document.getElementById('editLabelAlign');
const editLabelOffset = document.getElementById('editLabelOffset');
const editLabelCrossOffset = document.getElementById('editLabelCrossOffset');
const editCondition = document.getElementById('editCondition');
const editTargetId = document.getElementById('editTargetId');
const editTargetAnchorSide = document.getElementById('editTargetAnchorSide');
const editTargetAnchorOffset = document.getElementById('editTargetAnchorOffset');
const editRadius = document.getElementById('editRadius');
const stateParentRow = document.getElementById('stateParentRow');
const stateEntryRow = document.getElementById('stateEntryRow');
const stateEntryActionsRow = document.getElementById('stateEntryActionsRow');
const stateExitRow = document.getElementById('stateExitRow');
const stateExitActionsRow = document.getElementById('stateExitActionsRow');
const stateColorRow = document.getElementById('stateColorRow');
const stateDimensionsRow = document.getElementById('stateDimensionsRow');
const transSourceRow = document.getElementById('transSourceRow');
const transSourceAnchorRow = document.getElementById('transSourceAnchorRow');
const transKindRow = document.getElementById('transKindRow');
const transEventRow = document.getElementById('transEventRow');
const transPlacementRow = document.getElementById('transPlacementRow');
const transCondRow = document.getElementById('transCondRow');
const transTargetRow = document.getElementById('transTargetRow');
const transTargetAnchorRow = document.getElementById('transTargetAnchorRow');
const transActionsRow = document.getElementById('transActionsRow');
const transitionActionsRow = document.getElementById('transitionActionsRow');
const transRadiusRow = document.getElementById('transRadiusRow');
const entryActions = document.getElementById('entryActions');
const exitActions = document.getElementById('exitActions');
const transitionActions = document.getElementById('transitionActions');
const addEntryAction = document.getElementById('addEntryAction');
const addExitAction = document.getElementById('addExitAction');
const addTransitionAction = document.getElementById('addTransitionAction');
let activeDiagramUri = null;

const staticFieldTooltips = new Map([
	[scxmlFileSelect, 'Choose which SCXML file this inspector controls.'],
	[openScxmlFileButton, 'Open the selected SCXML in the visual diagram editor.'],
	[editStateKind, 'State type. Toggle between state and parallel when allowed.'],
	[editId, 'Identifier for the selected item. Example: cooking'],
	[editParentId, 'Parent state for this state. Use (scxml) for top-level.'],
	[addEntryAction, 'Add an action that runs when entering this state.'],
	[addExitAction, 'Add an action that runs when exiting this state.'],
	[editColor, 'Custom state color. Example: choose a color used by related states.'],
	[clearColorButton, 'Remove custom color and use the default theme color.'],
	[editWidth, 'State width in pixels. Example: 160'],
	[editHeight, 'State height in pixels. Example: 80'],
	[editTransitionKind, 'External exits/re-enters target; internal stays within source.'],
	[editSourceId, 'Transition source state id.'],
	[editSourceAnchorSide, 'Preferred side where the transition leaves the source state.'],
	[editSourceAnchorOffset, 'Source-anchor offset in pixels. Example: 20'],
	[editEvent, 'Space-separated event names. Example: turn_on timer'],
	[editLabelAlign, 'Preferred position for the transition label.'],
	[editLabelOffset, 'Label shift along the transition in pixels. Example: 20'],
	[editLabelCrossOffset, 'Label shift perpendicular to the transition in pixels. Example: -10'],
	[editCondition, 'Guard condition expression. Example: timer >= cook_time'],
	[editTargetId, 'Transition target state id. Use (none) for no target.'],
	[editTargetAnchorSide, 'Preferred side where the transition enters the target state.'],
	[editTargetAnchorOffset, 'Target-anchor offset in pixels. Example: 10'],
	[addTransitionAction, 'Add an action that runs when this transition fires.'],
	[editRadius, 'Corner radius for routed transition bends, in pixels. Example: 20']
]);

window.addEventListener('message', event => {
	const message = event.data;
	switch (message.command) {
		case 'clearSelection':
			selectionSummary.textContent = '';
			selectionSummary.hidden = true;
			editSection.hidden = true;
		break;

		case 'updateScxmlFiles':
			renderScxmlFileList(message.files || [], message.activeUri || null, message.diagramActiveUri || null);
		break;

		case 'updateSelection':
			renderSelection(message.payload);
		break;
	}
});

sendInspectorCommand('requestScxmlFiles', {});
initializeFieldTooltips();

function initializeFieldTooltips() {
	for (const [element, tooltip] of staticFieldTooltips) {
		if (!element) {
			continue;
		}
		applyTooltip(element, tooltip);
	}
}

function applyTooltip(element, tooltip) {
	if (!element || !tooltip) {
		return;
	}

	element.title = tooltip;
	const label = element.closest('label');
	if (label) {
		label.title = tooltip;
		const caption = label.querySelector(':scope > span');
		if (caption) {
			caption.title = tooltip;
		}
	}
}

function renderSelection(payload) {
	setActiveScxmlFile(payload.documentUri || null);
	const detailedItems = payload.inspectorData?.items || [];
	const items = detailedItems.length ? detailedItems : (payload.selectedItems || []);
	const count = items.length;
	if (!count) {
		selectionSummary.textContent = '';
		selectionSummary.hidden = true;
		editSection.hidden = true;
		return;
	}
	if (count >= 2) {
		selectionSummary.textContent = multiSelectionSummary(items);
		selectionSummary.hidden = false;
	} else {
		selectionSummary.textContent = '';
		selectionSummary.hidden = true;
	}

	renderEditor(payload, detailedItems);
}

function multiSelectionSummary(items) {
	let stateCount = 0;
	let transitionCount = 0;

	for (const item of items) {
		if (isTransitionSelectionItem(item)) {
			transitionCount += 1;
		} else if (isStateSelectionItem(item)) {
			stateCount += 1;
		}
	}

	if (stateCount && !transitionCount) {
		return `${stateCount} state${stateCount===1 ? '' : 's'} selected`;
	}

	if (transitionCount && !stateCount) {
		return `${transitionCount} transition${transitionCount===1 ? '' : 's'} selected`;
	}

	if (stateCount && transitionCount) {
		return `${stateCount} state${stateCount===1 ? '' : 's'}, ${transitionCount} transition${transitionCount===1 ? '' : 's'} selected`;
	}

	return `${stateCount} states, ${transitionCount} transitions selected`;
}

function isTransitionSelectionItem(item) {
	const kind = String(item?.tagName || item?.name || '').toLowerCase();
	return item?.type==='transition' || kind==='transition';
}

function isStateSelectionItem(item) {
	const kind = String(item?.tagName || item?.name || '').toLowerCase();
	if (item?.type==='state') {
		return true;
	}

	return kind==='state' || kind==='parallel' || kind==='history' || kind==='final';
}

function renderScxmlFileList(files, activeUri, diagramActiveUri) {
	const previousValue = scxmlFileSelect.value;
	activeDiagramUri = diagramActiveUri;
	scxmlFileSelect.innerHTML = '';

	if (!files.length) {
		const opt = document.createElement('option');
		opt.value = '';
		opt.textContent = '(no .scxml files found)';
		scxmlFileSelect.appendChild(opt);
		scxmlFileSelect.disabled = true;
		updateOpenDiagramButtonState();
		return;
	}

	for (const file of files) {
		const opt = document.createElement('option');
		opt.value = file.uri;
		opt.textContent = file.label;
		scxmlFileSelect.appendChild(opt);
	}

	scxmlFileSelect.disabled = false;
	setActiveScxmlFile(activeUri || previousValue || null);
	updateOpenDiagramButtonState();
}

function setActiveScxmlFile(uri) {
	if (!uri) {
		updateOpenDiagramButtonState();
		return;
	}
	const option = [...scxmlFileSelect.options].find(opt => opt.value===uri);
	if (option) {
		scxmlFileSelect.value = uri;
	}
	updateOpenDiagramButtonState();
}

function updateOpenDiagramButtonState() {
	const hasSelection = !!scxmlFileSelect.value;
	const alreadyFocusedDiagram = hasSelection && !!activeDiagramUri && scxmlFileSelect.value===activeDiagramUri;
	openScxmlFileButton.disabled = !hasSelection || alreadyFocusedDiagram;
}

function renderEditor(payload, items) {
	if (!items || items.length!==1) {
		if (!items || !items.length) {
			editSection.hidden = true;
			return;
		}
	}

	const single = items.length===1;
	const allStates = items.every(i => i.type==='state');
	const allTransitions = items.every(i => i.type==='transition');
	const item = items[0];
	editSection.hidden = false;
	editHint.hidden = true;
	if (!single && !(allStates || allTransitions)) {
		editHint.hidden = false;
		editHint.textContent = 'Mixed state/transition selection. Use the canvas inspector for mixed-type bulk edits.';
		stateKindRow.hidden = true;
		idRow.hidden = true;
		stateParentRow.hidden = true;
		stateEntryRow.hidden = true;
		stateEntryActionsRow.hidden = true;
		stateExitRow.hidden = true;
		stateExitActionsRow.hidden = true;
		stateColorRow.hidden = true;
		stateDimensionsRow.hidden = true;
		transSourceRow.hidden = true;
		transSourceAnchorRow.hidden = true;
		transKindRow.hidden = true;
		transEventRow.hidden = true;
		transPlacementRow.hidden = true;
		transCondRow.hidden = true;
		transTargetRow.hidden = true;
		transTargetAnchorRow.hidden = true;
		transActionsRow.hidden = true;
		transitionActionsRow.hidden = true;
		transRadiusRow.hidden = true;
		return;
	}

	idRow.hidden = !single;
	editId.disabled = !single;
	editId.value = single ? (item.id || '') : '';

	const isTransition = allTransitions;
	const isState = allStates;
	const stateIds = payload?.inspectorData?.stateIds || [];
	const parentValue = single ? (item.parentId || '(scxml)') : commonValue(items, 'parentId');
	const sourceValue = single ? (item.sourceId || '(scxml)') : commonValue(items, 'sourceId');
	const targetValue = single ? (item.targetId || '(none)') : commonValue(items, 'targetId');
	populateStateOptions(editParentId, ['(scxml)', ...stateIds], parentValue);
	populateStateOptions(editSourceId, ['(scxml)', ...stateIds], sourceValue);
	populateStateOptions(editTargetId, ['(none)', ...stateIds], targetValue);

	if (!single) {
		editHint.hidden = false;
		editHint.textContent = 'Bulk editing is active. Fields showing "-" have mixed values.';
	}

	stateKindRow.hidden = isTransition;
	if (isState) {
		configureStateKindControl(single, item, items);
	}
	stateParentRow.hidden = isTransition;
	stateEntryRow.hidden = isTransition;
	stateExitRow.hidden = isTransition;
	stateColorRow.hidden = isTransition;
	stateDimensionsRow.hidden = isTransition;
	transSourceRow.hidden = !isTransition;
	transSourceAnchorRow.hidden = !isTransition;
	transKindRow.hidden = !isTransition;
	transEventRow.hidden = !isTransition;
	transCondRow.hidden = !isTransition;
	transTargetRow.hidden = !isTransition;
	transTargetAnchorRow.hidden = !isTransition;
	transActionsRow.hidden = !isTransition;
	transRadiusRow.hidden = !isTransition;

	if (isTransition) {
		clearColorButton.disabled = true;
		setSelectValue(editSourceAnchorSide, single ? (item.sourceAnchorSide || '') : commonValue(items, 'sourceAnchorSide'));
		setScalar(editSourceAnchorOffset, single ? (item.sourceAnchorOffset || '') : commonValue(items, 'sourceAnchorOffset'));
		setSelectValue(editTransitionKind, single ? String(!!item.isInternal) : (commonValue(items, 'isInternal')===undefined ? undefined : String(!!commonValue(items, 'isInternal'))));
		setScalar(editEvent, single ? (item.event || '') : commonValue(items, 'event'));
		transPlacementRow.hidden = !hasAnyValidEvents(editEvent.value);
		setSelectValue(editLabelAlign, single ? (item.align || '') : commonValue(items, 'align'));
		setScalar(editLabelOffset, single ? (item.labelMainOffset || '') : commonValue(items, 'labelMainOffset'));
		setScalar(editLabelCrossOffset, single ? (item.labelCrossOffset || '') : commonValue(items, 'labelCrossOffset'));
		setScalar(editCondition, single ? (item.condition || '') : commonValue(items, 'condition'));
		setSelectValue(editTargetAnchorSide, single ? (item.targetAnchorSide || '') : commonValue(items, 'targetAnchorSide'));
		setScalar(editTargetAnchorOffset, single ? (item.targetAnchorOffset || '') : commonValue(items, 'targetAnchorOffset'));
		setScalar(editRadius, single ? (item.radius || '') : commonValue(items, 'radius'));
		stateEntryActionsRow.hidden = true;
		stateExitActionsRow.hidden = true;
		transitionActionsRow.hidden = !single;
		if (single) {
			renderActions(payload, 'transition', item.executables || [], transitionActions);
		}
	} else {
		transPlacementRow.hidden = true;
		setColor(editColor, single ? (item.rgbhex || '') : commonValue(items, 'rgbhex'));
		clearColorButton.disabled = false;
		setScalar(editWidth, single ? (item.w || 0) : commonValue(items, 'w'));
		setScalar(editHeight, single ? (item.h || 0) : commonValue(items, 'h'));
		stateEntryActionsRow.hidden = !single;
		stateExitActionsRow.hidden = !single;
		transitionActionsRow.hidden = true;
		if (single) {
			renderActions(payload, 'entry', item.enterExecutables || [], entryActions);
			renderActions(payload, 'exit', item.exitExecutables || [], exitActions);
		}
	}
}

function stateKind(item) {
	if (item.tagName==='history') return item.isDeep ? 'deep history' : 'shallow history';
	return item.tagName || 'state';
}

function isStateKindMutable(tagName) {
	return tagName==='state' || tagName==='parallel';
}

function configureStateKindControl(single, item, items) {
	editStateKind.innerHTML = '';

	const addOption = (value, text) => {
		const opt = document.createElement('option');
		opt.value = value;
		opt.textContent = text;
		editStateKind.appendChild(opt);
	};

	if (single) {
		if (isStateKindMutable(item.tagName)) {
			addOption('state', 'state');
			addOption('parallel', 'parallel');
			editStateKind.value = item.tagName;
			editStateKind.disabled = false;
			applyTooltip(editStateKind, 'State type. Use parallel for orthogonal child regions.');
		} else {
			addOption(stateKind(item), stateKind(item));
			editStateKind.disabled = true;
			applyTooltip(editStateKind, 'State type for this node is fixed.');
		}
		return;
	}

	const allMutable = items.every(candidate => isStateKindMutable(candidate.tagName));
	if (!allMutable) {
		const kind = commonStateKind(items);
		addOption(kind, kind);
		editStateKind.disabled = true;
		applyTooltip(editStateKind, 'State type is fixed for one or more selected nodes.');
		return;
	}

	addOption('state', 'state');
	addOption('parallel', 'parallel');
	const sharedTag = commonValue(items, 'tagName');
	if (sharedTag==='state' || sharedTag==='parallel') {
		editStateKind.value = sharedTag;
	} else {
		const mixed = document.createElement('option');
		mixed.value = '-';
		mixed.textContent = '-';
		editStateKind.prepend(mixed);
		editStateKind.value = '-';
	}

	editStateKind.disabled = false;
	applyTooltip(editStateKind, 'Apply state or parallel to all selected states.');
}

function commonStateKind(items) {
	let value;
	for (const item of items) {
		const kind = stateKind(item);
		if (value===undefined) value = kind;
		else if (value!==kind) return '-';
	}
	return value || 'state';
}

function populateStateOptions(selectEl, values, selected) {
	selectEl.innerHTML = '';
	if (selected===undefined) {
		const mixed = document.createElement('option');
		mixed.value = '-';
		mixed.textContent = '-';
		mixed.selected = true;
		selectEl.appendChild(mixed);
	}
	for (const value of values) {
		const opt = document.createElement('option');
		opt.value = value;
		opt.textContent = value;
		if (value===selected) opt.selected = true;
		selectEl.appendChild(opt);
	}
}

function setScalar(input, value) {
	if (value===undefined) {
		input.value = '';
		input.placeholder = '-';
	} else {
		input.value = value;
		input.placeholder = '';
	}
}

function setSelectValue(select, value) {
	const existingMixed = select.querySelector('option[value="-"]');
	if (existingMixed) existingMixed.remove();
	if (value===undefined) {
		const mixed = document.createElement('option');
		mixed.value = '-';
		mixed.textContent = '-';
		select.prepend(mixed);
		select.value = '-';
	} else {
		select.value = value;
	}
}

function setColor(input, value) {
	if (!value || value==='-') {
		input.value = '#808080';
		input.dataset.mixed = 'true';
	} else {
		input.value = value;
		delete input.dataset.mixed;
	}
}

function commonValue(items, key) {
	let first = undefined;
	for (const item of items) {
		const v = item[key];
		if (first===undefined) {
			first = v;
		} else if (v!==first) {
			return undefined;
		}
	}
	return first;
}

function hasAnyValidEvents(rawValue) {
	if (typeof rawValue !== 'string') {
		return false;
	}
	const tokens = rawValue.split(/\s+/).map(s => s.trim()).filter(Boolean);
	if (!tokens.length) {
		return false;
	}
	const eventToken = /^[A-Za-z0-9_.*-]+$/;
	return tokens.some(token => eventToken.test(token));
}

function refreshPlacementVisibilityFromEventInput() {
	if (transEventRow.hidden) {
		transPlacementRow.hidden = true;
		return;
	}
	transPlacementRow.hidden = !hasAnyValidEvents(editEvent.value);
}

function renderActions(payload, location, actions, container) {
	container.innerHTML = '';
	const actionTypes = payload?.inspectorData?.actionTypes || [];

	for (let i = 0; i < actions.length; ++i) {
		const action = actions[i];
		const schema = actionTypes.find(t => t.ns===action.namespaceURI && t.name===action.localName);
		const card = document.createElement('div');
		card.className = 'actionCard';

		const header = document.createElement('div');
		header.className = 'actionHeader';
		card.appendChild(header);

		if (schema) {
			const typeLabel = document.createElement('label');
			typeLabel.textContent = 'Type';
			header.appendChild(typeLabel);

			const typeSelect = document.createElement('select');
			const typeTooltip = schema.tip || 'Action type to execute at this step.';
			typeLabel.title = typeTooltip;
			typeSelect.title = typeTooltip;
			typeLabel.appendChild(typeSelect);
			for (const t of actionTypes) {
				const opt = document.createElement('option');
				opt.value = `${t.ns}|${t.name}`;
				opt.textContent = t.name;
				if (t.ns===action.namespaceURI && t.name===action.localName) opt.selected = true;
				typeSelect.appendChild(opt);
			}
			typeSelect.addEventListener('change', () => {
				const [ns, name] = typeSelect.value.split('|');
				sendInspectorCommand('setActionType', {location, index:i, ns, name});
			});
		} else {
			const summary = document.createElement('div');
			summary.className = 'actionReadonlySummary';
			summary.textContent = serializeUnknownActionSummary(action);
			summary.title = action.namespaceURI || '';
			header.appendChild(summary);
		}

		const del = document.createElement('button');
		del.type = 'button';
		del.className = 'deleteButton';
		del.textContent = '×';
		del.title = 'Delete action';
		del.setAttribute('aria-label', 'Delete action');
		del.addEventListener('click', () => {
			sendInspectorCommand('deleteAction', {location, index:i});
		});
		header.appendChild(del);

		if (!schema) {
			if ((action.textContent || '').trim()) {
				const textContent = document.createElement('div');
				textContent.className = 'actionReadonlyContent';
				textContent.textContent = action.textContent || '';
				card.appendChild(textContent);
			}

			if (!Object.keys(action.attrs || {}).length && !(action.textContent || '').trim()) {
				const hint = document.createElement('div');
				hint.className = 'hint';
				hint.textContent = 'No editable schema for this action type.';
				card.appendChild(hint);
			}

			container.appendChild(card);
			continue;
		}

		if (schema.cdata) {
			const textLabel = document.createElement('label');
			textLabel.textContent = 'Content';
			const ta = document.createElement('textarea');
			ta.rows = 3;
			ta.value = action.textContent || '';
			const contentTooltip = schema.cdataTip || 'Action text content. Example: timer = timer + 1';
			textLabel.title = contentTooltip;
			ta.title = contentTooltip;
			ta.addEventListener('input', () => {
				sendInspectorCommand('setActionText', {location, index:i, text:ta.value});
			});
			textLabel.appendChild(ta);
			card.appendChild(textLabel);
		}

		for (const attr of (schema?.attrs || [])) {
			const label = document.createElement('label');
			label.textContent = attr.name;
			const value = action.attrs?.[attr.name] ?? '';
			const attrTooltip = actionAttributeTooltip(attr);
			label.title = attrTooltip;

			if (attr.type==='choice') {
				const sel = document.createElement('select');
				sel.title = attrTooltip;
				for (const v of (attr.values || '').split(/,\s*/).filter(Boolean)) {
					const opt = document.createElement('option');
					opt.value = v;
					opt.textContent = v;
					if (v===value) opt.selected = true;
					sel.appendChild(opt);
				}
				sel.addEventListener('change', () => {
					sendInspectorCommand('setActionAttr', {location, index:i, name:attr.name, value:sel.value});
				});
				label.appendChild(sel);
			} else if (attr.type==='boolean') {
				const chk = document.createElement('input');
				chk.type = 'checkbox';
				chk.title = attrTooltip;
				chk.checked = value==='true';
				chk.addEventListener('change', () => {
					sendInspectorCommand('setActionAttr', {location, index:i, name:attr.name, value:String(chk.checked)});
				});
				label.appendChild(chk);
			} else {
				const inp = document.createElement('input');
				inp.type = attr.type==='int' || attr.type==='float' ? 'number' : 'text';
				inp.title = attrTooltip;
				if (attr.min!==undefined) inp.min = attr.min;
				if (attr.max!==undefined) inp.max = attr.max;
				if (attr.type==='float' && attr.step) inp.step = attr.step;
				inp.value = value;
				inp.addEventListener('input', () => {
					sendInspectorCommand('setActionAttr', {location, index:i, name:attr.name, value:inp.value});
				});
				label.appendChild(inp);
			}

			card.appendChild(label);
		}

		container.appendChild(card);
	}
}

function actionAttributeTooltip(attr) {
	const name = attr?.name || 'attribute';
	const lowerName = name.toLowerCase();
	if (attr?.tip) {
		return String(attr.tip).trim();
	}

	if (attr?.type==='choice') {
		const choices = (attr.values || '').split(/,\s*/).filter(Boolean);
		const sample = choices[0] || 'value';
		return `${name}: choose a supported value. Example: ${sample}`;
	}

	if (attr?.type==='boolean') {
		return `${name}: on/off flag (true or false).`;
	}

	const rangeParts = [];
	if (attr?.min!==undefined) rangeParts.push(`min ${attr.min}`);
	if (attr?.max!==undefined) rangeParts.push(`max ${attr.max}`);
	const rangeText = rangeParts.length ? ` (${rangeParts.join(', ')})` : '';

	if (lowerName.includes('expr')) {
		return `${name}: expression.${rangeText} Example: timer + 1`;
	}

	if (lowerName.includes('cond')) {
		return `${name}: guard condition.${rangeText} Example: timer >= cook_time`;
	}

	if (lowerName.includes('event')) {
		return `${name}: event name.${rangeText} Example: door_open`;
	}

	if (lowerName.includes('target')) {
		return `${name}: target id.${rangeText} Example: cooking`;
	}

	if (lowerName.includes('location')) {
		return `${name}: data location.${rangeText} Example: timer`;
	}

	if (attr?.type==='int' || attr?.type==='float') {
		return `${name}: numeric value.${rangeText} Example: 10`;
	}

	return `${name}: value.${rangeText} Example: value`;
}

function serializeUnknownActionSummary(action) {
	const name = action.localName || '(unknown)';
	const attrs = Object.entries(action.attrs || {})
		.map(([k, v]) => `${k}="${v ?? ''}"`)
		.join(' ');
	return attrs ? `${name} ${attrs}` : name;
}

function setProperty(property, value) {
	if (value==='-') return;
	sendInspectorCommand('setProperty', {property, value});
}

function sendInspectorCommand(command, payload) {
	vscode.postMessage({command, ...payload});
}

editId.addEventListener('input', () => setProperty('id', editId.value));
editStateKind.addEventListener('change', () => setProperty('stateKind', editStateKind.value));
editParentId.addEventListener('change', () => setProperty('parentId', editParentId.value));
const applyColorFromPicker = () => setProperty('rgbhex', editColor.value);
editColor.addEventListener('input', applyColorFromPicker);
editColor.addEventListener('change', applyColorFromPicker);
clearColorButton.addEventListener('click', () => {
	setProperty('rgbhex', '');
	setColor(editColor, '');
});
editWidth.addEventListener('input', () => setProperty('w', editWidth.value));
editHeight.addEventListener('input', () => setProperty('h', editHeight.value));
editSourceId.addEventListener('change', () => setProperty('sourceId', editSourceId.value));
editSourceAnchorSide.addEventListener('change', () => setProperty('sourceAnchorSide', editSourceAnchorSide.value));
editSourceAnchorOffset.addEventListener('input', () => setProperty('sourceAnchorOffset', editSourceAnchorOffset.value));
editTransitionKind.addEventListener('change', () => setProperty('isInternal', editTransitionKind.value));
editEvent.addEventListener('input', () => {
	setProperty('event', editEvent.value);
	refreshPlacementVisibilityFromEventInput();
});
editLabelAlign.addEventListener('change', () => setProperty('align', editLabelAlign.value));
editLabelOffset.addEventListener('input', () => setProperty('labelMainOffset', editLabelOffset.value));
editLabelCrossOffset.addEventListener('input', () => setProperty('labelCrossOffset', editLabelCrossOffset.value));
editCondition.addEventListener('input', () => setProperty('condition', editCondition.value));
editTargetId.addEventListener('change', () => setProperty('targetId', editTargetId.value));
editTargetAnchorSide.addEventListener('change', () => setProperty('targetAnchorSide', editTargetAnchorSide.value));
editTargetAnchorOffset.addEventListener('input', () => setProperty('targetAnchorOffset', editTargetAnchorOffset.value));
editRadius.addEventListener('input', () => setProperty('radius', editRadius.value));

addEntryAction.addEventListener('click', () => sendInspectorCommand('addAction', {location:'entry'}));
addExitAction.addEventListener('click', () => sendInspectorCommand('addAction', {location:'exit'}));
addTransitionAction.addEventListener('click', () => sendInspectorCommand('addAction', {location:'transition'}));
scxmlFileSelect.addEventListener('change', () => {
	updateOpenDiagramButtonState();
});
openScxmlFileButton.addEventListener('click', () => {
	if (!scxmlFileSelect.value) {
		return;
	}
	sendInspectorCommand('openScxmlInVisualEditor', {uri: scxmlFileSelect.value});
});
