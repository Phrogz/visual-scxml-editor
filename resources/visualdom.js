/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable curly */
'use strict';

import { SCXMLDoc, SCXMLState, SCXMLTransition } from 'scxmlDOM';
const SCXMLNS  = 'http://www.w3.org/2005/07/scxml';
const SVGNS    = 'http://www.w3.org/2000/svg';
const visualNS = 'http://phrogz.net/visual-scxml';

export class VisualDoc extends SCXMLDoc {
	createElementNS(nsURI, name, ...rest) {
		const el = super.createElementNS(nsURI, name, ...rest);
		if (nsURI === SCXMLNS) {
			let wrapClass;
			switch (name) {
				case 'state':
				case 'parallel':
				case 'history':
				case 'final':
					wrapClass = VisualState;
				break;
				case 'transition':
					wrapClass = VisualTransition;
				break;
			}
			if (wrapClass) {
                Object.setPrototypeOf(el, wrapClass.prototype);
                console.info(`VisualDoc.createElementNS() wrapping in ${wrapClass.name}`);
            }
		}
		return el;
	}

	removeVisualization() {
		const nodeIterator = this.evaluate(
			// Select elements and attribute in the vizualization namespace without
			// a namespaced element in their ancestry (since those will be removed hierarchically)
			'//viz:*[not(ancestor::viz:*)] | //@viz:*[not(ancestor::viz:*)]',
			this,
			this.createNSResolver(this.documentElement),
			XPathResult.ANY_TYPE
		);
		const nodesToDelete = [];
		let n;
		while (n = nodeIterator.iterateNext()) nodesToDelete.push(n);
		for (n of nodesToDelete) {
			if (n.nodeType === Node.ELEMENT_NODE) n.parentElement.removeChild(n);
			else                                  n.ownerElement.removeAttributeNode(n);
		}
	}
}

// We don't want to make the root <scxml> element a full VisualState
// so this class is just to ensure it behaves properly
export class VisualRoot extends SCXMLState {
	initialize(editor) {
		this._vse = {editor:editor};
		return this;
	}

	addChild(...args) {
		console.log(`VisualState.addChild() called on ${this.nodeName}#${this.id}`);
		const el = super.addChild(...args);
		el.initialize(this._vse.editor);
		return el;
	}
}

// ****************************************************************************
// ****************************************************************************
// ****************************************************************************

export class VisualState extends SCXMLState {
	static minWidth            = 30;
	static minHeight           = 20;
	static minParentWidth      = 50;
	static minParentHeight     = 50;
	static headerHeight        = 30;
	static defaultLeafWidth    = 120;
	static defaultLeafHeight   = 40;
	static defaultParentWidth  = 220;
	static defaultParentHeight = 100;
	static defaultSpacingHoriz = 80;
	static defaultSpacingVert  = 40;
	static defaultPaddingHoriz = 20;
	static defaultPaddingVert  = 20;

	initialize(editor) {
		// A special "expando" property on the element that holds all visualization information for it
		const ego = this._vse = {
			editor   : editor,
			shadow   : makeEl('rect', {_dad:editor.shadows, rx:this.cornerRadius, ry:this.cornerRadius}),
			main     : makeEl('g',    {_dad:editor.content, transform:'translate(0,0)', 'class':'state'}),
		};

		ego.tx = ego.main.transform.baseVal.getItem(0);
		ego.rect  = makeEl('rect', {_dad:ego.main, rx:this.cornerRadius, ry:this.cornerRadius, 'class':'body'});
		ego.label = makeEl('text', {_dad:ego.main, _text:this.id});
		ego.enter = makeEl('path', {_dad:ego.main, d:'M0,0', 'class':'enter'});
		ego.exit  = makeEl('path', {_dad:ego.main, d:'M0,0', 'class':'exit'});
		ego.dividerN  = makeEl('line', {_dad:ego.main, y1:VisualState.headerHeight, y2:VisualState.headerHeight, 'class':'parallel-divider parallel-divider-h'});
		ego.dividerW  = makeEl('line', {_dad:ego.main, 'class':'parallel-divider parallel-divider-v'});
		ego.dividerW2 = makeEl('line', {_dad:ego.main, 'class':'parallel-divider parallel-divider-v2'});

		editor.makeDraggable(ego.main, this);

		// Force generation of default values and updating from DOM
		this.xywh = this.xywh;
		if (this.rgb) this.updateColor();

		this.updateStyleForExecutable();
		this.updateStyleForDescendants();
		this.updateLabel();

		ego.main.addEventListener('mousedown', evt=>{
			evt.stopPropagation();
			editor.select(evt, this);
		});
	}

	startDragging(sandbox) {
		if (this.isParallelChild) return;
		// Re-order this state to the top
		sandbox.starts = new Map([this, ...this.descendants].map(n => [n, n.xy]));
		for (const [n,] of sandbox.starts) {
			n._vse.main.parentNode.appendChild(n._vse.main);
		}
	}

	handleDrag(dx, dy, sandbox) {
		if (this.isParallelChild) return;
		for (const [s,xy] of sandbox.starts) s.xy = [xy[0]+dx, xy[1]+dy];
		for (const [s,] of sandbox.starts) {
			s.transitions.forEach(t => t.reroute?.());
			s.incomingTransitions.forEach(t => t.reroute?.());
		}
		this._vse.editor.updateSelectors();
	}

	visuallySelect() {
		if (!this._vse.main.classList.contains('selected')) {
			this._vse.main.classList.add('selected');
			if (!this.isParallelChild) this.createSelectors();
			else {
				// TODO: draw selectors for a parallel child
			}
		}
	}

	visuallyDeselect() {
		this._vse.main.classList.remove('selected');
		if (!this.isParallelChild) this.removeSelectors();
	}

	delete(leaveInSelection=false, destructive=false) {
		if (!leaveInSelection) this._vse.editor.removeFromSelection(this);
		this.deleteGraphics();
		super.delete({deleteSubStates:destructive, deleteTargetingTransitions:destructive});
	}

	deleteGraphics() {
		// The graphics may have been already deleted, e.g. by delete()
		if (!this._vse) return;
		this._vse.shadow.remove();
		this._vse.main.remove();
		this.removeSelectors();
		delete this._vse;
	}

	addChild(...args) {
		const el = super.addChild(...args);
		el.initialize(this._vse.editor);

		let parentXYWH = this.xywh;
		if (parentXYWH) {
			// TODO: this assumes no other children; when they exist, place this child somewhere better
			const ed = this._vse.editor;
			el.xywh = [
				parentXYWH[0] + ed.gridSize,
				parentXYWH[1] + VisualState.headerHeight + ed.gridSize,
				VisualState.defaultLeafWidth,
				VisualState.defaultLeafHeight
				,
			];
			this.expandToFitChildren();
		} else {
			console.log("FIXME: place and size state added to root");
			// FIXME: need to place and size state if parent is scxml
		}

		return el;
	}

	expandToFitChildren() {
		const kids = this.states;
		const padding = this._vse.editor.gridSize;
		if (kids.length) {
			let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
			for (const k of kids) {
				const pts = k.x1y1x2y2;
				if (pts[0] < minX) minX = pts[0];
				if (pts[1] < minY) minY = pts[1];
				if (pts[2] > maxX) maxX = pts[2];
				if (pts[3] > maxY) maxY = pts[3];
			}
			minX -= padding;
			maxX += padding;
			minY -= padding + VisualState.headerHeight;
			maxY += padding;
			const pts = this.x1y1x2y2;
			if (pts[0] > minX) pts[0] = minX;
			if (pts[1] > minY) pts[1] = minY;
			if (pts[2] < maxX) pts[2] = maxX;
			if (pts[3] < maxY) pts[3] = maxY;
			this.xywh = [pts[0], pts[1], pts[2]-pts[0], pts[3]-pts[1]];
		}
	}

