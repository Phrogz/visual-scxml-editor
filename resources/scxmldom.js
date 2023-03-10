/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable curly */
'use strict';

// Namespaces for re-use
const NS = 'http://www.w3.org/2005/07/scxml';

let nodeClassByName;

export class SCXMLDoc extends XMLDocument {
	createElementNS(nsURI, name, ...rest) {
		const el = super.createElementNS(nsURI, name, ...rest);
		// Intentionally NOT a ternary expression
		const wrapClass = nsURI===NS && nodeClassByName[name] || nodeClassByName._custom;
		console.info(`SCXMLDoc.createElementNS() wrapping in ${wrapClass.name}`);
		Object.setPrototypeOf(el, wrapClass.prototype);
		return el;
	}

	// Populates errorsByType.conflictingIds to be an array of errors,
	// where each error is an array of 2+ states that share the same id
	checkForIdDuplicates() {
		delete this.errorsByType.conflictingIds;
		const idToState = {};
		const statesWithIds = Array.from(this.querySelectorAll('state[id], parallel[id], history[id], final[id]'))
		                           .filter(t => t.namespaceURI===NS);
		const conflictsById = {};
		for (const state of statesWithIds) {
			const conflictingState = idToState[state.id];
			if (conflictingState) {
				if (!this.errorsByType.conflictingIds) {
					this.errorsByType.conflictingIds = [];
				}
				if (!conflictsById[state.id]) {
					conflictsById[state.id] = [conflictingState];
					this.errorsByType.conflictingIds.push(conflictsById[state.id]);
				}
				conflictsById[state.id].push(state);
			}
			idToState[state.id] = state;
		}
	}

	// Returns the (first) state matching a given id, or null if none match
	getStateById(id) {
		return id==='(scxml)' ? this.root : this.querySelector(`state[id="${id}"], parallel[id="${id}"], history[id="${id}"], final[id="${id}"]`);
	}

	// Generate a new state id that is unique in the document, based off of baseName
	uniqueId(baseName='id') {
		const ids = new Set(this.ids);
		let i=0, newId=baseName;
		while (ids.has(newId)) newId = `${baseName}${++i}`;
		return newId;
	}
	// Convenience property to get the root <scxml> element
	get root() {
		return this.documentElement;
	}

	// Map from type key (e.g. `conflictingIds`) to an array of errors
	get errorsByType() {
		if (!this._scxmlErrors) this._scxmlErrors={};
		return this._scxmlErrors;
	}

	// Array of every event name currently on transitions in the document
	get events() {
		return Array.from(this.querySelectorAll('transition[event]'))
		            .filter(t => t.namespaceURI===NS)
		            .reduce((a,t)=>a.concat(t.event.split(/\s+/)),[]);
	}

	// Array of every state/parallel/history/final in the document
	// Mutating this array will not affect the document; use state.addChild() or state.delete() for that
	get states() {
		return Array.from(this.querySelectorAll('state, parallel, history, final'))
		            .filter(n => n.namespaceURI===NS);
	}

	// Array of every transition in the document
	// Mutating this array will not affect the document; use state.addTransition() or transition.delete() for that
	get transitions() {
		return Array.from(this.querySelectorAll('transition'))
		            .filter(t => t.namespaceURI===NS);
	}

	// Array of every state id currently in the document
	get ids() {
		return this.states.map(s=>s.id).filter(Boolean);
	}

	// Array of every transition that is not guarded by an event OR condition
	get instantTransitions() {
		return this.transitions.filter(t => !(t.event || t.condition));
	}
}

// ****************************************************************************

// Prototype injected into scxml, state, parallel, final, or history elements
export class SCXMLState extends Element {
	// Add a new child state.
	// stateType: must be 'state', 'parallel', 'history', or 'final'
	// newId: (optional) string id of the state
	// Returns the new state.
	addChild(stateType='state', newId=null) {
		const doc = this.ownerDocument;
		const child = doc.createElementNS(NS, stateType || 'state');
		child.id = doc.uniqueId(newId || (this.isSCXML ? 'NewState' : this.id));
		return this.appendChild(child);
	}

	// Add a new child script action
	// inExit: true for onexit, false for onentry
	// code: (optional) script code to add initially
	// Returns the new script element.
	addScript(inExit, code='') {
		const doc = this.ownerDocument;
		const containerName = inExit ? 'onexit' : 'onentry';
		let container = this.querySelector(`:scope > ${containerName}`);
		container ||= this.appendChild(doc.createElementNS(NS, containerName));
		const el = container.appendChild(doc.createElementNS(NS, 'script'));
		el.code = code;
		return el;
	}

