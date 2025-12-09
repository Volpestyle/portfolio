A few concrete upgrades would make this stack safer (avoid accidentally shipping plaintext secrets), tighter (least-privilege env per function), and simpler (less header/env sprawl):

1. Stop “passing everything everywhere” (your biggest leak risk)

Right now createAdditionalOrigins() does:

environment: this.filterReservedLambdaEnv(baseEnv),

baseEnv includes all of runtimeEnvironment, so if someone ever sets OPENAI_API_KEY, DATABASE_URL, GH_TOKEN, etc in props.environment, you’ll push plaintext secrets into Lambda env vars (and they become readable via GetFunctionConfiguration). AWS explicitly recommends Secrets Manager instead of env vars for sensitive values. ￼

Fix: reuse your edge allowlist logic for all regular Lambdas too.

private buildLambdaRuntimeEnv(source: Record<string,string>): Record<string,string> {
// Start from the same allowlist used for edge…
const env = this.buildEdgeEnvironment(source);

// …but add the secret _references_ that server Lambdas need to fetch real secrets.
for (const k of [
'SECRETS_MANAGER_ENV_SECRET_ID',
'SECRETS_MANAGER_REPO_SECRET_ID',
'AWS_SECRETS_MANAGER_PRIMARY_REGION',
'AWS_SECRETS_MANAGER_FALLBACK_REGION',
]) {
if (source[k]) env[k] = source[k];
}

return this.filterReservedLambdaEnv(env);
}

Then in createAdditionalOrigins:

environment: this.buildLambdaRuntimeEnv(baseEnv),

This one change prevents “oops, we exported a token” incidents across all non-edge function origins.

2. Add a synth-time “no plaintext secrets” guard

Make the stack fail fast if someone tries to pass likely secrets in props.environment:

private assertNoPlaintextSecrets(env: Record<string,string>) {
const allow = new Set([
'SECRETS_MANAGER_ENV_SECRET_ID',
'SECRETS_MANAGER_REPO_SECRET_ID',
]);

const suspiciousKey = /(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|DATABASE_URL)/i;
for (const [k, v] of Object.entries(env)) {
if (allow.has(k)) continue;
if (suspiciousKey.test(k)) {
throw new Error(`Do not pass plaintext secret via props.environment (${k}). Put it in Secrets Manager and pass only the secret id/arn.`);
}
if (/^AKIA[0-9A-Z]{16}$/.test(v)) {
      throw new Error(`Looks like an AWS access key was provided in env (${k}). Refuse to synth.`);
}
}
}

Call it right after enrichRuntimeEnvironment().

3. Don’t store secret values in CloudFront origin custom headers

buildOriginCustomHeaders() currently injects:

headers['x-chat-origin-secret'] = chatOriginSecret;

That means the secret value lives in CloudFront distribution config (anyone with cloudfront:GetDistributionConfig can read it). If this is meant as an origin lock, prefer IAM/OAC instead.

Best option: use Function URL + OAC (AWS_IAM) for chat too

AWS added/endorsed using CloudFront Origin Access Control with Lambda Function URLs using SigV4. ￼
If you can switch chat back to AWS_IAM, you can delete x-chat-origin-secret entirely.

(Also: Lambda@Edge still doesn’t support environment variables, so your header-based config approach for the edge function is still necessary. ￼)

If chat truly must remain unauthenticated (NONE), consider attaching a lightweight Lambda@Edge to that behavior that adds an HMAC header per request (key fetched from Secrets Manager once and cached). That way the secret value is not stored in the distribution config.

4. Make secret IDs unambiguous: require full ARNs if you support multi-region

You pass AWS_SECRETS_MANAGER_PRIMARY_REGION / fallback around, but your IAM policy builder uses Stack.of(this).region when a secret id is a name. That breaks if the secret is actually in another region, and your wildcard builder is also wrong when secretId is an ARN in a different region.

Two pragmatic fixes:
• Policy: require SECRETS*MANAGER*\*\_SECRET_ID be a complete ARN (with region), not a name.
• Or: build ARNs for primary + fallback regions when given a name.

If you keep the “name allowed” behavior, at least fix buildSecretResourceArns() to respect ARN region/account when secretId is already an ARN.

5. Remove the manual Secrets Manager policy statement if possible

You already do:

this.envSecret?.grantRead(grantable);
this.repoSecret?.grantRead(grantable);

That’s usually enough and safer than building wildcard ARNs yourself. The extra custom policy widens access and is easy to get subtly wrong (region/suffix issues).

Keep the explicit edgeFunction.addToRolePolicy only if you have a proven CDK edge-stack propagation issue in your environment.

6. One secret > many ad-hoc env vars

Your stack already hints at the right direction: pass only these refs:
• SECRETS_MANAGER_ENV_SECRET_ID
• SECRETS_MANAGER_REPO_SECRET_ID

Then have runtime code load them once, cache them in module scope (recommended by AWS for edge-ish patterns), and populate process.env as needed. ￼

That lets you delete most “secret-ish” keys from props.environment entirely.

7. Reduce blast radius: grant secret access only to functions that need it

Right now secrets read access is granted fairly broadly. If only serverEdgeFunction, chat, and maybe imageOptimizer need secrets, scope it down. Least privilege matters most with Secrets Manager. ￼

8. Optional simplification: store runtime config in SSM/AppConfig instead of headers

Since Lambda@Edge can’t use env vars ￼, headers are a common workaround—but you can shrink the header hack to one pointer:
• Put runtime JSON config in SSM Parameter Store (or AppConfig).
• Pass only x-runtime-config-param=/my/app/config to the edge.
• Edge fetches once per container and caches.

This avoids header chunking and makes it harder to accidentally push a secret into the edge config.

⸻

If you want the biggest bang-for-buck with minimal refactor: (1) stop passing baseEnv wholesale to additional origins + (2) add the synth-time secret guard + (3) remove the CloudFront x-chat-origin-secret value by using Function URL AWS_IAM + OAC.
