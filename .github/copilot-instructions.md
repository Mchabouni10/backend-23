This repository is an Express + Mongoose backend for the Rawdah Calculator API.

Keep these repository-specific points in mind when making edits or adding
features. Be concrete and conservative: follow existing patterns and prefer
small, focused changes.

- Big picture
  - server.js is the entrypoint: it wires middleware, CORS, rate-limiters,
    auth middleware (`config/checkToken.js`), then mounts routes under
    `/api/*`. Read `server.js` first to understand request flow.
  - Authentication: `checkToken` extracts a JWT from the `Authorization: Bearer`
    header or the HttpOnly `token` cookie. `ensureLoggedIn` returns 401 if
    `req.user` is missing. `/api/users` is intentionally mounted before
    `ensureLoggedIn` so signup/login remain public.
  - Data layer: Mongoose is initialized in `config/database.js`. Models live in
    `models/` (notably `models/Taxonomy.js` for work-type hierarchy). Controllers
    are under `controllers/api/` and return either plain resources or a
    { success, data } envelope (work-types uses the latter).

- How to run & dev workflow
  - Environment variables: `SECRET` (required, >= 32 chars), `MONGO_URI`,
    `ALLOWED_ORIGINS` (comma-separated), `PORT`, `NODE_ENV`.
  - Common commands from `package.json`:
    - npm run dev — start with nodemon for local development
    - npm start — start with node
  - Health check: GET /health is public and useful for smoke tests.

- Auth, cookies, and JWTs
  - Token cookie name: `token`. Cookies are HttpOnly. In production `secure`
    and `sameSite: 'none'` are used so the mobile WebView and cross-site
    clients work.
  - JWT payload contains only { id } and is signed with `process.env.SECRET`.
  - Tests or scripts that need a token can reuse `createJWT` logic in
    `controllers/api/users.js` (signed 24h expiry).

- Important code patterns & gotchas
  - Sanitize and validate inputs before saving: `controllers/api/projects.js`
    has `sanitizeSettings`, `ensureCategoryKeys`, and an explicit dot-notation
    update strategy (uses `$set` on individual `settings.*` fields) to avoid
    Mongoose silently dropping subdocuments when a cast error occurs.
  - Dot-notation updates are preferred for complex nested subdocuments where
    some nested entries might fail casting.
  - Avoid adding cookie-parser; `config/checkToken.js` performs tiny cookie
    parsing for the single `token` cookie intentionally.
  - Duplicate/uniqueness checks are handled manually (case-insensitive regexes)
    in `controllers/api/workTypes.js`; prefer returning 409 for conflicts.

- Response shapes & error handling
  - General pattern: controllers return resource objects on success or
    res.status(...).json({ error: '...' }) on failure. Some controllers
    (workTypes) wrap success in { success: true, data } — follow the file's
    existing convention when editing that area.
  - The global error handler in `server.js` recognizes `err.name === 'UnauthorizedError'`
    to return 401. Throw or forward errors with that name when appropriate.

- Logging and diagnostics
  - Use `utils/logger.js` for server-side logs (it is used widely across
    controllers). Controllers include diagnostic logs (e.g., received
    settings and counts) that are useful to preserve when modifying logic.

- Rate limiting & security headers
  - Global and write-specific rate limiters are applied in `server.js`.
    Mutating routes mount `writeLimiter` (projects, expenses, work-types).
  - Helmet is enabled with crossOriginResourcePolicy disabled; be cautious
    when changing header behavior to not break cross-origin clients.

- Files to inspect for PRs/examples
  - `server.js` — app wiring, middleware, routes and error handling
  - `config/checkToken.js`, `config/ensureLoggedIn.js` — auth flow
  - `controllers/api/projects.js` — input sanitization, dot-notation updates
  - `controllers/api/workTypes.js` — taxonomy semantics and ownership rules
  - `controllers/api/users.js` — signup/login/logout, cookie behavior
  - `models/` — Mongoose schemas and constraints

- When adding endpoints or changing schemas
  - Keep existing API shapes stable; prefer additive changes. If renaming
    or removing fields, coordinate with the frontend and migration scripts.
  - When updating nested documents, prefer the dot-notation `$set` pattern to
    avoid losing sibling fields due to casting errors.

If anything here is unclear or you want more examples (request/response
examples, seed scripts, or test helpers), tell me which area to expand and
I will iterate.
