# SketchSensAI

A runnable drawing-coach demo: five subjects, pressure-sensitive stylus/mouse/touch input, pen and eraser, undo/redo, guided overlays, and downloadable before/after comparisons. Install the Node dependencies with npm.

## Run today

Requires Node.js 22.9+ (Node 24 recommended).

```sh
cp .env.example .env
npm ci
npm start
```

Open http://localhost:3000. Draw, click **Get drawing guidance**, trace each reference part and use Next part to advance, then **Finish & compare**. The optional studio profile is a browser-local demo identity, not secure authentication. Sketch history stays in that browser (latest eight saves); use downloads for durable copies.

The default `AI_PROVIDER=demo` works offline using openly labeled preset template tips. It does **not** recognize the drawing. Real recognition and personalized correction paths require a configured vision model. References are simplified vector depictions of real objects, not retrieved photographs. AI overlays are model suggestions, not precise geometric measurements.

## Hugging Face vision AI

Create a Hugging Face token with Inference Providers access. In https://huggingface.co/playground choose a currently available **vision/image-text-to-text** model that supports image input, and copy its model ID. Availability and pricing depend on the provider.

Set in `.env` and restart:

```dotenv
AI_PROVIDER=huggingface
HF_TOKEN=your_token
HF_MODEL=your_available_vision_model_id
```

The backend sends the drawing PNG to `https://router.huggingface.co/v1/chat/completions`. Tokens remain on the server. It validates the returned feedback and SVG paths. Failed requests show an error without silently substituting preset feedback. Do not commit `.env`.

Official guide: https://huggingface.co/docs/inference-providers/tasks/chat-completion

## Local vision AI over Tailscale

The **app backend**, rather than the visitor's browser, connects to the model. Run an OpenAI-compatible vision model server (for example a compatible vLLM or llama.cpp vision setup) on the GPU machine at port 8000. Load a vision model from Hugging Face with its required image processor/projector; a text-only model cannot analyze sketches.

1. Install Tailscale on both the GPU machine and the machine running this Node backend. Sign in to the same tailnet or share the model device with your teammate. Allow access in your tailnet policy.
2. On the GPU machine, proxy the model's loopback port privately:

   ```sh
   tailscale serve --bg http://127.0.0.1:8000
   tailscale serve status
   ```

3. Copy the HTTPS device address shown by Tailscale, then configure the app:

   ```dotenv
   AI_PROVIDER=local
   LOCAL_AI_BASE_URL=https://your-gpu.your-tailnet.ts.net/v1
   LOCAL_AI_MODEL=the_model_id_your_server_exposes
   LOCAL_AI_API_KEY=your_model_server_key_if_required
   ```

