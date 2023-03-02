This document captures the design architecture of this extension: what files do, how data flows
between modules.

![diagram showing the conceptual containment described below](conceptual-containment.png)

# High-Level Overview

1. [`extension.ts`](../src/extension.ts) creates an `SCXMLEditorManager` when activated.
   For each text editor document where the `showEditor` command is invoked, the manager
   creates a new `EditorGlue` instance [`editorglue.ts`](../src/editorglue.ts) and associates
   it with the document uri.
2. Each `EditorGlue` instance creates its own `WebviewPanel` where the visualization takes place,
   building it from [`scxmleditor.html`](../resources/scxmleditor.html), which in turn pulls
   in other files in the [`resources`](../resources) directory.
   * The HTML page uses a big [SVG](https://developer.mozilla.org/en-US/docs/Web/SVG) diagram to
     show the states, transitions, and selection/manipulation handles. The HTML sets up the SVG
     shell, including the shapes of the "markers" that are applied to the ends of transitions.
     The rest of the SVG is created dynamically by [`visualeditor.js`](../resources/visualeditor.js).
   * Visually, the following CSS files are applied to the document:
     * **[`base.css`](../resources/base.css)** layout of the page elements, including the Inspector
     * **[`scxmleditor.css`](../resources/scxmleditor.css)** base style for all diagram pieces
     * **[`theme.css`](../resources/theme.css)** colors the diagram based on the current VS Code theme
     * **[`mutable.css`](../resources/theme.css)** holds styles to be modified by script at runtime
   * Programmatically, [`scxmleditor.js`](../resources/scxmleditor.js) is the only script loaded directly
     by the HTML; that library then imports other modules. Responsibilities by file:
     * **[`scxmleditor.js`](../resources/scxmleditor.js)** is the glue that pulls everything together:
       * creates the SCXMLDocument and VisualEditor and hooks them together
       * populates the Inspector when states/transitions are selected, and feeds changes to the SCXMLDoc
       * passes selection information back to the `EditorGlue`, to show selection in the text editor
     * **[`scxmldom.js`](../resources/scxmldom.js)** creates an in-memory representation of the SCXML
       document as an [`XMLDocument`](https://developer.mozilla.org/en-US/docs/Web/API/XMLDocument),
       except that the document and DOM elements in the tree are given additional functionality
       specific to SCXML.
     * **[`visualeditor.js`](../resources/visualeditor.js)** implements the editor that manages the SVG
       diagram: placing and sizing and coloring states, routing of transitions, placement
       of labels, showing selection handles, handling mouse interactions, resizing elements.
       Changes to the diagram mutate the SCXMLDocument document.
     * **[`neatxml.js`](../resources/neatxml.js)** provides stable, custom serialization of the in-memory
       XML document to produce updated code for the editor when the SCXMLDoc changes
3. The `EditorGlue` receives commands from the webview to rewrite the editor's text to match the
   visual changes, or to show selections in the editor.

![diagrams summarizing event and method calls for common interactions](sequence-diagrams.png)


# SCXML DOM

The SCXML text in the editor is first passed to [`scxmldom.js`](../resources/scxmldom.js).
This module creates an in-memory representation of an SCXML document as an
[`XMLDocument`](https://developer.mozilla.org/en-US/docs/Web/API/XMLDocument), except that the DOM
elements in the tree are given additional functionality specific to SCXML.
These properties and methods are intended as conveniences, and to help ensure a valid SCXML document
(not just valid XML).

* **`SCXMLDoc`** — added to the XMLDocument itself.
* **`SCXMLState`** — added to every `<scxml>`, `<state>`, `<parallel>`, `<history>`, and `<final>` element.
* **`SCXMLTransition`** — added to every `<transition>` element.
* **`SCXMLScript`** — added to every `<script>` element.
* **`SCXMLCustom`** — added to other elements, primarily intended for use with elements for custom actions.

_See the implementation of the above objects for the properties and methods they provide._


# Visual DOM

Once the SCXMLDoc is created and passed to [`visualeditor.js](../resources/visualeditor.js),
MORE prototypes are injected into certain elements, defined in [`visualdom.js`](../resources/visualdom.js).
These properties and methods manage the visual state of the diagram, outside the scope of just SCXML.

* **`VisualDoc`** — a simple extension to the XMLDocument which ensures that newly-created elements
  get properly injected with the new prototypes.
* **`VisualRoot`** — added just to the root `<scxml>` element.
* **`VisualState`** — added to state elements (other than `<scxml>`.
* **`VisualTransition`** — added to `<transition>` elements.

_See the implementation of the above objects for the properties and methods they provide._
