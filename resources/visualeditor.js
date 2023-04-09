/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable curly */
'use strict';

import { VisualDoc, VisualRoot, VisualState, VisualTransition, makeEl } from 'visualDOM';

const xmlNS    = 'http://www.w3.org/2000/xmlns/';
const visualNS = 'http://phrogz.net/visual-scxml';

class VisualEditor {
	svg        = null;
	scxmlDoc   = null;
	gridSize   = 10;
	gridActive = true;

	constructor(svg, scxmlDoc) {
		this.svg = svg;
		this.removeDocument();

		document.body.addEventListener('mousedown', this.select.bind(this));
		document.body.addEventListener('keydown',   this.onKeydown.bind(this));
		document.body.addEventListener('keyup',     this.onKeyup.bind(this));
		document.body.addEventListener('mousewheel',this.onMousewheel.bind(this));
		this.dragger.addEventListener('mousedown', this.startPanning.bind(this));

		if (scxmlDoc) this.useSCXML(scxmlDoc);
	}

	get maxRadius() {
		return this._maxRadius || 100;
	}
	set maxRadius(r) {
		this._maxRadius = r || Infinity;
		if (this?.scxmlDoc?.transitions) for (const t of this.scxmlDoc.transitions) t.reroute();
	}

	get eventLabelOffset() {
		return this._eventLabelOffset || 3;
	}
	set eventLabelOffset(o) {
		this._eventLabelOffset = o;
		if (this?.scxmlDoc?.transitions) for (const t of this.scxmlDoc.transitions) t.reroute();
	}

	get showEvents() {
		return this._showEvents!==false;
	}
	set showEvents(b) {
		this._showEvents=!!b;
		getStyle('mutable', '.transition text').style.display = this._showEvents ? 'block' : 'none';
	}

	get zoomFactor() {
		const p1 = this.pointFromScreen(0, 0);
		const p2 = this.pointFromScreen(1, 0);
		return p2.x-p1.x;
	}

	get extents() {
		const b1 = this.content.getBBox();
		const b2 = this.transitions.getBBox();
		const bounds = {
			x : Math.min(b1.x, b2.x),
			y : Math.min(b1.y, b2.y),
			r : Math.max(b1.x+b1.width, b2.x+b2.width),
			b : Math.max(b1.y+b1.height, b2.y+b2.height),
		};
		bounds.width = bounds.r-bounds.x;
		bounds.height = bounds.b-bounds.y;
		return bounds;
	}

	useSCXML(scxmlDoc) {
		console.info('visualeditor.js must useSCXML() a new document');
		// Set the visual namespace on the document root so that new documents don't get it added to each state/transition touched
		const existingNSPrefix = Array.from(scxmlDoc.root.attributes).find(a => a.value===visualNS && a.namespaceURI===xmlNS);
		if (!existingNSPrefix) scxmlDoc.root.setAttributeNS(xmlNS, 'xmlns:viz', visualNS);

		// Used to prevent notification back to document for changes occuring from this load
		this.justLoaded = true;
		const firstLoad = !this.scxmlDoc;

		while (this.selectors.firstChildNode) this.selectors.removeChild(this.selectors.firstChildNode);

		const previousSelection = this.selection.concat();
		console.log(`…there were ${previousSelection.length} things selected`);

		// TODO: check that the new document is valid document before clearing house?
		if (this.scxmlDoc) this.removeDocument();
		this.scxmlDoc = Object.setPrototypeOf(scxmlDoc, VisualDoc.prototype);
		this.observer = new MutationObserver(this.onDocChange.bind(this));
		this.observer.observe(scxmlDoc.root, {childList:true, attributes:true, subtree:true, attributeOldValue:true});
		Object.setPrototypeOf(scxmlDoc.root, VisualRoot.prototype);
		scxmlDoc.root.initialize(this);

		// Turn off the snapping grid when setting the initial positions of items
		this.gridActive = false;
		for (const s of scxmlDoc.states) this.addState(s);
		for (const t of scxmlDoc.transitions) this.addTransition(t);
		this.gridActive = true;

		if (!existingNSPrefix) this.layoutDiagram();
		else if (firstLoad) this.zoomToExtents();

		// Restore the selection as best as possible
		this.startSelectionModifications();
		for (const o of previousSelection) {
			if (o.isState) {
				const state = this.scxmlDoc.getStateById(o.id);
				if (state) this.addToSelection(state);
				else       console.warn(`…SCXML Editor could not reselect equivalent of ${o.nodeName}#${o.id}`);
			} else if (o.isTransition) {
				const state = this.scxmlDoc.getStateById(o.sourceId);
				if (state) {
					let candidateTransitions = state.transitions ? state.transitions.filter(t => t.targetId===o.targetId) : [];
					if (candidateTransitions.length>1) candidateTransitions = candidateTransitions.filter(t => t.event===o.event);
					if (candidateTransitions.length>1) candidateTransitions = candidateTransitions.filter(t => t.condition===o.condition);
					if (candidateTransitions.length>1) candidateTransitions = candidateTransitions.filter(t => t.executables.length===o.executables.length);
					if (candidateTransitions[0]) this.addToSelection(candidateTransitions[0]);
					else {
						// Let's try something different; how about just by index in the parent?
						const oldIndex = o.parentElement.transitions.indexOf(o);
						const newTran = state.transitions[oldIndex];
						if (newTran) this.addToSelection(newTran);
						else         console.info(`…SCXML Editor could not reselect equivalent of ${o.outerHTML}`);
					}
				} else {
					console.info(`…SCXML Editor could not find parent state of ${o.outerHTML} sourceId: ${o.sourceId}`);
				}
			}
		}
		this.completeSelectionModifications();
	}

