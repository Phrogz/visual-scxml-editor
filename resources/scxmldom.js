/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable curly */
'use strict';

export { loadFromString, loadFromURL };

// Namespaces for re-use
const SVGNS = 'http://www.w3.org/2005/07/scxml';

// Prototype injected into scxml, state, parallel, or history nodes
const SCXMLState = Object.setPrototypeOf(
	Object.defineProperties({
		// Add a new child state.
		// stateType: must be 'state', 'parallel', 'history', or 'final'
		// newId: (optional) string id of the state
		// Returns the new state.
		addChild(stateType='state', newId=null) {
			const doc = this.ownerDocument;
			const child = wrapNode(doc.createElementNS(SVGNS, stateType || 'state'));
			child.id = doc.uniqueId(newId || this.id);
			this.appendChild(child);

			return child;
		},

		// Add a new child script action
		// inExit: true for onexit, false for onentry
		// code: (optional) script code to add initially
		// Returns the new script element.
		addScript(inExit, code='') {
			const doc = this.ownerDocument;
			const containerName = inExit ? 'onexit' : 'onentry';
			let container = this.querySelector(`:scope > ${containerName}`);
			if (!container) {
				container = this.appendChild(doc.createElementNS(SVGNS, containerName));
			}
			const el = wrapNode(container.appendChild(doc.createElementNS(SVGNS, 'script')));
			el.code = code;
			return el;
		},

		// Add a new custom executable element
		// inExit: true for onexit, false for onentry
		// nsURI: namespace URI for the element
		// tagName: name of the element
		// attrs: (optional) attribute values
		addExecutable(inExit, nsURI, tagName, attrs={}) {
			const doc = this.ownerDocument;
			const containerName = inExit ? 'onexit' : 'onentry';
			let container = this.querySelector(`:scope > ${containerName}`);
			if (!container) {
				container = this.appendChild(doc.createElementNS(SVGNS, containerName));
			}
			const el = wrapNode(container.appendChild(doc.createElementNS(nsURI, tagName)));
			if (attrs) Object.entries(attrs).forEach(([key,val]) => el.setAttribute(key, val));
			return el;
		},

		// Add a new transition starting in this state
		// target:    (optional) id or state to target
		// event:     (optional) triggering event name(s)
		// condition: (optional) script code that guards the transition
		addTransition(target='', event='', condition='') {
			const tran = wrapNode(this.ownerDocument.createElementNS(SVGNS, 'transition'));
			if (target)    tran.target    = target;
			if (event)     tran.event     = event;
			if (condition) tran.condition = condition;
			this.appendChild(tran);
			return tran;
		},

		// Delete this state; does nothing if the state is the root SCXML element
		delete() {
			if (this.ownerDocument.root !== this) {
				this.remove();
			}
		},

		isState: true,
	},
	{
		// Array of all state children of this state
		// Mutating this array will not affect the document; use state.addChild() or state.delete() for that
		states: {
			get() {
				return Array.from(this.querySelectorAll(':scope > state, :scope > parallel, :scope > history, :scope > final'));
			}
		},

		// Array of all states under this state
		// Mutating this array will not affect the document; use state.addChild() or state.delete() for that
		descendants: {
			get() {
				return Array.from(this.querySelectorAll('state, parallel, history, final'));
			}
		},

		// Array of all transitions originating from this state
		// Mutating this array will not affect the document; use state.addTransition() or transition.delete() for that
		transitions: {
			get() {
				return Array.from(this.querySelectorAll(':scope > transition'));
			}
		},

		// Array of all transitions targeting this state
		// Mutating this array will not affect the document; use state.addTransition() or transition.delete() for that
		incomingTransitions: {
			get() {
				if (!this.id) return [];
				const re = new RegExp(`(?:^|\s)${this.id}(?:\s|$)`);
				return this.ownerDocument.transitions.filter(t => re.test(t.targetId));
			}
		},

		// Array of all enter script blocks for this state
		// Mutating this array will not affect the document; use state.addScript() or script.delete() for that
		enterScripts: {
			get() {
				return Array.from(this.querySelectorAll(':scope > onentry > script'));
			}
		},

		// Array of all exit script blocks for this state
		// Mutating this array will not affect the document; use state.addScript() or script.delete() for that
		exitScripts: {
			get() {
				return Array.from(this.querySelectorAll(':scope > onexit > script'));
			}
		},

		// Array of all enter executable content for this state
		// Mutating this array will not affect the document; use state.addScript()/state.addExecutable() or script.delete()/executable.delete() for that
		enterExecutables: {
			get() {
				return Array.from(this.querySelectorAll(':scope > onentry > *'));
			}
		},

		// Array of all exit executable content for this state
		// Mutating this array will not affect the document; use state.addScript()/state.addExecutable() or script.delete()/executable.delete() for that
		exitExecutables: {
			get() {
				return Array.from(this.querySelectorAll(':scope > onexit > *'));
			}
		},

		// Identifier for the state; setting to a conflicting value is allowed (see document.errorsByType.conflictingIds)
		id: {
			get() {
				return this.getAttribute('id') || (this.isSCXML ? '(scxml)' : null);
			},
			set(newId) {
				//FIXME: transitions can have multiple space-delimited targets
				const targetingTransitions = this.ownerDocument.querySelectorAll(`transition[target="${this.id}"]`);
				for (const t of targetingTransitions) {
					t.targetId = newId;
				}

				if (newId) {
					this.setAttribute('id', newId);
				} else {
					this.removeAttribute('id');
				}

				this.ownerDocument.checkForIdDuplicates();
			}
		},

		// Returns true if this state is the initial state of its parent
		// Setting to true will force this state to be the initial state for the parent
		// Setting to false will remove an explicit initial state, causing the first document child to be the initial
		isInitial: {
			get() {
				// The SCXML root is always an initial
				if (this.ownerDocument.root===this) {
					return true;
				}
				const initialId = this.parentNode.getAttribute('initial');

				// FIXME: initial attributes can have multiple space-delimited targets
				return initialId ? initialId===this.id : this.isFirstChildState;
			},
			set(makeInitial) {
				if (this.ownerDocument.root===this) {
					return;
				}
				if (makeInitial) {
					this.parentNode.setAttribute('initial', this.id);
				} else if (this.isInitial) {
					this.parentNode.removeAttribute('initial');
				}
			},
		},

		// Returns the parent node of this state
		parent: {
			get() {
				return this.parentNode;
			},
			set(newParent) {
				if (newParent!==this) {
					newParent.appendChild(this);
				}
			}
		},

		parentId: {
			get() {
				return this.parent.id;
			},
			set(id) {
				const newParent = this.ownerDocument.getStateById(id);
				if (newParent) {
					this.parent = newParent;
				}
			}
		},

		// Returns true if this is a history state with `type="deep"`
		isDeep: {
			get() {
				return this.tagName==='history' && this.getAttribute('type')==='deep';
			},
			set(b) {
				if (this.tagName==='history') {
					if (b) {
						this.setAttribute('type', 'deep');
					} else {
						this.removeAttribute('type');
					}
				}
			}
		},

		// Returns true if this state is the root SCXML element, false otherwise
		isSCXML: {
			get() {
				return this===this.ownerDocument.root;
			}
		},
		isHistory: {
			get() {
				return this.nodeName==='history';
			}
		},
		isParallel: {
			get() {
				return this.nodeName==='parallel';
			}
		},
		isParallelChild: {
			get() {
				return this.parent.isParallel;
			}
		},
		isFirstChildState: {
			get() {
				return this===this.parent.states[0];
			}
		},
		isParent: {
			get() {
				return !!this.querySelector('state, parallel, history, final');
			}
		},
		isLeaf: {
			get() {
				return !this.isParent;
			}
		}
	}),
	Element.prototype
);

