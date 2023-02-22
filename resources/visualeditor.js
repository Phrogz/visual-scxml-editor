/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable curly */
'use strict';

const SSE = {};
const xmlNS = "http://www.w3.org/2000/xmlns/";
const svgNS = 'http://www.w3.org/2000/svg';
const visualNS  = 'http://phrogz.net/visual-scxml';

SSE.Editor = function(svg, scxmlDoc) {
    this.svg = svg;

    this.removeDocument();

    this.gridSize   = 10;
    this.gridActive = true;

    document.body.addEventListener('mousedown', this.select.bind(this), false);
    document.body.addEventListener('keydown',   this.onKeydown.bind(this), false);
    document.body.addEventListener('keyup',     this.onKeyup.bind(this), false);
    document.body.addEventListener('mousewheel',this.onMousewheel.bind(this), false);

    this.dragger.addEventListener('mousedown', this.startPanning.bind(this), false);

    if (scxmlDoc) this.useSCXML(scxmlDoc);
};

Object.defineProperties(SSE.Editor.prototype, {
    maxRadius: {
        get() {
            return this._maxRadius || 100;
        },
        set(r) {
            this._maxRadius = r || Infinity;
            if (this.scxmlDoc) this.scxmlDoc.transitions.forEach(t => t.reroute());
        }
    },

    eventLabelOffset: {
        get() {
            return this._eventLabelOffset || 3;
        },
        set(o) {
            this._eventLabelOffset = o;
            if (this.scxmlDoc) this.scxmlDoc.transitions.forEach(t => t.reroute());
        }
    },

    showEvents: {
        get() {
            return this._showEvents!==false;
        },
        set(b) {
            this._showEvents=!!b;
            getStyle('mutable', '.transition text').style.display = this._showEvents ? 'block' : 'none';
        }
    },

    zoomFactor: {
        get() {
            const p1 = this.pointFromScreen(0, 0);
            const p2 = this.pointFromScreen(1, 0);
            return p2.x-p1.x;
        }
    },

    extents: {
        get() {
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
    },
});

SSE.Editor.prototype.useSCXML = function(scxmlDoc) {
    // Set the visual namespace on the document root so that new documents don't get it added to each state/transition touched
    const existingNSPrefix = Array.from(scxmlDoc.root.attributes).find(a => a.value===visualNS && a.namespaceURI===xmlNS);
    if (!existingNSPrefix) scxmlDoc.root.setAttributeNS(xmlNS, 'xmlns:viz', visualNS);

    // Used to prevent notification back to document for changes occuring from this load
    this.justLoaded = true;
    const firstLoad = !this.scxmlDoc;

    while (this.selectors.firstChildNode) this.selectors.removeChild(this.selectors.firstChildNode);

    const previousSelection = [];
    for (const o of this.selection) {
        // TODO: use heuristics beyond absolute ID to try to identify selection when IDs change.
        previousSelection.push(o);
    }

    // TODO: check for valid document before clearing house
    if (this.scxmlDoc) this.removeDocument();
    this.scxmlDoc = scxmlDoc;
    this.observer = new MutationObserver(this.onDocChange.bind(this));
    this.observer.observe(scxmlDoc.root, {childList:true, attributes:true, subtree:true, attributeOldValue:true});

    Object.setPrototypeOf(SSE.State, scxmlDoc.StateProto);
    Object.setPrototypeOf(SSE.Transition, scxmlDoc.TransitionProto);

    // Turn off the snapping grid when setting the initial positions of items
    this.gridActive = false;
    scxmlDoc.states.forEach(this.addState.bind(this));
    scxmlDoc.transitions.forEach(this.addTransition.bind(this));
    this.gridActive = true;

    if (firstLoad) {
        this.zoomToExtents();

        // TODO: this hack 'fixes' the zoom; something changes slightly after the initial zoom
        // However, it also causes a visual adjustment right after load. Gross. Why does initial zoom
        // not work exactly the same as later zooms?
        // setTimeout(this.zoomToExtents.bind(this), 1);
    }

    // Restore the selection as best as possible
    for (const o of previousSelection) {
        if (o.isState) {
            const state = this.scxmlDoc.getStateById(o.id);
            if (state) {
                this.selection.push(state);
                state.select();
            }
        } else if (o.isTransition) {
            const state = this.scxmlDoc.getStateById(o.sourceId);
            if (state) {
                let candidateTransitions = state.transitions ? state.transitions.filter(t => t.targetId===o.targetId) : [];
                if (candidateTransitions.length>1) candidateTransitions = candidateTransitions.filter(t => t.event===o.evt);
                if (candidateTransitions[0]) {
                    this.selection.push(candidateTransitions[0]);
                    candidateTransitions[0].select();
                }
            }
        }
    }
    this.onSelectionChanged(this.selection);
};

SSE.Editor.prototype.removeDocument = function() {
    if (this.scxmlDoc) {
        this.shadows.remove();
        this.content.remove();
        this.transitions.remove();
        this.selectors.remove();
        this.dragger.remove();
    }

    this.shadows     = make('g', {_dad:this.svg, id:'shadows'});
    this.content     = make('g', {_dad:this.svg, id:'content'});
    this.transitions = make('g', {_dad:this.svg, id:'transitions'});
    this.selectors   = make('g', {_dad:this.svg, id:'selectors'});
    this.dragger     = make('rect', {_dad:this.svg, fill:'none', id:'dragger'});
    this.selection = [];
    delete this.scxmlDoc;
};

SSE.Editor.prototype.addState = function(state) {
    // The root SCXML element does not get displayed visually
    if (state===this.scxmlDoc.root) return;
    Object.setPrototypeOf(state, SSE.State);
    state.initialize(this);
};

SSE.Editor.prototype.addTransition = function(tran) {
    if (tran.parentNode.isState) {
        Object.setPrototypeOf(tran, SSE.Transition);
        tran.initialize(this);
    } else {
        // TODO: raise this at the editor level so that editors can use it (e.g. send this to the VS Code debug console)
        console.error(`SCXML Editor ignoring transition as a child of ${tran.parentNode.nodeName}`);
    }
};

SSE.Editor.prototype.makeDraggable = function(el, obj) {
    el.addEventListener('mousedown', evt => {
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
        document.body.addEventListener('mousemove', onmove, false);
        document.body.addEventListener('mouseup',() => {
            document.body.removeEventListener('mousemove',onmove,false);
            if (obj.finishDragging) obj.finishDragging(sandbox);
            this.draggingActive = false;
            if (this.notifyWhenDoneDragging) {
                this.scxmlDoc.dispatchEvent(new CustomEvent('changed'));
                this.notifyWhenDoneDragging = false;
            }
        }, false);
    }, false);
};

SSE.Editor.prototype.select = function(evt, item){
    if (evt.type==='mousedown' && evt.which===2) {
        // middle mouse button down
        return this.startPanning(evt);
    }

    const oldSelection = this.selection.concat();
    if (!evt.shiftKey) {
        this.selection.forEach(i => i.deselect());
        this.selection.length = 0;
    }
    if (item) {
        this.selection.push(item);
        item.select();
    }
    if (this.onSelectionChanged) {
        let anyChanged = oldSelection.length!==this.selection.length;
        if (!anyChanged) {
            for (let i=this.selection.length;i--;) {
                if (this.selection[i]!==oldSelection[i]) {
                    anyChanged = true;
                    break;
                }
            }
        }
        if (anyChanged) this.onSelectionChanged(this.selection);
    }
};

SSE.Editor.prototype.onKeydown = function(evt) {
    switch (evt.code) {
        case 'KeyE':
            this.showEvents = !this.showEvents;
            evt.preventDefault();
        break;

        case 'KeyZ':
            if (evt.altKey) {
                if (evt.metaKey || evt.ctrlKey) this.zoomToExtents();
                else if (evt.shiftKey) this.zoomTo100();
            }
        break;

        case 'Space':
            this.enableDragPan();
        break;
    }
};

SSE.Editor.prototype.onKeyup = function(evt) {
    switch (evt.key) {
        case ' ':
            this.disableDragPan();
        break;
    }
};

SSE.Editor.prototype.onMousewheel = function(evt) {
    if (evt.ctrlKey) {
        // TODO: detect trackpad and divide by only ~20
        const delta = evt.deltaY/300;
        const multiplier = 1/(delta>0 ? (1+delta) : (1/(1-delta)));
        const mouseLoc = this.pointFromScreen(evt.clientX, evt.clientY);
        this.zoomBy(multiplier, mouseLoc.x, mouseLoc.y);
    } else if (evt.shiftKey) {
        this.panBy(evt.deltaY*this.zoomFactor, evt.deltaX*this.zoomFactor);
    } else {
        this.panBy(evt.deltaX*this.zoomFactor, evt.deltaY*this.zoomFactor);
    }
};

SSE.Editor.prototype.enableDragPan = function() {
    if (!this.dragEnabled) {
        // TODO: ensure that this fully covers the view even after panning
        this.dragger.setAttribute('x', -5e4);
        this.dragger.setAttribute('y', -5e4);
        this.dragger.setAttribute('width',  1e5);
        this.dragger.setAttribute('height', 1e5);
        this.dragger.style.fill = 'transparent';
        this.dragEnabled = true;
    }
};

SSE.Editor.prototype.startPanning = function(evt) {
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
        this.svg.viewBox.baseVal.x = start.vx - (evt.clientX-start.mx) * zoomFactor;
        this.svg.viewBox.baseVal.y = start.vy - (evt.clientY-start.my) * zoomFactor;
    };
    document.body.addEventListener('mousemove', onmove, false);
    document.body.addEventListener('mouseup',function(){
        document.body.removeEventListener('mousemove',onmove,false);
    },false);
};