	updateAttribute(attrNS, attrName) {
		const ego = this._vse;
		let recognized = false;
		switch (attrName) {
			case 'xywh':
				// If the attribute has been removed, ask our getter to give us a default value
				let [x,y,w,h] = this.getAttributeNS(attrNS, attrName)?.split(/\s+/).map(Number) || this.xywh;
				ego.tx.setTranslate(x, y);
				setAttributes(ego.shadow, {x:x, y:y});
				setAttributes(ego.rect,   {width:w, height:h});
				setAttributes(ego.shadow, {width:w, height:h});

				const o = 4;
				const r = this.cornerRadius-o;
				if (this.isParallel) {
					// Action brackets for parallels live in the top of the diagram
					h = VisualState.headerHeight;
					setAttributes(ego.dividerN, {x2:w});
				} else if (this.isParallelChild) {
					setAttributes(ego.dividerW, {y2:h});
					setAttributes(ego.dividerW2, {y2:h});
				}
				ego.enter.setAttribute('d', `M${o+r},${o} A${r},${r},0,0,0,${o},${o+r} L${o},${h-o-r} A${r},${r},0,0,0,${o+r},${h-o}`);
				ego.exit.setAttribute('d', `M${w-o-r},${o} A${r},${r},0,0,1,${w-o},${o+r} L${w-o},${h-o-r} A${r},${r},0,0,1,${w-o-r},${h-o}`);

				// Some transitions in the scxmlDoc may not be visual (e.g. children of <initial>)
				this.transitions.forEach(t => t.reroute?.());
				this.incomingTransitions.forEach(t => t.reroute?.());
				this.updateLabelPosition();
				this.updateStyleForContainment();
				recognized = true;
			break;

			case 'rgb':
				this.updateColor();
				recognized = true;
			break;

			case 'id':
				this.updateLabel();
				recognized = true;
			break;

			case 'initial':
				this.states.forEach(s => s.updateLabel);
				recognized = true;
			break;
		}
		return recognized;
	}

	createSelectors() {
		const ego = this._vse;

		this.removeSelectors();
		ego.selectors = {
			nw: makeEl('circle', {_dad:ego.editor.selectors, 'class':'nw'}),
			ne: makeEl('circle', {_dad:ego.editor.selectors, 'class':'ne'}),
			sw: makeEl('circle', {_dad:ego.editor.selectors, 'class':'sw'}),
			se: makeEl('circle', {_dad:ego.editor.selectors, 'class':'se'}),
			n:  makeEl('rect',   {_dad:ego.editor.selectors, 'class':'n'}),
			s:  makeEl('rect',   {_dad:ego.editor.selectors, 'class':'s'}),
			w:  makeEl('rect',   {_dad:ego.editor.selectors, 'class':'w'}),
			e:  makeEl('rect',   {_dad:ego.editor.selectors, 'class':'e'}),
		};

		const childStates = this.isParallel && this.states;
		if (childStates) {
			for (let i=1; i<childStates.length; ++i) {
				ego.selectors[`divider${i}`] = makeEl('rect', {_dad:ego.editor.selectors, 'class':'divider', 'data-divider-index':i});
			}
		}

		this.placeSelectors();

		for (const el of Object.values(ego.selectors)) {
			const direction = el.getAttribute('class');
			const draggingClass = `dragging-${direction}`;
			const dividerIndex = el.dataset.dividerIndex*1;

			ego.editor.makeDraggable(el, {
				startDragging: sandbox => {
					sandbox.xywh = this.xywh;
					sandbox.childXs = childStates && childStates.map(child => child.x);
					sandbox.childWidths = childStates && childStates.map(child => child.w);
					switch (direction) {
						case 'nw': case 'w': case 'sw':
							sandbox.minDeltaX = -Infinity;
							sandbox.maxDeltaX = (childStates ? childStates[0].w : this.w) - VisualState.minWidth;
						break;
						case 'ne': case 'e': case 'se':
							sandbox.minDeltaX = VisualState.minWidth - (childStates ? childStates[childStates.length-1].w : this.w);
							sandbox.maxDeltaX = Infinity;
						break;
						case 'divider':
							sandbox.minDeltaX = VisualState.minParentWidth - childStates[dividerIndex-1].w;
							sandbox.maxDeltaX = childStates[dividerIndex].w - VisualState.minParentWidth;
						break;
					}
					switch (direction) {
						case 'nw': case 'n': case 'ne':
							sandbox.minDeltaY = -Infinity;
							sandbox.maxDeltaY = this.h - (this.isParallel ? (VisualState.headerHeight + VisualState.minParentHeight) : VisualState.minHeight);
						break;
						case 'sw': case 's': case 'se':
							sandbox.minDeltaY = -(this.h - (this.isParallel ? (VisualState.headerHeight + VisualState.minParentHeight) : VisualState.minHeight));
							sandbox.maxDeltaY = Infinity;
						break;
					}
					ego.editor.svg.classList.add(draggingClass);
				},

				handleDrag: (dx, dy, sandbox) => {
					if (sandbox.maxDeltaX!==undefined) dx = Math.min(sandbox.maxDeltaX, Math.max(sandbox.minDeltaX, dx));
					if (sandbox.maxDeltaY!==undefined) dy = Math.min(sandbox.maxDeltaY, Math.max(sandbox.minDeltaY, dy));
					let [x,y,w,h] = sandbox.xywh;
					switch (direction) {
						case 'nw': case 'w': case 'sw':
							x += dx;
							w -= dx;
							if (childStates) {
								childStates[0].x = x;
								childStates[0].w = sandbox.childWidths[0] - dx;
							}
						break;
						case 'ne': case 'e': case 'se':
							w += dx;
							if (childStates) childStates[childStates.length-1].w = sandbox.childWidths[childStates.length-1] + dx;
						break;
						case 'divider':
							childStates[dividerIndex-1].w = sandbox.childWidths[dividerIndex-1] + dx;
							childStates[dividerIndex].w = sandbox.childWidths[dividerIndex] - dx;
							childStates[dividerIndex].x = sandbox.childXs[dividerIndex] + dx;
						break;
					}
					switch (direction) {
						case 'nw': case 'n': case 'ne':
							y += dy;
							h -= dy;
							if (childStates) {
								childStates.forEach(child => {
									child.y = y + VisualState.headerHeight;
									child.h = h - VisualState.headerHeight;
								});
							}
						break;
						case 'sw': case 's': case 'se':
							h += dy;
							if (childStates) childStates.forEach(child => {
								child.h = h - VisualState.headerHeight;
							});
						break;
					}
					this.xy = [x,y];
					this.wh = [w,h];

					this.placeSelectors();
				},

				finishDragging: () => {
					ego.editor.svg.classList.remove(draggingClass);
				}
			});
		}
	}

	placeSelectors() {
		const sel = this._vse.selectors;
		if (!sel) return;

		const [x,y,w,h] = this.xywh;
		const ed  = this._vse.editor;
		const zoom = Math.min(1, ed.zoomFactor);
		const [r, rw, rh] = [4*zoom, 18*zoom, 8*zoom];

		sel.ne.setAttribute('r', r);
		sel.se.setAttribute('r', r);
		sel.nw.setAttribute('r', r);
		sel.sw.setAttribute('r', r);

		sel.ne.setAttribute('cx', x+w);
		sel.se.setAttribute('cx', x+w);
		sel.nw.setAttribute('cx', x);
		sel.sw.setAttribute('cx', x);
		sel.ne.setAttribute('cy', y);
		sel.nw.setAttribute('cy', y);
		sel.sw.setAttribute('cy', y+h);
		sel.se.setAttribute('cy', y+h);

		sel.n.setAttribute('width',  rw);
		sel.n.setAttribute('height', rh);
		sel.s.setAttribute('width',  rw);
		sel.s.setAttribute('height', rh);

		sel.e.setAttribute('width',  rh);
		sel.e.setAttribute('height', rw);
		sel.w.setAttribute('width',  rh);
		sel.w.setAttribute('height', rw);

		sel.n.setAttribute('x', x + w/2 - rw/2);
		sel.s.setAttribute('x', x + w/2 - rw/2);
		sel.e.setAttribute('x', x + w   - rh/2);
		sel.w.setAttribute('x', x +     - rh/2);
		sel.n.setAttribute('y', y +     - rh/2);
		sel.s.setAttribute('y', y + h   - rh/2);
		sel.e.setAttribute('y', y + h/2 - rw/2);
		sel.w.setAttribute('y', y + h/2 - rw/2);

		sel.n.setAttribute('rx', r);
		sel.n.setAttribute('ry', r);
		sel.s.setAttribute('rx', r);
		sel.s.setAttribute('ry', r);
		sel.e.setAttribute('rx', r);
		sel.e.setAttribute('ry', r);
		sel.w.setAttribute('rx', r);
		sel.w.setAttribute('ry', r);

		if (this.isParallel) {
			const childStates = this.states;
			let childWidths = 0;
			for (let i=childStates.length-1; i>=1; --i) {
				childWidths += childStates[i].w;

				const div = sel[`divider${i}`];
				div.setAttribute('rx', r);
				div.setAttribute('ry', r);
				div.setAttribute('width',  rh);
				div.setAttribute('height', rw);
				div.setAttribute('x', x + w - childWidths - rh/2);
				div.setAttribute('y', y + (h - VisualState.headerHeight)/2 + VisualState.headerHeight - rw/2);
			}
		}
	}

