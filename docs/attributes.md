This file documents the custom attributes added for visualization.
All attributes are in the namespace `http://phrogz.net/ns/visual-scxml-editor`,
usually denote with the namespace prefix `viz`.

The names and values are intentionally somewhat terse to limit the amount of text added to what
should be a human-readable and human-editable XML file.

## States

* **`viz:xywh="x y w h"`** — Four numbers separated by whitespace indicating the left and top
  location of the top left corner, and the width and height of the state. All values are in global
  space, even for states that are children of another state. (Moving the parent state in the visual
  editor updates the x,y coordinates for all descendants.)

  To be visualized correctly children of a parallel must:
  * Be arranged left-to-right, in source code order, dividing up the width of the parent.
  * `child.y = parallelParent.y + 30`
  * `child.h = parallelParent.h - 30`

* **`viz:rgb="rrggbb"`** — hexadecimal integer values for red, green, and blue fill color


## Transitions

* **`viz:pts="start (wayline+)? end?"`** — route points for the transition line
  * The first and last values (`start` and `end`) describe offsets along an edge of the initial and
    target state; for example, `E20` is a point 20 units down from the top of the right edge, while
    `N0` is a point (nominally) along the of the state at the left edge. Transitions cannot attach
    in the rounded region of a state, and so `N0` is actually the leftmost point on the top edge
    where the edge is straight, and `N999999` would result in the rightmost point on the straight
    portion of the top edge.
  * Waylines are horizontal or vertical locations _in global coordinates_ that the transition's path
    must pass through. A wayline of `X10` causes the transition to pass through the closest point on
    the vertical line at `x=10`; a wayline of `Y-100` causes the transition to pass through the
    closest point on the horizontal line at `y=-100`.
* **`viz:r="10"`** — fixed corner radius to use when changing direction
* **`viz:offset="along"`**, **`viz:offset="along across"`** — distance from the transition start
  point to place text `along` the transition's route, with an optional offset `across`
  (perpendicular to) the transition's path at that point; positive values for `across` are to the
  right, negative to the left
* **`viz:align="NW|N|NE|W|C|E|SW|S|SE"`** — alignment of the text around the offset point: `N` places
  the text to be above the point and horizontally centered, `NW` makes it above and right-justified, and so on.
