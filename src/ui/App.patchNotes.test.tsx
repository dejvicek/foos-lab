import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { memoryRepository } from '../storage/memoryRepository';
import { memorySeenVersion } from '../storage/prefs';
import { APP_VERSION } from '../storage/appVersion';
import { PATCH_NOTES } from './components/PatchNotes';

beforeEach(() => {
  window.location.hash = '#/trainings';
});

const versions = (dialog: HTMLElement) => within(dialog).getAllByRole('region').map((r) => r.getAttribute('aria-label'));

describe('patch notes (20. 11. 2026)', () => {
  it('klik na číslo verze ukáže všechny verze s daty, nejnovější nahoře; Zavřít okno zavře', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository()} />);
    await screen.findByRole('heading', { name: 'Tréninky' });
    await user.click(screen.getAllByRole('button', { name: `Verze appky ${APP_VERSION} – co je nového` })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Co je nového' });
    expect(versions(dialog)).toEqual(PATCH_NOTES.map((e) => `Verze ${e.version}`));
    expect(within(dialog).getByRole('heading', { name: /^1\.0\.0 10\. 11\. 2026$/ })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Zavřít' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('po aktualizaci jednou: co je nového od naposledy viděné verze; po zavření se už neukáže', async () => {
    const user = userEvent.setup();
    const seen = memorySeenVersion('1.0.0');
    const { unmount } = render(<App repo={memoryRepository()} seenVersion={seen} />);
    const dialog = await screen.findByRole('dialog', { name: 'Co je nového od verze 1.0.0' });
    const expected = PATCH_NOTES.filter((e) => e.version !== '1.0.0').map((e) => `Verze ${e.version}`);
    expect(versions(dialog)).toEqual(expected);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(seen.current()).toBe(APP_VERSION);
    unmount();
    render(<App repo={memoryRepository()} seenVersion={seen} />);
    await screen.findByRole('heading', { name: 'Tréninky' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('zařízení, které ještě nic nevidělo: jen poznámky běžící verze', async () => {
    const seen = memorySeenVersion(null);
    render(<App repo={memoryRepository()} seenVersion={seen} />);
    const dialog = await screen.findByRole('dialog', { name: `Co je nového ve verzi ${APP_VERSION}` });
    expect(versions(dialog)).toEqual([`Verze ${APP_VERSION}`]);
  });

  it('aktuální verze už viděná: nic se neukazuje', async () => {
    render(<App repo={memoryRepository()} seenVersion={memorySeenVersion(APP_VERSION)} />);
    await screen.findByRole('heading', { name: 'Tréninky' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
