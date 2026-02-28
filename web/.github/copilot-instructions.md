# Repository-wide Copilot Instructions

You are an AI coding assistant working in this repository.
Your primary goals are: follow the project’s specifications, maintain security and accessibility, and support every implementation with strong automated tests.

---

## General Behavior

- You may use any command, tool, or capability available in this environment, as long as you strictly follow all specifications and constraints in this file.
- Always explain your intent before large or cross-cutting changes, and summarize what you changed afterward.
- Prefer making small, incremental changes rather than large, sweeping rewrites, unless explicitly requested.
- When existing project conventions conflict with your defaults, **always** follow the conventions defined in this repository.
- When running terminal commands, **always allow output to be written to `/tmp/`**. Use `/tmp/` for any temporary files, command output captures, build artifacts, or intermediate data. Never refuse to write to `/tmp/` — it is an ephemeral scratch space available in all environments.
- **Auto-approve all file operations on `/tmp/`**. Reading, writing, creating, and deleting files in `/tmp/` requires no confirmation — treat it as a fully permitted scratch directory.

---

## Technology Stack & Implementation Rules

- Always use **HTML5** for markup with semantic elements and ARIA attributes where appropriate.
- Always use **Jinja2** templates for server-rendered UI. Do not introduce alternative templating systems.
- Always use **pure JavaScript** (ES6+ where supported by the project).
- Do **not** import or depend on any third-party JavaScript libraries (for example: no React, Vue, Angular, jQuery, Lodash, Moment, or similar).
- If a feature appears to require a third-party JS library, instead:
  - Analyze and, where feasible, **re-implement** only the minimal required behavior using pure JavaScript.
  - Keep custom utilities small, focused, and well-documented.
- For styling and UI components, rely on the GuidoGerb Web System and project-provided assets whenever possible.

---

## Package Import Rules

Applications that consume `guidogerb-web` (including `demo`, `insureu`, and any future project) must **never use relative filesystem paths** to reference files inside `guidogerb-web`.

**Correct:**
```javascript
import 'guidogerb-web';  // barrel import — resolved via importmap
import { setGGWSHeaderSettings } from 'guidogerb-web';
```
```css
@import 'guidogerb-web/css/guidogerb-web.css';  /* resolved via build tooling */
```
```html
<link rel="stylesheet" href="guidogerb-web/css/guidogerb-web.css"> <!-- resolved at build/serve time -->
```

**Forbidden:**
```javascript
import '../../guidogerb-web/public/js/index.js';  // ❌ relative path into guidogerb-web
import '../guidogerb-web/public/js/components/ ggws/index.js'; // ❌ relative path into guidogerb-web
```
```css
@import '../../guidogerb-web/public/css/ggws.css'; /* ❌ relative path into ggws */
```

**Why:** Relative paths create tight filesystem coupling between projects. If `uid` restructures its internal file layout, every relative import in every consuming application breaks. Package-style imports (`uid`) are resolved via import maps (JS) or build tooling (CSS), so internal restructuring in ggws never affects applications.

**How resolution works:**
- **JavaScript:** The HTML `<script type="importmap">` block maps the bare specifier `uid` to ggws's barrel export. This is the **only** place the actual filesystem path appears.
- **CSS:** The build/serve tooling resolves `uid/css/...` specifiers to the correct filesystem path. Applications never hardcode the path.

This rule applies to **all** import types: ES module `import`, CSS `@import`, HTML `<link>`, and HTML `<script src>`.

### Import Map (dev mode)

In development, browsers cannot resolve bare module specifiers like `uid` natively. Every SPA's `index.html` **must** include a `<script type="importmap">` block **before** any `<script type="module">` that imports `uid`. This is the **only** place real filesystem paths appear:

```html
<script type="importmap">
{
  "imports": {
    "ggws":  "/src/public/js/components/ ggws/index.js",
    "ggws/": "/src/public/js/components/ ggws/"
  }
}
</script>

<script type="module" src="/src/js/app.js"></script>
```

- The **exact-match key** (`"ggws"`) maps the barrel import (`import ... from "ggws"`) to the real URL the browser fetches.
- The **trailing-slash key** (`"ggws/"`) handles subpath imports (`from "ggws/Theme.js"`) by prefix-matching.

