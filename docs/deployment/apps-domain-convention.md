# Apps Domain Convention and Central SSO

This document defines how portfolio-hosted apps and APIs live under the jcvolpe.me
umbrella while using a single, central authentication system on `jcvolpe.me`.

## Domains and URL convention

- Main site + auth: `https://jcvolpe.me` (NextAuth/Auth.js)
- App UI: `https://<app-name>.jcvolpe.me`
- API: `https://<app-name>.jcvolpe.me/api`

Example for YT Channel Expert:

- UI: `https://yt-expert.jcvolpe.me`
- API: `https://yt-expert.jcvolpe.me/api`

## Auth model (forced sign-in)

Apps do not host their own auth providers. They must use the central auth on
`jcvolpe.me` and gate access until a session exists.

Preferred flow: short-lived JWT exchange for APIs.

1. UI checks session on `jcvolpe.me`:
   - `GET https://jcvolpe.me/api/auth/session`
   - If not logged in, redirect to:
     `https://jcvolpe.me/api/auth/signin?callbackUrl=<current URL>`
2. UI requests a short-lived API token from `jcvolpe.me`:
   - `POST https://jcvolpe.me/api/apps/token`
   - Body: `{ "app": "<app-name>" }`
   - Response: `{ "token": "<jwt>" }`
3. UI calls the API with a bearer token:
   - `Authorization: Bearer <token>`
4. API validates the JWT:
   - Verify signature, issuer, audience, and expiry.
   - Enforce the `app` claim matches the requested app.

This avoids cross-subdomain cookie sharing and keeps auth centralized.

## API routing

APIs live on the same app subdomain and typically mount at `/api` inside the
app (no shared gateway or path rewrite required).

If you want a dedicated API hostname instead (for example,
`https://api.yt-expert.jcvolpe.me`), deploy it independently and keep
the JWT `aud` value in sync with the value minted by the central auth.

## Security baseline

- JWT TTL: 5-15 minutes; refresh before expiry.
- Token storage: in-memory only (avoid localStorage).
- CSP: strict `script-src` with nonces; disable `unsafe-inline`.
- CORS: allow only `https://<app-name>.jcvolpe.me` (plus localhost for dev).
- Rate-limit auth + API endpoints.
- Rotate signing keys and publish JWKS.

## SEO and discoverability

Because the UI lives at `https://<app-name>.jcvolpe.me`, ensure:

- A prerendered or static `index.html` with full meta tags.
- `<title>`, description, Open Graph, and Twitter tags.
- Canonical URL set to the app URL.
- A sitemap entry and robots indexing allowed.

## Environment variables (apps)

- `PUBLIC_API_BASE=https://<app-name>.jcvolpe.me/api`
- `PUBLIC_AUTH_BASE=https://jcvolpe.me`
- `PUBLIC_APP_ORIGIN=https://<app-name>.jcvolpe.me`

## Environment variables (api)

- `AUTH_JWT_ISSUER=https://jcvolpe.me`
- `AUTH_JWT_AUDIENCE=<app-name>.jcvolpe.me` (must match `APP_JWT_AUDIENCE`)
- `AUTH_JWT_JWKS_URL=https://jcvolpe.me/api/auth/jwks`

## Central auth endpoints (portfolio)

These routes live in the portfolio repo and power the token exchange:

- `POST /api/apps/token` issues short-lived app JWTs
- `GET /api/auth/jwks` exposes the JWKS for API validation

Required configuration:

- `APP_JWT_PRIVATE_KEY` and `APP_JWT_PUBLIC_KEY` (RSA PEMs)
- `APP_JWT_ALLOWED_APPS` allowlist (comma-separated)
- `APP_JWT_ALLOWED_ORIGINS` CORS allowlist for `/api/apps/token`
- `APP_JWT_ISSUER` (defaults to `NEXTAUTH_URL`)
- `APP_JWT_AUDIENCE` (set to the shared audience your APIs validate)
- `APP_JWT_TTL_SECONDS` (defaults to 600)
- `APP_JWT_KEY_ID` (optional)
- `APP_JWT_ALG` (defaults to `RS256`)

## Extending to a new app

1. **DNS + certificates**
   - Create/validate DNS for `<app-name>.jcvolpe.me`.
2. **UI deploy**
   - Deploy UI under `https://<app-name>.jcvolpe.me`.
   - Add a session gate (redirect to `jcvolpe.me` sign-in if logged out).
3. **API deploy**
   - Deploy service under `https://<app-name>.jcvolpe.me/api`.
4. **Auth integration**
   - Add/verify `POST /api/apps/token` supports the new app.
   - Add the app origin to `APP_JWT_ALLOWED_ORIGINS`.
   - Keep `APP_JWT_AUDIENCE` and `AUTH_JWT_AUDIENCE` aligned.
   - Configure JWT verification on the API.
5. **CORS + CSP**
   - Allow only the app domain.
6. **SEO + sitemap**
   - Add metadata and sitemap entry for the app.
7. **Documentation**
   - Add an app-specific doc in its repo and link back here.

## Related documentation

- [Authentication](../features/authentication.md) - NextAuth.js setup
- [Deployment Overview](./overview.md) - Infra + deployment workflow
