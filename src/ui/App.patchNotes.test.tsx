import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { memoryRepository } from '../storage/memoryRepository';
import { memoryAuth } from '../storage/auth';
import { memorySeenVersion } from '../storage/prefs';
import { APP_VERSION } from '../storage/appVersion';
import { PATCH_NOTES } from './components/PatchNotes';

beforeEach(() => {
  window.location.hash = '#/trainings';
});

const page = () => screen.getByRole('region', { name: 'Co je nového' });
const versions = () => within(page()).getAllByRole('heading', { level: 2 }).map((h) => h.querySelector('.pn-num')?.textContent);
const entry = (v: string) => within(page()).getAllByRole('listitem').find((li) => li.querySelector('.pn-num')?.textContent === v)!;

describe('Co je nového – stránka #/patch-notes (20. 11. 2026)', () => {
  it('číslo verze vede na stránku: všechny verze s daty, nejnovější nahoře; běžící verze jen plným uzlem, bez štítku', async () => {
    const user = userEvent.setup();
    render(<App repo={memoryRepository()} />);
    await screen.findByRole('heading', { name: 'Tréninky' });
    const link = screen.getAllByRole('link', { name: `Verze appky ${APP_VERSION} – co je nového` })[0];
    expect(link).toHaveAttribute('href', '#/patch-notes');
    await user.click(link);
    expect(await screen.findByRole('heading', { level: 1, name: 'Co je nového' })).toBeInTheDocument();
    expect(versions()).toEqual(PATCH_NOTES.map((e) => e.version));
    expect(within(entry('1.0.0')).getByText('10. 11. 2026')).toBeInTheDocument();
    expect(entry(APP_VERSION)).toHaveClass('is-current');
    expect(within(page()).queryByText(/Tvoje verze|Aktuální verze/)).toBeNull();
  });

  it('nejnovější verze je rozbalená, starší jen se shrnutím; Celý záznam rozbalí', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/patch-notes';
    render(<App repo={memoryRepository()} />);
    await screen.findByRole('heading', { level: 1, name: 'Co je nového' });
    expect(within(entry(PATCH_NOTES[0].version)).getByRole('button', { name: 'Skrýt podrobnosti' })).toBeInTheDocument();
    const old = entry('1.2.0');
    expect(old).toHaveTextContent('Zápasy na víc legů'); // shrnutí
    expect(old).not.toHaveTextContent('Formát zápasu BO1');
    await user.click(within(old).getByRole('button', { name: 'Celý záznam' }));
    expect(old).toHaveTextContent('Formát zápasu BO1');
  });

  it('po aktualizaci jednou lišta Nová verze; Co je nového otevře stránku s označením nových verzí a lišta zmizí', async () => {
    const user = userEvent.setup();
    const seen = memorySeenVersion('1.1.0');
    const { unmount } = render(<App repo={memoryRepository()} seenVersion={seen} />);
    await screen.findByText(`Appka má novou verzi ${APP_VERSION}.`);
    await user.click(screen.getByRole('button', { name: 'Co je nového' }));
    expect(window.location.hash).toBe('#/patch-notes');
    expect(within(entry('1.2.0')).getByText('Nové pro tebe')).toBeInTheDocument();
    expect(within(entry('1.1.0')).queryByText('Nové pro tebe')).toBeNull();
    expect(screen.queryByText(/Appka má novou verzi/)).toBeNull();
    expect(seen.current()).toBe(APP_VERSION);
    unmount();
    window.location.hash = '#/trainings';
    render(<App repo={memoryRepository()} seenVersion={seen} />);
    await screen.findByRole('heading', { name: 'Tréninky' });
    expect(screen.queryByText(/Appka má novou verzi/)).toBeNull();
  });

  it('Skrýt lištu: poznámky jsou viděné, příště se neukáže', async () => {
    const user = userEvent.setup();
    const seen = memorySeenVersion('1.0.0');
    render(<App repo={memoryRepository()} seenVersion={seen} />);
    await screen.findByText(`Appka má novou verzi ${APP_VERSION}.`);
    await user.click(screen.getByRole('button', { name: 'Skrýt' }));
    expect(screen.queryByText(/Appka má novou verzi/)).toBeNull();
    expect(seen.current()).toBe(APP_VERSION);
  });

  it('aktuální verze už viděná: žádná lišta', async () => {
    render(<App repo={memoryRepository()} seenVersion={memorySeenVersion(APP_VERSION)} />);
    await screen.findByRole('heading', { name: 'Tréninky' });
    expect(screen.queryByText(/Appka má novou verzi/)).toBeNull();
  });

  it('bez přihlášení jde stránka číst a vede na přihlášení', async () => {
    window.location.hash = '#/patch-notes';
    render(<App repo={memoryRepository()} auth={memoryAuth({ signedIn: null })} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Co je nového' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Přihlásit se' })).toBeInTheDocument();
  });
});