SSE.Editor.prototype.disableDragPan = function() {
    this.dragger.style.fill = 'none';
    this.dragEnabled = false;
};

SSE.Editor.prototype.panBy = function(dx, dy) {
    this.svg.viewBox.baseVal.x += dx;
    this.svg.viewBox.baseVal.y += dy;
};

SSE.Editor.prototype.zoomBy = function(factor, cx=null, cy=null) {
    // Clamp the final zoom between 0.2 and 5.0
    const zoomFactor = this.zoomFactor;
    factor = Math.min(zoomFactor*5, Math.max(zoomFactor/5, factor));

    if (cx===null) cx = this.svg.viewBox.baseVal.x + this.svg.viewBox.baseVal.width/2;
    if (cy===null) cy = this.svg.viewBox.baseVal.y + this.svg.viewBox.baseVal.height/2;
    this.svg.viewBox.baseVal.x = cx - (cx-this.svg.viewBox.baseVal.x)/factor;
    this.svg.viewBox.baseVal.y = cy - (cy-this.svg.viewBox.baseVal.y)/factor;
    this.svg.viewBox.baseVal.width  /= factor;
    this.svg.viewBox.baseVal.height /= factor;
    if (factor!==1.0) this.onZoomChanged();
};

SSE.Editor.prototype.zoomToExtents = function() {
    const extents = this.extents;
    const buffer = 0.1;
    const oldZoom = this.zoomFactor;
    this.svg.viewBox.baseVal.x = extents.x - buffer * extents.width;
    this.svg.viewBox.baseVal.y = extents.y - buffer * extents.height;
    this.svg.viewBox.baseVal.width = extents.width * (1+buffer*2);
    this.svg.viewBox.baseVal.height = extents.height * (1+buffer*2);
    if (oldZoom!==this.zoomFactor) this.onZoomChanged();
};

