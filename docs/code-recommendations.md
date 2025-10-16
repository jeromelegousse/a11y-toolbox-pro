# Prioritized Code Recommendations

## 1. Sanitize module rendering paths (High)
- **Issue**: `renderBlock` injects `block.icon`, `block.title`, and the return value of `block.render(state)` directly into `innerHTML` without sanitization. Third-party modules or dynamic content can therefore inject arbitrary HTML (and scripts) into the dashboard.
- **Recommendation**: Replace the raw `innerHTML` usage with DOM construction helpers that apply `textContent` for plain strings and only allow vetted markup fragments. At minimum, pass dynamic strings through a sanitizer such as DOMPurify before insertion.
- **Context**: `src/registry.js` lines 167-208.

## 2. Restrict audit help links to safe protocols (High)
- **Issue**: `renderAuditViolations` only escapes quotes before placing `violation.helpUrl` into an `<a>` tag. Attackers can provide `javascript:` or `data:` URLs that execute code when clicked.
- **Recommendation**: Before rendering, validate the URL protocol (e.g., allow only `https:` and `http:`) and fall back to a safe placeholder when the value does not meet expectations.
- **Context**: `src/modules/audit-view.js` lines 72-99.

## 3. Make the store resilient to non-browser environments (Medium)
- **Issue**: `createStore` assumes `window` and `localStorage` exist; importing the module on the server or in privacy-restricted browsers throws.
- **Recommendation**: Guard each access with `typeof window !== 'undefined'` / `typeof localStorage !== 'undefined'`, and allow callers to provide an optional storage adapter for SSR or tests.
- **Context**: `src/store.js` lines 91-161.
