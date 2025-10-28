## Runtime Log Diving

### 1. Verify the Edge Response

- `curl -I https://jcvolpe.me`
- Note the HTTP status, `x-cache`, and any `LambdaExecutionError` hints.

### 2. Find the CloudWatch Log Group (Lambda@Edge)

- CLI:
  - Get the function's physical id:
    - `aws cloudformation list-stack-resources --stack-name PortfolioStack --region us-east-1 --query "StackResourceSummaries[?contains(LogicalResourceId, 'ServerEdgeFunctionFn')].PhysicalResourceId" --output text`
  - Discover the log group by prefix:
    - `aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/us-east-1.PortfolioStack-ServerEdgeFunction" --region us-east-1`

Note: Regional (non-Edge) Lambdas use `/aws/lambda/<LambdaFunctionName>` and live in the stack's primary region. For OpenNext, also check server/image optimization functions if needed.

### 3. Tail the Lambda@Edge Logs

- `aws logs tail /aws/lambda/us-east-1.PortfolioStack-ServerEdgeFunctionFnA77602FC-ofeDiVMPulIy --region us-east-1 --since 10m`
- Look for:
  - `MODULE_NOT_FOUND` errors → usually missing packages in the OpenNext bundle.
  - `No value provided for input HTTP label: Bucket.` → cache bucket env vars are unset.
  - Secret errors (e.g. `Missing secret id for 'OPENAI_API_KEY'`) → check Secrets Manager wiring.