// Prototype injected into <transition> nodes
const SCXMLTransition = Object.setPrototypeOf(
	Object.defineProperties({
		// Add a new child script action
		// code: (optional) script code to add initially
		addScript(code='') {
			const el = wrapNode(this.appendChild(this.ownerDocument.createElementNS(SVGNS, 'script')));
			el.code = code;
			return el;
		},

		// Add a custom executable element
		// nsURI: the namespace URI for the element
		// tagName: the name of the element
		// attributes: (optional) map of attribute=value
		addExecutable(nsURI, tagName, attrs={}) {
			const el = wrapNode(this.appendChild(this.ownerDocument.createElementNS(nsURI, tagName)));
			if (attrs) Object.entries(attrs).forEach(([key,val]) => el.setAttribute(key, val));
			return el;
		},

		// Delete this transition
		delete: SCXMLState.delete,

		isTransition: true,
	},
	{
		// The id(s) of the state(s) this transition targets
		// Set to null to target no states
		targetId: {
			get() {
				return this.getAttribute('target');
			},
			set(id) {
				if (id) {
					this.setAttribute('target', id);
				} else {
					this.removeAttribute('target');
				}
			}
		},

		// The state node targeted by this transition
		// Set to null to target no states
		// TODO: support transitions targetting multiple states
		target: {
			get() {
				return this.ownerDocument.getStateById(this.targetId);
			},
			set(state) {
				this.targetId = state && state.id;
			}
		},

		targetsOtherState: {
			get() {
				const tid = this.targetId;
				return tid && (tid !== this.sourceId);
			}
		},

		targetIsValid: {
			get() {
				return !this.targetId || !!this.target;
			}
		},

		// The state node that this transition originates from
		// Assign to a new state to change the origin
		source: {
			get() {
				return this.parentNode;
			},
			set(state) {
				if (state && state.appendChild) {
					state.appendChild(this);
				}
			}
		},

		// The id of the state this transition originates from
		// Assign to a new id to change the origin
		sourceId: {
			get() {
				return this.parentNode.id;
			},
			set(id) {
				this.source = this.ownerDocument.getStateById(id);
			}
		},

		// The condition script code guarding this transition
		condition: {
			get() {
				return this.getAttribute('cond');
			},
			set(script){
				if (script) {
					this.setAttribute('cond', script);
				} else {
					this.removeAttribute('cond');
				}
			}
		},

		// The event(s) triggering this transition (single space-delimited string for multiple)
		event: {
			get() {
				return this.getAttribute('event');
			},
			set(events) {
				if (events) {
					this.setAttribute('event', events);
				} else {
					this.removeAttribute('event');
				}
			}
		},

		// Is the type of this transition internal (true) or external (false)
		isInternal: {
			get() {
				return this.getAttribute('type')==='internal';
			},
			set(bool) {
				if (bool) {
					this.setAttribute('type', 'internal');
				} else {
					this.removeAttribute('type');
				}
			}
		},

		// Array of all script blocks for this transition
		// Mutating this array will not affect the document; use transition.addScript() or script.delete() for that
		scripts: {
			get() {
				return this.querySelectorAll(':scope > script');
			}
		},

		// Array of all executable elements for this transition
		// Mutating this array will not affect the document; use transition.addExecutable() or executable.delete() for that
		executables: {
			get() {
				return this.querySelectorAll(':scope > *');
			}
		}
	}),
	Element.prototype
);

