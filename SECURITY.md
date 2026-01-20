# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

1. **Do NOT** open a public issue
2. Email **security@localintelligence.dev** with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes (optional)

### What to Expect

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 7 days
- **Resolution Timeline**: Depends on severity, typically 30-90 days

### Scope

This policy applies to:

- `@local-intelligence/core`
- `@local-intelligence/pii`
- `@local-intelligence/sentiment`
- `@local-intelligence/semantic-search`

### Out of Scope

- Vulnerabilities in third-party dependencies (report to upstream)
- Issues in the playground demo app (non-production code)

## Security Best Practices

When using @local-intelligence packages:

1. **Keep packages updated** - Run `npm update` regularly
2. **PII handling** - Use `@local-intelligence/pii` for sensitive data detection
3. **Model integrity** - Models are downloaded over HTTPS from our CDN
4. **On-device processing** - All ML inference happens locally, no data leaves the device

## Recognition

We appreciate responsible disclosure. Contributors who report valid security issues will be acknowledged in our release notes (unless they prefer to remain anonymous).