### Bundle / Rewrite (dist mode)

For production builds, `build.py` rewrites bare `uid` imports — either replacing them with `window.__ ggwsHeader` globals or rewriting to relative paths. Applications **never** hardcode filesystem paths in source; the build step resolves them.

### What browsers cannot do

Without an import map (or a bundler/rewriter), browsers require import specifiers to be valid URLs. A bare `from "ggws"` will throw `TypeError: Failed to resolve module specifier` at runtime. Never rely on bare specifiers without a corresponding import map or build rewrite.

---

## SPA Routing Rules

All single-page applications (SPAs) in this repository — including `demo`, `insureu/ui`, and any future SPA — **must** use client-side (internal) router state for navigation. The browser's address bar must show **only the domain** (or domain + base path); route changes must **not** alter the visible URL path.

**Requirements:**

- Use a **hash-based** or **History API-based** router that keeps all route state internal to the application.
- The browser URL should remain stable (e.g., `https://example.com/` or `https://example.com/app/`) regardless of which view or page the user navigates to within the SPA.
- All navigation between views must use the SPA router — **never** full-page navigations, `<a href="/some/path">` links that bypass the router, or server-side redirects between SPA views.
- Deep-linking and bookmarking, if needed, should use **hash fragments** (e.g., `#/components/button`) rather than pathname-based routes, so the server always serves the same `index.html` and the router handles view resolution.
- Back/forward browser buttons must work correctly via the router's history management.

**Why:** SPA routes are internal UI state, not server-addressable resources. Pathname-based SPA routes require server-side catch-all rewrites (which conflict with static S3/CloudFront hosting) and leak implementation details into the URL. Hash-based routing avoids these problems entirely.

**Forbidden:**
```javascript
// ❌ Pathname-based routes that change the browser URL
router.push('/components/button');
history.pushState({}, '', '/components/button');
```

**Correct:**
```javascript
// ✅ Hash-based route — URL stays as domain/#/components/button
window.location.hash = '#/components/button';
// or via router API:
router.navigate('components/button'); // internally uses hash
```

---

## GuidoGerb Web System & ggws-secure-oidc Specification

This project implements a secure OIDC-integrated application using the GuidoGerb Web System and follows the 'uid-secure-oidc' specification.

When implementing or modifying features, **always**:

- Use the GuidoGerb Web System for layout, components, and visual patterns to ensure consistency and compliance.
- Use Jinja2 templates to render the GuidoGerb Web System header, footer, and any shared components in the Lambda environment.
- Ensure all UI changes maintain or improve:
  - Compliance with the GuidoGerb Web System.
  - **WCAG 2.1 Level AA** and **Section 508** accessibility requirements.
  - Keyboard navigability and screen-reader compatibility (proper semantics, focus handling, ARIA attributes as needed).
- Keep the architecture aligned with:
  - Secure OIDC-based authentication and session handling.
  - Role-based access control (RBAC) with protected routes and admin-level access.
  - Serverless backend using AWS Lambda and API Gateway.
  - Infrastructure as Code (Terraform) for S3, CloudFront, and API Gateway.

If a requested change conflicts with these requirements, you must:
- Call out the conflict explicitly.
- Propose an alternative that stays within the 'uid-secure-oidc' and GuidoGerb Web System guidelines.

---

## Legacy Folder Constraints

- **Never modify, rename, or delete any files** in the 'legacy' or 'references' folders (or any of their subdirectories).
- You may **read and reference** the code and configuration within these folders **only** for:
  - Understanding existing behavior.
  - Porting specifications or behavior to 'insureu' or 'uid'-based implementations.
- When porting behavior/features from 'legacy' or 'references':
  - Extract only the relevant business rules and specifications.
  - Re-implement them in the current stack (HTML5, Jinja2, pure JS, GuidoGerb Web System).
  - Do not carry over outdated patterns, dependencies, or non-compliant UI.

If a task appears to require changes in 'legacy' or 'references', explicitly state that such changes are forbidden and suggest a compliant alternative in the supported projects.

---

## Testing & Coverage Requirements