	removeSelectors() {
		if (!this._vse.selectors) return;
		Object.values(this._vse.selectors).forEach(el => el.parentNode.removeChild(el));
		delete this._vse.selectors;
	}

	updateStyleForContainment() {
		this._vse.main.classList.toggle('containmentError', !this.containedWithin(this.parentNode));
		this.states.forEach(s => s.updateStyleForContainment && s.updateStyleForContainment());
	}

	updateStyleForExecutable() {
		if (!this._vse) return;
		this._vse.main.classList.toggle('enter', this.enterExecutables.length);
		this._vse.main.classList.toggle('exit',  this.exitExecutables.length);
	}

	updateStyleForDescendants() {
		const ego = this._vse;
		if (!ego) return;

		ego.main.classList.toggle('parent', this.states.length);
		ego.main.classList.toggle('parallel', this.isParallel);
		ego.main.classList.toggle('parallel-child', this.isParallelChild);
		ego.main.classList.toggle('first-parallel-child', this.isFirstParallelChild);

		this.updateLabelPosition();
	}

	updateLabel() {
		let prefix='', postfix='';
		if (this.isInitial && !this.isParallelChild) {
			prefix = '▸ ';
			postfix = ' ';
		}
		if (this.isHistory) {
			prefix += this.isDeep ? '★ ' : '✪ ';
		}
		this._vse.label.textContent = `${prefix}${this.id}${postfix}`;
	}

	updateColor() {
		const rgb = this.rgb;
		const rect = this._vse.rect;
		rect.style.fill = rgb ? `rgb(${this.rgb.join()})` : '';
		rect.classList.toggle('explicit-color', rgb);
	}

	updateLabelPosition() {
		const [,,w,h] = this.xywh;
		const top = this.states.length>0 ? 15 : h/2;
		setAttributes(this._vse.label, {x:w/2, y:top});
	}

	containedWithin(s2) {
		if (s2.isSCXML) return true;
		const d1=this.xywh, d2=s2.xywh;
		return (d1[0]>=d2[0] && d1[1]>=d2[1] && (d1[0]+d1[2])<=(d2[0]+d2[2]) && (d1[1]+d1[3])<=(d2[1]+d2[3]));
	}

	onZoomChanged() {
		this.placeSelectors();
	}

	// Find the best spot on the side of this state to go towards the point,
	// reaching the point in the horiz/vert direction desired
	bestAnchorTowards(targetAnchor) {
		const [sx,sy,w,h] = this.xywh;
		const rr = this.cornerRadius;
		const xMin = rr, xMax = w-rr,
		      yMin = rr, yMax = h-rr;
		let {x:tx, y:ty, horiz} = targetAnchor;
		const result = {auto:true};
		let txClamped, tyClamped;

		const hasX = tx!==undefined,
		      hasY = ty!==undefined;

		// translate to state-local space for easier comparisons and offset calculation
		if (hasX) {
			tx -= sx;
			txClamped = Math.min(Math.max(xMin, tx), xMax);
		}
		if (hasY) {
			ty -= sy;
			tyClamped = Math.min(Math.max(yMin, ty), yMax);
		}

		if (hasX && hasY) {
			if (horiz) {
				result.x = sx + ((ty < 0 || ty > h) ? txClamped : (tx < w/2) ? 0 : w);
				result.y = sy + ((ty < 0) ? 0 : (ty > h) ? h : tyClamped);
				result.horiz = (ty >= 0 && ty <= h);
			} else {
				result.x = sx + ((tx < 0) ? 0 : (tx > w) ? w : txClamped);
				result.y = sy + ((tx < 0 || tx > w) ? tyClamped : (ty < h/2) ? 0 : h);
				result.horiz = (tx < 0 || tx > w);
			}
		} else {
			if (horiz) {
				delete result.x;
				if (ty < 0 || ty > h) result.xRange = [sx + xMin, sx + xMax];
				else                  result.xOptions = [sx, sx + w];
				result.y = sy + ((ty < 0) ? 0 : (ty > h) ? h : tyClamped); // note: identical to a case above; could be DRY'd up
				result.horiz = (ty >= 0 && ty <= h);
			} else {
				result.x = sx + ((tx < 0) ? 0 : (tx > w) ? w : txClamped); // note: identical to a case above; could be DRY'd up
				delete result.y;
				if (tx < 0 || tx > w) result.yRange = [sy + yMin, sy + yMax];
				else                  result.yOptions = [sy, sy + h];
				result.horiz = (tx < 0 || tx > w);                          // note: identical to a case above; could be DRY'd up
			}
		}

		return result;
	}

	get x()  { return this.xywh[0]; }
	set x(x) { const xywh=this.xywh; xywh[0]=this._vse.editor.snap(x); this.xywh=xywh; }

	get y()  { return this.xywh[1]; }
	set y(y) { const xywh=this.xywh; xywh[1]=this._vse.editor.snap(y); this.xywh=xywh; }

	get w()  { return this.xywh[2]; }
	set w(w) { const xywh=this.xywh; xywh[2]=this._vse.editor.snap(w); this.xywh=xywh; }

	get h()  { return this.xywh[3]; }
	set h(h) { const xywh=this.xywh; xywh[3]=this._vse.editor.snap(h); this.xywh=xywh; }

	get xy()   { return this.xywh.slice(0,2); }
	set xy(xy) { const xywh=this.xywh; [xywh[0], xywh[1]]=this._vse.editor.snap(xy); this.xywh=xywh; }

	get wh()   { return this.xywh.slice(2); }
	set wh(wh) { const xywh=this.xywh; [xywh[2], xywh[3]]=this._vse.editor.snap(wh); this.xywh=xywh; }

	get xywh() {
		const xywh=this.getAttributeNS(visualNS, 'xywh');
		if (xywh) return xywh.split(/\s+/).map(Number);

		return [0, 0, VisualState.defaultLeafWidth, VisualState.defaultLeafHeight];
	}
	set xywh(xywh) {
		xywh[2] = Math.max(xywh[2], VisualState.minWidth);
		xywh[3] = Math.max(xywh[3], VisualState.minHeight);
		this.setAttributeNS(visualNS, 'xywh', xywh.join(' '));
		this.states.forEach(s => s.updateStyleForContainment && s.updateStyleForContainment());
	}

	get x1y1x2y2() {
		const xywh = this.xywh;
		return [xywh[0], xywh[1], xywh[0]+xywh[2], xywh[1]+xywh[3]];
	}
	set x1y1x2y2([x1, y1, x2, y2]) {
		this.xywh = [x1, y1, x2-x1, y2-y1];
	}

	get r()  { return this.rgb[0]; }
	set r(r) { const rgb=this.rgb; rgb[0]=r; this.rgb=rgb; }

	get g()  { return this.rgb[1]; }
	set g(g) { const rgb=this.rgb; rgb[1]=g; this.rgb=rgb; }

	get b()  { return this.rgb[2]; }
	set b(b) { const rgb=this.rgb; rgb[2]=b; this.rgb=rgb; }

	get rgb() {
		const rgb = this.getAttributeNS(visualNS, 'rgb');
		return rgb && rgb.match(/[\da-f]{2}/gi).map(s=>parseInt(s,16));
	}
	set rgb(rgb) {
		if (rgb) this.setAttributeNS(visualNS, 'rgb', rgb.map(toHex255).join(''));
		else this.removeAttributeNS(visualNS, 'rgb');
	}

	get rgbhex() {
		return this.rgb && `#${this.rgb.map(n => n.toString(16).padStart(2,'0')).join('')}`;
	}
	set rgbhex(color) {
		this.setAttributeNS(visualNS, 'rgb', color.slice(1));
	}

