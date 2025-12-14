# Contributing to ScrapeX

Thank you for your interest in contributing to ScrapeX! This document provides guidelines and instructions for contributing.

## 🎯 Ways to Contribute

- 🐛 Report bugs
- 💡 Suggest new features
- 📝 Improve documentation
- 🔧 Fix issues or add features
- ⚡ Optimize performance
- 🧪 Add tests

## 🚀 Getting Started

### 1. Fork and Clone

```bash
# Fork the repository on GitHub
git clone https://github.com/YOUR_USERNAME/scrapex-engine.git
cd scrapex-engine
```

### 2. Install Dependencies

```bash
# Core engine
cd core-engine
npm install

# Website (optional)
cd ../website
npm install
```

### 3. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
```

## 📋 Development Guidelines

### Code Style

- **TypeScript**: Follow strict typing, avoid `any`
- **Formatting**: Use Prettier (configured in project)
- **Linting**: ESLint rules must pass
- **Naming**: Use camelCase for variables, PascalCase for classes

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance

**Examples**:
```
feat(ai): add support for OpenAI GPT-4
fix(scraper): handle timeout errors correctly
docs(api): update endpoint documentation
```

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Test specific scraper
bash test-engine.sh
```

### Building

```bash
# Build TypeScript
npm run build

# Build Docker
docker-compose -f docker-compose.prod.yml build
```

## 🔄 Pull Request Process

### 1. Before Submitting

- ✅ Code builds without errors
- ✅ All tests pass
- ✅ Linting passes
- ✅ Documentation updated
- ✅ Commit messages follow convention

### 2. Submit PR

1. Push your branch to GitHub
2. Create a Pull Request
3. Fill in the PR template
4. Link related issues

### 3. PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## How Has This Been Tested?
Describe testing approach

## Checklist
- [ ] Code follows project style
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings
- [ ] Tests added/updated
- [ ] All tests pass
```

### 4. Code Review

- Address review comments
- Keep discussion professional
- Be patient - reviews take time

## 🐛 Reporting Bugs

### Bug Report Template

```markdown
**Describe the bug**
Clear description of the bug

**To Reproduce**
Steps to reproduce:
1. Go to '...'
2. Click on '....'
3. See error

**Expected behavior**
What you expected to happen

**Screenshots**
If applicable, add screenshots

**Environment:**
 - OS: [e.g. Ubuntu 22.04]
 - Node version: [e.g. 18.17.0]
 - Package version: [e.g. 1.0.0]

**Additional context**
Any other context
```

## 💡 Feature Requests

### Feature Request Template

```markdown
**Is your feature request related to a problem?**
Description of the problem

**Describe the solution you'd like**
Clear description of desired solution

**Describe alternatives you've considered**
Alternative solutions considered

**Additional context**
Mockups, examples, or context
```

## 📁 Project Structure

```
scrapex-engine/
├── core-engine/        # Main API server
├── shared/            # Shared utilities
├── services/          # Microservices
├── website/           # Marketing site
└── docs/              # Documentation
```

## 🧪 Adding a New Scraper

1. Create scraper in `services/your-scraper/`
2. Implement `ScraperInterface`
3. Add to plugin manager
4. Write tests
5. Update documentation

Example:
```typescript
import { ScraperInterface, ScrapeResult } from '../../shared/types';

export class YourScraper implements ScraperInterface {
  async scrape(url: string, options?: any): Promise<ScrapeResult> {
    // Implementation
  }
}
```

## 🤖 Adding AI Provider

1. Create provider in `shared/ai/llm/`
2. Implement `LLMProvider` interface
3. Add circuit breaker
4. Update external key manager
5. Add tests

## 📝 Documentation

- Update README.md for major changes
- Update API_REFERENCE.md for endpoint changes
- Add JSDoc comments for public APIs
- Include examples where helpful

## ⚖️ License

By contributing, you agree that your contributions will be licensed under the MIT License.

## 🙏 Questions?

- Open a GitHub Discussion
- Join our Discord community
- Email: support@scrapex.com

---

**Thank you for contributing to ScrapeX!** 🎉
