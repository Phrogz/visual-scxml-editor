# Visual SCXML Editor

An extension for Visual Studio Code that visualizes SCXML state charts, and provides the ability to visually adjust the state chart.


## Features

* Editing the XML for the state chart updates the graphics, and vice-versa.
* Default visual style matches the current VS Code theme.
  * Customization of state colors allows for additional information to be conveyed.
* Visual changes are stored in a custom namespace that does not affect SCXML operation.
* Support for `state`, `parallel`, `history`, and `final` nodes.
* Powerful and attractive routing of transitions via waypoints.


## Instructions

### Keyboard Controls

* `E` — will toggle the display of transition event labels
* `Ctrl-Alt-Z`/`Cmd-Alt-Z` — Zoom diagram to fit entire diagram
* `Alt-Shift-Z` — Zoom diagram to "100%" size
* `Space` — enable panning


## TODO (aka Known Issues, Planned or Missing Features)

### High Priority

* Show entry/exit actions on states for custom actions
* Editor namespace should get added to root, not states
* Selection keeps getting dropped when editing some attributes
* Add graphical editing of transition waypoints
* Create transition graphically via context menu
* Create state graphically via context menu
* Transition with only first point does not draw to target state; should
* First selection of transition drops selection, second sticks
* Author custom actions


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


### Low Priority

* Transitions targeting multiple states are not supported
* Setting multiple initial states explicitly is not supported
* Command to remove all visualization parameters
* Context menu to zoom to fit
* Move inspector into separate docked webview?
* Move XML errors into separate docked webview (so we can erase and re-set them)
* Custom transition colors
* Export diagram as SVG or PNG



## Release Notes

### 0.1.0

Under-development version
