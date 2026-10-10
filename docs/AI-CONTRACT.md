# Model adapter contract

POST `/api/analyze`: `{subject: 'house'|'car'|'cup'|'tree'|'bicycle', image: 'data:image/png;base64,...'}`.

Returns `{source,match,summary,steps:[{title,instruction,path}]}`. Paths use drawing coordinates 800 × 600. The browser renders one guide at a time, never injects model-provided HTML, and excludes guides from exported drawings. The original image is captured at the first analysis; repeated analysis keeps that original.

The backend accepts only allowlisted subjects, limits input size, times out inference after 60 seconds, validates model text lengths and paths, and returns explicit errors. When a step has no valid path, a preset path for the matched object is used; this fallback may not align with the submitted drawing. Improve geometric alignment separately from model-generated prose.

Frontend: `public/app.js`, `public/style.css`, `public/index.html`.
Subject references and demo coaching: `public/templates.js`.
Model integration and HTTP API: `server.mjs`.

Demo identities and saves are localStorage data, not accounts. Hosted static builds have no AI API; they default to template mode.
