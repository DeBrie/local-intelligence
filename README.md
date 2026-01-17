# @local-intelligence

On-device AI for React Native — privacy-first, hardware-accelerated machine learning without cloud dependencies.

## Packages

| Package                               | Description                                         | Status     |
| ------------------------------------- | --------------------------------------------------- | ---------- |
| `@local-intelligence/core`            | Native engine, model management, hardware detection | ✅ MVP     |
| `@local-intelligence/pii`             | PII redaction with NLTagger (iOS) / BERT (Android)  | ✅ MVP     |
| `@local-intelligence/sentiment`       | 3-class sentiment analysis with batch processing    | ✅ MVP     |
| `@local-intelligence/semantic-search` | Text embeddings + vector storage (sqlite-vec)       | ✅ MVP     |
| `@local-intelligence/chat`            | On-device LLM (Foundation Models / ExecuTorch)      | 🚧 Planned |

## Getting Started

### Prerequisites

- Node.js 18+
- React Native 0.76+ (New Architecture required)
- Xcode 15+ (for iOS)
- Android Studio (for Android)

### Installation

```bash
# Clone the repository
git clone https://github.com/local-intelligence/local-intelligence.git
cd local-intelligence

# Install dependencies
npm install

# iOS: Install pods
cd apps/playground/ios && pod install && cd ../../..

# Run the playground app
nx run playground:run-ios
# or
nx run playground:run-android
```

## Development

This is an Nx monorepo with the following structure:

```
local-intelligence/
├── libs/
│   └── core/           # @local-intelligence/core - Native JSI/TurboModule
├── apps/
│   └── playground/     # Demo app showcasing all features
├── nx.json             # Nx configuration
└── package.json        # Root package.json
```

### Commands

```bash
# Build all packages
npm run build

# Run tests
npm run test

# Lint
npm run lint

# Run affected builds only
npm run affected:build

# Release (with conventional commits)
npm run release:dry  # Dry run
npm run release      # Actual release
```

### Conventional Commits

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for semantic versioning.

**Format:** `type(scope): description`

**Types:**

- `feat` - New feature (minor version bump)
- `fix` - Bug fix (patch version bump)
- `docs` - Documentation only
- `style` - Code style (formatting, etc.)
- `refactor` - Code refactoring
- `test` - Adding tests
- `chore` - Maintenance tasks

**Scopes:** `core`, `pii`, `sentiment`, `semantic-search`, `chat`, `playground`, `workspace`, `deps`, `release`

**Examples:**

```bash
git commit -m "feat(core): add device capability detection"
git commit -m "fix(core): handle model download cancellation"
git commit -m "docs(workspace): update README"
```

## Platform Support

| Platform | Minimum Version | Notes                        |
| -------- | --------------- | ---------------------------- |
| iOS      | 15.0            | Core ML, NLTagger            |
| iOS      | 26.0            | Foundation Models (for chat) |
| Android  | API 24          | LiteRT base support          |
| Android  | API 27          | NNAPI acceleration           |

## License

MIT © [Local Intelligence](https://github.com/anthropics/local-intelligence)
