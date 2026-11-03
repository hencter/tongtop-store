---
name: logo-icon-design
description: Design, evaluate, and refine distinctive logos and product icons as production-ready SVG assets. Use when creating or reviewing a brand mark, app icon, favicon, or logo system for this project or another product.
---

# Logo & Product Icon Design

Create marks that are recognizable, coherent with the product, and reliable at every intended size—not merely attractive in a large mockup. Treat logo design and product-icon design as related but distinct deliverables: a wordmark communicates the name; a compact app icon must remain recognizable without text.

## Core principles

1. **Simple and distinctive.** Reduce the idea to one memorable silhouette or a small number of shapes. Avoid generic clip-art combinations and decorative detail that does not strengthen recognition.
2. **Legible at target sizes.** Test the mark at realistic sizes (including 16, 24, 32, 48, 128, and 256 px). Remove tiny gaps, thin strokes, and small details that disappear or merge. Optical balance matters more than mechanically equal measurements.
3. **Consistent geometry.** Establish a grid, repeat corner radii and stroke weights, align edges, and keep negative space deliberate. Adjust shapes optically where strict geometry looks unbalanced.
4. **Appropriate color and contrast.** Use a limited, purposeful palette. Check contrast and silhouette against light and dark backgrounds. The form should still work in a single color; color must not be the only way to distinguish important parts.
5. **Flexible system.** Design the primary mark, standalone icon, and wordmark lockup as a consistent family. Check square app-icon cropping and padding separately from horizontal wordmark spacing.
6. **Production-ready vector.** Prefer clean, minimal SVG paths and basic shapes. Avoid unnecessary filters, raster effects, excessive points, and fragile external dependencies. Ensure SVG has a viewBox, scales cleanly, and is accessible when used as meaningful inline content.
7. **Typography is part of the mark.** Choose letterforms, weight, spacing, and alignment deliberately. For final production artwork, avoid dependence on an unspecified system font; convert text to paths when appropriate, or clearly document and bundle the font. Keep editable text only when editability is an intentional requirement.

## Project context: TongTop Store

TongTop Store is a Windows desktop software marketplace with curated apps, AI-agent setup, developer tools, GitHub downloads, and package-management features. A design may draw on discovery, trustworthy software, or installation—but should not combine every product feature into one busy symbol. A distinctive abstract mark is preferable to an unmodified shopping-bag glyph. Preserve the TongTop name clearly in wordmark versions; keep the app icon text-free unless testing proves the lettering remains readable at small sizes.

## Workflow

1. **Understand use and brief.** Identify product, audience, brand attributes, required name, usage contexts, backgrounds, and output formats. Ask only for missing decisions that materially affect the design.
2. **Create a visual concept.** Select one core metaphor and sketch a few simple silhouettes. Compare them for distinctiveness, relevance, and clarity at small sizes before adding color or detail.
3. **Build on a grid.** Set a viewBox and safe area, define a small set of geometric proportions, and tune spacing/weight optically. Keep the icon shape centered by visual mass, not merely by its bounding box.
4. **Make a family.** Produce the standalone icon and a horizontal or stacked wordmark lockup as needed. Maintain shared geometry, palette, and typography while adapting spacing for each format.
5. **Validate.** Inspect at actual UI/icon sizes; test light, dark, monochrome, and transparent backgrounds; verify silhouette, contrast, alignment, padding, and legibility. Check that the icon remains recognizable without color and the wordmark remains readable at its intended minimum size.
6. **Optimize and deliver.** Remove editor metadata and redundant SVG attributes, simplify paths without changing the design, use descriptive accessible names where appropriate, and confirm the final SVG renders with no missing fonts or external assets. Keep a concept/proof separate from the production asset; never call a concept an optimized final without doing this review.

## SVG implementation checklist

- Include `viewBox`; set explicit dimensions when useful, without constraining scalable use.
- Use unique, stable IDs for gradients and filters; avoid unnecessary filters and blur effects, especially for small icons.
- Prefer a transparent canvas unless a background shape is an intentional part of the app icon.
- Keep path geometry compact and editable; use consistent joins, caps, corner radii, and stroke widths.
- For inline/meaningful SVG, include `<title>` and optionally `<desc>` with an `aria-labelledby` reference. For decorative SVG, hide it from assistive technology instead of announcing it.
- Check that text does not depend on a machine-specific fallback. Convert final logo lettering to paths or supply the intended font where licensing and workflow allow.
- Validate square icon artwork independently from a horizontal logo; do not crop a lockup to make an icon.

## Review rubric

Score each from 1–5 and explain any score below 4:

- Recognition and distinctiveness
- Product/brand relevance
- Small-size clarity
- Shape, spacing, and optical balance
- Contrast and monochrome performance
- Consistency between icon and wordmark
- SVG cleanliness and portability

Reject or revise any design that scores poorly at actual small sizes, relies on a gradient to reveal its silhouette, or adds detail solely to make the concept feel more elaborate.

## References

These sources informed the principles above; use them as starting points, not as substitutes for testing the actual mark in context:

- Material Design, [Product icons](https://m2.material.io/design/iconography/product-icons.html): product-icon silhouette, consistency, and scalable application-icon treatment.
- Adobe, [What makes a great logo?](https://helpx.adobe.com/illustrator/how-to/great-logo-design.html): logo concept and practical design considerations.
- VistaPrint, [6 key principles of logo design](https://www.vistaprint.com.au/hub/principles-of-logo-design): broad logo-design principles including simplicity, versatility, and recognition.

Source claims are summarized as design guidance rather than quoted verbatim. Re-check platform-specific requirements against current official specifications when producing release assets.