	get enterScriptCode() {
		return this.enterScripts.map(n => deindent(n.code)).join('\n');
	}
	set enterScriptCode(code) {
		const scripts = this.enterScripts;
		if (!scripts.length) scripts.push(this.addScript(false));
		else for (let i=1; i<scripts.length; ++i) scripts[i].delete();
		scripts[0].code = code;
	}

	get exitScriptCode() {
		return this.exitScripts.map(n => deindent(n.code)).join('\n');
	}
	set exitScriptCode(code) {
		const scripts = this.exitScripts;
		if (!scripts.length) scripts.push(this.addScript(true));
		else for (let i=1; i<scripts.length; ++i) scripts[i].delete();
		scripts[0].code = code;
	}

	// Find the left-most child
	get isFirstParallelChild() {
		if (!this.isParallelChild) return false;
		return Array.from(this.parent.states).sort((a,b) => {
			a = a.xywh;
			b = b.xywh;
			return (a&&b) ? (a[0]-b[0]) : a ? -1 : 0;
		})[0] === this;
	}

	get visualBounds() {
		return transformedBoundingBox(this._vse.main);
	}
}
Object.assign(VisualState.prototype, {
	cornerRadius: 10
});

// ****************************************************************************
// ****************************************************************************
// ****************************************************************************

export class VisualTransition extends SCXMLTransition {
	initialize(editor) {
		// A special "expando" property on the element that holds all visualization information for it
		const ego = this._vse = {
			editor : editor,
			main   : makeEl('g', {_dad:editor.transitions, 'class':'transition'}),
		};
		ego.catcher = makeEl('path', {_dad:ego.main, d:'M0,0', 'class':'catcher'});
		ego.path    = makeEl('path', {_dad:ego.main, d:'M0,0', 'class':'line'});
		ego.label   = makeEl('text', {_dad:ego.main, _text:this.event});

		this.checkCondition();
		this.checkEvent();
		this.checkTarget();
		this.updateStyleForExecutable();

		ego.main.addEventListener('mousedown', evt=>{
			evt.stopPropagation();
			editor.select(evt, this);
		});

		this.reroute();
	}

	reroute() {
		delete this._anchors;
		const anchors = this.anchors;
		const ego = this._vse;
		const path = svgPathFromAnchors(anchors, this.radius);

		ego.path.setAttribute('d', path);
		ego.catcher.setAttribute('d', path);

		if (this.event) this.placeLabel(anchors);
	}

	placeLabel(anchors=this.anchors) {
		const ego = this._vse;
		const [mainOffset, crossOffset] = this.labelOffsets;
		let align = this.align || (anchors.length===1 && 'S');
		let offset;
		if (anchors.length>1) {
			// Treat 0 offset as a very small offset to determine direction
			const pt = ego.path.getPointAtLength(mainOffset || 0.01);
			const dx = pt.x-anchors[0].x,
			      dy = pt.y-anchors[0].y;
			offset = {x:dx, y:dy};
			if (!align) {
				align = (Math.abs(dx) > Math.abs(dy)) ? (dx>0 ? 'NE' : 'SW') : (dy>0 ? 'S' : 'N');
			}
			if (crossOffset) {
				const p2 = ego.path.getPointAtLength(mainOffset+1);
				// Rotate 90 degrees around offset point, scale by crossOffset
				offset.x += (pt.y-p2.y)*crossOffset;
				offset.y += (p2.x-pt.x)*crossOffset;
			}
		}

		const alignW = align.includes('W'), alignE = align.includes('E'),
		      alignN = align.includes('N'), alignS = align.includes('S');

		if (!offset) {
			offset = {
				x: alignW ? -mainOffset : alignE ? mainOffset : 0,
				y: alignN ? -mainOffset : alignS ? mainOffset : 0
			};
		}

		ego.label.setAttribute('x', anchors[0].x + offset.x);
		ego.label.setAttribute('y', anchors[0].y + offset.y);

		ego.label.style.textAnchor = alignW ? 'end' : alignE ? 'start' : 'middle';
		ego.label.style.dominantBaseline = alignN ? 'text-after-edge' : alignS ? 'text-before-edge' : 'middle';
	}

	get visualBounds() {
		return transformedBoundingBox(this._vse.path);
	}

	visuallySelect() {
		const main = this._vse.main;
		main.parentNode.appendChild(main);
		main.classList.add('selected');
		this.createSelectors();
	}

	visuallyDeselect() {
		this._vse.main.classList.remove('selected');
		this.removeSelectors();
	}

	createSelectors() {
		this.removeSelectors();

		const ego = this._vse;
		const wrapper = ego.editor.guides;
		ego.selectors = [];
		const numbers = '⓿➊➋➌➍➎➏➐➑➒';
		const numberN = '🅝';
		const anchors = this.anchors;
		const viewport = calculateViewport(ego.editor.svg);
		const snapSize = ego.editor.gridSize / 2;

		// Iterate in reverse order so that early anchor labels draw above later
		for (let i=anchors.length; i--;) {
			const [prev, anchor, next] = [anchors[i-1], anchors[i], anchors[i+1]];
			if (anchor.axis) {
				const n = numbers.charAt(i) || numberN;
				const sel = {anchorIndex:i};
				let guide, label, handle;
				if (anchor.axis==='Y') {
					sel.guide = makeEl('line', {_dad:wrapper, x1:-1e6, x2:1e6, y1:anchor.y, y2:anchor.y});
					sel.label = makeEl('text', {_dad:wrapper, _text:n, x:viewport.x + 10, y:anchor.y});
					sel.handle = makeEl('rect', {_dad:ego.editor.selectors, 'class':'n'});
				} else if (anchor.axis==='X') {
					sel.guide = makeEl('line', {_dad:wrapper, x1:anchor.x, x2:anchor.x, y1:-1e6, y2:1e6});
					sel.label = makeEl('text', {_dad:wrapper, _text:n, x:anchor.x, y:viewport.y + 10});
					sel.handle = makeEl('rect', {_dad:ego.editor.selectors, 'class':'e'});
				}
				ego.selectors.push(sel);

				const draggingClass = `dragging-${sel.handle.getAttribute('class')}`;
				ego.editor.makeDraggable(sel.handle, {
					startDragging: sandbox => {
						sandbox.transtion = this;
						sandbox.anchorIndex = i;
						sandbox.offset = this.anchors[i].offset*1;
						ego.editor.svg.classList.add(draggingClass);
					},

					handleDrag: (dx, dy, sandbox) => {
						const a = this.anchors[sandbox.anchorIndex];
						if (a.axis==='Y') {
							a.y = a.offset = Math.round((sandbox.offset+dy)/snapSize) * snapSize;
						} else if (a.axis==='X') {
							a.x = a.offset = Math.round((sandbox.offset+dx)/snapSize) * snapSize;
						}
						// Push new value to be serialized, but also force recalculation of endpoints
						this.anchors = this.anchors;
						this.placeSelectors();
					},

					finishDragging: () => {
						ego.editor.svg.classList.remove(draggingClass);
					}
				});

			}
		}

		this.placeSelectors();

		if (!ego.viewBoxObserver) {
			ego.viewBoxObserver = new MutationObserver(changes => {
				for (const c of changes) {
					if (c.attributeName==="viewBox") this.placeSelectors();
				}
			});
		}
		ego.viewBoxObserver.observe(ego.editor.svg, {attributes:true});
	}

	placeSelectors() {
		const ego = this._vse;
		if (!ego.selectors) return;
		const anchors = this.anchors;
		const viewport = calculateViewport(ego.editor.svg);

		const zoom = Math.min(1, ego.editor.zoomFactor);
		const [r, rw, rh] = [4*zoom, 18*zoom, 8*zoom];
		let x,y,w,h;
		for (const sel of ego.selectors) {
			const axis = sel.label.dataset.axis;
			const [prev, anchor, next] = [anchors[sel.anchorIndex-1], anchors[sel.anchorIndex], anchors[sel.anchorIndex+1]];
			if (anchor?.axis==='Y') {
				sel.guide.setAttribute('y1', anchor.y);
				sel.guide.setAttribute('y2', anchor.y);
				sel.label.setAttribute('x', viewport.x + 10);
				sel.label.setAttribute('y', anchor.y);
				[x,y,w,h] = [(prev.x + next.x)/2 - rw/2, anchor.y - rh/2, rw, rh];
			} else if (anchor?.axis==='X') {
				sel.guide.setAttribute('x1', anchor.x);
				sel.guide.setAttribute('x2', anchor.x);
				sel.label.setAttribute('x', anchor.x);
				sel.label.setAttribute('y', viewport.y + 10);
				[x,y,w,h] = [anchor.x - rh/2, (prev.y + next.y)/2 - rw/2, rh, rw];
			}

			sel.label.setAttribute(axis, viewport[axis] + 10);
			sel.label.style.fontSize = `${30*zoom}px`;

			sel.handle.setAttribute('x', x);
			sel.handle.setAttribute('y', y);
			sel.handle.setAttribute('width', w);
			sel.handle.setAttribute('height', h);
			sel.handle.setAttribute('rx', r);
			sel.handle.setAttribute('ry', r);
		}
	}

