'use strict';

const vscode = acquireVsCodeApi();

const docLabel = document.getElementById('docLabel');
const selectionSummary = document.getElementById('selectionSummary');
const selectionItems = document.getElementById('selectionItems');
const editSection = document.getElementById('editSection');
const editHint = document.getElementById('editHint');
const idRow = document.getElementById('idRow');
const editId = document.getElementById('editId');
const editParentId = document.getElementById('editParentId');
const editColor = document.getElementById('editColor');
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
const stateColorRow = document.getElementById('stateColorRow');
const stateWidthRow = document.getElementById('stateWidthRow');
const stateHeightRow = document.getElementById('stateHeightRow');
const transSourceRow = document.getElementById('transSourceRow');
const transSourceAnchorSideRow = document.getElementById('transSourceAnchorSideRow');
const transSourceAnchorOffsetRow = document.getElementById('transSourceAnchorOffsetRow');
const transKindRow = document.getElementById('transKindRow');
const transEventRow = document.getElementById('transEventRow');
const transLabelAlignRow = document.getElementById('transLabelAlignRow');
const transLabelOffsetRow = document.getElementById('transLabelOffsetRow');
const transLabelCrossOffsetRow = document.getElementById('transLabelCrossOffsetRow');
const transCondRow = document.getElementById('transCondRow');
const transTargetRow = document.getElementById('transTargetRow');
const transTargetAnchorSideRow = document.getElementById('transTargetAnchorSideRow');
const transTargetAnchorOffsetRow = document.getElementById('transTargetAnchorOffsetRow');
const transRadiusRow = document.getElementById('transRadiusRow');
const stateActionsSection = document.getElementById('stateActionsSection');
const transitionActionsSection = document.getElementById('transitionActionsSection');
const entryActions = document.getElementById('entryActions');
const exitActions = document.getElementById('exitActions');
const transitionActions = document.getElementById('transitionActions');
const addEntryAction = document.getElementById('addEntryAction');
const addExitAction = document.getElementById('addExitAction');
const addTransitionAction = document.getElementById('addTransitionAction');

window.addEventListener('message', event => {
	const message = event.data;
	switch (message.command) {
		case 'clearSelection':
			docLabel.textContent = 'No active SCXML visual editor';
			selectionSummary.textContent = 'Nothing selected';
			selectionItems.innerHTML = '';
			editSection.hidden = true;
		break;

		case 'updateSelection':
			renderSelection(message.payload);
		break;
	}
});