	// Add a new custom executable element
	// inExit: true for onexit, false for onentry
	// nsURI: namespace URI for the element
	// tagName: name of the element
	// attrs: (optional) attribute values
	addExecutable(inExit, nsURI, tagName, attrs={}) {
		const doc = this.ownerDocument;
		const containerName = inExit ? 'onexit' : 'onentry';
		let container = this.querySelector(`:scope > ${containerName}`);
		container ||= this.appendChild(doc.createElementNS(NS, containerName));
		const el = container.appendChild(doc.createElementNS(nsURI, tagName));
		if (attrs) for (const [attr, val] of Object.entries(attrs)) el.setAttribute(attr, val);

		return el;
	}

	// Add a new transition starting in this state
	// target:    (optional) id or state to target
	// event:     (optional) triggering event name(s)
	// condition: (optional) script code that guards the transition
	addTransition(target='', event='', condition='') {
		const tran = this.ownerDocument.createElementNS(NS, 'transition');
		if (target)    tran.target    = target;
		if (event)     tran.event     = event;
		if (condition) tran.condition = condition;
		this.appendChild(tran);
		return tran;
	}

	// Delete this state; does nothing if the state is the root SCXML element
	delete(opts={deleteSubStates:true, deleteTargetingTransitions:true}) {
		if (this.ownerDocument.root !== this) {
			if (!opts.deleteSubStates) for (const s of this.states) s.parent = this.parent;
			for (const t of this.incomingTransitions) {
				if (opts.deleteTargetingTransitions) {
					t.delete();
				} else {
					// Remove the ID of this state from the target of the transition
					t.targetId = t.targetId.replace(new RegExp(`^${this.id}(?: |$)|(?:^| )${this.id}\b`), '');
				}
			}
			this.remove();
		}
	}

	// Array of all state children of this state
	// Mutating this array will not affect the document; use state.addChild() or state.delete() for that
	get states() {
		return Array.from(this.querySelectorAll(':scope > state, :scope > parallel, :scope > history, :scope > final'))
                    .filter(t => t.namespaceURI===NS);
	}

	// Array of all states under this state
	// Mutating this array will not affect the document; use state.addChild() or state.delete() for that
	get descendants() {
		return Array.from(this.querySelectorAll('state, parallel, history, final'))
		            .filter(t => t.namespaceURI===NS);
	}

	// Array of all transitions originating from this state
	// Mutating this array will not affect the document; use state.addTransition() or transition.delete() for that
	get transitions() {
		return Array.from(this.querySelectorAll(':scope > transition'))
		            .filter(t => t.namespaceURI===NS);
	}

	// Array of all transitions targeting this state
	// Mutating this array will not affect the document; use state.addTransition() or transition.delete() for that
	get incomingTransitions() {
		if (!this.id) return [];
		const re = new RegExp(`(?:^|\s)${this.id}(?:\s|$)`);
		return this.ownerDocument.transitions.filter(t => re.test(t.targetId));
	}

	// Array of all enter script blocks for this state
	// Mutating this array will not affect the document; use state.addScript() or script.delete() for that
	get enterScripts() {
		return Array.from(this.querySelectorAll(':scope > onentry > script'))
		            .filter(t => t.namespaceURI===NS);
	}

	// Array of all exit script blocks for this state
	// Mutating this array will not affect the document; use state.addScript() or script.delete() for that
	get exitScripts() {
		return Array.from(this.querySelectorAll(':scope > onexit > script'))
		            .filter(t => t.namespaceURI===NS);
	}

	// Array of all enter executable content for this state
	// Mutating this array will not affect the document; use state.addScript()/state.addExecutable() or script.delete()/executable.delete() for that
	get enterExecutables() {
		return Array.from(this.querySelectorAll(':scope > onentry > *'));
	}

	// Array of all exit executable content for this state
	// Mutating this array will not affect the document; use state.addScript()/state.addExecutable() or script.delete()/executable.delete() for that
	get exitExecutables() {
		return Array.from(this.querySelectorAll(':scope > onexit > *'));
	}

	// Identifier for the state; setting to a conflicting value is allowed (see document.errorsByType.conflictingIds)
	get id() {
		return this.getAttribute('id') || (this.isSCXML ? '(scxml)' : null);
	}
	set id(newId) {
		//FIXME: transitions can have multiple space-delimited targets
		const targetingTransitions = Array.from(this.ownerDocument.querySelectorAll(`transition[target="${this.id}"]`))
										  .filter(t => t.namespaceURI===NS);
		for (const t of targetingTransitions) t.targetId = newId;

		if (newId) this.setAttribute('id', newId);
		else       this.removeAttribute('id');

		this.ownerDocument.checkForIdDuplicates();
	}

