Hardening Plan: Secrets and Runtime Env Safety (Second Pass)

1) Enforce least-privilege runtime env
   - Create a shared helper to build Lambda envs using the edge allowlist/blocklist plus secret IDs/regions, then apply it to all function origins (server, chat, image, additional origins).
   - Stop passing `baseEnv` wholesale into `createAdditionalOrigins` and other Lambdas.

2) Add synth-time secret guards
   - Fail synth if `props.environment` includes suspicious secret-shaped keys/values (SECRET/TOKEN/API_KEY/PASSWORD/DATABASE_URL, AKIA… keys), except for explicit secret ID/ARN vars.
   - Require that secrets be delivered via Secrets Manager (pass IDs/ARNs only).

3) Remove plaintext secrets from CloudFront config
   - Eliminate `x-chat-origin-secret` by switching chat to `AWS_IAM` + OAC on the Function URL if possible.
   - If unauth chat is required, move origin auth to a per-request HMAC fetched from Secrets Manager (Edge Lambda), not stored in distribution headers.

4) Tighten Secrets Manager policies
   - Prefer `secret.grantRead` over wildcard ARNs.
   - If names (not ARNs) are allowed, build ARNs for primary/fallback regions correctly; otherwise, require full ARNs for cross-region secrets.
   - Scope secret grants only to the functions that actually need them.

5) Centralize and validate env rules
   - Keep a single source of truth for allowlist/blocklist and use it for edge + non-edge Lambdas.
   - Add a validation hook that reports which keys are shipped to edge/runtime and fails if required keys are missing.

6) Optional: runtime config indirection
   - If header size or leakage is a concern, consider storing edge runtime config in SSM/AppConfig and passing only a pointer header; cache the fetch per container.

7) Incremental rollout
   - Apply env filtering + synth guard first; deploy and verify.
   - Then remove chat secret header by enabling IAM/OAC (or add HMAC edge guard if unauth is required).
   - Finally, tighten secret grants/ARN handling and add validation.
