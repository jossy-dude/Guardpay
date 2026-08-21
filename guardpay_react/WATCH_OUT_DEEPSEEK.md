# Watch Out: DeepSeek V4 Flash 0731 Common Mistakes & Prompting Guide

## Model Profile
- **Model:** deepseek-v4-flash (0731 build, July 31 2026)
- **Architecture:** 284B/13B MoE, MIT open weights
- **Strengths:** Agentic/code tasks (Terminal-Bench 82.7%), fast (113.5 t/s), cheap ($0.14/M input, $0.28/M output)
- **Weaknesses:** Factual/knowledge precision trails V4-Pro, vendor-reported benchmarks (unreleased harness)

## Common Mistakes to Avoid

### 1. Trusting benchmarks without verification
All benchmark scores are from DeepSeek's own evaluation suite using their unreleased harness. DeepSWE (54.4%) and Cybergym (76.7%) need independent verification. **Always run real tests on your own codebase.**

### 2. Using default/max output limits
Max output is 384K tokens — that's a ceiling, not a default. For code generation, set explicit output limits appropriate to the task. Don't let it generate 500 lines when you need 50.

### 3. Not using thinking mode for complex tasks
V4 Flash has thinking and non-thinking modes. For architecture decisions, complex refactors, or multi-step planning: **always enable thinking mode**. For simple code edits or file operations, non-thinking is faster.

### 4. Inconsistent reasoning mode during A/B tests
If testing prompt variations, keep reasoning mode constant. Mixing thinking/non-thinking across tests makes results incomparable.

### 5. Ignoring cache for repeated contexts
Cached input costs $0.0028/M vs $0.14/M uncached. For repeated project contexts (same files, same instructions), enable caching. It's 50x cheaper.

### 6. Not providing explicit output schema
V4 Flash works best with structured outputs. Always provide:
- Role (what you are)
- Context (what project, what files)
- Constraints (what NOT to do)
- Output format (exact structure expected)

### 7. Over-relying on agentic scores
Flash excels at agentic tasks but trails Pro on factual precision. For library version checks, API documentation accuracy, or dependency compatibility: **verify independently** (npm registry, PyPI, official docs).

### 8. Not setting temperature appropriately
- Code generation: temperature 0.0-0.3 (deterministic)
- Creative UI/design: temperature 0.7-0.9 (varied)
- Planning/architecture: temperature 0.0 (deterministic)
Default eval used temperature 1.0 — that's for benchmarking, not production code.

### 9. Forgetting the deprecation deadline
Legacy API strings `deepseek-chat` and `deepseek-reasoner` were discontinued July 24, 2026. Use `deepseek-v4-flash` and `deepseek-v4-pro` model names.

### 10. Not validating package versions
V4 Flash may suggest outdated or non-existent npm packages. **Always verify:**
- Check npm registry for actual package names and latest versions
- Verify peer dependency compatibility
- Test that the package actually installs and works offline

## Prompting Best Practices

### For Code Generation
```
You are a senior [language] developer.

Context:
- Project: [description]
- Framework: [specific versions]
- File: [path]

Task: [specific, measurable goal]

Constraints:
- Use only [specific packages] (already installed)
- Follow [specific patterns from codebase]
- No comments unless asked
- Must work offline

Output: Complete file content, ready to paste.
```

### For Architecture Decisions
```
[Enable thinking mode]

I need to choose between [option A] and [option B] for [specific use case].

Current state:
- [relevant constraints]
- [performance requirements]
- [existing dependencies]

Evaluate both options against:
1. Performance at 100 items
2. Theme customizability
3. Offline compatibility
4. Bundle size impact

Give a recommendation with reasoning.
```

### For UI Component Code
```
Build a React component for [specific UI element].

Design reference: [screenshot description or CSS]

Requirements:
- TypeScript with strict types
- Tailwind CSS (no inline styles)
- Accessible (keyboard nav, ARIA labels)
- Animations via Framer Motion
- Works with theme system (uses CSS variables)
- Responsive (desktop-first, mobile-usable)

Output: Single .tsx file with all imports.
```

## Package Verification Checklist
Before using any suggested package:
- [ ] Check npm for actual package name (not typo)
- [ ] Verify last publish date (< 9 months old)
- [ ] Check weekly downloads (> 10K for production use)
- [ ] Verify it works offline (no runtime CDN calls)
- [ ] Check bundle size (prefer < 50KB gzipped)
- [ ] Verify TypeScript types available
- [ ] Check for known security advisories

## DeepSeek-Specific Gotchas for This Project

### SQLite vs Postgres
V4 Flash may default to suggesting Postgres/complex setups. For GuardPay (< 100 houses, single admin, offline-first), SQLite WAL is correct. Push back if it suggests otherwise.

### PDF Generation
V4 Flash may suggest heavy PDF libraries. For image-mode PDFs, html2canvas + jsPDF is proven. For text-mode, @react-pdf/renderer is the right choice. Don't let it suggest server-side Puppeteer or wkhtmltopdf.

### Font Loading
V4 Flash may suggest Google Fonts CDN. For offline-first, always use @fontsource/* packages. Verify the specific font package exists on npm before suggesting it.

### Animation Libraries
V4 Flash may suggest react-spring or CSS-only animations. For this project, Framer Motion is the best choice — declarative, accessible, well-maintained. Stick with it.