	// Returns true if this state is the initial state of its parent
	get isInitial() {
		// The SCXML root is always an initial
		if (this.ownerDocument.root===this) return true;
		const initialId = this.parentNode.getAttribute('initial');

		// FIXME: initial attributes can have multiple space-delimited targets
		return initialId ? initialId===this.id : this.isFirstChildState;
	}

	// Setting to true will force this state to be the initial state for the parent
	// Setting to false will remove an explicit initial state, causing the first document child to be the initial
	set isInitial(makeInitial) {
		if (this.ownerDocument.root===this) return;
		if (makeInitial)         this.parentNode.setAttribute('initial', this.id);
		else if (this.isInitial) this.parentNode.removeAttribute('initial');
	}

	// Returns the parent node of this state
	get parent() {
		return this.parentNode;
	}

	// Moves the node to a new parent
	set parent(newParent) {
		if (newParent!==this) newParent.appendChild(this);
	}

	get parentId() {
		return this.parent.id;
	}
	set parentId(id) {
		const newParent = this.ownerDocument.getStateById(id);
		if (newParent) this.parent = newParent;
	}

	// Returns true if this is a history state with `type="deep"`
	get isDeep() {
		return this.tagName==='history' && this.getAttribute('type')==='deep';
	}
	set isDeep(b) {
		if (this.tagName==='history') {
			if (b) this.setAttribute('type', 'deep');
			else   this.removeAttribute('type');
		}
	}

	// Returns true if this state is the root SCXML element, false otherwise
	get isSCXML() {
		return this===this.ownerDocument.root;
	}
	get isHistory() {
		return this.nodeName==='history';
	}
	get isParallel() {
		return this.nodeName==='parallel';
	}
	get isParallelChild() {
		return this.parent.isParallel;
	}
	get isFirstChildState() {
		return this===this.parent.states[0];
	}
	get isParent() {
		return !!this.querySelector('state, parallel, history, final');
	}
	get isLeaf() {
		return !this.isParent;
	}
	get canHaveChildStates() {
		return this.nodeName==='scxml' || this.nodeName==='state' || this.nodeName==='parallel';
	}
	get canHaveTransitions() {
		return this.nodeName==='state' || this.nodeName==='parallel' || this.nodeName==='history';
	}
}
Object.assign(SCXMLState.prototype, {
	isState: true
});

// ****************************************************************************

// Prototype injected into <transition> elements
export class SCXMLTransition extends Element {
	// Add a new child script action
	// code: (optional) script code to add initially
	addScript(code='') {
		const el = this.appendChild(this.ownerDocument.createElementNS(NS, 'script'));
		el.code = code;
		return el;
	}

	// Add a custom executable element
	// nsURI: the namespace URI for the element
	// tagName: the name of the element
	// attributes: (optional) map of attribute=value
	addExecutable(nsURI, tagName, attrs={}) {
		const el = this.appendChild(this.ownerDocument.createElementNS(nsURI, tagName));
		if (attrs) for (const [attr, val] of Object.entries(attrs)) el.setAttribute(attr, val);
		return el;
	}

	// Delete this transition
	delete() {
		this.remove();
	}

	// The id(s) of the state(s) this transition targets
	// Set to null to target no states
	get targetId() {
		return this.getAttribute('target');
	}
	set targetId(id) {
		if (id) this.setAttribute('target', id);
		else    this.removeAttribute('target');
	}

	// The state node targeted by this transition
	// Set to null to target no states
	// TODO: support transitions targetting multiple states
	get target() {
		return this.ownerDocument.getStateById(this.targetId);
	}
	set target(state) {
		this.targetId = (typeof state==='string') ? state : state?.id;
	}

	get targetsOtherState() {
		const tid = this.targetId;
		return tid && (tid !== this.sourceId);
	}

	get targetIsValid() {
		return !this.targetId || !!this.target;
	}

	// The state node that this transition originates from
	// Assign to a new state to change the origin
	get source() {
		return this.parentNode;
	}
	set source(state) {
		state?.appendChild?.(this);
	}

	// The id of the state this transition originates from
	// Assign to a new id to change the origin
	get sourceId() {
		return this.parentNode.id;
	}
	set sourceId(id) {
		this.source = this.ownerDocument.getStateById(id);
	}

	// The condition script code guarding this transition
	get condition() {
		return this.getAttribute('cond');
	}
	set condition(expr){
		if (expr) this.setAttribute('cond', expr);
		else      this.removeAttribute('cond');
	}

