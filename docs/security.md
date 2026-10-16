# Security

## Threat model (v0.1)

| Asset | Threat | Control |
|---|---|---|
| Recordings on the laptop | Leak through git | `research/.gitignore`; guard hook blocks `git add` of media, transcripts, answers and consent (also with `-f`) |
| Recordings on the laptop | Leak to the model or chat | Guard hook blocks reading media, raw transcripts and consent records; skills read only `analysis-input.json` (redacted) |
| Uploads in transit | Interception | HTTPS only; S3 bucket policy denies non-TLS |
| Relay bucket | Public exposure | Public access block, bucket-owner ownership, KMS encryption, 1-day lifecycle |
| Relay upload endpoint | Uploads by strangers | HMAC-SHA256 participant tokens bound to study, participant id and expiry; constant-time comparison; names limited to a fixed pattern; uploads refused once a session is finished |
| Relay storage | Oversized uploads | The presigned URL signs `Content-Length`, so S3 refuses any body that isn't the declared size (25 MB per piece at most); the importer skips anything larger |
| Imported sessions | A reused link replacing a real session | Uploads that arrive after a session was imported are reported, not imported, and deleted |
| Relay admin endpoints | Download or delete by strangers | Bearer admin token, compared in constant time; never printed in chat; stored at mode 0600 outside the project |
| Admin token | Sent to the wrong server by an edited study.yaml | The relay URL is pinned in the secrets file at setup and must be https; imports only ever call that address, and `runner_build` refuses a study pointing elsewhere |
| Participant links | Leaking into chat logs | Written to a 0600 file outside the project; the tool result gives only the path |
| Media processing | Malicious "recordings" from the internet | Files must start with a real media signature; FFmpeg runs with `-protocol_whitelist file` and a fixed input format for relay pieces |
| Imported documents | Zip bombs | Only the document part of a DOCX is unpacked, up to 20 MB |
| Local Studio and Board | Other websites calling `127.0.0.1` (CSRF, DNS rebinding) | Server binds to 127.0.0.1, rejects any other `Host` header (421), and requires a random key that is passed in the URL fragment and sent as a header |
| Participant page | Script injection | Strict CSP (`default-src 'self'`, frames only from the prototype origin, connections only to the relay and bucket); all text escaped |
| Prototype messages | Spoofed events | Only messages from the configured prototype origin (or Figma's) are accepted |
| Report HTML | Injection through quotes or labels | Markdown renderer escapes all text and allows only http(s) and in-page links |
| Imported files | Path traversal | Participant ids limited to `P1`–`P999`, slugs to `[a-z0-9-]`, relay file names to a fixed list, `consent.file` to `consent/<name>.md`, Studio tracks to `screen`/`mic`; every write checked to stay inside the research folder |

## Known limits

- **Relay secrets in Secrets Manager.** The function reads them at start-up; anyone with `secretsmanager:GetSecretValue` on that secret, or who can change the function's code, can still obtain them. Restrict both. The values are also CloudFormation parameters, so use `NoEcho` (already set) and don't keep them in shell history. Concurrency is capped at 10 to bound cost under a flood.
- **Export packages.** A study export holds raw survey answers (and media if included). It is written with owner-only permissions to `.proofloop/exports/`, which git ignores and the guard hook blocks from the agent; moving it is the user's job.
- **Participant page CSP.** It is set with a meta tag, which can't carry `frame-ancestors`, and `connect-src` allows `https://*.amazonaws.com` because the page doesn't know the bucket name. When hosting, also send `Content-Security-Policy: frame-ancestors 'none'` as a header, and narrow `connect-src` to your bucket's host if your host supports headers.
- **Guard hook.** It resolves paths and blocks shell commands that touch protected research files unless they only list names (`ls`, `du`, `find` without `-exec`). A determined person can still get round it, for example by building a path inside a script; it protects against accidents and prompt injection, not against the user.
- **Redaction is pattern-based.** See [privacy.md](privacy.md).
- **Local relay.** `relay/local.mjs` is for pilots on an internal server. Put it behind HTTPS.

## Reporting a vulnerability

Contact the repository owner privately. Please don't open a public issue.