	removeSelectors() {
		const ego = this._vse;
		if (ego.selectors) {
			for (const s of ego.selectors) {
				s.handle.remove();
				s.guide.remove();
				s.label.remove();
			}
			delete ego.selectors;
		}
		if (ego.viewBoxObserver) ego.viewBoxObserver.disconnect();
	}

	delete() {
		this._vse.editor.removeFromSelection(this);
		this.deleteGraphics();
		super.delete();
	}

	deleteGraphics() {
		// Graphics may have already been deleted, e.g. by delete()
		if (!this._vse) return;
		this._vse.main.remove();
		delete this._vse;
	}

	bestAnchors() {
		const source=this.source, target=this.target;
		const [sx,sy,sw,sh] = source.xywh;
		if (!this.targetsOtherState || !this.targetIsValid) return [anchorOnState(source, 'S', sw/2)];
		const [tx,ty,tw,th] = target.xywh;
		const [sr,sb,tr,tb] = [sx+sw, sy+sh, tx+tw, ty+th];
		if (source.containedWithin(target)) {
			return [
				anchorOnState(source, 'E', sh/2, true),
				anchorOnState(target, 'E', source.y + sh/2 - target.y, false),
			];
		} else if (target.containedWithin(source)) {
			return [
				anchorOnState(source, 'W', target.y + th/2 - source.y, true),
				anchorOnState(target, 'W', th/2, false),
			];
		} else {
			const gapN = sy-tb;
			const gapS = ty-sb;
			const gapE = tx-sr;
			const gapW = sx-tr;
			const biggest = Math.max(gapE, gapS, gapW, gapN);
			const avgY = (Math.max(sy,ty)+Math.min(sb,tb))/2;
			const avgX = (Math.max(sx,tx)+Math.min(sr,tr))/2;
			const result = [];
			if (biggest===gapE) {
				result.push(anchorOnState(source, 'E', avgY-sy-5, true));
				if      (avgY<ty) result.push(anchorOnState(target, 'N', 0, false));
				else if (avgY>tb) result.push(anchorOnState(target, 'S', 0, false));
				else              result.push(anchorOnState(target, 'W', avgY-ty-5, false));
			} else if (biggest===gapS) {
				result.push(anchorOnState(source, 'S', avgX-sx-5, true));
				if      (avgX<tx) result.push(anchorOnState(target, 'W', 0, false));
				else if (avgX>tr) result.push(anchorOnState(target, 'E', 0, false));
				else              result.push(anchorOnState(target, 'N', avgX-tx-5, false));
			} else if (biggest===gapW) {
				result.push(anchorOnState(source, 'W', avgY-sy+5, true));
				if      (avgY<ty) result.push(anchorOnState(target, 'N', tw, false));
				else if (avgY>tb) result.push(anchorOnState(target, 'S', tw, false));
				else              result.push(anchorOnState(target, 'E', avgY-ty+5, false));
			} else if (biggest===gapN) {
				result.push(anchorOnState(source, 'N', avgX-sx+5, true));
				if      (avgX<tx) result.push(anchorOnState(target, 'W', th, false));
				else if (avgX>tr) result.push(anchorOnState(target, 'E', th, false));
				else              result.push(anchorOnState(target, 'S', avgX-tx+5, false));
			}
			return result;
		}
	}

	// Find the best spot on the side of this state to go towards the point,
	// reaching the point in the horiz/vert direction desired
	bestAnchorFromStateTowards(state, x, y, horiz=false) {
		const [x1,y1,w,h] = state.xywh;
		x -= x1;
		y -= y1;
		let side;
		if (horiz) side = (y<0) ? 'N' : (y>h) ? 'S' : (x < w/2) ? 'W' : 'E';
		else       side = (x<0) ? 'W' : (x>w) ? 'E' : (y < h/2) ? 'N' : 'S';
		const offset = (side==='N' || side==='S') ? x : y;
		return anchorOnState(state, side, offset);
	}

	addWayline(axis=null) {
		const anchors = this.anchors.filter(a => !a.injected);
		const xy = axis.toLowerCase();
		const newAnchor = {axis};
		const anchorIndex = anchors.length-1;
		anchors.splice(anchorIndex, 0, newAnchor);
		let i;
		for (i=anchorIndex-1; anchors[i] && !(xy in anchors[i]); --i){}
		const prevValue = anchors[i][xy];
		for (i=anchorIndex+1; anchors[i] && !(xy in anchors[i]); ++i){}
		const nextValue = anchors[i][xy];
		const delta = nextValue - prevValue;
		newAnchor.offset = newAnchor[xy] = prevValue + Math.round(delta/3);
		this.anchors = anchors;
		this.placeSelectors();
		// this.reroute();
	}

	checkCondition() {
		this._vse.main.classList.toggle('conditional',   this.condition);
		this._vse.main.classList.toggle('conditionless', !this.condition);
	}

	checkEvent() {
		// Add non-breaking spaces before/after to hack horizontal offset for label placement
		this._vse.label.textContent = `\xa0${this.event}\xa0`;
		this._vse.main.classList.toggle('event',     this.event);
		this._vse.main.classList.toggle('eventless', !this.event);
	}

	checkTarget() {
		const hasTarget = this.targetsOtherState && this.targetIsValid;
		this._vse.main.classList.toggle('targeted',   hasTarget);
		this._vse.main.classList.toggle('targetless', !hasTarget);
		this._vse.main.classList.toggle('targeterror', !this.targetIsValid);
	}

	updateStyleForExecutable() {
		// We check for child elements instead of scripts collection to account for non-script actions
		this._vse.main.classList.toggle('actions',    this.childElementCount);
		this._vse.main.classList.toggle('actionless', !this.childElementCount);
	}

	updateAttribute(attrNS, attrName) {
		let recognized = false;
		switch (attrName) {
			case 'target':
				this.checkTarget();
				// Intentional flow through
			case 'pts':
			case 'radius':
			case 'offset':
			case 'align':
				this.reroute();
				recognized = true;
			break;
			case 'event':
				this.checkEvent();
				recognized = true;
			break;
		}
		return recognized;
	}

	onZoomChanged() {
	}

	get radius() {
		// This (intentionally) prevents completely square corners by ignoring values of 0
		return this.getAttributeNS(visualNS, 'r')*1 || this._vse.editor.maxRadius || null;
	}
	set radius(r) {
		// This (intentionally) prevents completely square corners by ignoring values of 0
		if (r) {
			this.setAttributeNS(visualNS, 'r', r*1);
		} else {
			this.removeAttributeNS(visualNS, 'r');
		}
		this.reroute();
	}

	get labelOffsets() {
		const offset = this.getAttributeNS(visualNS, 'offset');
		if (!offset) {
			return [this._vse.editor.eventLabelOffset, 0];
		} else {
			if (offset.indexOf(' ')>=0) {
				return offset.split(/\s+/, 2).map(Number);
			} else {
				return [offset*1, 0];
			}
		}
	}
	set labelOffsets(valueOrValues) {
		let attrValue = valueOrValues;
		if (Array.isArray(valueOrValues)) {
			if (!valueOrValues[1]) {
				valueOrValues.length = 1;
			} else if (valueOrValues[0]==='') {
				valueOrValues[0] = 0;
			}
			attrValue = valueOrValues.join(' ').trim();
		}
		if (attrValue && attrValue!=='0') {
			this.setAttributeNS(visualNS, 'offset', attrValue);
		} else {
			this.removeAttributeNS(visualNS, 'offset');
		}
	}

	get labelMainOffset() {
		return this.getAttributeNS(visualNS, 'offset') && this.labelOffsets[0];
	}
	set labelMainOffset(offset) {
		const offsets = this.labelOffsets;
		offsets[0] = offset;
		this.labelOffsets = offsets;
	}