	// The event(s) triggering this transition (single space-delimited string for multiple)
	get event() {
		return this.getAttribute('event');
	}
	set event(events) {
		if (events) this.setAttribute('event', events);
		else        this.removeAttribute('event');
	}

	// Is the type of this transition internal (true) or external (false)
	get isInternal() {
		return this.getAttribute('type')==='internal';
	}
	set isInternal(bool) {
		if (bool) this.setAttribute('type', 'internal');
		else      this.removeAttribute('type');
	}

	// Array of all script blocks for this transition
	// Mutating this array will not affect the document; use transition.addScript() or script.delete() for that
	get scripts() {
		return Array.from(this.querySelectorAll(':scope > script'))
		            .filter(t => t.namespaceURI===NS);
	}

	// Array of all executable elements for this transition
	// Mutating this array will not affect the document; use transition.addExecutable() or executable.delete() for that
	get executables() {
		return Array.from(this.querySelectorAll(':scope > *'));
	}
}
Object.assign(SCXMLTransition.prototype, {
	isTransition: true,
});

// ****************************************************************************

// Prototype injected into <script> elements
export class SCXMLScript extends Element {
	delete() {
		const container = this.parentNode;
		this.remove();

		// delete empty <onentry> or <onexit> containers
		if (container.childElementCount===0 && (container.tagName==='onentry' || container.tagName==='onexit')) {
			container.remove();
		}
	}

	// The script code for this action
	get code() {
		return this.textContent;
	}
	set code(code) {
		if (code.trim()) this.textContent = code;
		else             this.delete();
	}
}

// Prototype injected into unrecognized elements
export class SCXMLCustom extends Element {
	// Delete this element
	delete() {
		const container = this.parentNode;
		this.remove();
		// delete empty <onentry> or <onexit> containers
		if (container.childElementCount===0 && (container.tagName==='onentry' || container.tagName==='onexit')) {
			container.remove();
		}
	}

	// Modify the value of one or more attributes based on simple attr=value map
	update(attrMap={}) {
		for (const [attr, val] of Object.entries(attrMap)) this.setAttribute(attr, val);
	}

	// Replace this element with a new one, maintaining attribute values where possible
	mutateInto(newNS, newName, newAttrs) {
		const doc = this.ownerDocument;
		const el = doc.createElementNS(newNS, newName);
		for (const k of Object.keys(newAttrs)){
			el.setAttribute(k, newAttrs[k]);
		}
		this.replaceWith(el);
	}

	// Convenience for fetching attributes, assuming no namespaces
	get attrs() {
		const attrs = {};
		for (let i=0; i<this.attributes.length; ++i) {
			const a = this.attributes[i];
			attrs[a.localName] = a.value;
		}
		return attrs;
	}
}

// ****************************************************************************

// Return a new SCXMLDocument from parsing SCXML source code
// If there are parsing errors, an array of error objects is returned instead
export function loadFromString(scxml) {
	const xmldoc = (new DOMParser).parseFromString(scxml, "text/xml");
	const errorEl = xmldoc.querySelector('parsererror');
	if (errorEl) {
		const errorStrings = errorEl.querySelector('div').innerText;
		const errorMatcher = /^error on line (\d+) at column (\d+): (.+)/g;
		const errors = [];
		let match;
		while (match = errorMatcher.exec(errorStrings)) {
			errors.push({line:match[1]*1, col:match[2]*1, msg:match[3]});
		}
		return errors;
	} else {
		return wrapNode(xmldoc);
	}
}

// Return a new SCXMLDocument by using XMLHttpRequest to load a URL
export function loadFromURL(url, callback) {
	loadURL(url, xml=>callback(loadFromString(xml)));
}

function loadURL(url, callback) {
	const xhr = new XMLHttpRequest;
	xhr.open('get', url);
	xhr.onerror = x => console.error('error loading '+url, x);
	xhr.onload  = ()=> callback(xhr.responseText);
	xhr.send();
}

nodeClassByName = {
	"#document": SCXMLDoc,
	scxml:       SCXMLState,
	state:       SCXMLState,
	parallel:    SCXMLState,
	history:     SCXMLState,
	final:       SCXMLState,
	transition:  SCXMLTransition,
	script:      SCXMLScript,
	_custom:     SCXMLCustom
};

function wrapNode(el) {
	const proto = nodeClassByName[el.nodeName] || SCXMLCustom;
	Object.setPrototypeOf(el, proto.prototype);
	for (const c of el.children) wrapNode(c);
	return el;
}