	removeDocument() {
		if (this.scxmlDoc) {
			this.guides.remove();
			this.shadows.remove();
			this.content.remove();
			this.transitions.remove();
			this.selectors.remove();
			this.dragger.remove();
		}

		this.guides      = makeEl('g', {_dad:this.svg, id:'guides'});
		this.shadows     = makeEl('g', {_dad:this.svg, id:'shadows'});
		this.content     = makeEl('g', {_dad:this.svg, id:'content'});
		this.transitions = makeEl('g', {_dad:this.svg, id:'transitions'});
		this.selectors   = makeEl('g', {_dad:this.svg, id:'selectors'});
		this.dragger     = makeEl('rect', {_dad:this.svg, fill:'none', id:'dragger'});
		this.selection = [];
		delete this.scxmlDoc;
	}

	addState(state) {
		// The root SCXML element does not get displayed visually
		if (state===this.scxmlDoc.root) return;
		Object.setPrototypeOf(state, VisualState.prototype).initialize(this);
	}

	addTransition(tran) {
		if (tran.parentNode.isState) {
			Object.setPrototypeOf(tran, VisualTransition.prototype).initialize(this);
		} else {
			// TODO: raise this at the editor level so that editors can use it (e.g. send this to the VS Code debug console)
			console.error(`SCXML Editor ignoring transition as a child of ${tran.parentNode.nodeName}`);
		}
	}

	createTransition(opts) {
		const newTrans = opts.sourceIds
		                 .map(id => this.scxmlDoc.getStateById(id))
		                 .filter(el => el.canHaveTransitions)
		                 .map(state => state.addTransition(opts.targetId, opts.event, opts.condition));
		for (const t of newTrans) t.initialize(this);
		this.setSelection(newTrans);
	}

	addVerticalWayline() {
		this.addWayline('X');
	}

	addHorizontalWayline() {
		this.addWayline('Y');
	}

	addWayline(axis) {
		const transitions = this.selection.filter(o => o.isTransition);
		for (const t of transitions) t.addWayline(axis);
	}

	makeDraggable(el, obj) {
		el.addEventListener('mousedown', evt => {
			if (evt.button) return; // Only drag when button is 0, i.e. left button
			evt.stopPropagation();
			const startLoc = this.pointFromScreen(evt.clientX, evt.clientY);
			const sandbox={};
			this.draggingActive=false;
			const onmove = evt => {
				const mouseLoc = this.pointFromScreen(evt.clientX, evt.clientY);
				evt.stopPropagation();
				if (!this.draggingActive && (this.draggingActive=true) && obj.startDragging) obj.startDragging(sandbox);
				if (obj.handleDrag) obj.handleDrag(mouseLoc.x-startLoc.x, mouseLoc.y-startLoc.y, sandbox);
			};
			document.body.addEventListener('mousemove', onmove);
			document.body.addEventListener('mouseup',() => {
				document.body.removeEventListener('mousemove', onmove);
				if (obj.finishDragging) obj.finishDragging(sandbox);
				this.draggingActive = false;
				if (this.notifyWhenDoneDragging) {
					this.scxmlDoc.dispatchEvent(new CustomEvent('changed'));
					this.notifyWhenDoneDragging = false;
				}
			});
		});
	}

