# CHAINED public-image processor

Portable, offline image-processing container. It has no Supabase credentials, HTTP server, Cloud Run API, or job-claiming behavior.

It accepts a local source and creates `small.webp`, `large.webp`, and `result.json`:

```text
npm run process-image -- --input /input/A.jpg --output-dir /output/A
```

The fixed specifications are SMALL 960px/Q90 and LARGE 3200px/Q94. The processor preserves aspect ratio, never upscales or crops, normalizes EXIF orientation, attaches the tracked CHAINED sRGB v4 profile, and emits sanitized failure codes only.

`CHAINED_MAX_DECODED_PIXELS` is intentionally configurable; its default is 60 MP pending container measurement. Inputs remain capped at 50 MiB. The Dockerfile sets libvips concurrency to one; deploy-time CPU, memory, timeout, and request concurrency remain configuration outside this portable container.

Build and execute after Docker is available:

```text
docker build -t chained-public-image-processor services/public-image-processor
docker run --rm --memory=2g -v /absolute/input:/input:ro -v /absolute/output:/output chained-public-image-processor --input /input/A.jpg --output-dir /output/A
```
