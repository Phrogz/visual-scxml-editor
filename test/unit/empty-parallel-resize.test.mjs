import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

class FakeElement {
	constructor() {
		this.attributes = new Map();
		this.children = [];
		this.dataset = {};
	}

	appendChild(child) {
		this.children.push(child);
		child.parentNode = this;
		return child;
	}

	removeChild(child) {
		this.children.splice(this.children.indexOf(child), 1);
		delete child.parentNode;
	}

	getAttribute(name) {
		return this.attributes.get(name) ?? null;
	}

	removeAttribute(name) {
		this.attributes.delete(name);
	}

	setAttribute(name, value) {
		this.attributes.set(name, String(value));
		if (name.startsWith('data-')) {
			this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
		}
	}
}

globalThis.document = {
	createElementNS: () => new FakeElement(),
	createTextNode: text => text
};

const visualDOMSource = fs.readFileSync(new URL('../../resources/visualdom.js', import.meta.url), 'utf8');
const visualDOMWithStubbedDependency = visualDOMSource.replace(
	"import { SCXMLDoc, SCXMLState, SCXMLTransition } from 'scxmlDOM';",
	'class SCXMLDoc {} class SCXMLState { addChild(...args) { return this._addChild(...args); } } class SCXMLTransition {}'
);
assert.notEqual(visualDOMWithStubbedDependency, visualDOMSource);
const {VisualRoot, VisualState, VisualTransition} = await import(`data:text/javascript;base64,${Buffer.from(visualDOMWithStubbedDependency).toString('base64')}`);

const visualEditorSource = fs.readFileSync(new URL('../../resources/visualeditor.js', import.meta.url), 'utf8');
const visualEditorWithStubbedDependency = visualEditorSource.replace(
	"import { VisualDoc, VisualRoot, VisualState, VisualTransition, makeEl } from 'visualDOM';",
	'class VisualDoc {} class VisualRoot {} class VisualState {} class VisualTransition {} function makeEl() {}'
);
assert.notEqual(visualEditorWithStubbedDependency, visualEditorSource);
const {default:VisualEditor} = await import(`data:text/javascript;base64,${Buffer.from(visualEditorWithStubbedDependency).toString('base64')}`);

function makeState(states=[]) {
	let xywh = [10, 20, 120, 80];
	const dragHandlers = new Map();
	const state = Object.create(VisualState.prototype);
	state.isParallel = true;
	state.states = states;
	state._vse = {
		editor: {
			makeDraggable: (element, handlers) => dragHandlers.set(element.getAttribute('class'), handlers),
			selectors: new FakeElement(),
			svg: {classList: {add() {}, remove() {}}},
			zoomFactor: 1
		}
	};
	Object.defineProperties(state, {
		h: {get: () => xywh[3]},
		w: {get: () => xywh[2]},
		wh: {set: ([w,h]) => { xywh = [xywh[0], xywh[1], w, h]; }},
		xy: {set: ([x,y]) => { xywh = [x, y, xywh[2], xywh[3]]; }},
		xywh: {get: () => xywh.slice()}
	});
	state.createSelectors();
	return {dragHandlers, getXYWH: () => xywh.slice()};
}

function drag(state, direction, dx) {
	const handlers = state.dragHandlers.get(direction);
	const sandbox = {};
	handlers.startDragging(sandbox);
	handlers.handleDrag(dx, 0, sandbox);
}

function makeChild(xywh) {
	let bounds = xywh.slice();
	return {
		initialize() {},
		get w() { return bounds[2]; },
		get xywh() { return bounds.slice(); },
		set xywh(value) { bounds = value.slice(); }
	};
}

function makeParallelForAdding(parentXYWH, childXYWHs=[]) {
	let bounds = parentXYWH.slice();
	const children = childXYWHs.map(makeChild);
	const newChild = makeChild([0, 0, 120, 40]);
	const state = Object.create(VisualState.prototype);
	state.isParallel = true;
	state._vse = {editor:{gridSize:10}};
	state._addChild = () => {
		children.push(newChild);
		return newChild;
	};
	Object.defineProperty(state, 'xywh', {
		get: () => bounds.slice(),
		set: value => { bounds = value.slice(); }
	});
	Object.defineProperty(state, 'states', {get: () => children.slice()});
	return {
		state,
		children,
		newChild,
		getParentXYWH: () => bounds.slice()
	};
}

test('an empty parallel resizes horizontally without child errors', () => {
	const eastResize = makeState();
	assert.doesNotThrow(() => drag(eastResize, 'e', 40));
	assert.deepEqual(eastResize.getXYWH(), [10, 20, 160, 80]);

	const westResize = makeState();
	assert.doesNotThrow(() => drag(westResize, 'w', 40));
	assert.deepEqual(westResize.getXYWH(), [50, 20, 80, 80]);
});

test('a populated parallel keeps its children coupled during resize', () => {
	const children = [
		{id: 'left', x: 10, w: 60},
		{id: 'right', x: 70, w: 60}
	];
	const eastResize = makeState(children);
	drag(eastResize, 'e', 20);

	assert.deepEqual(eastResize.getXYWH(), [10, 20, 140, 80]);
	assert.equal(children[1].w, 80);
});