	get labelCrossOffset() {
		return this.getAttributeNS(visualNS, 'offset') && this.labelOffsets[1];
	}
	set labelCrossOffset(offset) {
		const offsets = this.labelOffsets;
		offsets[1] = offset;
		this.labelOffsets = offsets;
	}

	get align() {
		return this.getAttributeNS(visualNS, 'align');
	}
	set align(align) {
		if (align) this.setAttributeNS(visualNS, 'align', align);
		else       this.removeAttributeNS(visualNS, 'align');
	}

	// Returns ~ {side:'N', offset:80, x:120, y:210}
	get sourceAnchor() {
		if (this.pts) {
			const anchor = this.anchors[0];
			if (anchor?.side || anchor?.auto) return anchor;
		}
	}
	set sourceAnchor(anchor) {
		if (anchor) {
			const anchors = this.anchors;
			if (anchors && anchors[0]) {
				if (anchors[0].side || anchors[0].auto) anchors[0] = anchor;
				else anchors.splice(0, 0, anchor);
				this.anchors = anchors;
			} else this.anchors = [anchor];
		} else this.anchors = [];
	}

	get sourceAnchorSide() {
		const anchor = this.sourceAnchor;
		if (anchor && !anchor.auto) return anchor.side;
	}
	set sourceAnchorSide(side) {
		this.sourceAnchor = side && {side, offset:this.sourceAnchorOffset||0};
	}

	get sourceAnchorOffset() {
		const anchor = this.sourceAnchor;
		return anchor && anchor.offset;
	}
	set sourceAnchorOffset(offset) {
		const sourceAnchor = this.sourceAnchor;
		this.sourceAnchor = sourceAnchor && {side:sourceAnchor.side, offset:offset||0};
	}

	get targetAnchor() {
		if (this.pts) {
			const anchors = this.anchors;
			const lastAnchor = anchors[anchors.length-1];
			if (lastAnchor?.side || lastAnchor?.auto) return lastAnchor;
		}
	}
	set targetAnchor(anchor) {
		const anchors = this.anchors;
		if (anchor) {
			const last = anchors[anchors.length-1];
			if (last?.side || last?.auto) {

			}
			if (anchors.length)
			if (anchors.length===1) anchors.push(anchor);
			else anchors[anchors.length-1] = anchor;
		} else {
			const last = anchors[anchors.length-1];
			if (last && 'x' in last && 'y' in last) anchors.pop();
			// If there's an explicit source anchor, make up an explicit target
			if (anchors.length) anchors.push(this.bestAnchors().pop());
		}
		this.anchors = anchors;
	}

	get targetAnchorSide() {
		const anchor = this.targetAnchor;
		if (anchor && !anchor.auto) return anchor.side;
	}
	set targetAnchorSide(side) {
		this.targetAnchor = side && this.target && {side, offset:this.targetAnchorOffset||0};
	}

	get targetAnchorOffset() {
		const anchor = this.targetAnchor;
		return anchor && anchor.offset;
	}
	set targetAnchorOffset(offset) {
		const targetAnchor = this.targetAnchor;
		this.targetAnchor = targetAnchor && {side:targetAnchor.side, offset:offset||0};
	}

	get anchors() {
		if (this._anchors) return this._anchors;

		const pts = this.pts;
		if (!this.pts) return this.bestAnchors();
		const source=this.source, target=this.target;
		let anchors = [], regex = /a|([NSEWXY])\s*(\S+)/g;
		let match;
		while (match=regex.exec(pts)) {
			const [auto, direction, offset] = match;
			if (auto==='a') anchors.push({auto:true});
			else switch (direction) {
				case 'X': anchors.push({axis:direction, offset:offset, x:offset*1, horiz:false}); break;
				case 'Y': anchors.push({axis:direction, offset:offset, y:offset*1, horiz:true }); break;
				default:
					const state = anchors.length ? target : source;
					const anchor = anchorOnState(state, direction, offset*1, state===source, true);
					if (anchor) anchors.push(anchor);
			}
		}
		if (anchors.length===0) return this.bestAnchors();

		// add 'auto' anchors at front and back if needed
		if (anchors[0].axis) anchors.unshift({auto:true});
		if (this.target && (anchors.length===1 || anchors[anchors.length-1].axis)) {
			anchors.push({auto:true});
		}

		// remove any 'auto' anchors in the middle
		anchors = anchors.filter((a,i) => (i===0) || (i===anchors.length-1) || (!a.auto));
		if (!this.target) anchors.length = 1;
		if (anchors.every(a => a.auto)) return this.bestAnchors();

		const last = anchors.length-1;
		// Add both auto anchors before resolving, so the first can use the second for resolution
		if (anchors[0].auto) anchors[0] = this.source.bestAnchorTowards(anchors[1]);
		if (anchors[last].auto) anchors[last] = this.target.bestAnchorTowards(anchors[last-1]);
		if (anchors[0].auto) resolveAutoAnchor(anchors, true);
		if (anchors[last].auto) resolveAutoAnchor(anchors, false);

		return this._anchors = anchors;

		function resolveAutoAnchor(anchors, forward) {
			if (!forward) anchors = anchors.slice().reverse();
			const anchor0 = anchors[0];
			for (const axis of ['x','y']) {
				if (!(axis in anchor0)) {
					const rangeName = `${axis}Range`,
						  optsName  = `${axis}Options`,
						  noOptsErr = new Error(`State anchors must have one of .${axis}, .${rangeName}, or .${optsName}`);
					let foundValue;
					for (let i=1; i<anchors.length && foundValue===undefined; i++) {
						if (axis in anchors[i]) foundValue = anchors[i][axis];
					}
					const [min0, max0] = anchor0[rangeName] || anchor0[optsName];
					const mid0 = (min0 + max0) / 2;
					if (foundValue !== undefined) {
						if (anchor0[rangeName]) {
							anchor0[axis] = Math.min(Math.max(foundValue, min0), max0);
						} else if (anchor0[`${axis}Options`]) {
							anchor0[axis] = (Math.abs(foundValue-min0) < Math.abs(foundValue-max0)) ? min0 : max0;
						} else throw noOptsErr;
					} else {
						const anchorΩ = anchors[anchors.length-1];
						const [minΩ, maxΩ] = anchorΩ[rangeName] || anchorΩ[optsName];
						const midΩ = (minΩ + maxΩ) / 2;
						let best;
						if (anchor0[rangeName]) {
							if (anchorΩ[rangeName]) {
								if (max0 <= minΩ)      best = (max0 + minΩ) / 2;
								else if (maxΩ <= min0) best = (min0 + maxΩ) / 2;
								else { // the ranges overlap
									if      (max0 < maxΩ && min0 > minΩ) best = (min0 + max0) / 2;
									else if (maxΩ < max0 && minΩ > min0) best = (minΩ + maxΩ) / 2;
									else if (minΩ < max0)                best = (minΩ + max0) / 2;
									else                                 best = (min0 + maxΩ) / 2;
								}
							} else if (anchorΩ[optsName]) {
								// TODO: maybe the first two branches produce the same result as the last?
								if      (min0 <= minΩ && minΩ <= max0) best = minΩ;
								else if (min0 <= maxΩ && maxΩ <= max0) best = maxΩ;
								else best = (Math.abs(minΩ - mid0) < Math.abs(maxΩ - mid0)) ? minΩ : maxΩ;
							} else throw noOptsErr;
						} else if (anchor0[optsName]) {
							if (anchorΩ[rangeName]) {
								// TODO: maybe the first two branches produce the same result as the last?
								if      (minΩ <= min0 && min0 <= maxΩ) best = min0;
								else if (minΩ <= max0 && max0 <= maxΩ) best = max0;
								else best = (Math.abs(min0 - midΩ) < Math.abs(max0 - midΩ)) ? min0 : max0;
							} else if (anchorΩ[optsName]) {
								const [,best0, bestΩ] = [
									[Math.abs(min0 - minΩ), min0, minΩ],
									[Math.abs(min0 - maxΩ), min0, maxΩ],
									[Math.abs(max0 - maxΩ), max0, maxΩ],
									[Math.abs(max0 - minΩ), max0, minΩ]
								].sort((a,b) => a[0]-b[0])[0];
								anchor0[axis] = best0;
								anchorΩ[axis] = bestΩ;
							} else throw noOptsErr;
						} else throw noOptsErr;
						if (best !== undefined) {
							// FIXME: I think this might futz up an "option" by allowing an intermediate value
							anchor0[axis] = Math.min(Math.max(best, min0), max0);
							anchorΩ[axis] = Math.min(Math.max(best, minΩ), maxΩ);
						}
					}
				}
			}
		}
	}
	set anchors(anchors) {
		this.pts = anchors.filter(a => !a.auto).map(a => [a.side||a.axis, Math.round(a.offset)].join('') ).join(' ');
		delete this._anchors;
	}

