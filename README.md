# Visual SCXML Editor

An extension for Visual Studio Code that visualizes SCXML state charts,
and provides the ability to visually adjust the state chart,
in a manner that allows the SCXML to still be used in production.

![](docs/example.png)

## Features

* Side-by-side editing allows you to edit either the XML code or the graphics and have
  the other reflect the changes
* Selecting states and transitions highlights them in the text editor, making then easy to find
  for hand-editing or detailed inspection
* Visual changes are stored in a custom namespace that does not affect SCXML operation
* Visualization goes beyond just states and transition flow:
  * See which states have actions performed on entry or exit
  * See which transitions execute actions
  * See which transitions have conditions guarding them,
    or have no condition or event at all.
  * See transitions that just execute an action, but don't leave the state.
* Visually differentiates transitions with actions
* Visually differentiates transitions with conditions
* Default visual style matches the current VS Code theme
  * Customization of state colors allows for additional information to be conveyed
* Inspector palette supports authoring of custom actions (requires custom elements in SCXML)
* Route of transitions around states via waypoints;
  rounded corners make it clear when transitions turn versus cross another.


## Instructions

1. Open an SCXML file, ensure VS Code knows the language is set to XML,
   and then invoke the command `SCXML Editor: Open to the Side`
   * Your states will (currently) be displayed in a jumbled mess. Sorry about that.
2. Drag states to impose order and clarity.

_Better instructions to come when there's more useful


### Commands

* `SCXML Editor: Open to Side` — Opens a visual editor tied to the current SCXML document;
  only available if the language for the active text editor is set to XML.
* `SCXML Editor: Add State` — Creates new state(s) in the state machine.
  If any state(s) are selected the new states are added as children of them.
  Also available via context menu in the visual editor.
* `SCXML Editor: Expand State to Fit Children` — Parent state(s) selected in the
  visual editor will have their placement adjusted to ensure all children fit within them.
* `SCXML Editor: Zoom to Fit` — Fit the entire state machine in the visual editor.
* `SCXML Editor: Zoom to 100%` — Adjust the zoom to the base size.
* `SCXML Editor: Show/Hide Events` — Toggle the display of transition events.
* `SCXML Editor: Delete Selection Only` — Delete selected state(s) and transition(s)
  in a least-destructive manner:
  * Unselected child-states are not deleted, but are instead re-parented up a level.
  * Transitions targeting any state(s) to be deleted are not themselves deleted,
    but instead have their `target` attribute changed to not target that state.
* `SCXML Editor: Delete Selection and References` — Delete selected state(s) and transition(s) in the most destructive manner:
  * Descendant states are also deleted.
  * Transitions targeting state(s) to be deleted are also deleted.

### Keyboard Controls in the Visual Editor

* `Space` — enable pan via left mouse drag
* `Middle-MouseWheel Drag` — pan around the document
* `TrackpadScroll` — pan around the document
* `Trackpad Pinch` — zoom in/out
* `Ctrl-MouseWheel` — zoom in/out
* `MouseWheel` — pan up/down
* `Shift-MouseWheel` — pan left/right
* `Delete` — Delete Selection Only
* `Shift+Delete` — Delete Selection and References
* `Ctrl+Alt+Z`/`Cmd+Alt+Z` — Zoom to Fit
* `Alt+Shift+Z` — Zoom to 100%
* `e` — Show/Hide Events


## TODO (Known Issues, Planned Features)

### High Priority

* Bug: Selection keeps getting dropped when editing some attributes
  (e.g. label `placement` alignment for a transition)
* Bug: First selection often drops selection, second sticks
* Create via context menu should place at cursor, not drag parent
* Create transition graphically via context menu
* Add graphical editing of transition waypoints
* Bug: Transition with only first point set does not draw to target state
* Ctrl-S/Cmd-S in visual editor should save text editor
* Move keybindings in visual editor to commands that can be invoked

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


## Release Notes

### 0.3.0

Under-development version
