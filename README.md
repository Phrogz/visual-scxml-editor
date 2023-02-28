# Visual SCXML Editor

An extension for Visual Studio Code that visualizes SCXML state charts,
and provides the ability to visually adjust the state chart,
in a manner that allows the SCXML to still be used in production.

![](docs/example.png)

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
* Route transitions around states via waypoints
  * Currently requires hand-editing the XML attribute to inject waypoints;
    see the [documentation on visualization attributes](docs/attributes.md#transitions) for details


## Instructions

1. Open an SCXML file, ensure VS Code knows the language is set to XML,
   and then invoke the command `SCXML Editor: Open to the Side`
   * Your states will (currently) be displayed in a jumbled mess. Sorry about that.
2. Drag states to impose order and clarity.
3. Select states or transitions and edit some aspects of them in the Inspector palette
   that appears.


### Other Commands

* `SCXML Editor: Open to Side` — Opens a visual editor tied to the current SCXML document; only
  available if the language for the active text editor is set to XML.
* `SCXML Editor: Add State` — Creates new state(s) in the state machine. If any state(s) are
  selected the new states are added as children of them. Also available via context menu in the
  visual editor.
* `SCXML Editor: Expand State to Fit Children` — Parent state(s) selected in the visual editor will
  have their placement adjusted to ensure all children fit within them.
* `SCXML Editor: Zoom to Fit` — Fit the entire state machine in the visual editor.
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
* `Ctrl+Alt+Z`/`Cmd+Alt+Z` — Zoom to Fit
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
       xmlns:gnb="http://dawsonschool.org/robotics/2972"
       xmlns:viz="http://phrogz.net/visual-scxml">
	<viz:actions>
    <!-- e.g. <gnb:enableDriving value="0" /> -->
		<gnb:enableDriving>
			<viz:attribute max="1" min="0" name="value" type="int" />
		</gnb:enableDriving>

    <!-- e.g. <gnb:robotToggle key="armRaised" value="1" /> -->
		<gnb:robotToggle>
			<viz:attribute name="key" type="choice" values="armRaised,gripperOpen" />
			<viz:attribute max="1" min="0" name="value" type="int" />
		</gnb:robotToggle>

    <!-- e.g. <gnb:doMagic magic="retractBoom" /> -->
		<gnb:doMagic>
			<viz:attribute name="magic" type="choice" values="(none),alignToPiece,extendBoom,retractBoom,autoReverse,driveToGrid" />
		</gnb:doMagic>

    <!-- e.g. <gnb:speak message="Hi mom!" /> -->
		<gnb:speak>
			<viz:attribute name="message" type="string" />
		</gnb:speak>

  </viz:actions>
```

Supported attribute types:

* `string` — arbitrary text input
* `choice` — text from a list of values
  * `values` must be a comma-delimited list of options to provide
* `int` – integer
  * `min` and `max` values constrain the range
* `float` – floating point number
  * `min` and `max` values constrain the range
  * `step` optionally defines the increment/decrement amounts and controls precision
* `boolean` – values of "true" or "false" only


## TODO (Known Issues, Planned Features)

### High Priority

* Create state via context menu should place at cursor, not drag parent
* Create transition graphically via context menu
* Add graphical editing of transition waypoints
* Bug: Transition with only first point set does not draw to target state


### Medium Priority

* Changing state or extension types in inspector does not update code to match.
* Toggle ruler/grid to show where transitions route
* Fade out text below certain zoom level
* Automatic layout of a state chart
* Documentation showing screenshots, animation of auto routing
* Documentation on instructions
* Expose commands (zoom to fit, create state, etc.) via command palette
* Marquee select (with inside vs touching)
* Shrink markers below certain zoom level
* Optionally draw condition as a label if no even is specified (e.g. "if (…)")
* Optionally add condition to an event label ("event\nif (…)")
* Moving a transition (with waypoints?) to the root level (via text) causes runtime error
* Space uses mouse move to pan, without dragging
* Allow explicit transition routing to omit explicit first and/or last attachment point, e.g.
  `viz:pts="- X10 -"`
* Switching tabs away from the text editor and back breaks the ability of the Webview to show
  selection in text editor
* Changes to inspector action parameters defocuses Inspector after editor updates;
  this does not occur for non-action inputs, e.g. state size.
* Fix the context `visual-scxml-editor.editorActive` to be active iff an editor is active,
  and switch commands that could be invoked from the text editor (like `Add State`) to use this context.
* Add command to create new text editor with SCXML shell + visual editor
* Rename state without Inspector
* Attempting to resize `<parallel>` with no children throws error
* Marker at the end of transitions with actions do not properly show up on light themes
* Provide a language snippet for boostrapping an SCXML file


### Low Priority

* Transitions targeting multiple states are not supported
* Setting multiple initial states explicitly is not supported
* Command to remove all visualization parameters
* Context menu to zoom to fit
* Move inspector into separate docked webview?
* Move XML errors into separate docked webview (so we can erase and re-set them)
* Custom transition colors
* Export diagram as SVG or PNG
* Visual editing of custom actions with child elements
* Visual editing of custom actions derived via XSD
* Closing the text editor should close the webview


## Contributing

Want to help fix bugs or add features? Great! See the [Architecture documentation](docs/architecture.md)
for core concepts on how the extension works and information flows.

## Release Notes

### 0.4.0 (unreleased)

* Ctrl+S/Cmd+S with the visual editor focused will save the text editor


### 0.3.0 : 2023-Feb-27

Initial public release.
