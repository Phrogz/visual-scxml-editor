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
	'class SCXMLDoc {} class SCXMLState {} class SCXMLTransition {}'
);
assert.notEqual(visualDOMWithStubbedDependency, visualDOMSource);
const {VisualState, VisualTransition} = await import(`data:text/javascript;base64,${Buffer.from(visualDOMWithStubbedDependency).toString('base64')}`);

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