test('the first parallel child fills the area below the header', () => {
	const fixture = makeParallelForAdding([100, 200, 120, 80]);
	const added = fixture.state.addChild();

	assert.equal(added, fixture.newChild);
	assert.deepEqual(fixture.getParentXYWH(), [100, 200, 120, 80]);
	assert.deepEqual(added.xywh, [100, 230, 120, 50]);
});

test('a new parallel child is appended while existing widths stay proportional', () => {
	const fixture = makeParallelForAdding([100, 200, 180, 100], [
		[100, 230, 120, 70],
		[220, 230, 60, 70]
	]);
	fixture.state.addChild();

	assert.deepEqual(fixture.getParentXYWH(), [100, 200, 180, 100]);
	assert.deepEqual(fixture.children.map(child => child.xywh), [
		[100, 230, 80, 70],
		[180, 230, 40, 70],
		[220, 230, 60, 70]
	]);
});

test('fractional proportional widths are apportioned without gaps', () => {
	const fixture = makeParallelForAdding([0, 0, 200, 100], [
		[0, 30, 120, 70],
		[120, 30, 80, 70]
	]);
	fixture.state.addChild();

	assert.deepEqual(fixture.children.map(child => child.xywh), [
		[0, 30, 80, 70],
		[80, 30, 50, 70],
		[130, 30, 70, 70]
	]);
});

test('the parallel grows only enough to keep every child at minimum width', () => {
	const fixture = makeParallelForAdding([0, 0, 120, 100], [
		[0, 30, 30, 70],
		[30, 30, 90, 70]
	]);
	fixture.state.addChild();

	assert.deepEqual(fixture.getParentXYWH(), [0, 0, 150, 100]);
	assert.deepEqual(fixture.children.map(child => child.xywh), [
		[0, 30, 30, 70],
		[30, 30, 70, 70],
		[100, 30, 50, 70]
	]);
	assert.ok(fixture.children.every(child => child.w >= VisualState.minWidth));
});

function addChildWithSiblingPositions(siblingPositions) {
	let childXYWH;
	let expansionCount = 0;
	const child = {
		initialize() {},
		set xywh(value) { childXYWH = value; }
	};
	const parent = Object.create(VisualState.prototype);
	parent.isParallel = false;
	parent.states = siblingPositions.map(([x,y]) => ({x,y}));
	parent._vse = {editor:{gridSize:10}};
	parent._addChild = () => child;
	parent.expandToFitChildren = () => expansionCount++;
	Object.defineProperty(parent, 'xywh', {get:() => [100, 200, 220, 100]});

	parent.addChild();
	return {childXYWH, expansionCount};
}

test('new children of a non-parallel parent use the first unoccupied diagonal grid position', () => {
	assert.deepEqual(addChildWithSiblingPositions([]), {
		childXYWH: [110, 240, 120, 40],
		expansionCount: 1
	});
	assert.deepEqual(addChildWithSiblingPositions([
		[110, 240],
		[120, 250],
		[130, 999]
	]), {
		childXYWH: [130, 260, 120, 40],
		expansionCount: 1
	});
});

function addWayline(anchors, axis) {
	let currentAnchors = anchors;
	let selectorsCreated = 0;
	let selectorsPlaced = 0;
	const transition = Object.create(VisualTransition.prototype);
	Object.defineProperty(transition, 'anchors', {
		get: () => currentAnchors,
		set: value => { currentAnchors = value; }
	});
	transition.createSelectors = () => selectorsCreated++;
	transition.placeSelectors = () => selectorsPlaced++;
	transition.addWayline(axis);
	return {anchors:currentAnchors, selectorsCreated, selectorsPlaced};
}

test('adding either wayline axis rebuilds selectors for the new handle', () => {
	for (const [axis, coordinate] of [['X', 'x'], ['Y', 'y']]) {
		const result = addWayline([
			{x:0, y:0},
			{x:90, y:90}
		], axis);

		assert.equal(result.anchors[1].axis, axis);
		assert.equal(result.anchors[1][coordinate], 30);
		assert.equal(result.selectorsCreated, 1);
		assert.equal(result.selectorsPlaced, 0);
	}
});

test('adding a consecutive wayline rebuilds selectors with both handles', () => {
	const result = addWayline([
		{x:0, y:0},
		{axis:'X', offset:30, x:30},
		{x:90, y:90}
	], 'X');

	assert.deepEqual(result.anchors.slice(1, 3).map(anchor => anchor.x), [30, 50]);
	assert.equal(result.selectorsCreated, 1);
});

test('setting selected states as initial replaces sibling choices and skips parallel children', () => {
	const parent1 = {initial: 'oldSibling'};
	const parent2 = {initial: null};
	const parallel = {initial: null};
	const state = (id, parent, isParallelChild=false) => ({
		id,
		parent,
		isState: true,
		isParallelChild,
		set isInitial(makeInitial) {
			if (makeInitial) this.parent.initial = this.id;
		}
	});
	const editor = Object.create(VisualEditor.prototype);
	editor.selection = [
		state('newSibling', parent1),
		state('nestedInitial', parent2),
		state('parallelChild', parallel, true),
		{isTransition: true}
	];

	editor.setInitial();

	assert.equal(parent1.initial, 'newSibling');
	assert.equal(parent2.initial, 'nestedInitial');
	assert.equal(parallel.initial, null);
});