4. From the backend machine, check connectivity with `curl https://your-gpu.your-tailnet.ts.net/v1/models` (supply your server's authentication if required). Restart `npm start`, then analyze a drawing.

To let your teammate use your running studio, run `tailscale serve --bg http://127.0.0.1:3000` on the app machine and share its tailnet HTTPS URL. This is shared access to the app; sketches remain local to each browser, not a live multi-user canvas.

Tailscale Serve is private to the tailnet. A cloud-hosted public app cannot reach this private endpoint unless its backend also has tailnet access. The hosted static preview runs preset coaching only. Use this Node backend on a Tailscale device for local AI; for public hosting, deploy the backend to a supported server and configure reachability and authentication. Tailscale Funnel exposes a service publicly and is unnecessary for the private setup above. Do not publish an unauthenticated model endpoint.

Official Serve guide: https://tailscale.com/docs/reference/tailscale-cli/serve

## Live drawing suggestions

With `AI_PROVIDER=local` and `LOCAL_AI_MODEL` configured, a **Live suggestions** checkbox appears in the coaching panel. After two seconds without a stroke, the app sends the current ink, the reference when available, and the current guide-part instruction to your local vision model. It returns up to two short practice tips about the visible drawing, such as joining a gap or keeping a curve smooth. Both preset practice and Freehand support these suggestions.

Each browser makes at most one request every fifteen seconds, with one request in flight. Changed drawings discard outdated replies; clearing, changing subjects, disabling suggestions or finishing cancels pending coaching. Guide generation pauses coaching so the two tasks do not compete from the same browser. The guide itself stays in place. Empty canvases do not trigger feedback. `LIVE_COACH_TIMEOUT_MS=30000` controls the local request deadline; feedback also depends on your model's inference speed. These requests use only your local model and consume no Hugging Face image credits.

## Work together on GitHub

Repository: https://github.com/wonderwhy1120-cmd/SketchSensAI

The repository owner should invite the teammate under **Settings → Collaborators**. Each person clones it, copies `.env.example` to `.env`, and uses a separate feature branch:

```sh
git clone https://github.com/wonderwhy1120-cmd/SketchSensAI.git
cd SketchSensAI
git switch -c feature/your-task
```

Suggested split for today's demo:

- Person 1: `public/` — drawing tools, responsive UI, coaching flow.
- Person 2: `server.mjs`, `test/`, `docs/` — Hugging Face/local model configuration and deployment.

Agree before both editing `public/templates.js`, which defines the shared subject and response format. Open pull requests to `main`; merge and pull frequently. The GitHub workflow runs syntax and API checks for each PR. Use GitHub collaboration for development; this demo does not synchronize drawing strokes between users.

## Checks and boundaries

```sh
npm run check
npm test
```

The API tests cover static serving, secret-file exclusion, invalid input, cross-origin requests, template labeling, and model-output validation. No paid/live model calls are made by tests. Browser/stylus behavior requires manual checking on your hardware.

For a production launch, add real authentication, persistent per-user storage, per-user rate limits and request concurrency limits before exposing a paid inference backend. This same-day prototype binds to loopback by default. Frontend demo profiles do not protect the API.

Local inference tuning: `AI_TIMEOUT_MS=180000` allows three minutes per request; it does not accelerate inference. `AI_MAX_TOKENS=700` caps generated output. Increase it if the model hits the token limit. Keep responses concise to reduce generation work.

In Freehand, type any object or scene into the box and select **Generate guide**, even on a blank canvas. You can also sketch first and select **Guess my drawing**. Command+Z (Control+Z on Windows/Linux) undoes a stroke; Command+Shift+Z (Control+Shift+Z) redoes it. Shortcuts preserve native text undo while typing.

Freehand recognition asks the vision model for up to three likely objects with reasons and suggestions about the actual sketch. Choose a guess, name a different object, or keep drawing and ask again.

The **More detail** checkbox in the Freehand toolbar controls the next generated guide. Checked requests rich interior features and finer tracing contours; unchecked requests simpler outlines while preserving the requested subjects and setting. Each detail level uses a separate cache entry. Change it before generating or selecting a recognized object.

Every Freehand guide sends the full description directly to the configured image-generation model. Freehand does not use online icons, bundled outlines, keyword compositions or practice-shape substitutes. Generation and tracing failures show an error and retain the current sketch. Preset subjects continue using their existing reference geometry.

Freehand references require a **text-to-image** model. Qwen-VL continues to handle recognition and coaching; it no longer invents coordinates or assembles icon collages. The backend uses Hugging Face's image-generation client, then extracts stroke centerlines from the resulting coloring-book style image. The actual generated image appears in the reference panel, and its extracted lines form the tracing parts. Guides fit the complete canvas with comfortable margins and consistent placement across parts.

Configure these in `.env` and restart:

```dotenv
HF_TOKEN=your_token_with_inference_providers_permission
HF_IMAGE_MODEL=Qwen/Qwen-Image-2512
HF_IMAGE_PROVIDER=fal-ai
IMAGE_TIMEOUT_MS=180000
IMAGE_MAX_ATTEMPTS=2
```

`HF_IMAGE_TOKEN` can supply a separate token. Image generation is independent of `AI_PROVIDER`, so local vision coaching can run alongside hosted image generation. Availability and billing depend on the selected provider. The backend caches the latest twelve generated references and shares concurrent requests for the same description.

Generation requests a detailed black-and-white line-art illustration with white interiors and single black contour lines, with a negative prompt excluding shading, color and large solid fills. Animal features, tree branches, foliage outlines and architectural details are requested explicitly. Tracing preserves finer contours and splits long strokes into safe navigation parts instead of discarding them. Keyword/icon backups bypass raster tracing tolerance; their notice includes the generation failure reason. Successful generated references are cached until the backend restarts. Qwen Image uses 28 inference steps and guidance 4; fal receives the correct `image_size` parameter. The outline check rejects color, extensive midtones, large filled regions and excessive path complexity. Accepted images are normalized to pure black and white before display. If quality validation fails, the app automatically generates once more with a simpler outline prompt, keeping the requested subjects. Both attempts share `IMAGE_TIMEOUT_MS`; provider/authentication errors do not trigger a retry. Set `IMAGE_MAX_ATTEMPTS=1` to disable the extra paid generation. If both quality attempts fail, the backend recovers prominent contours from the generated image, simplifies them, renders those paths onto pure white paper, and checks the resulting outline again. The cleaned reference and tracing parts use these same paths. Conversion makes no additional paid image request; blank images still have no recoverable contours. Prompting reduces unsuitable outputs but cannot guarantee model compliance.

References allow up to 2,000 paths and 40,000 drawing commands. Vehicles and road scenes use the same generation pipeline as every other Freehand request.

Image generation API: https://huggingface.co/docs/inference-providers/tasks/text-to-image

Online reference API: https://iconify.design/docs/api/search.html


## Freehand generation failures

No fallback reference is returned for Freehand requests, including simple objects, recognized objects, detailed descriptions and scenes. Provider errors and unsupported tracing geometry are reported to the user for retry. Contour recovery may convert the actual generated image into clean outline paths; it never replaces the requested subject with a catalog icon. Successful generated references are cached by the full description until the backend restarts.
