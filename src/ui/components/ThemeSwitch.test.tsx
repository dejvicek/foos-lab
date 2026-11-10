import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeSwitch } from './ThemeSwitch';
import { loadTheme } from '../../storage/prefs';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

it('přepínač režimu: světlý → tmavý → světlý, volba se pamatuje v zařízení', async () => {
  const user = userEvent.setup();
  render(<ThemeSwitch />);
  // bez volby podle systému (v testu světlý) – nabízí tmavý
  expect(loadTheme()).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Tmavý režim' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(loadTheme()).toBe('dark');
  await user.click(screen.getByRole('button', { name: 'Světlý režim' }));
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(loadTheme()).toBe('light');
});