test('changing an initial attribute refreshes immediate child labels', () => {
	for (const ParentClass of [VisualRoot, VisualState]) {
		const refreshes = [];
		const parent = Object.create(ParentClass.prototype);
		parent.states = [
			{updateLabel: () => refreshes.push('first')},
			{updateLabel: () => refreshes.push('second')}
		];

		assert.equal(parent.updateAttribute(null, 'initial'), true);
		assert.deepEqual(refreshes, ['first', 'second']);
	}
});

test('overflowing state labels are left-aligned and faded until they fit', () => {
	for (const children of [[], [{}]]) {
		let width = 60;
		let id = 'abcdefgh';
		const label = new FakeElement();
		label.getComputedTextLength = () => Array.from(label.textContent).length * 10;
		const state = Object.create(VisualState.prototype);
		state._vse = {label, main:new FakeElement()};
		state.states = children;
		Object.defineProperties(state, {
			id: {get: () => id},
			isInitial: {get: () => false},
			isParallelChild: {get: () => false},
			isHistory: {get: () => false},
			xywh: {get: () => [0, 0, width, 40]}
		});

		state.updateLabel();
		assert.equal(label.textContent, 'abcdefgh');
		assert.equal(label.children.at(-1).textContent, 'abcdefgh');
		assert.equal(label.getAttribute('x'), '10');
		assert.equal(label.getAttribute('y'), children.length ? '15' : '20');
		assert.match(label.getAttribute('mask'), /^url\(#state-label-mask-\d+\)$/);
		assert.equal(state._vse.labelMask.getAttribute('width'), '40');
		assert.equal(state._vse.labelMaskSolid.getAttribute('width'), '25');
		assert.equal(state._vse.labelMaskFade.getAttribute('width'), '15');

		width = 120;
		state.updateLabelPosition();
		assert.equal(label.textContent, 'abcdefgh');
		assert.equal(label.getAttribute('x'), '60');
		assert.equal(label.getAttribute('mask'), null);
		assert.equal(state._vse.labelMask, undefined);

		id = 'abcdefghijklmnop';
		state.updateLabel();
		assert.equal(label.textContent, id);
		assert.equal(label.getAttribute('x'), '10');
		assert.match(label.getAttribute('mask'), /^url\(#state-label-mask-\d+\)$/);
		assert.equal(label.children.at(-1).textContent, id);
	}
});

test('minimum-width adorned labels fade inside the state', () => {
	const label = new FakeElement();
	label.getComputedTextLength = () => Array.from(label.textContent).length * 10;
	const state = Object.create(VisualState.prototype);
	state._vse = {label, main:new FakeElement()};
	state.states = [];
	Object.defineProperties(state, {
		id: {get: () => 'longHistoryState'},
		isInitial: {get: () => true},
		isParallelChild: {get: () => false},
		isHistory: {get: () => true},
		isDeep: {get: () => true},
		xywh: {get: () => [0, 0, 30, 20]}
	});

	state.updateLabel();
	assert.equal(label.getAttribute('x'), '10');
	assert.equal(state._vse.labelMask.getAttribute('width'), '10');
	assert.equal(state._vse.labelMaskSolid.getAttribute('width'), '0');
	assert.equal(state._vse.labelMaskFade.getAttribute('width'), '10');
	assert.equal(label.children.at(-1).textContent, 'longHistoryState');
});

test('the editor provides the shared state-label fade gradient', () => {
	const editorHTML = fs.readFileSync(new URL('../../resources/scxmleditor.html', import.meta.url), 'utf8');
	const editorCSS = fs.readFileSync(new URL('../../resources/scxmleditor.css', import.meta.url), 'utf8');
	assert.match(editorHTML, /<linearGradient id='state-label-fade'/);
	assert.match(editorCSS, /\.state text\[mask\]\s*\{\s*text-anchor:start;/);
	assert.match(editorCSS, /\.state\.parallel > text\s*\{\s*opacity:var\(--state-label-opacity, 1\) !important;/);
});

test('deleting a selection clears it before removing graphics', () => {
	for (const [command, expectedDeleteArgs] of [
		['deleteSelectionOnly', [true]],
		['deleteSelectionAndMore', [true, true]]
	]) {
		const editor = Object.create(VisualEditor.prototype);
		let graphicsExist = true;
		let deleteArgs;
		const deletedItem = {
			visuallyDeselect() {
				assert.equal(graphicsExist, true);
			},
			delete(...args) {
				assert.deepEqual(editor.selection, []);
				deleteArgs = args;
				graphicsExist = false;
			}
		};
		const nextItem = {visuallySelect() {}};
		editor.selection = [deletedItem];

		editor[command]();
		editor.setSelection([nextItem]);

		assert.deepEqual(deleteArgs, expectedDeleteArgs);
		assert.deepEqual(editor.selection, [nextItem]);
	}
});
