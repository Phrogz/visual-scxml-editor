# Visual SCXML Editor

An extension for Visual Studio Code that visualizes SCXML state charts, and provides the ability to visually adjust the state chart.


## Features

* Editing the XML for the state chart updates the graphics, and vice-versa.
* Default visual style matches the current VS Code theme.
  * Customization of state colors allows for additional information to be conveyed.
* Visual changes are stored in a custom namespace that does not affect SCXML operation.
* Support for `state`, `parallel`, `history`, and `final` nodes.
* Powerful routing of transitions via waypoints

## Instructions

TODO


## TODO (Known Issues, Missing Features)

* Transitions targeting multiple states are not supported
* Setting multiple initial states explicitly is not supported
* Show entry/exit actions on states for custom actions
* Editor namespace should get added to root, not states
* Selection keeps getting dropped when editing some attributes
* Changing state or extension types in inspector does not update code to match.
* Toggle ruler/grid to show where transitions route
* No graphical editing of transition waypoints
* Automatic layout of a state chart with no graphical information
* Custom action schema
* Documentation showing screenshots, animation of auto routing
* Add state in webview via context
* Start transition in webview via context
* Documentation on instructions
* Move inspector into separate docked webview?
* Move errors into separate docked webview (so we can erase and re-set them)
* Context menu to zoom to fit
* Fade out text below certain zoom level
* Shrink markers below certain zoom level
* Transition with only first point does not draw to target state; should
* First selection of transition drops selection, second sticks
* Optionally draw condition as a label if no even is specified (e.g. "if (…)")
* Optionally add condition to an event label ("event\nif (…)")
* Maybe support custom transition colors?
* Moving a transition (with waypoints?) to the root level causes runtime error
* Export diagram as SVG or PNG

## Release Notes

### 0.1.0

Under-development version
