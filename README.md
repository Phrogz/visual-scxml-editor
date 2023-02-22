# Visual SCXML Editor

An extension for Visual Studio Code that visualizes SCXML state charts,
and provides the ability to visually adjust the state chart.


## Features

* Editing the XML for the state chart updates the graphics, and vice-versa
* Selecting states and transitions highlights them in the text editor
* Default visual style matches the current VS Code theme
  * Customization of state colors allows for additional information to be conveyed
* Visual changes are stored in a custom namespace that does not affect SCXML operation
* Inspector palette supports authoring of custom actions (requires custom schema addition to SCXML)
* Visually differentiates states with entry/exit actions
* Visually differentiates transitions with actions
* Visually differentiates transitions with conditions
* Powerful and attractive routing of transitions via waypoints


## Instructions

### Controls

* `E` — toggle the display of transition event labels
* `Ctrl-Alt-Z`/`Cmd-Alt-Z` — zoom to fit entire diagram
* `Alt-Shift-Z` — zoom to "100%" size
* `Space` — enable pan via left mouse drag
* `Middle-MouseWheel Drag` — pan around the document
* `TrackpadScroll` — pan around the document
* `Trackpad Pinch` — zoom in/out
* `Ctrl-MouseWheel` — zoom in/out
* `MouseWheel` — pan up/down
* `Shift-MouseWheel` — pan left/right


## TODO (Known Issues, Planned Features)

### High Priority

* Document visualization meaning
* Bug: Selection keeps getting dropped when editing some attributes
  (e.g. label `placement` alignment for a transition)
* Bug: First selection often drops selection, second sticks
* Create state graphically via context menu
* Create transition graphically via context menu
* Add graphical editing of transition waypoints
* Bug: Transition with only first point set does not draw to target state
* Improve mouse-based navigation:
  * Middle-mouse drag to pan
* Ctrl-Z in visual editor should ask text editor to undo

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

### 0.1.0

Under-development version