function renderSelection(payload) {
	docLabel.textContent = payload.documentLabel || payload.documentUri;
	const detailedItems = payload.inspectorData?.items || [];
	const count = detailedItems.length || payload.selectedItems?.length || 0;
	if (!count) {
		selectionSummary.textContent = 'Nothing selected';
		selectionItems.innerHTML = '';
		editSection.hidden = true;
		return;
	}
	selectionSummary.textContent = `${count} item${count===1 ? '' : 's'} selected`;
	selectionItems.innerHTML = '';
	for (const item of (detailedItems.length ? detailedItems : payload.selectedItems)) {
		const li = document.createElement('li');
		const label = item.id ? `${item.tagName || item.name} #${item.id}` : (item.tagName || item.name);
		let details = '';
		if (item.type==='transition') {
			details = `event="${item.event || ''}" target="${item.targetId || ''}" actions=${item.executables?.length || 0}`;
		} else if (item.type==='state') {
			details = `size=${item.w || '?'}x${item.h || '?'} entryActions=${item.enterExecutables?.length || 0} exitActions=${item.exitExecutables?.length || 0}`;
		}
		li.textContent = details ? `${label} — ${details}` : label;
		selectionItems.appendChild(li);
	}

	renderEditor(payload, detailedItems);
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
		idRow.hidden = true;
		stateParentRow.hidden = true;
		stateColorRow.hidden = true;
		stateWidthRow.hidden = true;
		stateHeightRow.hidden = true;
		transSourceRow.hidden = true;
		transSourceAnchorSideRow.hidden = true;
		transSourceAnchorOffsetRow.hidden = true;
		transKindRow.hidden = true;
		transEventRow.hidden = true;
		transLabelAlignRow.hidden = true;
		transLabelOffsetRow.hidden = true;
		transLabelCrossOffsetRow.hidden = true;
		transCondRow.hidden = true;
		transTargetRow.hidden = true;
		transTargetAnchorSideRow.hidden = true;
		transTargetAnchorOffsetRow.hidden = true;
		transRadiusRow.hidden = true;
		stateActionsSection.hidden = true;
		transitionActionsSection.hidden = true;
		return;
	}

	idRow.hidden = !single;
	editId.disabled = !single;
	editId.value = single ? (item.id || '') : '';

	const isTransition = allTransitions;
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

	stateParentRow.hidden = isTransition;
	stateColorRow.hidden = isTransition;
	stateWidthRow.hidden = isTransition;
	stateHeightRow.hidden = isTransition;
	transSourceRow.hidden = !isTransition;
	transSourceAnchorSideRow.hidden = !isTransition;
	transSourceAnchorOffsetRow.hidden = !isTransition;
	transKindRow.hidden = !isTransition;
	transEventRow.hidden = !isTransition;
	transLabelAlignRow.hidden = !isTransition;
	transLabelOffsetRow.hidden = !isTransition;
	transLabelCrossOffsetRow.hidden = !isTransition;
	transCondRow.hidden = !isTransition;
	transTargetRow.hidden = !isTransition;
	transTargetAnchorSideRow.hidden = !isTransition;
	transTargetAnchorOffsetRow.hidden = !isTransition;
	transRadiusRow.hidden = !isTransition;

	if (isTransition) {
		setSelectValue(editSourceAnchorSide, single ? (item.sourceAnchorSide || '') : commonValue(items, 'sourceAnchorSide'));
		setScalar(editSourceAnchorOffset, single ? (item.sourceAnchorOffset || '') : commonValue(items, 'sourceAnchorOffset'));
		setSelectValue(editTransitionKind, single ? String(!!item.isInternal) : (commonValue(items, 'isInternal')===undefined ? undefined : String(!!commonValue(items, 'isInternal'))));
		setScalar(editEvent, single ? (item.event || '') : commonValue(items, 'event'));
		setSelectValue(editLabelAlign, single ? (item.align || '') : commonValue(items, 'align'));
		setScalar(editLabelOffset, single ? (item.labelMainOffset || '') : commonValue(items, 'labelMainOffset'));
		setScalar(editLabelCrossOffset, single ? (item.labelCrossOffset || '') : commonValue(items, 'labelCrossOffset'));
		setScalar(editCondition, single ? (item.condition || '') : commonValue(items, 'condition'));
		setSelectValue(editTargetAnchorSide, single ? (item.targetAnchorSide || '') : commonValue(items, 'targetAnchorSide'));
		setScalar(editTargetAnchorOffset, single ? (item.targetAnchorOffset || '') : commonValue(items, 'targetAnchorOffset'));
		setScalar(editRadius, single ? (item.radius || '') : commonValue(items, 'radius'));
		stateActionsSection.hidden = true;
		transitionActionsSection.hidden = !single;
		if (single) renderActions(payload, 'transition', item.executables || [], transitionActions);
	} else {
		setColor(editColor, single ? (item.rgbhex || '#808080') : commonValue(items, 'rgbhex'));
		setScalar(editWidth, single ? (item.w || 0) : commonValue(items, 'w'));
		setScalar(editHeight, single ? (item.h || 0) : commonValue(items, 'h'));
		stateActionsSection.hidden = !single;
		transitionActionsSection.hidden = true;
		if (single) {
			renderActions(payload, 'entry', item.enterExecutables || [], entryActions);
			renderActions(payload, 'exit', item.exitExecutables || [], exitActions);
		}
	}
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

