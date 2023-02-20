This document captures the design architecture of this extension: what files do, how data flows
between modules.

# High-Level Overview

1. `extension.ts` creates an `SCXMLEditorManager`, which creates a `WebviewPanel` for each editor
   document where the `showEditor` command is invoked. This WebviewPanel is where all visualization
   takes place.
2. The `WebviewPanel` and editor are passed along to create a new `EditorPanel` (from
   [`editorpanel.ts`](src/editorpanel.ts)).
3. The `EditorPanel` receives commands from the Webview to rewrite the editor's text to match the
   visual changes, or to show selections in the editor. The `EditorPanel` is also responsible for
   building the Webview from [`scxmleditor.html`](resources/scxmleditor.html), which in turn pulls
   in other files in the [`resources`](./resources) directory.
   * The HTML page uses a big [SVG](https://developer.mozilla.org/en-US/docs/Web/SVG) diagram to
     show the states, transitions, and selection/manipulation handles. The HTML sets up the SVG
     shell, including the shapes of the "markers" that are applied to the ends of transitions.
     The rest of the SVG is created dynamically by [`scxmleditor.js`](resources/scxmleditor.js).
   * Visually, the following CSS files are applied to the document:
     * **[`base.css`](resources/base.css)** layout of the page elements, including the Inspector
     * **[`scxmleditor.css`](resources/scxmleditor.css)** base style for all diagram pieces
     * **[`theme.css`](resources/theme.css)** colors the diagram based on the current VS Code theme
     * **[`mutable.css`](resources/theme.css)** holds styles to be modified by script at runtime
   * Programmatically, [`editorglue.js`](resources/editorglue.js) is the only script loaded directly
     by the HTML; that library then imports other modules. Responsibilities by file:
     * **[`scxmldom.js`](resources/scxmldom.js)** creates an in-memory representation of the SCXML
       document as an [`XMLDocument`](https://developer.mozilla.org/en-US/docs/Web/API/XMLDocument),
       except that the document and DOM elements in the tree are given additional functionality
       specific to SCXML.
     * **[`scxmleditor.js`](resources/scxmleditor.js)** implements the editor that manages the SVG
       diagram: placing and sizing and coloring states, routing of transitions, placement
       of labels, showing selection handles, handling mouse interactions, resizing elements.
       Changes to the diagram mutate the SCXMLDom document.
     * **[`editorglue.js`](resources/editorglue.js)**
       * creates the SCXMLDom and SCXMLEditor and hooks them together
       * populates the Inspector when states/transitions are selected, and feeds changes to the SCXMLDoc
       * passes selection information back to the `EditorPanel`, to show selection in the text editor
     * **[`neatxml.js`](resources/neatxml.js)** provides stable, custom serialization of the in-memory
       XML document to produce updated code for the editor when the SCXMLDoc changes


# SCXML DOM

The SCXML text in the editor is first passed to `scxmldom.js`. This module creates an in-memory
representation of an SCXML document as an
[`XMLDocument`](https://developer.mozilla.org/en-US/docs/Web/API/XMLDocument), except that the DOM
elements in the tree are given additional functionality specific to SCXML:

* **`SCXMLDoc`** — added to the XMLDocument itself
  * Properties
    * `.root` — points to the root `<scxml>` element
    * `.errorsByType` — an object tracking arrays of errors of specific types; only one type of
      error is tracked currently
      * `.conflictingIds` — each entry in the array is an array pair of `SCXMLState` elements which
        share the same `id` attribute
    * `.events` — array of every event name used in `<transition>` elements throughout the document
    * `.states` — array of every state/parallel/history/final in the document; do not mutate this
      array, use `SCXMLState.addChild()` or `SCXMLState.delete()`
    * `.transitions` — array of every `<transition>` in the document; do not mutate this array, use
      `SCXMLState.addTransition()` or `SCXMLTransition.delete()`
    * `.instantTransitions` — array of every `<transition>` that has neither `event` or `condition`
      triggering it
    * `.ids` — array of every state id in the document
  * Methods
    * `.checkForIdDuplicates()` — updates `.errorsByType.conflictingIds` to be up-to-date
    * `.getStateById(id)` — Returns the (first) state matching the given id string, or `null` if
      none match
    * `.uniqueId(baseName='id')` — generates a new id that is unique in the document; `baseName` is
      used as a prefix to the id, and thus must match a legal XML identifier

* **`SCXMLState`** — added to every `<scxml>`, `<state>`, `<parallel>`, and `<history>` node
  * Properties
    * `.states` — array of every child state/parallel/history/final of this state; do not mutate
      this array, use `SCXMLState.addChild()` or `SCXMLState.delete()`
    * `.descendants` — array of every child state/parallel/history/final of this state; do not
      mutate this array, use `SCXMLState.addChild()` or `SCXMLState.delete()`
    * `.transitions` — array of every transition originating from this state; do not mutate this
      array, use `SCXMLState.addTransition()` or `SCXMLTransition.delete()`
    * `.incomingTransitions` — array of every transition targeting this state; do not mutate this
      array, use `SCXMLState.addTransition()` or `SCXMLTransition.delete()`
    * `.enterScripts` — array of all `<script>` elements in the `<onentry>` section of this state;
      do not mutate this array, use `SCXMLState.addScript()` or `SCXMLScript.delete()`
    * `.exitScripts` — array of all `<script>` elements in the `<onexit>` section of this state; do
      not mutate this array, use `SCXMLState.addScript()` or `SCXMLScript.delete()`
    * `.id` — read or set the id of this state; values that conflict with other states are permitted
    * `.isInitial` — `true` if this state is the initial state of its parent; setting to `true` will
      force this state to be the initial state for the parent; setting to `false` will remove an
      explicit initial state, causing the first document child to be the implicit initial
    * `.parent` — the parent node of this state; setting this value will move the node to be the
      last child the supplied element
    * `.parentId` — the id of the parent node; setting this value will move this state to be a child
      of the parent if and only if a state with the supplied id is present in the document
    * `.isDeep` — returns `true` if this is a `<history type="deep">` state; setting this will
      toggle the `type` value
    * `.isSCXML` — is this state the root `<scxml>` element? (read-only)
    * `.isHistory` — is this a `<history>` state? (read-only)
    * `.isParallel` — is this a `<parallel>` state? (read-only)
    * `.isFirstChildState` — is this state the first child of its parent? (read-only)
    * `.isParent` — does this state have any state children? (read-only)
    * `.isLeaf` — does this state have NO state children? (read-only)
    * `.isState` — `true`
  * Methods
    * `.addChild(stateType='state', newId=null)` — add a new child to this state and return it;
      `stateType` must be 'state', 'parallel', 'history', or 'final'
    * `.addScript(inExit, code='')` — add a new `<script>` child to this state's `<onentry>` or
      `<onexit>` section, and return it
    * `.addTransition(target='', event='', condition='')` — add a new SCXMLTransition to this state,
      and return it
    * `.delete()` — delete this state from the document (unless this state is the root `<scxml>`
      state)

* **`SCXMLTransition`** — added to every `<transition>` element
  * Properties
    * `.targetId` — the space-delimited id(s) of the state(s) this transition targets
    * `.target` — the single `SCXMLState` targeted by this transition; returns `null` if this
      transition targets multiple states; setting this property to a state will update the
      `.targetId`
    * `.targetsOtherState` — `true` iff this transition targets a state other than its parent
      (read-only)
    * `.targetsIsValid` — `false` if this transition has a `.targetId` that does not match an
      existing state (read-only)
    * `.isTransition` — `true`
    * `.source` — the `SCXMLState` that this transition initates from; setting this value will move
      the transition to the new parent state
    * `.sourceId` — the id of the state this transition is within; setting thie value will move the
      transition to the new state
    * `.condition` – the condition script code guarding this transition; set to a non-truthy value
      to remove
    * `.event` — the event(s) triggering this transition (single space-delimited string for
      multiple)
    * `.isInternal` — is the `type` of this transition internal (`true`) or external (`false`)
    * `.scripts` — array of all script blocks for this transition; do not mutate this array, use
      `SCXMLTransition.addScript()` or `SCXMLScript.delete()`
  * Methods
    * `.addScript(code='')` — add a new `<script>` to this transition and return it
    * `.delete()` — delete this transition from the document

* **`SCXMLScript`** — added to every `<script>` element
  * Properties
    * `.code` — the code content of the script
  * Methods
    * `.delete()` — remove this script block; if this element was the sole child of an `<onentry>`
      or `<onexit>` element, that now-empty element is also removed
