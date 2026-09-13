import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const visualDOMSource = fs.readFileSync(new URL('../../resources/visualdom.js', import.meta.url), 'utf8');
const visualDOMWithStubbedDependency = visualDOMSource.replace(
	"import { SCXMLDoc, SCXMLState, SCXMLTransition } from 'scxmlDOM';",
	'class SCXMLDoc {} class SCXMLState { addChild(...args) { return this._addChild(...args); } } class SCXMLTransition {}'
);
assert.notEqual(visualDOMWithStubbedDependency, visualDOMSource);
const {VisualRoot} = await import(`data:text/javascript;base64,${Buffer.from(visualDOMWithStubbedDependency).toString('base64')}`);

function makeRoot(viewBox, existingXYs=[]) {
	const gridSize = 10;
	const editor = {
		gridSize,
		svg: {viewBox: {baseVal: viewBox}},
		snap: n => n.map(v => Math.round(v/gridSize) * gridSize)
	};
	const children = existingXYs.map(([x, y]) => ({x, y}));
	const newChild = {initialize() {}, xywh: undefined};
	const root = Object.create(VisualRoot.prototype);
	root.nodeName = 'scxml';
	root._vse = {editor};
	root._addChild = () => {
		children.push(newChild);
		return newChild;
	};
	Object.defineProperty(root, 'states', {get: () => children.slice()});
	return {root, newChild};
}

test('a new root state is centred in the visible area, not at the origin', t => {
	t.mock.method(console, 'log', () => {});
	const {root, newChild} = makeRoot({x: 1000, y: 2000, width: 800, height: 600});

	assert.equal(root.addChild(), newChild);
	assert.deepEqual(newChild.xywh, [1340, 2280, 120, 40]);
});

test('a new root state steps past a root state already at the centre', t => {
	t.mock.method(console, 'log', () => {});
	const {root, newChild} = makeRoot({x: 0, y: 0, width: 800, height: 600}, [[340, 280], [350, 290]]);

	root.addChild();
	assert.deepEqual(newChild.xywh, [360, 300, 120, 40]);
});

test('a root state is left unplaced when the view has no size yet', t => {
	t.mock.method(console, 'log', () => {});
	const {root, newChild} = makeRoot({x: 0, y: 0, width: 0, height: 0});

	root.addChild();
	assert.equal(newChild.xywh, undefined);
});