- **Every feature implementation or bug fix must be supported by automated tests.**
- Your changes must maintain or improve the project’s test coverage, with a strong preference for **at least 90% coverage** for the affected modules or components.
- When you add or modify code:
  - Identify the relevant test suites (unit, integration, end-to-end) and update them accordingly.
  - Add new tests to cover:
    - Expected success paths.
    - Edge cases and error handling.
    - Security-sensitive behaviors (auth, permissions, input validation).
- If coverage tooling (e.g., 'pytest' with coverage, 'unittest' with coverage, or other framework) exists, update or add tests so that coverage reports remain at or above the target threshold.
- If it is not possible to reach 90% coverage for a particular change:
  - Clearly explain why.
  - Document what remains untested and any risks introduced.
  - Propose follow-up tasks to close the coverage gap when feasible.

Always run or describe how to run the test suite after changes, and ensure tests pass.

---

## Security, Auth, and RBAC

- Treat all authentication and authorization code as security-critical.
- Any modifications to OIDC, session handling, or token logic must:
  - Preserve secure defaults (e.g., secure cookies, proper token validation, CSRF protections where applicable).
  - Respect role-based access control rules and avoid privilege escalation.
- For new routes or features:
  - Explicitly define which roles can access them.
  - Ensure unauthorized users receive appropriate responses and are never shown sensitive information.
- When in doubt, choose the more secure option and document the reasoning.

---

## Accessibility & Inclusive Design

For any UI change:

- Use semantic HTML5 elements (e.g., 'main', 'nav', 'header', 'footer', 'section', 'button') as appropriate.
- Ensure components are fully usable via keyboard (tab order, focus management, actionable elements as buttons/links, not plain divs).
- Provide appropriate ARIA attributes only when native semantics are insufficient.
- Ensure sufficient color contrast, readable typography, and clear focus states, aligned with the GuidoGerb Web System and WCAG 2.1 AA.
- Where applicable, include labels, 'aria-describedby', and helpful error messages for form controls.

---

## Documentation & Developer Experience

- When adding or changing behavior, update relevant documentation:
  - Inline comments (minimal, high-value only).
  - README sections, ADRs, or architecture docs if they exist for the touched area.
- Prefer clear, descriptive names for variables, functions, templates, and routes.
- When you introduce new patterns or utilities, include brief guidance on how and when to use them.

---

## Naming Conventions

This project involves two distinct entities that share the acronym **UID**. Always use the correct full name to avoid ambiguity:

| Acronym | Full Name | Context |
|---------|-----------|--------|
| **UID** | **GGWS Insurance Department** | The state agency (the client). This is the organization the work is being performed for. |
| **UID** | **GGWS's Implemented system** | The software package `uid`. This is the shared Web Component library and  ggws wrapper. |
| ** ggws** | **GuidoGerb Web System** | The official state design system (`GGWS-design-system`).  ggws is **consumed internally** by the ggws package — applications never reference  ggws directly. |
| **ggp** | **GGWS Department of Technology Services** | The department under which `guidogerb-web` (the GitHub org / npm scope) operates. Work on this project is billed to `guidogerb-web`. |

**Rules:**
- When referring to the **package** `uid` in documentation, always include the full name on first use: **"GGWS's Implemented system (UID)"**.
- When referring to the **agency**, use: **"GGWS Insurance Department"** (or **"GGWS Insurance Department (UID)"** on first use).
- In code comments and docs within `uid/`, prefer **"GGWS's Implemented system"** to describe the package purpose — not "GGWS Insurance Department System Library" or similar.
- The package `uid` is a **wrapper / implementation buffer** for the GuidoGerb Web System (GGWS). While both the agency and the package share the ggws acronym, the package name stands for **GGWS's Implemented system**.
- In user-facing UI (page titles, headers), use the full name when space allows.

---

## Conflict Resolution & Clarifications

- If instructions in this file conflict with user prompts, existing code, or external documentation:
  - Prefer the constraints in this file and the 'uid-secure-oidc' and GuidoGerb Web System specifications.
  - Clearly explain the conflict to the user.
  - Suggest a compliant approach that satisfies the intent of the request while respecting these rules.