	select(evt, item) {
		if (evt.type==='mousedown' && evt.button===1) {
			// middle mouse button down
			return this.startPanning(evt);
		}

		const wasSelected = this.selection.includes(item);
		this.startSelectionModifications();
		if (evt.shiftKey) {
			if (wasSelected) this.removeFromSelection(item);
			else if (item)   this.addToSelection(item);
		} else if (!wasSelected) {
			if (item) this.setSelection([item]);
			else      this.clearSelection();
		}
		this.completeSelectionModifications();
	}

	clearSelection() {
		this.setSelection([]);
	}

	startSelectionModifications() {
		this.selectionModsUnderway = true;
		if (this.onSelectionChanged) this.preModSelection = this.selection.concat();
	}

	addToSelection(item) {
		if (!item) return;
		if (!this.selection.includes(item)) {
			item.visuallySelect?.();
			this.selection.push(item);
			if (!this.selectionModsUnderway) this.onSelectionChanged?.(this.selection);
		}
	}

	removeFromSelection(item) {
		const oldCount = this.selection.length;
		this.selection = this.selection.filter(o => o!==item);
		item.visuallyDeselect?.();

		if (!this.selectionModsUnderway && oldCount !==this.selection.length) {
			this.onSelectionChanged?.(this.selection);
		}
	}

	setSelection(selectedItems=[]) {
		const modsUnderway = this.selectionModsUnderway;
		if (!modsUnderway) this.startSelectionModifications();

		for (const o of this.selection) o.visuallyDeselect?.();
		this.selection = selectedItems?.filter(item => item?.visuallySelect) || [];
		for (const o of this.selection) o.visuallySelect();

		if (!modsUnderway) this.completeSelectionModifications();
		this.selectionModsUnderway = modsUnderway;
	}

	completeSelectionModifications() {
		delete this.selectionModsUnderway;

		if (this.onSelectionChanged) {
			let anyChanged = this.preModSelection.length !== this.selection.length;
			if (!anyChanged) {
				for (let i=this.selection.length;i--;) {
					if (this.selection[i] !== this.preModSelection[i]) {
						anyChanged = true;
						break;
					}
				}
			}
			if (anyChanged) this.onSelectionChanged(this.selection);
			delete this.preModSelection;
		}
	}

	deleteSelectionOnly() {
		for (const o of this.selection) o.delete(true);
		this.clearSelection();
	}

	deleteSelectionAndMore() {
		for (const o of this.selection) o.delete(true, true);
		this.clearSelection();
	}

	toggleEventDisplay() {
		this.showEvents = !this.showEvents;
	}

	onKeydown(evt) {
		// Most keyboard shortcuts are assigned in package.json
		switch (evt.code) {
			case 'Space':
				this.enableDragPan();
			break;
		}
	}

	onKeyup(evt) {
		switch (evt.key) {
			case ' ':
				this.disableDragPan();
			break;
		}
	}

	onMousewheel(evt) {
		if (evt.ctrlKey) {
			const delta = evt.deltaY/300;
			const multiplier = 1/(delta>0 ? (1+delta) : (1/(1-delta)));
			const mouseLoc = this.pointFromScreen(evt.clientX, evt.clientY);
			this.zoomBy(multiplier, mouseLoc.x, mouseLoc.y);
		} else if (evt.shiftKey) {
			this.panBy(evt.deltaY*this.zoomFactor, evt.deltaX*this.zoomFactor);
		} else {
			this.panBy(evt.deltaX*this.zoomFactor, evt.deltaY*this.zoomFactor);
		}
	}

	enableDragPan() {
		if (!this.dragEnabled) {
			// TODO: ensure that this fully covers the view even after panning
			this.dragger.setAttribute('x', -5e4);
			this.dragger.setAttribute('y', -5e4);
			this.dragger.setAttribute('width',  1e5);
			this.dragger.setAttribute('height', 1e5);
			this.dragger.style.fill = 'transparent';
			this.dragEnabled = true;
		}
	}

	startPanning(evt) {
		evt.stopPropagation();
		const start = {
			mx : evt.clientX,
			my : evt.clientY,
			vx : this.svg.viewBox.baseVal.x,
			vy : this.svg.viewBox.baseVal.y,
		};
		const zoomFactor = this.zoomFactor;
		const onmove = evt => {
			evt.stopPropagation();
			this.setViewBox(
				start.vx - (evt.clientX-start.mx) * zoomFactor,
				start.vy - (evt.clientY-start.my) * zoomFactor
			);
		};
		document.body.addEventListener('mousemove', onmove);
		document.body.addEventListener('mouseup', function() {
			document.body.removeEventListener('mousemove', onmove);
		});
	}

	disableDragPan() {
		this.dragger.style.fill = 'none';
		this.dragEnabled = false;
	}

