Plan: lock chat Function URL to CloudFront only

Goal
- Keep `authType: NONE` to avoid SigV4 breakage, but prevent direct public invocation by restricting the Function URL resource policy to CloudFront.

Steps
- Inspect current CDK binding for the chat Function URL and its existing invoke permissions (`restrictFunctionUrlAccess` uses a CloudFront principal but does not deny the public).
- Update the CDK stack to attach a Function URL resource policy that:
  - Allows `cloudfront.amazonaws.com` with `SourceArn` = the distribution ARN.
  - Explicitly denies `Principal: *` for any request whose `SourceArn` is not the distribution, to close public access when `authType: NONE`.
- Ensure the allow-list of forwarded headers remains correct (`x-revalidate-secret` already included).
- Regenerate OpenNext output and run `pnpm run validate` to confirm the CDK template passes.
- Deploy and verify:
  - CloudFront → chat still works (curl via domain returns 200/SSE).
  - Direct Function URL invocation without CloudFront returns 403 (denied by policy).

Notes
- Function URL policies are resource-based; with `authType: NONE`, they must include both the CloudFront allow and an explicit deny for all others.
- Keep the existing rate limiting and budget checks as secondary protections; this change reduces exposure surface. 