SSE.Editor.prototype.zoomTo100 = function() {
    const oldZoom = this.zoomFactor;
    const extents = this.extents;
    this.zoomBy(this.zoomFactor, extents.x+extents.width/2, extents.y+extents.height/2);
    if (oldZoom!==this.zoomFactor) this.onZoomChanged();
};

SSE.Editor.prototype.onZoomChanged = function() {
    // Tell all the child states and transitions
    this.scxmlDoc.states.forEach(state => state.onZoomChanged());
    this.scxmlDoc.transitions.forEach(tran => tran.onZoomChanged());
};

SSE.Editor.prototype.pointFromScreen = function(x, y) {
    if (!this.pt) this.pt = this.svg.createSVGPoint();
    this.pt.x = x;
    this.pt.y = y;
    return this.pt.matrixTransform(this.svg.getScreenCTM().inverse());
};

SSE.Editor.prototype.snap = function(n) {
    if (this.gridActive) {
        if (n.map) n = n.map(v => Math.round(v/this.gridSize) * this.gridSize);
        else       n = Math.round(n/this.gridSize) * this.gridSize;
    }
    return n;
};

SSE.Editor.prototype.updateSelectors = function() {
    this.selection.forEach(o => o.placeSelectors && o.placeSelectors());
};

SSE.Editor.prototype.onDocChange = function(mutationList){
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
                            if (n._sse) n.checkContainment();
                            else this.addState(n);
                            n.parentNode.checkChildren();
                        break;

                        case 'transition':
                            if (n._sse) n.reroute();
                            else this.addTransition(n);
                        break;

                        case 'script':
                            const parent = n.parentNode;
                            switch (parent?.nodeName) {
                                case 'transition':
                                    parent.checkScripts();
                                break;
                                case 'onentry':
                                case 'onexit':
                                    parent.parentNode.checkScripts();
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

                if (anyScripts) this.scxmlDoc.states.forEach(s => s.checkScripts());
                if (anyStates)  this.scxmlDoc.states.forEach(s => s.checkChildren());
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
            this.scxmlDoc.dispatchEvent(new CustomEvent('changed'));
        }
    }
    this.justLoaded = false;
};

// ****************************************************************************
// ****************************************************************************
// ****************************************************************************

