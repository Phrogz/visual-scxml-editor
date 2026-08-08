# Visual SCXML Editor

An extension for Visual Studio Code that visualizes SCXML state charts,
and provides the ability to visually adjust the state chart,
in a manner that allows the SCXML to still be used in production.

![screenshot of SCXML adjacent to a visual statechart](docs/example.png)

## Features

* Parallel editing allows you to modify either the XML code or the graphics and have the other
  reflect the changes
* Visual changes are stored in a custom namespace that does not affect SCXML operation
* Visualization goes beyond just states and transition flow:
  * See which states have actions performed on entry or exit
  * See which transitions execute actions
  * See which transitions have conditions guarding them, or have no condition or event at all.
  * See transitions that just execute an action, but don't leave the state.
* Visually differentiates transitions with actions
* Visually differentiates transitions with conditions
* Selecting graphical objects highlights them in the text editor, making them easy to find for
  hand-editing or detailed inspection
* Default visual style matches the current VS Code theme
  * Customization of state colors allows for additional information to be conveyed
* Inspector palette supports authoring of custom actions ([see below](#authoring-custom-executable-actions) for details)
* Route transitions around states via waylines
  * Add horizontal or vertical waylines from the command palette or visual-editor context menu
  * Hand-edit the XML attribute when exact wayline ordering is needed;
    see the [documentation on visualization attributes](docs/attributes.md#transitions) for details


## Instructions

1. Open an SCXML file, _ensure that the language for the file is set to XML_,
   and then invoke the command `SCXML Editor: Open to the Side`
   * If this is your first time working on this file, the `Layout Entire Diagram`
     command will be run for you to roughly make an initial sensible layout.
   * Alternatively, the command `SCXML Editor: Create Blank State Machine` will create
     a new text editor, fill it out with the minimum needed for a state machine, and
     open a visual editor connected to it.
2. Drag states to impose order and clarity.
3. Select states or transitions and edit some aspects of them in the Inspector palette
   that appears.


### Available Commands

* `SCXML Editor: Create Blank State Machine` — Creates a new untitled `.scxml` document.
* `SCXML Editor: Open to the Side` — Opens a visual editor tied to the current SCXML document; only
  available if the language for the active text editor is set to XML.
* `SCXML Editor: Add State` — Creates a new root state when no state is selected.
* `SCXML Editor: Add Child State` — Adds a child to each selected state. Both state-creation commands
  are also available via context menu in the visual editor.
* `SCXML Editor: Set as Initial` — Marks each eligible selected state as its parent's initial state,
  replacing any previously marked sibling. Direct children of a `<parallel>` state are ignored, and
  the command is unavailable when they are the only selected states.
* `SCXML Editor: Expand State to Fit Children` — Parent state(s) selected in the visual editor will
  have their placement adjusted to ensure all children fit within them.
* `SCXML Editor: Layout Entire Diagram` — Moves all states to hopefully-useful initial places.
  Also resets any existing transition routing to the defaults.
* `SCXML Editor: Undo` — Runs Undo in the connected text editor, available as `Ctrl+Z`/`Cmd+Z` while
  the visual editor has focus.
* `SCXML Editor: Save` — Saves the connected text document, available as `Ctrl+S`/`Cmd+S` while the
  visual editor has focus.
* `SCXML Editor: Add Transition` — Creates new transition(s) in the state machine, starting at the
  selected state(s). (If no states are selected, uses a quick pick to select a state to start from.)
  Quick picks also let you select the target state, and specify an event name and conditional.
  The command is also available via context menu in the visual editor.
* `SCXML Editor: Add Wayline, Horizontal` (or `SCXML Editor: Add Wayline, Vertical`) — Appends a
  wayline to each selected transition and immediately shows its drag handle. Also available via
  context menu in the visual editor.
* `SCXML Editor: Zoom to Fit` — Fit the entire state machine in the visual editor.
* `SCXML Editor: Zoom to Selected` — Fit the selected state(s) and transition(s) in the view.
* `SCXML Editor: Zoom to 100%` — Adjust the zoom to the base size.
* `SCXML Editor: Show/Hide Events` — Toggle the display of transition events.
* `SCXML Editor: Delete Selection Only` — Delete selected state(s) and transition(s) in a
  least-destructive manner:
  * Unselected child-states are not deleted, but are instead re-parented up a level.
  * Transitions targeting any state(s) to be deleted are not themselves deleted, but instead have
    their `target` attribute changed to not target that state.
* `SCXML Editor: Delete Selection and References` — Delete selected state(s) and transition(s) in
  the most destructive manner:
  * Descendant states are also deleted.
  * Transitions targeting state(s) to be deleted are also deleted.
* `SCXML Editor: Reset Visualization` — Remove every attribute and element in the document using
  the custom visualization namespace.

### Keyboard Controls in the Visual Editor

* `Space` — enable pan via left mouse drag
* `Middle-MouseWheel Drag` — pan around the document
* `Trackpad Scroll` — pan around the document
* `Trackpad Pinch` — zoom in/out
* `Ctrl-MouseWheel` — zoom in/out
* `MouseWheel` — pan up/down
* `Shift-MouseWheel` — pan left/right
* `Delete` — Delete Selection Only
* `Shift+Delete` — Delete Selection and References
* `Ctrl+Alt+Z`/`Cmd+Alt+Z` — Zoom to Selected when there is a selection; otherwise, Zoom to Fit
* `Alt+Shift+Z` — Zoom to 100%
* `e` — Show/Hide Events


### Authoring Custom Executable Actions

In addition to the [`<send>` element](https://www.w3.org/TR/scxml/#send) allowing the state machine to
communicate with the owning program—given interpreter support—the SCXML specification also allows for
[custom action elements](https://www.w3.org/TR/scxml/#extensibility) in custom namespaces where other
executable content would be present.

When these custom actions are present onentry, onexit, or within a transition, the Inspector palette
will show the actions and their attributes, and allow them to be deleted. It does not support editing
them or creating new custom actions from the palette, however, unless you provide information about the
schema.

To describe the custom actions that can be edited and created, add an element named `actions` in the
visualization namespace at the root of the SCXML document. Each child of this element should be an
element you'd like to be able to edit—in the proper namespace—with child elements describing the allowed
attributes.

For example:

```xml
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"
       xmlns:robo="http://dawsonschool.org/robotics/2972"
       xmlns:viz="http://phrogz.net/visual-scxml">
  <viz:actions>
    <!-- e.g. <robo:enableDriving value="0" /> -->
    <robo:enableDriving>
      <viz:attribute max="1" min="0" name="value" type="int" />
    </robo:enableDriving>

    <!-- e.g. <robo:toggle key="armRaised" value="1" /> -->
    <robo:toggle>
      <viz:attribute name="key" type="choice" values="armRaised,gripperOpen" />
      <viz:attribute max="1" min="0" name="value" type="int" />
    </robo:toggle>

    <!-- e.g. <robo:doMagic magic="retractBoom" /> -->
    <robo:doMagic>
      <viz:attribute name="magic" type="choice" values="(none),alignToPiece,extendBoom,retractBoom,autoReverse,driveToGrid" />
    </robo:doMagic>

    <!-- e.g. <robo:speak message="Hi Mom!" /> -->
    <robo:speak>
      <viz:attribute name="message" type="string" />
    </robo:speak>
  </viz:actions>
```

Each `<viz:attribute>` must have a `name` and `type` attribute. Supported attribute types:

* `string` — arbitrary text input
* `choice` — text from a list of values
  * `values` must be a comma-delimited list of options to provide
* `int` – integer
  * optional `min` and `max` attributes constrain the range
* `float` – floating point number
  * optional `min` and `max` attributes constrain the range
  * `step` optionally defines the increment/decrement amounts and controls precision
* `boolean` – values of "true" or "false" only

## Known Issues, Planned Features

All issues and planned features are tracked using [GitHub Issues](https://github.com/Phrogz/visual-scxml-editor/issues):

* [Major bugs](https://github.com/Phrogz/visual-scxml-editor/issues?q=is%3Aissue+is%3Aopen+label%3Abug+label%3Ahigh-value) are labeled with `bug` && `high-value`; alternatively, see [all bugs](https://github.com/Phrogz/visual-scxml-editor/issues?q=is%3Aissue+is%3Aopen+label%3Abug).
* [Major features](https://github.com/Phrogz/visual-scxml-editor/issues?q=is%3Aissue+is%3Aopen+label%3Afeature+label%3Ahigh-value) are similarly labeled `feature` and `high-value`; alternatively, see [all features](https://github.com/Phrogz/visual-scxml-editor/issues?q=is%3Aissue+is%3Aopen+label%3Afeature).


## Contributing

Want to help fix bugs or add features? Great! See the [Architecture documentation](docs/architecture.md)
for core concepts on how the extension works and information flows.

## Release Notes

### **0.6.0** — 2026-Aug-7

#### New Features

* New `Add Wayline, Horizontal` and `Add Wayline, Vertical` commands let you add routing guidelines graphically,
  with the new drag handle shown immediately.
  They're always added as the new last waypoint/line, though; for now, hand-edit the `viz:pts="…"` to change the order.
  ([Issue #42](https://github.com/Phrogz/visual-scxml-editor/issues/42), [Issue #56](https://github.com/Phrogz/visual-scxml-editor/issues/56))

* Transition routes can omit either endpoint, but use waypoints or waylines, to automatically select an attachment point.
  ([Issue #7](https://github.com/Phrogz/visual-scxml-editor/issues/7), [Issue #18](https://github.com/Phrogz/visual-scxml-editor/issues/18))

* Added a `Set as Initial` command for graphically changing which child states are the initial to enter.
  ([Issue #46](https://github.com/Phrogz/visual-scxml-editor/issues/46))

* Transition labels fade out, and then state labels fade later as the diagram is zoomed out.
  ([Issue #10](https://github.com/Phrogz/visual-scxml-editor/issues/10))

* Transition markers shrink at low zoom levels, so they don't overwhelm the diagram.
  ([Issue #14](https://github.com/Phrogz/visual-scxml-editor/issues/14)).

* Empty `<parallel>` states can be resized without errors; adding parallel children automatically gives them a reasonable size within the parent.
  ([Issue #24](https://github.com/Phrogz/visual-scxml-editor/issues/24), [Issue #57](https://github.com/Phrogz/visual-scxml-editor/issues/57))

#### Bug Fixes

* Fixed case-sensitive compiled imports so the extension should work everywhere, including Remote SSH.
  ([Issue #45](https://github.com/Phrogz/visual-scxml-editor/issues/45))

* Deleting a selected state no longer prevents subsequent visual selections.
  ([Issue #62](https://github.com/Phrogz/visual-scxml-editor/issues/62))

* Visual edits reconnect correctly after switching away from and back to the text-editor tab.
  ([Issue #19](https://github.com/Phrogz/visual-scxml-editor/issues/19))

* States created through `Add State` are immediately available as transition targets.
  ([Issue #40](https://github.com/Phrogz/visual-scxml-editor/issues/40))

* Symmetrical wayline routes now result in symmetrical corner radii.
  ([Issue #43](https://github.com/Phrogz/visual-scxml-editor/issues/43))

* Malformed `viz:pts` commands are now ignored without breaking the diagram, and are reported as
  warnings in the Problems panel.
  ([Issue #44](https://github.com/Phrogz/visual-scxml-editor/issues/44))

* Newly created transitions remain selected in both the visual and text editors
  ([Issue #41](https://github.com/Phrogz/visual-scxml-editor/issues/41))

* Repeatedly adding new child nodes no longer stacks them atop one another.

* Long state IDs are kept within their state boundaries.
  ([Issue #55](https://github.com/Phrogz/visual-scxml-editor/issues/55))

* Removed unused test dependencies that introduced security audit findings and added automated tests to the package workflow.

### **0.5.0** — 2023-Mar-2

* `Create Blank State Machine` command creates a new template file for you to start with
* `Add Transition` command lets you create a transition with minimal typing
* `Reset Visualization` command removes all visualization attributes and elements from the SCXML

### **0.4.0** — 2023-Feb-28

* Ctrl+S/Cmd+S with the visual editor focused will save the text editor
* Added `Layout Entire Diagram` command for automatic initial layout
  * Automatically invoked when opening a new SCXML file
* Added `Zoom to Selected` command
* SCXML parse errors show up in the Problems panel, clear when OK
* Fixed bugs related to selection and dragging with left and right clicks

### **0.3.0** — 2023-Feb-27

Initial public release.