	panBy(dx, dy) {
		this.setViewBox(
			this.svg.viewBox.baseVal.x + dx,
			this.svg.viewBox.baseVal.y + dy
		);
	}

	zoomBy(factor, cx=null, cy=null) {
		// Clamp the final zoom between 0.2 and 5.0
		const zoomFactor = this.zoomFactor;
		factor = Math.min(zoomFactor*5, Math.max(zoomFactor/5, factor));

		if (cx===null) cx = this.svg.viewBox.baseVal.x + this.svg.viewBox.baseVal.width/2;
		if (cy===null) cy = this.svg.viewBox.baseVal.y + this.svg.viewBox.baseVal.height/2;
		this.setViewBox(
			cx - (cx-this.svg.viewBox.baseVal.x)/factor,
			cy - (cy-this.svg.viewBox.baseVal.y)/factor,
			this.svg.viewBox.baseVal.width  / factor,
			this.svg.viewBox.baseVal.height / factor
		);
		if (factor!==1.0) this.onZoomChanged();
	}

	zoomTo100() {
		const oldZoom = this.zoomFactor;
		const extents = this.extents;
		this.zoomBy(this.zoomFactor, extents.x+extents.width/2, extents.y+extents.height/2);
		if (oldZoom!==this.zoomFactor) this.onZoomChanged();
	}

	zoomToExtents() {
		this.zoomToBounds(this.extents);
	}

	zoomToSelected() {
		let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
		for (const item of this.selection) {
			const bounds = item.visualBounds;
			console.log({item, bounds});
			if (bounds.x < minX) minX = bounds.x;
			if (bounds.x + bounds.width > maxX) maxX = bounds.x + bounds.width;
			if (bounds.y < minY) minY = bounds.y;
			if (bounds.y + bounds.height > maxY) maxY = bounds.y + bounds.height;
		}
		this.zoomToBounds({x:minX, y:minY, width:maxX - minX, height:maxY - minY});
	}

	zoomToBounds(bounds) {
		const buffer = 0.1;
		const oldZoom = this.zoomFactor;
		this.setViewBox(
			bounds.x - buffer * bounds.width,
			bounds.y - buffer * bounds.height,
			bounds.width * (1+buffer*2),
			bounds.height * (1+buffer*2)
		);
		if (oldZoom!==this.zoomFactor) this.onZoomChanged();
	}

	setViewBox(x, y, w, h) {
		if (w===undefined) w = this.svg.viewBox.baseVal.width;
		if (h===undefined) h = this.svg.viewBox.baseVal.height;
		this.svg.setAttribute('viewBox', [x, y, w, h].join(' '));
	}

	onZoomChanged() {
		// Tell all the child states and transitions
		this.scxmlDoc.states.forEach(state => state.onZoomChanged());
		this.scxmlDoc.transitions.forEach(tran => tran.onZoomChanged());
	}

	layoutDiagram() {
		// local map for optimization, to prevent attribute churn during setup
		const boundMap = new Map();

		const scxml = this.scxmlDoc.root;

		// Clear out transition routing and attachments
		for (const t of this.scxmlDoc.transitions) {
			t.labelOffsets = null;
			t.align = null;
			t.pts = null;
		}

		layoutChildrenUnder(scxml, true, 0);

		// Apply the map to the elements
		for (const [el,b] of boundMap) {
			if (el !== scxml) {
				el.x1y1x2y2 = [b.x1, b.y1, b.x2, b.y2];
			}
		}

		setTimeout(this.zoomToExtents.bind(this), 1);

		function layoutChildrenUnder(parent, layoutHorizontal, lv) {
			// initialize each state when first seen
			const bounds = {
				x1:0,
				y1:0,
				x2:VisualState.defaultLeafWidth,
				y2:VisualState.defaultLeafHeight,
			};
			boundMap.set(parent, bounds);

			if (parent.isParallel) layoutHorizontal = true;

			const kids = parent.states;
			for (const kid of kids) layoutChildrenUnder(kid, !layoutHorizontal, lv+1);
			if (kids.length) {
				let prevBounds;
				for (const kid of kids) {
					const kidBounds = boundMap.get(kid);
					if (prevBounds) {
						if (layoutHorizontal) {
							offset(kid, prevBounds.x2 + (parent.isParallel ? 0 : VisualState.defaultSpacingHoriz) - kidBounds.x1);
						} else {
							offset(kid, 0, prevBounds.y2 + VisualState.defaultSpacingVert - kidBounds.y1);
						}
					}
					prevBounds = kidBounds;
				}

				const minX = Math.min.apply(null, kids.map(k => boundMap.get(k).x1));
				const maxX = Math.max.apply(null, kids.map(k => boundMap.get(k).x2));
				const minY = Math.min.apply(null, kids.map(k => boundMap.get(k).y1));
				const maxY = Math.max.apply(null, kids.map(k => boundMap.get(k).y2));
				if (parent.isParallel) {
					// Ensure the children have the same height
					for (const kid of kids) {
						const kidBounds = boundMap.get(kid);
						offset(kid, 0, minY - kidBounds.y1);
						kidBounds.y2 = maxY;
					}
					bounds.x1 = minX;
					bounds.x2 = maxX;
					bounds.y1 = minY - VisualState.headerHeight;
					bounds.y2 = maxY;
				} else {
					bounds.x1 = minX - VisualState.defaultPaddingHoriz;
					bounds.x2 = maxX + VisualState.defaultPaddingHoriz;
					bounds.y1 = minY - VisualState.headerHeight;
					bounds.y2 = maxY + VisualState.defaultPaddingVert;
				}
			}

			function offset(el, x=0, y=0) {
				const b = boundMap.get(el);
				b.x1 += x;
				b.x2 += x;
				b.y1 += y;
				b.y2 += y;
				for (const kid of el.states) offset(kid, x, y);
			}
		}
	}