	get pts() { return this.getAttributeNS(visualNS, 'pts'); }
	set pts(str) {
		if (str) this.setAttributeNS(visualNS, 'pts', str);
		else     this.removeAttributeNS(visualNS, 'pts');
		delete this._anchors;
	}
}

// ****************************************************************************

// state: a state node
// side: 'N', 'S', 'E', 'W'
// offset: a distance along that edge
function anchorOnState(state, side, offset, isStartState, isRealAnchor=false) {
	if (!state) return;
	const rad = state.cornerRadius;
	let [x,y,w,h] = state.xywh;
	const [l,t,r,b] = [x+rad, y+rad, x+w-rad, y+h-rad];
	const anchor = {x, y, horiz:true, side, offset, auto:!isRealAnchor};
	if (isStartState!==undefined) anchor.start=isStartState;
	if (side==='N' || side==='S') {
		anchor.horiz = false;
		anchor.x += offset;
		if (anchor.x<l) anchor.x=l;
		else if (anchor.x>r) anchor.x=r;
		if (side==='S') anchor.y+=h;
	}
	if (side==='W' || side==='E') {
		anchor.y += offset;
		if (anchor.y<t) anchor.y=t;
		else if (anchor.y>b) anchor.y=b;
		if (side==='E') anchor.x+=w;
	}
	return anchor;
}

function svgPathFromAnchors(anchors, maxRadius=Infinity) {
	if (anchors.length===1) {
		const [x,y] = [anchors[0].x,anchors[0].y];
		return `M${x},${y}M${x-5},${y+0.01}A5,5,0,1,0,${x-5},${y-0.01}M${x},${y}`;
	}

	// Duplicate the anchors so changes we make don't affect the originals
	anchors = anchors.map(a => Object.assign({},a));

	// Ensure that the anchors on both ends have a single, explicit `x` and `y` coordinates
	resolveStateAnchor(anchors, true);
	resolveStateAnchor(anchors, false);

	// Remove inline points that are perfectly aligned to neighbors
	for (let i=1; i<anchors.length-1; ++i) {
		const axis = anchors[i-1].horiz ? 'y' : 'x';
		if ((axis in anchors[i-1]) &&
			(anchors[i-1][axis] === anchors[i+1][axis]) &&
			(!(axis in anchors[i]) || (anchors[i][axis] === anchors[i-1][axis]))) {
			anchors.splice(i--, 1);
		}
	}

	// Inject (unanchored) waylines as needed
	for (let i=1; i<anchors.length; ++i) {
		const prev = anchors[i-1];
		const next = anchors[i];
		const mainAxis = prev.horiz ? 'y' : 'x';
		if (prev.horiz == next.horiz && next[mainAxis] !== prev[mainAxis]) {
			anchors.splice(i--, 0, {horiz:!prev.horiz, injected:true});
		}
	}

	const corners = findCorners(anchors);
	return svgPathFromCorners(corners, maxRadius || Infinity);
}

function resolveStateAnchor(anchors, forward) {
	if (!forward) anchors = anchors.slice().reverse();
	const anchor0 = anchors[0];
	for (const axis of ['x','y']) {
		if (!(axis in anchor0)) {
			const rangeName = `${axis}Range`,
				  optsName  = `${axis}Options`,
				  noOptsErr = new Error(`State anchors must have one of .${axis}, .${rangeName}, or .${optsName}`);
			let foundValue;
			for (let i=1; i<anchors.length && foundValue===undefined; i++) {
				if (axis in anchors[i]) foundValue = anchors[i][axis];
			}
			const [min0, max0] = anchor0[rangeName] || anchor0[optsName];
			const mid0 = (min0 + max0) / 2;
			if (foundValue !== undefined) {
				if (anchor0[rangeName]) {
					anchor0[axis] = Math.min(Math.max(foundValue, min0), max0);
				} else if (anchor0[`${axis}Options`]) {
					anchor0[axis] = (Math.abs(foundValue-min0) < Math.abs(foundValue-max0)) ? min0 : max0;
				} else throw noOptsErr;
			} else {
				const anchorΩ = anchors[anchors.length-1];
				const [minΩ, maxΩ] = anchorΩ[rangeName] || anchorΩ[optsName];
				const midΩ = (minΩ + maxΩ) / 2;
				let best;
				if (anchor0[rangeName]) {
					if (anchorΩ[rangeName]) {
						if (max0 <= minΩ)      best = (max0 + minΩ) / 2;
						else if (maxΩ <= min0) best = (min0 + maxΩ) / 2;
						else { // the ranges overlap
							if      (max0 < maxΩ && min0 > minΩ) best = (min0 + max0) / 2;
							else if (maxΩ < max0 && minΩ > min0) best = (minΩ + maxΩ) / 2;
							else if (minΩ < max0)                best = (minΩ + max0) / 2;
							else                                 best = (min0 + maxΩ) / 2;
						}
					} else if (anchorΩ[optsName]) {
						// TODO: maybe the first two branches produce the same result as the last?
						if      (min0 <= minΩ && minΩ <= max0) best = minΩ;
						else if (min0 <= maxΩ && maxΩ <= max0) best = maxΩ;
						else best = (Math.abs(minΩ - mid0) < Math.abs(maxΩ - mid0)) ? minΩ : maxΩ;
					} else throw noOptsErr;
				} else if (anchor0[optsName]) {
					if (anchorΩ[rangeName]) {
						// TODO: maybe the first two branches produce the same result as the last?
						if      (minΩ <= min0 && min0 <= maxΩ) best = min0;
						else if (minΩ <= max0 && max0 <= maxΩ) best = max0;
						else best = (Math.abs(min0 - midΩ) < Math.abs(max0 - midΩ)) ? min0 : max0;
					} else if (anchorΩ[optsName]) {
						const [,best0, bestΩ] = [
							[Math.abs(min0 - minΩ), min0, minΩ],
							[Math.abs(min0 - maxΩ), min0, maxΩ],
							[Math.abs(max0 - maxΩ), max0, maxΩ],
							[Math.abs(max0 - minΩ), max0, minΩ]
						].sort((a,b) => a[0]-b[0])[0];
						anchor0[axis] = best0;
						anchorΩ[axis] = bestΩ;
					} else throw noOptsErr;
				} else throw noOptsErr;
				if (best !== undefined) {
					// FIXME: I think this might futz up an "option" by allowing an intermediate value
					anchor0[axis] = Math.min(Math.max(best, min0), max0);
					anchorΩ[axis] = Math.min(Math.max(best, minΩ), maxΩ);
				}
			}
		}
	}
}

function findCorners(anchors) {
	let last = anchors[0];
	const pts = [last];
	for (let i=1; i<anchors.length; ++i) {
		const prev = anchors[i-1];
		const next = anchors[i];
		const mainAxis = prev.horiz ? 'y' : 'x';
		const crosAxis = prev.horiz ? 'x' : 'y';

		// Skip if the next point is perfectly aligned in the direction we're headed
		if (next[mainAxis] !== prev[mainAxis]) {
			const pt = {[mainAxis]:prev[mainAxis]};

			if (crosAxis in next) {
				pt[crosAxis] = next[crosAxis];
			} else {
				let nextValidValue;
				// Find the next anchor with the axis value we need,
				// and divide the space between here and there evenly
				const crosAnchors = [pt, next];
				// We cannot guarantee that the horiz values alternate, so step one at a time
				for (let j=i+1; j<anchors.length && nextValidValue===undefined; j++) {
					const anchor = anchors[j];
					if (crosAxis in anchor) nextValidValue = anchor[crosAxis];
					else if (anchor.horiz==next.horiz) crosAnchors.push(anchor);
				}

				// there is ~no chance nextValidValue will be undefined, as the final anchor should/must have x/y values after `resolveStateAnchor`
				const step = (nextValidValue - last[crosAxis]) / (crosAnchors.length);
				for (const [i,a] of crosAnchors.entries()) a[crosAxis] = last[crosAxis] + step * i;
			}
			if (crosAxis in next) {
				pt[crosAxis] = next[crosAxis];
			} else {
				// we never were able to resolve this axis, what do we do?
			}
			pts.push(pt);
			last = pt;
		}
	}

	const finalAnchor = anchors[anchors.length-1];
	if (last.x !== finalAnchor.x || last.y !== finalAnchor.y) {
		pts.push(finalAnchor);
	}

	return pts;
}

