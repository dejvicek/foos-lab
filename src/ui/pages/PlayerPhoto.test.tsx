import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlayerPage } from './PlayerPage';
import { PlayersProvider } from '../components/Avatar';
import { useAppState } from '../useAppState';
import { memoryRepository } from '../../storage/memoryRepository';
import { defaultPrefs } from '../../storage/prefs';
import type { Repository } from '../../storage/repository';

const img = 'data:image/webp;base64,AA==';
const players = [
  { id: 'a', name: 'Adam', archived: false, order: 0 },
  { id: 'b', name: 'Bára', archived: false, order: 1, avatar: img },
];

function Harness({ repo, id, me, admin }: { repo: Repository; id: string; me: string; admin: boolean }) {
  const store = useAppState(repo);
  if (store.status !== 'ready') return null;
  return (
    <PlayersProvider players={store.data.players} me={me}>
      <PlayerPage store={store} id={id} prefs={defaultPrefs()} navigate={() => {}} me={me} admin={admin} />
    </PlayersProvider>
  );
}

const show = async (id: string, me: string, admin = false) => {
  const repo = memoryRepository({ players, trainings: [] });
  render(<Harness repo={repo} id={id} me={me} admin={admin} />);
  await screen.findByRole('heading', { level: 1 });
  return repo;
};

describe('profilová fotka na stránce hráče (21. 11. 2026)', () => {
  it('hráč na cizím profilu fotku jen vidí', async () => {
    await show('b', 'a');
    expect(document.querySelector('.pp-head .av img')?.getAttribute('src')).toBe(img);
    expect(screen.queryByRole('button', { name: /fotku/ })).toBeNull();
    expect(screen.queryByTestId('avatar-file')).toBeNull();
  });

  it('na svém profilu bez fotky: písmeno a Přidat fotku', async () => {
    await show('a', 'a');
    expect(document.querySelector('.pp-head .av')?.textContent).toBe('A');
    expect(screen.getAllByRole('button', { name: 'Přidat fotku' })).toHaveLength(2); // fotoaparát + odkaz
    expect(screen.queryByRole('button', { name: 'Smazat fotku' })).toBeNull();
    expect(screen.getByTestId('avatar-file')).toHaveAttribute('accept', 'image/*');
  });

  it('admin smaže fotku jinému hráči po potvrzení', async () => {
    const user = userEvent.setup();
    const repo = await show('b', 'a', true);
    expect(screen.getAllByRole('button', { name: 'Změnit fotku' })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Smazat fotku' }));
    await user.click(screen.getByRole('button', { name: 'Nechat' }));
    expect(document.querySelector('.pp-head .av img')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Smazat fotku' }));
    await user.click(screen.getByRole('button', { name: 'Smazat' }));
    expect(document.querySelector('.pp-head .av')?.textContent).toBe('B');
    await waitFor(() => expect(repo.snapshot().players[1].avatar).toBeUndefined());
  });

  it('soubor, který není obrázek, ukáže chybu', async () => {
    const user = userEvent.setup({ applyAccept: false });
    await show('a', 'a');
    await user.upload(screen.getByTestId('avatar-file'), new File(['nic'], 'a.txt', { type: 'text/plain' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('nepodařilo otevřít jako obrázek');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