	pointFromScreen(x, y) {
		if (!this.pt) this.pt = this.svg.createSVGPoint();
		this.pt.x = x;
		this.pt.y = y;
		return this.pt.matrixTransform(this.svg.getScreenCTM().inverse());
	}

	snap(n) {
		if (this.gridActive) {
			if (n.map) n = n.map(v => Math.round(v/this.gridSize) * this.gridSize);
			else       n = Math.round(n/this.gridSize) * this.gridSize;
		}
		return n;
	}

	updateSelectors() {
		this.selection.forEach(o => o.placeSelectors && o.placeSelectors());
	}

	removeVisualization() {
		this.clearSelection();
		this.scxmlDoc.removeVisualization();
	}

	onDocChange(mutationList) {
		console.info('VisualEditor.onDocChange() invoked due to SCXMLDoc mutation');
		let interestingChanges = false;
		mutationList.forEach(m => {
			switch (m.type) {
				case 'childList':
					interestingChanges = true;
					let anyScripts = false;
					let anyStates  = false;
					m.removedNodes.forEach(n => {
						if (!n.parentNode && n.deleteGraphics) n.deleteGraphics();
						anyScripts |= n.nodeName==='script';
						anyStates  |= n.isState;
					});

					m.addedNodes.forEach(n => {
						switch (n.nodeName) {
							case 'state':
							case 'parallel':
							case 'history':
							case 'final':
								if (n._vse) n.updateStyleForContainment();
								else this.addState(n);
								// FIXME: why isn't this available when adding a state as a child of <scxml>?
								// What breaks by not calling it?
								n.parentNode.updateStyleForDescendants?.();
							break;

							case 'transition':
								if (n._vse) n.reroute();
								else this.addTransition(n);
							break;

							case 'script':
								const parent = n.parentNode;
								switch (parent?.nodeName) {
									case 'transition':
										parent.updateStyleForExecutable();
									break;
									case 'onentry':
									case 'onexit':
										parent.parentNode.updateStyleForExecutable();
									break;
									case null:
										console.error(`Trying to add script node, but there's no parentNode for ${n}`);
									break;
								}
							break;

							case '#text':
							case 'onentry':
							case 'onexit':
								// intentionally do nothing
							break;

							default:
								console.warn(`Visual SCXML Editor is ignoring added ${n.nodeName} node:`, n);
						}
					});

					if (anyScripts) this.scxmlDoc.states.forEach(s => s.updateStyleForExecutable());
					if (anyStates)  this.scxmlDoc.states.forEach(s => s.updateStyleForDescendants());
				break;

				case 'attributes':
					const newValue = m.target.getAttributeNS(m.attributeNamespace, m.attributeName);
					interestingChanges |= newValue !== m.oldValue;
					if (m.target.updateAttribute) m.target.updateAttribute(m.attributeNamespace, m.attributeName);
				break;
			}
		});
		if (interestingChanges) {
			if (this.draggingActive) {
				this.notifyWhenDoneDragging = true;
			} else if (!this.justLoaded) {
				console.info('...VisualEditor.onDocChange() firing a custom "changed" event on the document');
				this.scxmlDoc.dispatchEvent(new CustomEvent('changed'));
			}
		}
		this.justLoaded = false;
	}
}

export default VisualEditor;