SSE.State = Object.defineProperties({
    cornerRadius         : 10,
    minWidth             : 30,
    minHeight            : 20,
    minParentWidth       : 50,
    minParentHeight      : 50,
    parallelHeaderHeight : 30,
    defaultLeafWidth     : 120,
    defaultLeafHeight    : 40,
    defaultParentWidth   : 220,
    defaultParentHeight  : 100,

    initialize(editor) {
        const ego = this._sse = {
            editor   : editor,
            shadow   : make('rect', {_dad:editor.shadows, rx:this.cornerRadius, ry:this.cornerRadius}),
            main     : make('g',    {_dad:editor.content, transform:'translate(0,0)', 'class':'state'}),
        };

        ego.tx = ego.main.transform.baseVal.getItem(0);
        ego.rect  = make('rect', {_dad:ego.main, rx:this.cornerRadius, ry:this.cornerRadius, 'class':'body'});
        ego.label = make('text', {_dad:ego.main, _text:this.id});
        ego.enter = make('path', {_dad:ego.main, d:'M0,0', 'class':'enter'});
        ego.exit  = make('path', {_dad:ego.main, d:'M0,0', 'class':'exit'});
        ego.dividerN  = make('line', {_dad:ego.main, y1:30, y2:30, 'class':'parallel-divider parallel-divider-h'});
        ego.dividerW  = make('line', {_dad:ego.main, 'class':'parallel-divider parallel-divider-v'});
        ego.dividerW2 = make('line', {_dad:ego.main, 'class':'parallel-divider parallel-divider-v2'});

        editor.makeDraggable(ego.main, this);

        // Force generation of default values and updating from DOM
        this.xywh = this.xywh;
        if (this.rgb) this.updateColor();

        this.checkScripts();
        this.checkChildren();
        this.updateLabel();

        ego.main.addEventListener('mousedown', evt=>{
            evt.stopPropagation();
            editor.select(evt, this);
        }, false);
    },

    startDragging(sandbox) {
        if (this.isParallelChild) return;
        // Re-order this state to the top
        sandbox.starts = new Map([this, ...this.descendants].map(n => [n, n.xy]));
        for (const [n,] of sandbox.starts) {
            n._sse.main.parentNode.appendChild(n._sse.main);
        }
    },

    handleDrag(dx, dy, sandbox) {
        if (this.isParallelChild) return;
        for (const [s,xy] of sandbox.starts) s.xy = [xy[0]+dx, xy[1]+dy];
        for (const [s,] of sandbox.starts) {
            s.transitions.forEach(t => t.reroute && t.reroute());
            s.incomingTransitions.forEach(t => t.reroute && t.reroute());
        }
        this._sse.editor.updateSelectors();
    },

    select() {
        if (!this._sse.main.classList.contains('selected')) {
            this._sse.main.classList.add('selected');
            if (!this.isParallelChild) this.createSelectors();
        }
    },

    deselect() {
        this._sse.main.classList.remove('selected');
        if (!this.isParallelChild) this.removeSelectors();
    },

    deleteGraphics() {
        this._sse.shadow.remove();
        this._sse.main.remove();
        this.removeSelectors();
        delete this._sse;
    },

    updateAttribute(attrNS, attrName) {
        const val = this.getAttributeNS(attrNS, attrName);
        const ego = this._sse;
        let recognized = false;
        switch (attrName) {
            case 'xywh':
                let [x,y,w,h] = val.split(/\s+/).map(Number);
                ego.tx.setTranslate(x, y);
                setAttributes(ego.shadow, {x:x, y:y});
                setAttributes(ego.rect,   {width:w, height:h});
                setAttributes(ego.shadow, {width:w, height:h});

                const o = 4;
                const r = this.cornerRadius-o;
                if (this.isParallel) {
                    // Action brackets for parallels live in the top 30px of the diagram
                    h = 30;
                    setAttributes(ego.dividerN, {x2:w});
                } else if (this.isParallelChild) {
                    setAttributes(ego.dividerW, {y2:h});
                    setAttributes(ego.dividerW2, {y2:h});
                }
                ego.enter.setAttribute('d', `M${o+r},${o} A${r},${r},0,0,0,${o},${o+r} L${o},${h-o-r} A${r},${r},0,0,0,${o+r},${h-o}`);
                ego.exit.setAttribute('d', `M${w-o-r},${o} A${r},${r},0,0,1,${w-o},${o+r} L${w-o},${h-o-r} A${r},${r},0,0,1,${w-o-r},${h-o}`);

                // Some transitions in the scxmlDoc may not be visual (e.g. children of <initial>)
                this.transitions.forEach(t => t.reroute && t.reroute());
                this.incomingTransitions.forEach(t => t.reroute && t.reroute());
                this.updateLabelPosition();
                this.checkContainment();
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
    },

    createSelectors() {
        const ego = this._sse;

        this.removeSelectors();
        ego.selectors = {
            nw: make('circle', {_dad:ego.editor.selectors, 'class':'nw'}),
            ne: make('circle', {_dad:ego.editor.selectors, 'class':'ne'}),
            sw: make('circle', {_dad:ego.editor.selectors, 'class':'sw'}),
            se: make('circle', {_dad:ego.editor.selectors, 'class':'se'}),
            n:  make('rect',   {_dad:ego.editor.selectors, 'class':'n'}),
            s:  make('rect',   {_dad:ego.editor.selectors, 'class':'s'}),
            w:  make('rect',   {_dad:ego.editor.selectors, 'class':'w'}),
            e:  make('rect',   {_dad:ego.editor.selectors, 'class':'e'}),
        };

        const childStates = this.isParallel && this.states;
        if (childStates) {
            for (let i=1; i<childStates.length; ++i) {
                ego.selectors[`divider${i}`] = make('rect', {_dad:ego.editor.selectors, 'class':'divider', 'data-divider-index':i});
            }
        }

        this.placeSelectors();

        Object.values(ego.selectors).forEach( el => {
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
                            sandbox.maxDeltaX = (childStates ? childStates[0].w : this.w) - SSE.State.minWidth;
                        break;
                        case 'ne': case 'e': case 'se':
                            sandbox.minDeltaX = SSE.State.minWidth - (childStates ? childStates[childStates.length-1].w : this.w);
                            sandbox.maxDeltaX = Infinity;
                        break;
                        case 'divider':
                            sandbox.minDeltaX = SSE.State.minParentWidth - childStates[dividerIndex-1].w;
                            sandbox.maxDeltaX = childStates[dividerIndex].w - SSE.State.minParentWidth;
                        break;
                    }
                    switch (direction) {
                        case 'nw': case 'n': case 'ne':
                            sandbox.minDeltaY = -Infinity;
                            sandbox.maxDeltaY = this.h - (this.isParallel ? (SSE.State.parallelHeaderHeight + SSE.State.minParentHeight) : SSE.State.minHeight);
                        break;
                        case 'sw': case 's': case 'se':
                            sandbox.minDeltaY = -(this.h - (this.isParallel ? (SSE.State.parallelHeaderHeight + SSE.State.minParentHeight) : SSE.State.minHeight));
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
                                    child.y = y + SSE.State.parallelHeaderHeight;
                                    child.h = h - SSE.State.parallelHeaderHeight;
                                });
                            }
                        break;
                        case 'sw': case 's': case 'se':
                            h += dy;
                            if (childStates) childStates.forEach(child => {
                                child.h = h - SSE.State.parallelHeaderHeight;
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
        });
    },

    placeSelectors() {
        const sel = this._sse.selectors;
        if (!sel) return;

        const [x,y,w,h] = this.xywh;
        const ed  = this._sse.editor;
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
                div.setAttribute('y', y + (h - SSE.State.parallelHeaderHeight)/2 + SSE.State.parallelHeaderHeight - rw/2);
            }
        }
    },

    removeSelectors() {
        if (!this._sse.selectors) return;
        Object.values(this._sse.selectors).forEach(el => el.parentNode.removeChild(el));
        delete this._sse.selectors;
    },

    checkContainment() {
        this._sse.main.classList.toggle('containmentError', !this.containedWithin(this.parentNode));
        this.states.forEach(s => s.checkContainment && s.checkContainment());
    },

    checkScripts() {
        if (!this._sse) return;
        this._sse.main.classList.toggle('enter', this.enterExecutables.length);
        this._sse.main.classList.toggle('exit',  this.exitExecutables.length);
    },

    checkChildren() {
        const ego = this._sse;
        if (!ego) return;

        ego.main.classList.toggle('parent', this.states.length);
        ego.main.classList.toggle('parallel', this.isParallel);
        ego.main.classList.toggle('parallel-child', this.isParallelChild);
        ego.main.classList.toggle('first-parallel-child', this.isFirstParallelChild);

        this.updateLabelPosition();
    },

    updateLabel() {
        let prefix='', postfix='';
        if (this.isInitial && !this.isParallelChild) {
            prefix = '▸ ';
            postfix = ' ';
        }
        if (this.isHistory) {
            prefix += this.isDeep ? '★ ' : '✪ ';
            postfix += ' ';
        }
        this._sse.label.textContent = `${prefix}${this.id}${postfix}`;
    },

    updateColor() {
        const rgb = this.rgb;
        const rect = this._sse.rect;
        rect.style.fill = rgb ? `rgb(${this.rgb.join()})` : '';
        rect.classList.toggle('explicit-color', rgb);
    },

    updateLabelPosition() {
        const [,,w,h] = this.xywh;
        const top = this.states.length>0 ? 15 : h/2;
        setAttributes(this._sse.label, {x:w/2, y:top});
    },

    containedWithin(s2) {
        if (s2.isSCXML) return true;
        const d1=this.xywh, d2=s2.xywh;
        return (d1[0]>=d2[0] && d1[1]>=d2[1] && (d1[0]+d1[2])<=(d2[0]+d2[2]) && (d1[1]+d1[3])<=(d2[1]+d2[3]));
    },

    onZoomChanged() {
        this.placeSelectors();
    },
},{
    x: {
        get() { return this.xywh[0]; },
        set(x) { const xywh=this.xywh; xywh[0]=this._sse.editor.snap(x); this.xywh=xywh; }
    },
    y: {
        get() { return this.xywh[1]; },
        set(y) { const xywh=this.xywh; xywh[1]=this._sse.editor.snap(y); this.xywh=xywh; }
    },
    w: {
        get() { return this.xywh[2]; },
        set(w) { const xywh=this.xywh; xywh[2]=this._sse.editor.snap(w); this.xywh=xywh; }
    },
    h: {
        get() { return this.xywh[3]; },
        set(h) { const xywh=this.xywh; xywh[3]=this._sse.editor.snap(h); this.xywh=xywh; }
    },
    xy: {
        get() { return this.xywh.slice(0,2); },
        set(xy) { const xywh=this.xywh; [xywh[0], xywh[1]]=this._sse.editor.snap(xy); this.xywh=xywh; }
    },
    wh: {
        get() { return this.xywh.slice(2); },
        set(wh) { const xywh=this.xywh; [xywh[2], xywh[3]]=this._sse.editor.snap(wh); this.xywh=xywh; }
    },
    xywh: {
        get() {
            const xywh=this.getAttributeNS(visualNS, 'xywh');
            if (xywh) return xywh.split(/\s+/).map(Number);

            // Make up ~reasonable xywh
            const childIndex = this.parent.states.indexOf(this);
            const [parentX,parentY] = (this.parent.xy || [0,0]);
            const x = parentX + (childIndex+1)*this._sse.editor.gridSize;
            const y = parentY + 20 + childIndex*this._sse.editor.gridSize;
            if (this.isParallel) return [x, y, this.states.length*SSE.State.defaultParentWidth, SSE.State.defaultParentHeight+SSE.State.parallelHeaderHeight];
            if (this.isParallelChild) return [parentX + childIndex*SSE.State.defaultParentWidth, parentY+SSE.State.parallelHeaderHeight, SSE.State.defaultParentWidth, SSE.State.defaultParentHeight];
            if (this.isParent) return [x, y, SSE.State.defaultParentWidth, SSE.State.defaultParentHeight];
            return [x, y, SSE.State.defaultLeafWidth, SSE.State.defaultLeafHeight];
        },
        set(xywh) {
            this.setAttributeNS(visualNS, 'xywh', xywh.join(' '));
            this.states.forEach(s => s.checkContainment && s.checkContainment());
        }
    },

    r: {
        get() { return this.rgb[0]; },
        set(r) { const rgb=this.rgb; rgb[0]=r; this.rgb=rgb; }
    },
    g: {
        get() { return this.rgb[1]; },
        set(g) { const rgb=this.rgb; rgb[1]=g; this.rgb=rgb; }
    },
    b: {
        get() { return this.rgb[2]; },
        set(b) { const rgb=this.rgb; rgb[2]=b; this.rgb=rgb; }
    },
    rgb: {
        get() {
            const rgb = this.getAttributeNS(visualNS, 'rgb');
            return rgb && rgb.match(/[\da-f]{2}/gi).map(s=>parseInt(s,16));
        },
        set(rgb) {
            if (rgb) this.setAttributeNS(visualNS, 'rgb', rgb.map(toHex255).join(''));
            else this.removeAttributeNS(visualNS, 'rgb');
        }
    },
    rgbhex: {
        get() {
            return this.rgb && `#${this.rgb.map(n => n.toString(16).padStart(2,'0')).join('')}`;
        },
        set(color) {
            this.setAttributeNS(visualNS, 'rgb', color.slice(1));
        }
    },
    enterScriptCode: {
        get() {
            return this.enterScripts.map(n => deindent(n.code)).join('\n');
        },
        set(code) {
            const scripts = this.enterScripts;
            if (!scripts.length) scripts.push(this.addScript(false));
            else for (let i=1; i<scripts.length; ++i) scripts[i].delete();
            scripts[0].code = code;
        }
    },
    exitScriptCode: {
        get() {
            return this.exitScripts.map(n => deindent(n.code)).join('\n');
        },
        set(code) {
            const scripts = this.exitScripts;
            if (!scripts.length) scripts.push(this.addScript(true));
            else for (let i=1; i<scripts.length; ++i) scripts[i].delete();
            scripts[0].code = code;
        }
    },
    // Find the left-most child
    isFirstParallelChild: {
        get() {
            if (!this.isParallelChild) return false;
            return Array.from(this.parent.states).sort((a,b) => {
                a = a.xywh;
                b = b.xywh;
                return (a&&b) ? (a[0]-b[0]) : a ? -1 : 0;
            })[0] === this;
        }
    }
});

