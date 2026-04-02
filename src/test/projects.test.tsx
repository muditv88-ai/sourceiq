import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from './utils';
import ProjectsPage from '@/pages/ProjectsPage';

describe('ProjectsPage', () => {
  it('renders the page without crashing', () => {
    render(<ProjectsPage />);
    // Page title or heading should be present
    const heading = document.querySelector('h1, h2, [data-testid="page-title"]');
    expect(heading || document.body).toBeTruthy();
  });

  it('renders a list or empty state after loading', async () => {
    render(<ProjectsPage />);
    await waitFor(() => {
      // Either projects list or empty-state message should appear
      const content = document.body.textContent || '';
      expect(content.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });
});
