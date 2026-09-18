# Photo Corrector (local prototype)

An isolated browser-only utility for technical correction of art and exhibition documentation photography. Images are never uploaded to CHAINED or any external service.

Currently working: JPG/PNG import (20 MB / 50 MP limits), contained canvas preview, non-destructive rotation/straighten/light state, four draggable perspective corners, a real projective perspective warp with bilinear resampling, connected local wall selection, before view, and JPG/PNG export from the original-resolution source canvas.

Known limits: the preview uses Canvas 2D and large full-resolution exports can use substantial browser memory. Crop is prepared but not implemented yet. Perspective warp is manual: it does not detect edges automatically and applies before whole-image rotation/straighten. Wall selection is local flood-fill without brush refinement or feathering in v1.

Open `index.html` through a local static server. No backend, API, AI, or dependency is required.