function svgPathFromCorners(pts, maxRadius=1000) {
	// Precalculate inter-point distances
	for (let i=1; i<pts.length; ++i) {
		const pt = pts[i-1];
		const {x:x1, y:y1} = pt,
		      {x:x2, y:y2} = pts[i];
		pt.distanceToNext = Math.hypot(x2-x1, y2-y1);
		pt.horiz = y1===y2;
	}

	// Crawl along the point triplets, calculating curves
	let lastCmd = {c:'M', x:pts[0].x, y:pts[0].y};
	let cmds = [lastCmd];
	for (let i=1; i<pts.length-1; ++i) {
		const [a,b,c] = [pts[i-1], pts[i], pts[i+1]];
		const radius = Math.min(a.distanceToNext/2, b.distanceToNext/2, maxRadius);

		let x=a.horiz ? (a.x<b.x ? b.x-radius : b.x+radius) : a.x;
		let y=a.horiz ? a.y : (a.y<b.y ? b.y-radius : b.y+radius);
		if (x!==lastCmd.x || y!==lastCmd.y) {
			lastCmd = {c:'L', x:x, y:y};
			cmds.push(lastCmd);
		}

		x = b.x + (b.horiz ? (c.x>b.x ? radius : -radius) : 0);
		y = b.y + (b.horiz ? 0 : (c.y>b.y ? radius : -radius));

		if (x===lastCmd.x || y===lastCmd.y) lastCmd = {c:'L', x:x, y:y};
		else                                lastCmd = {c:'A', x1:b.x, y1:b.y, x:x, y:y, r:radius};
		cmds.push(lastCmd);
	}
	const last = pts[pts.length-1];
	cmds.push({c:'L', x:last.x, y:last.y});

	let x,y;
	return cmds.map(cmd => {
		let result;
		switch (cmd.c) {
			case 'M':
			case 'L':
				result = `${cmd.c}${cmd.x},${cmd.y}`;
			break;
			case 'A':
				const angle = (cmd.y1-y)*(cmd.x-cmd.x1)-(cmd.y-cmd.y1)*(cmd.x1-x);
				result = `A${cmd.r},${cmd.r},0,0,${angle<0?1:0},${cmd.x},${cmd.y}`;
			break;
		}
		x = cmd.x;
		y = cmd.y;
		return result;
	}).join('');
}

function setAttributes(node, attr={}) {
	for (const k of Object.keys(attr)) {
		node.setAttribute(k, attr[k]);
	}
}

export function makeEl(name, opts={}) {
	const el = document.createElementNS(SVGNS, name);
	for (const k of Object.keys(opts)){
		switch(k){
			case '_dad':
				opts[k].appendChild(el);
			break;

			case '_text':
				el.appendChild(document.createTextNode(opts[k]));
			break;

			default:
				el.setAttribute(k, opts[k]);
		}
	}
	return el;
}

function toHex255(n) {
	return (Math.round(n)%256).toString(16).padStart(2,'0');
}

function getStyle(sheetTitle, selectorText) {
	for (const sheet of document.styleSheets) {
		if (sheet.title === sheetTitle) {
			for (const rule of sheet.cssRules) {
				if (rule.selectorText===selectorText) {
					return rule;
				}
			}
			return;
		}
	}
}

function deindent(str) {
	str = str.replace(/^(?:\r?\n)+/, '').replace(/\s+$/, '');
	const shortest = (str.match(/^[ \t]*/g) || []).sort((a,b) => a.length-b.length)[0];
	return shortest ? str.replace(new RegExp('^'+shortest, 'gm'), '') : str;
}

// Calculate the bounding box of an element with respect to its parent element
function transformedBoundingBox(el){
	const bb  = el.getBBox(),
	      svg = el.ownerSVGElement;
	const m = el.parentNode.getScreenCTM().inverse().multiply(el.getScreenCTM());

	// Create an array of all four points for the original bounding box
	var pts = [
		svg.createSVGPoint(), svg.createSVGPoint(),
		svg.createSVGPoint(), svg.createSVGPoint()
	];
	pts[0].x=bb.x;          pts[0].y=bb.y;
	pts[1].x=bb.x+bb.width; pts[1].y=bb.y;
	pts[2].x=bb.x+bb.width; pts[2].y=bb.y+bb.height;
	pts[3].x=bb.x;          pts[3].y=bb.y+bb.height;

	// Transform each into the space of the parent,
	// and calculate the min/max points from that.
	var xMin=Infinity,xMax=-Infinity,yMin=Infinity,yMax=-Infinity;
	pts.forEach(function(pt){
		pt = pt.matrixTransform(m);
		xMin = Math.min(xMin,pt.x);
		xMax = Math.max(xMax,pt.x);
		yMin = Math.min(yMin,pt.y);
		yMax = Math.max(yMax,pt.y);
	});

	// Update the bounding box with the new values
	bb.x = xMin; bb.width  = xMax-xMin;
	bb.y = yMin; bb.height = yMax-yMin;
	return bb;
}

// https://stackoverflow.com/a/23684202/405017
function calculateViewport(svg) {
	var style    = getComputedStyle(svg),
		owidth   = parseInt(style.width,10),
		oheight  = parseInt(style.height,10),
		aspect   = svg.preserveAspectRatio.baseVal,
		viewBox  = svg.viewBox.baseVal,
		width    = viewBox && viewBox.width  || owidth,
		height   = viewBox && viewBox.height || oheight,
		x        = viewBox ? viewBox.x : 0,
		y        = viewBox ? viewBox.y : 0;
	if (!width || !height || !owidth || !oheight) return;
	if (aspect.align===aspect.SVG_PRESERVEASPECTRATIO_NONE || !viewBox || !viewBox.height){
	  return {x:x,y:y,width:width,height:height};
	}else{
	  var inRatio  = viewBox.width / viewBox.height,
		  outRatio = owidth / oheight;
	  var meetFlag = aspect.meetOrSlice !== aspect.SVG_MEETORSLICE_SLICE;
	  var fillAxis = outRatio>inRatio ? (meetFlag?'y':'x') : (meetFlag?'x':'y');
	  if (fillAxis==='x'){
		height = width/outRatio;
		var diff = viewBox.height - height;
		switch (aspect.align){
		  case aspect.SVG_PRESERVEASPECTRATIO_UNKNOWN:
		  case aspect.SVG_PRESERVEASPECTRATIO_XMINYMID:
		  case aspect.SVG_PRESERVEASPECTRATIO_XMIDYMID:
		  case aspect.SVG_PRESERVEASPECTRATIO_XMAXYMID:
			y += diff/2;
		  break;
		  case aspect.SVG_PRESERVEASPECTRATIO_XMINYMAX:
		  case aspect.SVG_PRESERVEASPECTRATIO_XMIDYMAX:
		  case aspect.SVG_PRESERVEASPECTRATIO_XMAXYMAX:
			y += diff;
		  break;
		}
	  }
	  else{
		width = height*outRatio;
		var diff = viewBox.width - width;
		switch (aspect.align){
		  case aspect.SVG_PRESERVEASPECTRATIO_UNKNOWN:
		  case aspect.SVG_PRESERVEASPECTRATIO_XMIDYMIN:
		  case aspect.SVG_PRESERVEASPECTRATIO_XMIDYMID:
		  case aspect.SVG_PRESERVEASPECTRATIO_XMIDYMAX:
			x += diff/2;
		  break;
		  case aspect.SVG_PRESERVEASPECTRATIO_XMAXYMID:
		  case aspect.SVG_PRESERVEASPECTRATIO_XMAXYMIN:
		  case aspect.SVG_PRESERVEASPECTRATIO_XMAXYMAX:
			x += diff;
		  break;
		}
	  }
	  return {x:x,y:y,width:width,height:height};
	}
  }