function renderActions(payload, location, actions, container) {
	container.innerHTML = '';
	const actionTypes = payload?.inspectorData?.actionTypes || [];

	for (let i = 0; i < actions.length; ++i) {
		const action = actions[i];
		const card = document.createElement('div');
		card.className = 'actionCard';

		const header = document.createElement('div');
		header.className = 'actionHeader';
		card.appendChild(header);

		const typeLabel = document.createElement('label');
		typeLabel.textContent = 'Type';
		header.appendChild(typeLabel);

		const typeSelect = document.createElement('select');
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

		const del = document.createElement('button');
		del.type = 'button';
		del.className = 'deleteButton';
		del.textContent = 'Delete';
		del.addEventListener('click', () => {
			sendInspectorCommand('deleteAction', {location, index:i});
		});
		header.appendChild(del);

		const schema = actionTypes.find(t => t.ns===action.namespaceURI && t.name===action.localName);
		if (schema?.cdata) {
			const textLabel = document.createElement('label');
			textLabel.textContent = 'Content';
			const ta = document.createElement('textarea');
			ta.rows = 3;
			ta.value = action.textContent || '';
			ta.addEventListener('change', () => {
				sendInspectorCommand('setActionText', {location, index:i, text:ta.value});
			});
			textLabel.appendChild(ta);
			card.appendChild(textLabel);
		}

		for (const attr of (schema?.attrs || [])) {
			const label = document.createElement('label');
			label.textContent = attr.name;
			const value = action.attrs?.[attr.name] ?? '';

			if (attr.type==='choice') {
				const sel = document.createElement('select');
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
				chk.checked = value==='true';
				chk.addEventListener('change', () => {
					sendInspectorCommand('setActionAttr', {location, index:i, name:attr.name, value:String(chk.checked)});
				});
				label.appendChild(chk);
			} else {
				const inp = document.createElement('input');
				inp.type = attr.type==='int' || attr.type==='float' ? 'number' : 'text';
				if (attr.min!==undefined) inp.min = attr.min;
				if (attr.max!==undefined) inp.max = attr.max;
				if (attr.type==='float' && attr.step) inp.step = attr.step;
				inp.value = value;
				inp.addEventListener('change', () => {
					sendInspectorCommand('setActionAttr', {location, index:i, name:attr.name, value:inp.value});
				});
				label.appendChild(inp);
			}

			card.appendChild(label);
		}

		container.appendChild(card);
	}
}

function setProperty(property, value) {
	if (value==='-') return;
	sendInspectorCommand('setProperty', {property, value});
}

function sendInspectorCommand(command, payload) {
	vscode.postMessage({command, ...payload});
}

editId.addEventListener('change', () => setProperty('id', editId.value));
editParentId.addEventListener('change', () => setProperty('parentId', editParentId.value));
editColor.addEventListener('change', () => setProperty('rgbhex', editColor.value));
editWidth.addEventListener('change', () => setProperty('w', editWidth.value));
editHeight.addEventListener('change', () => setProperty('h', editHeight.value));
editSourceId.addEventListener('change', () => setProperty('sourceId', editSourceId.value));
editSourceAnchorSide.addEventListener('change', () => setProperty('sourceAnchorSide', editSourceAnchorSide.value));
editSourceAnchorOffset.addEventListener('change', () => setProperty('sourceAnchorOffset', editSourceAnchorOffset.value));
editTransitionKind.addEventListener('change', () => setProperty('isInternal', editTransitionKind.value));
editEvent.addEventListener('change', () => setProperty('event', editEvent.value));
editLabelAlign.addEventListener('change', () => setProperty('align', editLabelAlign.value));
editLabelOffset.addEventListener('change', () => setProperty('labelMainOffset', editLabelOffset.value));
editLabelCrossOffset.addEventListener('change', () => setProperty('labelCrossOffset', editLabelCrossOffset.value));
editCondition.addEventListener('change', () => setProperty('condition', editCondition.value));
editTargetId.addEventListener('change', () => setProperty('targetId', editTargetId.value));
editTargetAnchorSide.addEventListener('change', () => setProperty('targetAnchorSide', editTargetAnchorSide.value));
editTargetAnchorOffset.addEventListener('change', () => setProperty('targetAnchorOffset', editTargetAnchorOffset.value));
editRadius.addEventListener('change', () => setProperty('radius', editRadius.value));

addEntryAction.addEventListener('click', () => sendInspectorCommand('addAction', {location:'entry'}));
addExitAction.addEventListener('click', () => sendInspectorCommand('addAction', {location:'exit'}));
addTransitionAction.addEventListener('click', () => sendInspectorCommand('addAction', {location:'transition'}));