// ****************************************************************************
// ****************************************************************************
// ****************************************************************************

SSE.Transition = Object.defineProperties({
    initialize(editor) {
        const ego = this._sse = {
            editor : editor,
            main   : make('g', {_dad:editor.transitions, 'class':'transition'}),
        };
        ego.catcher = make('path', {_dad:ego.main, d:'M0,0', 'class':'catcher'});
        ego.path    = make('path', {_dad:ego.main, d:'M0,0', 'class':'line'});
        ego.label   = make('text', {_dad:ego.main, _text:this.event});

        this.checkCondition();
        this.checkEvent();
        this.checkTarget();
        this.checkScripts();

        ego.main.addEventListener('mousedown', evt=>{
            evt.stopPropagation();
            editor.select(evt, this);
        }, false);

        this.reroute();
    },

    reroute(){
        const ego = this._sse;
        const anchors = this.anchors;
        const path = svgPathFromAnchors(anchors, this.radius);
        ego.path.setAttribute('d', path);
        ego.catcher.setAttribute('d', path);

        if (this.event) this.placeLabel(anchors);
    },

    placeLabel(anchors=this.anchors) {
        const ego = this._sse;
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
    },

    select() {
        const main = this._sse.main;
        main.parentNode.appendChild(main);
        main.classList.add('selected');
    },

    deselect() {
        this._sse.main.classList.remove('selected');
    },

    deleteGraphics() {
        this._sse.main.remove();
        delete this._sse;
    },

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
    },

    checkCondition() {
        this._sse.main.classList.toggle('conditional',   this.condition);
        this._sse.main.classList.toggle('conditionless', !this.condition);
    },

    checkEvent() {
        // Add non-breaking spaces before/after to hack horizontal offset for label placement
        this._sse.label.textContent = `\xa0${this.event}\xa0`;
        this._sse.main.classList.toggle('event',     this.event);
        this._sse.main.classList.toggle('eventless', !this.event);
    },

    checkTarget() {
        const hasTarget = this.targetsOtherState && this.targetIsValid;
        this._sse.main.classList.toggle('targeted',   hasTarget);
        this._sse.main.classList.toggle('targetless', !hasTarget);
        this._sse.main.classList.toggle('targeterror', !this.targetIsValid);
    },

    checkScripts() {
        // We check for child elements instead of scripts collection to account for non-script actions
        this._sse.main.classList.toggle('actions',    this.childElementCount);
        this._sse.main.classList.toggle('actionless', !this.childElementCount);
    },

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
    },

    onZoomChanged() {
    },
},{
    radius: {
        get() {
            // This (intentionally) prevents completely square corners by ignoring values of 0
            return this.getAttributeNS(visualNS, 'r')*1 || this._sse.editor.maxRadius || null;
        },
        set(r) {
            // This (intentionally) prevents completely square corners by ignoring values of 0
            if (r) {
                this.setAttributeNS(visualNS, 'r', r*1);
            } else {
                this.removeAttributeNS(visualNS, 'r');
            }
        }
    },

    labelOffsets: {
        get() {
            const offset = this.getAttributeNS(visualNS, 'offset');
            if (!offset) {
                return [this._sse.editor.eventLabelOffset, 0];
            } else {
                if (offset.indexOf(' ')>=0) {
                    return offset.split(/\s+/, 2).map(Number);
                } else {
                    return [offset*1, 0];
                }
            }
        },
        set(valueOrValues) {
            let attributeValue = valueOrValues;
            if (Array.isArray(valueOrValues)) {
                if (!valueOrValues[1]) {
                    valueOrValues.length = 1;
                } else if (valueOrValues[0]==='') {
                    valueOrValues[0] = 0;
                }
                attributeValue = valueOrValues.join(' ').trim();
            }
            if (attributeValue && attributeValue!=='0') {
                this.setAttributeNS(visualNS, 'offset', attributeValue);
            } else {
                this.removeAttributeNS(visualNS, 'offset');
            }
        }
    },

    labelMainOffset: {
        get() {
            return this.getAttributeNS(visualNS, 'offset') && this.labelOffsets[0];
        },
        set(offset) {
            const offsets = this.labelOffsets;
            offsets[0] = offset;
            this.labelOffsets = offsets;
        }
    },

    labelCrossOffset: {
        get() {
            return this.getAttributeNS(visualNS, 'offset') && this.labelOffsets[1];
        },
        set(offset) {
            const offsets = this.labelOffsets;
            offsets[1] = offset;
            this.labelOffsets = offsets;
        }
    },

    align: {
        get() {
            return this.getAttributeNS(visualNS, 'align');
        },
        set(align) {
            this.setAttributeNS(visualNS, 'align', align);
        }
    },

    // Returns ~ {side:'N', offset:80, x:120, y:210}
    sourceAnchor: {
        get() { return this.pts && this.anchors[0]; },
        set(anchor) {
            const anchors = this.anchors;
            if (anchor) {
                anchors[0] = anchor;
            } else {
                // If there's a target anchor, make up a good source anchor
                if (anchors[1]) anchors[0] = this.bestAnchors()[0];
                else this.anchors = [];
            }
            this.anchors = anchors;
        }
    },

    sourceAnchorSide: {
        get() {
            const anchor = this.sourceAnchor;
            return anchor && anchor.side;
        },
        set(side) {
            this.sourceAnchor = side && {side, offset:this.sourceAnchorOffset||0};
        }
    },

    sourceAnchorOffset: {
        get() {
            const anchor = this.sourceAnchor;
            return anchor && anchor.offset;
        },
        set(offset) {
            const sourceAnchor = this.sourceAnchor;
            this.sourceAnchor = sourceAnchor && {side:sourceAnchor.side, offset:offset||0};
        }
    },

    targetAnchor: {
        get() {
            if (this.pts) {
                const anchors = this.anchors;
                if (anchors.length>1) return anchors[anchors.length-1];
            }
        },
        set(anchor) {
            const anchors = this.anchors;
            if (anchor) {
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
    },

    targetAnchorSide: {
        get() {
            const anchor = this.targetAnchor;
            return anchor && anchor.side;
        },
        set(side) {
            this.targetAnchor = side && this.target && {side, offset:this.targetAnchorOffset||0};
        }
    },

    targetAnchorOffset: {
        get() {
            const anchor = this.targetAnchor;
            return anchor && anchor.offset;
        },
        set(offset) {
            const targetAnchor = this.targetAnchor;
            this.targetAnchor = targetAnchor && {side:targetAnchor.side, offset:offset||0};
        }
    },

    anchors: {
        get() {
            const pts = this.pts;
            if (!this.pts) return this.bestAnchors();
            const anchors = [],
                  regex   = /([NSEWXY])\s*(\S+)/g;
            let match;
            while (match=regex.exec(pts)) {
                const [,direction,offset] = match;
                switch (direction) {
                    case 'X': anchors.push({axis:direction, offset:offset, x:offset*1, horiz:false}); break;
                    case 'Y': anchors.push({axis:direction, offset:offset, y:offset*1, horiz:true }); break;
                    default:
                        const state = anchors.length ? this.target : this.parentNode;
                        const anchor = anchorOnState(state, direction, offset*1, state===this.parentNode);
                        if (anchor) anchors.push(anchor);
                }
            }
            if (anchors.length===0) return this.bestAnchors();
            return anchors;
        },
        set(anchors) {
            this.pts = anchors.map(a => `${a.side||a.axis}${a.offset}` ).join(' ');
        }
    },

    pts: {
        get() { return this.getAttributeNS(visualNS, 'pts'); },
        set(str) {
            if (str) this.setAttributeNS(visualNS, 'pts', str);
            else     this.removeAttributeNS(visualNS, 'pts');
        }
    }
});

// state: a state node
// side: 'N', 'S', 'E', 'W'
// offset: a distance along that edge
function anchorOnState(state, side, offset, startState) {
    if (!state) return;
    const rad = state.cornerRadius;
    let [x,y,w,h] = state.xywh;
    const [l,t,r,b] = [x+rad, y+rad, x+w-rad, y+h-rad];
    const anchor = {x, y, horiz:true, side, offset};
    if (startState!==undefined) anchor.start=startState;
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
    if (!maxRadius) maxRadius = Infinity;

    // Calculate intersection points
    let prevPoint = anchors[0], nextPoint;
    const pts = [prevPoint];
    for (let i=1; i<anchors.length; ++i) {
        nextPoint = Object.assign({}, anchors[i]);
        // Interject an anchor of opposite orientation between two sequential anchors with the same orientation
        if (nextPoint.horiz===prevPoint.horiz) {
            const mainAxis = prevPoint.horiz ? 'x' : 'y',
                  crosAxis = prevPoint.horiz ? 'y' : 'x';
            let nextMain = nextPoint[mainAxis];
            for (let j=i; nextMain===undefined; ++j) nextMain = anchors[j][mainAxis];
            nextPoint = {
                [mainAxis] : (prevPoint[mainAxis]+nextMain)/2,
                [crosAxis] : prevPoint[crosAxis],
                horiz      : !prevPoint.horiz
            };
            // Since we generated a new anchor, retry the next real anchor next loop
            i--;
        } else {
            if (prevPoint.horiz) nextPoint.y = prevPoint.y;
            else                 nextPoint.x = prevPoint.x;
        }
        pts.push(nextPoint);
        prevPoint.distanceToNext = Math.hypot(nextPoint.x-prevPoint.x, nextPoint.y-prevPoint.y);
        prevPoint = nextPoint;
    }
    nextPoint = anchors[anchors.length-1];
    prevPoint.distanceToNext = Math.hypot(nextPoint.x-prevPoint.x, nextPoint.y-prevPoint.y);
    pts.push(nextPoint);

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

function make(name, opts={}) {
    const el = document.createElementNS(svgNS, name);
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

export default SSE.Editor;
