# SketchSensAI

A runnable drawing-coach demo: five subjects, pressure-sensitive stylus/mouse/touch input, pen and eraser, undo/redo, guided overlays, and downloadable before/after comparisons. No dependencies to install.

## Run today

Requires Node.js 22.9+ (Node 24 recommended).

```sh
cp .env.example .env
npm start
```

Open http://localhost:3000. Draw, click **Get drawing guidance**, adjust your lines, advance through the steps, then **Finish & compare**. The optional studio profile is a browser-local demo identity, not secure authentication. Sketch history stays in that browser (latest eight saves); use downloads for durable copies.

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