// Prototype injected into <script> nodes
const SCXMLScript = Object.setPrototypeOf(
	Object.defineProperties({
		// Delete this script block
		delete() {
			const container = this.parentNode;
			this.remove();
			// delete empty <onentry> or <onexit> containers
			if (container.childElementCount===0 && (container.tagName==='onentry' || container.tagName==='onexit')) {
				container.remove();
			}
		}
	},
	{
		// The script code for this action
		code: {
			get() {
				return this.textContent;
			},
			set(code) {
				if (code.trim()) {
					this.textContent = code;
				} else {
					// Remove whitespace-only or empty scripts
					this.delete();
				}
			}
		},
	}),
	Element.prototype
);

// Prototype injected into unrecognized nodes
const SCXMLCustom = Object.setPrototypeOf(
	Object.defineProperties({
		// Delete this element
		delete() {
			const container = this.parentNode;
			this.remove();
			// delete empty <onentry> or <onexit> containers
			if (container.childElementCount===0 && (container.tagName==='onentry' || container.tagName==='onexit')) {
				container.remove();
			}
		},

		// Modify the value of one or more attributes based on simple attr=value map
		update(attrMap={}) {
			Object.entries(attrMap).forEach( ([attr,val]) => {
				this.setAttribute(attr, val);
			});
		},

		// Replace this element with a new one, maintaining attribute values where possible
		mutateInto(newNS, newName, newAttrs) {
			const doc = this.ownerDocument;
			const el = wrapNode(doc.createElementNS(newNS, newName));
			for (const k of Object.keys(newAttrs)){
				el.setAttribute(k, newAttrs[k]);
			}
			this.replaceWith(el);
		}
	},
	{
		// Convenience for fetching attributes, assuming no namespaces
		attrs: {
			get() {
				const attrs = {};
				for (let i=0; i<this.attributes.length; ++i) {
					const a = this.attributes[i];
					attrs[a.localName] = a.value;
				}
				return attrs;
			},
		},
	}),
	Element.prototype
);

