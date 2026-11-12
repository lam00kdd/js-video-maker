# CP5.0 — Renderer and feature decision matrix

| Candidate | Visual range | Determinism / preview-MP4 parity | Security | Performance | Recommendation |
|---|---|---|---|---|---|
| Extend classic renderer directly | Low-medium; tightly coupled to current defaults | Existing path can stay stable, but features spread through legacy draws | Good if fields remain constrained | Good today | Keep as legacy adapter; poor foundation for v3 |
| Extend Scene Graph v2 in place | Medium; already has groups, paths, actions, characters | Existing resolver helps; schema additions can destabilize mode | Good with validation | Good for current scenes | Use as migration reference, not v3 contract |
| New normalized Canvas2D v3 | High for vector, typography, assets, 2.5D layers | High if preview/export share evaluator and draw modules | Strong with bounded declarative input | Suitable with budgets/cache | **Recommended MVP backend** |
| DOM/SVG per scene | High vector expressiveness | Browser layout/font/export differences complicate parity | SVG sanitization required | Variable with complex DOM | Use sanitization/import tooling only, not primary backend |
| WebGL renderer | High at scale for complex effects | Shader and browser parity complexity | More complex resource controls | Excellent for heavy scenes, unnecessary now | Revisit only if measured Canvas limit reached |
| Hybrid Canvas2D + WebGL | Very high | Two composition pipelines and z-order boundaries | Larger attack/perf surface | High ceiling | Later only with benchmark evidence |

## Feature staging

| Feature | MVP v3 | Later | Exclude |
|---|---|---|---|
| Groups, nested transforms, origin, opacity | Yes, depth capped | — | — |
| Rect/ellipse/line/polyline/polygon/path/text/image/symbol/character | Yes | — | — |
| Linear gradient, stroke cap/join, one shadow | Yes | Radial gradient, bounded blur | Arbitrary filter graph |
| Clip path | Simple vector clip | Alpha masks after prototype | Remote or nested external masks |
| Bundled fonts and wrapping | Yes | Text shaping enhancements | Unbundled arbitrary system font names |
| Timeline | Absolute-time bounded keyframes | Spring-like easing if deterministic | Arbitrary expressions/scripts |
| Camera/parallax | 2D pan/zoom and layer depth | Multi-plane 2.5D presets | Free camera/3D simulation |
| Asset formats | PNG/WebP | Sanitized SVG ingest; AVIF only if decode parity proven | Remote media, arbitrary HTML |
| Blend modes | Normal/source-over | Small whitelist after parity tests | Arbitrary browser composite modes |

## Known risks and decision reversals

Canvas text and image decode can vary by browser/OS, so bundle fonts, freeze readiness and test the deployed browser. Raw SVG parsing is a security boundary; use a maintained parser plus strict allowlist or normalize to internal geometry. Canvas redraw cost can rise with large shadows and high resolution; instrument full scene time and memory before raising caps. If future measured workloads exceed Canvas budget, prototype isolated WebGL layers while preserving the same normalized graph and frame evaluator.
