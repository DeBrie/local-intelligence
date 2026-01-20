# Contributing to @local-intelligence

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/local-intelligence.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feat/your-feature`

## Development Setup

```bash
# Install dependencies
npm install

# iOS: Install pods
cd apps/playground/ios && pod install && cd ../../..

# Run the playground app
nx run playground:run-ios
# or
nx run playground:run-android
```

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/). Format: `type(scope): description`

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Scopes:** `core`, `pii`, `sentiment`, `semantic-search`, `chat`, `playground`, `workspace`, `deps`

**Examples:**

```bash
git commit -m "feat(core): add device capability detection"
git commit -m "fix(sentiment): handle empty text input"
git commit -m "docs(workspace): update README"
```

## Pull Request Process

1. Ensure your code passes linting: `npm run lint`
2. Ensure tests pass: `npm run test`
3. Update documentation if needed
4. Fill out the PR template completely
5. Request review from maintainers

## Code Style

- Follow existing code patterns
- Use TypeScript for all new code
- Add JSDoc comments for public APIs
- Keep native code (Swift/Kotlin) consistent with existing style

## Testing

- Add unit tests for new functionality
- Run benchmarks for ML-related changes: `npm run benchmark:*`
- Test on both iOS and Android before submitting

## Reporting Issues

- Use the issue templates provided
- Include device/OS information for bugs
- Provide minimal reproduction steps

## Questions?

Open a [Discussion](https://github.com/DeBrie/local-intelligence/discussions) for questions or ideas.