// Prototype injected into the document
const SCXMLDoc = Object.setPrototypeOf(
	Object.defineProperties({
		// Populates errorsByType.conflictingIds to be an array of errors,
		// where each error is an array of 2+ states that share the same id
		checkForIdDuplicates() {
			delete this.errorsByType.conflictingIds;
			const idToState = {};
			const statesWithIds = this.querySelectorAll('state[id], parallel[id], history[id], final[id]');
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
		},

		// Returns the (first) state matching a given id, or null if none match
		getStateById(id) {
			return id==='(scxml)' ? this.root : this.querySelector(`state[id="${id}"], parallel[id="${id}"], history[id="${id}"], final[id="${id}"]`);
		},

		// Generate a new state id that is unique in the document, based off of baseName
		uniqueId(baseName='id') {
			const ids = new Set(this.ids);
			let i=0, newId=baseName;
			while (ids.has(newId)) {
				newId = `${baseName}${++i}`;
			}
			return newId;
		},

		StateProto: SCXMLState,
		TransitionProto: SCXMLTransition,
		ScriptProto: SCXMLScript
	},
	{
		// Convenience property to get the root <scxml> element
		root: {
			get() {
				return this.documentElement;
			}
		},

		// Map from type key (e.g. `conflictingIds`) to an array of errors
		errorsByType: {
			get() {
				if (!this._scxmlErrors) {
					this._scxmlErrors={};
				}
				return this._scxmlErrors;
			}
		},

		// Array of every event name currently on transitions in the document
		events: {
			get() {
				return Array.from(this.querySelectorAll('transition[event]'))
					   .reduce((a,t)=>a.concat(t.event.split(/\s+/)),[]);
			}
		},

		// Array of every state/parallel/history/final in the document
		// Mutating this array will not affect the document; use state.addChild() or state.delete() for that
		states: {
			get() {
				return Array.from(this.querySelectorAll('state, parallel, history, final'));
			}
		},

		// Array of every transition in the document
		// Mutating this array will not affect the document; use state.addTransition() or transition.delete() for that
		transitions: {
			get() {
				return Array.from(this.querySelectorAll('transition'));
			}
		},

		// Array of every state id currently in the document
		ids: {
			get() {
				return this.states.map(s=>s.id).filter(Boolean);
			}
		},

		// Array of every transition that is not guarded by an event OR condition
		instantTransitions: {
			get() {
				return this.transitions.filter(t => !(t.event || t.condition));
			}
		}
	}),
	XMLDocument.prototype
);

// Return a new SCXMLDocument from parsing SCXML source code
// If there are parsing errors, an array of error objects is returned instead
function loadFromString(scxml) {
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
function loadFromURL(url, callback) {
	loadURL(url, xml=>callback(loadFromString(xml)));
}

function loadURL(url, callback) {
	const xhr = new XMLHttpRequest;
	xhr.open('get', url);
	xhr.onerror = x => console.error('error loading '+url, x);
	xhr.onload  = ()=> callback(xhr.responseText);
	xhr.send();
}

const nodeProtos = {
	"#document": SCXMLDoc,
	scxml:       SCXMLState,
	state:       SCXMLState,
	parallel:    SCXMLState,
	history:     SCXMLState,
	transition:  SCXMLTransition,
	script:      SCXMLScript,
};

function wrapNode(el) {
	const proto = nodeProtos[el.nodeName] || SCXMLCustom;
	if (proto) Object.setPrototypeOf(el, proto);
	for (const c of el.children) wrapNode(c);
	return el;
}