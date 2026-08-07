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
const {VisualState} = await import(`data:text/javascript;base64,${Buffer.from(visualDOMWithStubbedDependency).toString('base64')}`);

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
