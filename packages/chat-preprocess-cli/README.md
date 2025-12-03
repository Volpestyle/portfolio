# @portfolio/chat-preprocess-cli

Workspace-local CLI that powers `pnpm chat:preprocess`. It wraps the repo ingestion tasks (project knowledge, resume parsing, profile normalization) into a single command so other apps can eventually `npx chat-preprocess` with their own config.

## Usage

```bash
pnpm chat:preprocess [--config path/to/config.(json|yaml|js)] [--env extra.env]
```

- `--config` points to a JSON/YAML/JS module that exports a `ChatPreprocessConfig`. Override paths like `generatedDir`, `resumePdf`, or the env-file list without touching the script.
- `--env` may be repeated to append preprocess-specific `.env` files. When omitted the CLI tries `scripts/chat-preprocess.env`, `.env.local`, and `.env` in that order.
- `--seeOutput` prints the contents of each task artifact to stdout after it is written (useful for debugging; note that embeddings files can be very large).

Persona generation is deterministic and sourced from `data/chat/profile.json` fields (`systemPersona`, first three `about` entries for `shortAbout`, `styleGuidelines`, `voiceExamples`). No OpenAI call is made for persona.

## Config Highlights

```yaml
# chat-preprocess.config.yml
envFiles:
  - scripts/chat-preprocess.env
  - .env.shared
resume:
  filename: resume.pdf

models:
  textModel: gpt-5.1-2025-11-13
  embeddingModel: text-embedding-3-large

paths:
  generatedDir: .out/chat
  resumePdf: public/resume/resume.pdf # defaults to chat-preprocess.config.yml resume.filename (falls back to resume.pdf)
  resumeJson: generated/resume-raw.json # default; point to a curated file to bypass PDF extraction

  repos:
    gistId: d3adb33f1234 # overrides PORTFOLIO_GIST_ID
    include:
      - my-org/flagship-app
      - marketing-site
    exclude:
      - my-org/archive-app

artifacts:
  writers:
    - type: s3
      bucket: my-portfolio-artifacts
      prefix: chat/
      region: us-east-1
```

- **Repo filters**: `include`/`exclude` accept `name` or `owner/name` values so you can focus preprocess runs on a curated subset without editing the gist or code.
- **Gist override**: set `repos.gistId` when you want the CLI to read metadata from a different gist than the default `PORTFOLIO_GIST_ID`.
- **Resume input**: by default, resume parsing starts from the PDF (filename defaults to `resume.filename` in `chat-preprocess.config.yml`, falling back to `resume.pdf`) and writes `generated/resume-raw.json`. If you maintain a handcrafted JSON source, set `paths.resumeJson` to that file and it will be used/merged instead.
- **Artifact writers**: the local JSON writer always runs to keep downstream tasks working. Additional writers (e.g., S3) can stream each artifact to external services for automation or backup. S3 uploads honor the AWS credentials in your environment and accept optional `prefix`, `region`, and `kmsKeyId`.

See `src/config.ts` and the types in `src/types.ts` for the full schema. The CLI re-exports `runPreprocessCli` so other pipelines can compose it programmatically.

## Building

```bash
pnpm --filter @portfolio/chat-preprocess-cli build
```

Emits an ESM bundle to `dist/` so the package can be published or executed via `npx chat-preprocess`.
