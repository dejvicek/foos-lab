import { render, screen, waitFor } from '@testing-library/react';
import { App } from './App';
import { memoryRepository } from '../storage/memoryRepository';
import { myVersion } from '../storage/appVersion';

beforeEach(() => {
  window.location.hash = '#/trainings';
});

describe('App – kontrola verze', () => {
  it('bez novější verze se nic neukazuje', async () => {
    render(<App repo={memoryRepository()} latestVersion={async () => ({ ...myVersion })} />);
    await screen.findByRole('heading', { name: 'Tréninky' });
    expect(screen.queryByRole('button', { name: 'Obnovit' })).toBeNull();
  });

  it('novější verze: lišta s tlačítkem Obnovit, appka běží dál', async () => {
    render(<App repo={memoryRepository()} latestVersion={async () => ({ build: 'novejsi', compat: myVersion.compat })} />);
    await screen.findByRole('heading', { name: 'Tréninky' });
    await screen.findByText(/nová verze/i);
    expect(screen.getByRole('button', { name: 'Obnovit' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tréninky' })).toBeInTheDocument();
  });

  it('nová verze, vedle které tahle nesmí běžet: místo obsahu výzva k obnovení', async () => {
    render(<App repo={memoryRepository()} latestVersion={async () => ({ build: 'novejsi', compat: myVersion.compat + 1 })} />);
    await screen.findByText(/bez obnovení/i);
    expect(screen.getByRole('button', { name: 'Obnovit' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Tréninky' })).toBeNull());
  });
});
