# Testing Patterns

**Analysis Date:** 2026-03-20

## Test Framework

**Runner:**
- Not detected in this codebase

**Assertion Library:**
- Not detected in this codebase

**Run Commands:**
- No test runner configured in `package.json`
- Available scripts: `dev`, `build`, `start`, `lint`

## Test File Organization

**Location:**
- No test files found in codebase

**Naming:**
- Not applicable - no test files present

**Structure:**
- Not applicable - no test files present

## Test Structure

**Suite Organization:**
- Not applicable - no test files present

**Patterns:**
- Not applicable - no test files present

## Mocking

**Framework:**
- Not configured

**Patterns:**
- Not applicable - no test framework present

**What to Mock:**
- Not applicable

**What NOT to Mock:**
- Not applicable

## Fixtures and Factories

**Test Data:**
- Not applicable - no test framework present

**Location:**
- Not applicable

## Coverage

**Requirements:**
- Not enforced - no coverage tracking tools detected

**View Coverage:**
- No coverage reporting configured

## Test Types

**Unit Tests:**
- Not implemented
- Recommended for utility functions, form validation, state logic
- Would be suitable for: ContactForm component's form state handler, data transformations in services array

**Integration Tests:**
- Not implemented
- Recommended for client-side form submission flow
- Would be suitable for: Contact form → WhatsApp redirect flow, component composition testing

**E2E Tests:**
- Not implemented
- Framework: Not configured (would use Playwright, Cypress, or similar)
- Recommended areas: User flows across pages (navigation, booking flow, contact form submission)

## Current Testing State

**Assessment:**
This codebase currently lacks automated testing infrastructure. All testing is manual.

**Recommended Implementation Path:**

1. **Install Jest + React Testing Library** (for unit and component tests):
   ```bash
   npm install --save-dev jest @testing-library/react @testing-library/jest-dom @types/jest ts-jest
   ```

2. **Create jest.config.js**:
   ```javascript
   module.exports = {
     preset: 'ts-jest',
     testEnvironment: 'jsdom',
     setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
     moduleNameMapper: {
       '^@/(.*)$': '<rootDir>/$1',
     },
     testMatch: ['**/__tests__/**/*.test.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
   }
   ```

3. **Add test scripts to package.json**:
   ```json
   {
     "scripts": {
       "test": "jest",
       "test:watch": "jest --watch",
       "test:coverage": "jest --coverage"
     }
   }
   ```

## Suggested Test Structure

**For React Components** (location: `components/__tests__/ComponentName.test.tsx`):

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Nav from '../Nav'

describe('Nav', () => {
  it('renders navigation links', () => {
    render(<Nav />)
    expect(screen.getByText('Services')).toBeInTheDocument()
  })

  it('toggles mobile menu on button click', async () => {
    render(<Nav />)
    const user = userEvent.setup()
    const button = screen.getByLabelText('Menu')
    await user.click(button)
    expect(screen.getByText('Book now')).toBeVisible()
  })

  it('applies scrolled styles when window scrolls', () => {
    render(<Nav />)
    fireEvent.scroll(window, { scrollY: 50 })
    const nav = screen.getByRole('navigation')
    expect(nav).toHaveClass('bg-anthracite/95')
  })
})
```

**For Forms** (location: `components/__tests__/ContactForm.test.tsx`):

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ContactForm from '../ContactForm'

describe('ContactForm', () => {
  it('renders all form fields', () => {
    render(<ContactForm whatsappNumber="420000000000" />)
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('updates form state on input change', async () => {
    render(<ContactForm whatsappNumber="420000000000" />)
    const user = userEvent.setup()
    const nameInput = screen.getByLabelText('Name')
    await user.type(nameInput, 'John Doe')
    expect(nameInput).toHaveValue('John Doe')
  })

  it('shows success message after submission', async () => {
    render(<ContactForm whatsappNumber="420000000000" />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Name'), 'John')
    await user.type(screen.getByLabelText('Email'), 'john@example.com')
    await user.type(screen.getByLabelText('Message'), 'Test message')
    await user.click(screen.getByRole('button', { name: /Send message/i }))
    await waitFor(() => {
      expect(screen.getByText('Message sent.')).toBeInTheDocument()
    })
  })
})
```

**For Page Components** (location: `app/__tests__/page.test.tsx`):

```typescript
import { render, screen } from '@testing-library/react'
import Home from '../page'

describe('Home Page', () => {
  it('renders main content section', () => {
    render(<Home />)
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
  })

  it('renders all major sections', () => {
    render(<Home />)
    // These components would need to be tested individually
    expect(screen.getByText(/Prague/i)).toBeInTheDocument()
  })
})
```

## Areas Without Test Coverage

**High Priority:**
- `ContactForm.tsx`: Form state management, form submission flow, WhatsApp URL generation
- `Nav.tsx`: Mobile menu toggle logic, scroll listener behavior, state management
- Form validation: Email format, required fields
- Data transformations: Service list rendering, testimonial mapping

**Medium Priority:**
- Navigation between pages
- Component composition on home page
- Layout component metadata handling
- Responsive behavior (desktop vs mobile)

**Low Priority:**
- CSS class application
- Styling edge cases
- Animation delays

## Mocking Strategy

**What to Mock:**
- `window.addEventListener` and `window.removeEventListener` - for scroll listeners
- `window.open` - for WhatsApp redirect
- Browser APIs - localStorage, sessionStorage if added
- External APIs - if any HTTP calls added in future

**What NOT to Mock:**
- React hooks (use actual useState/useEffect)
- Component rendering
- User interaction (use userEvent)
- Form elements

## Future Test Infrastructure

**Recommended additions:**
- Husky pre-commit hooks to run tests
- GitHub Actions CI pipeline for automated testing on push
- Coverage thresholds (recommend: 70%+ minimum)
- Visual regression testing (Playwright visual comparisons)
- Accessibility testing (axe, jest-axe)

---

*Testing analysis: 2026-03-20*
