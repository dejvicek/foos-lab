import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { memoryRepository } from '../../storage/memoryRepository';
import { memoryAuth } from '../../storage/auth';

describe('Návod pro hráče (landing page, 10. 11. 2026)', () => {
  it('bez přihlášení: odkaz z přihlášení, ukázka zápisu legu, zpět na přihlášení', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/trainings';
    render(<App repo={memoryRepository()} auth={memoryAuth({ signedIn: null })} />);
    await screen.findByRole('heading', { name: 'Přihlášení' });
    await user.click(screen.getByRole('link', { name: 'Jak appka funguje ›' }));
    const guide = await screen.findByRole('main', { name: 'Návod pro hráče' });
    expect(within(guide).getByRole('heading', { level: 1 })).toHaveTextContent('Ťukni gól.Zbytek pohlídá appka.');
    // ukázka: leg do 6, pak zamčeno; Opravit vrátí poslední ťuknutí
    const demo = within(guide).getByLabelText('Ukázka: zápis zápasu na telefonu');
    for (let i = 0; i < 6; i++) await user.click(within(demo).getByRole('button', { name: 'Gól vlevo' }));
    expect(within(demo).getByRole('status')).toHaveTextContent('Leg dohrán 6:0 · uloženo');
    expect(within(demo).getByRole('button', { name: 'Gól vpravo' })).toBeDisabled();
    await user.click(within(demo).getByRole('button', { name: 'Opravit' }));
    expect(within(demo).queryByRole('status')).toBeNull();
    // Start 5:5: o 2 góly
    await user.click(within(demo).getByRole('button', { name: 'Start 5:5' }));
    await user.click(within(demo).getByRole('button', { name: 'Gól vlevo' }));
    expect(within(demo).queryByRole('status')).toBeNull(); // 6:5 ještě ne
    await user.click(within(demo).getByRole('button', { name: 'Gól vlevo' }));
    expect(within(demo).getByRole('status')).toHaveTextContent('Leg dohrán 7:5');
    await user.click(within(guide).getByRole('button', { name: 'Přihlásit se' }));
    expect(await screen.findByRole('heading', { name: 'Přihlášení' })).toBeInTheDocument();
  });

  it('přihlášený: Návod v horní liště, Zpět do appky', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/trainings';
    render(<App repo={memoryRepository()} />);
    await user.click(await screen.findByRole('button', { name: 'Návod' }));
    const guide = await screen.findByRole('main', { name: 'Návod pro hráče' });
    // cvičení: po 20 pokusech hotovo
    const drill = within(guide).getByLabelText('Ukázka: zápis cvičení');
    for (let i = 0; i < 8; i++) await user.click(within(drill).getByRole('button', { name: 'Gól' }));
    expect(within(drill).getByRole('status')).toHaveTextContent('Hotovo 17 z 20');
    // žebříček: medaile v Zápasech, Zdržovači se šnekem a „Brzda“
    const ladder = within(guide).getByLabelText('Ukázka: žebříček');
    expect(within(ladder).getByTitle('1. místo')).toBeInTheDocument();
    expect(within(ladder).getByTitle('1 ze 3 tréninků')).toBeInTheDocument();
    await user.click(within(ladder).getByRole('button', { name: 'Zdržovači' }));
    expect(within(ladder).getByRole('button', { name: 'Zdržovači' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(ladder).getByText('Brzda')).toBeInTheDocument();
    expect(within(ladder).getByTitle('3. nejdelší čekání')).toBeInTheDocument();
    expect(within(ladder).queryByTitle('4. nejdelší čekání')).toBeNull();
    expect(within(guide).getByRole('link', { name: 'Foos Lab – úvodní stránka' })).toHaveAttribute('href', '#/trainings');
    await user.click(within(guide).getByRole('button', { name: 'Zpět do appky' }));
    expect(await screen.findByRole('heading', { name: 'Trénink' })).toBeInTheDocument();
  });
});
