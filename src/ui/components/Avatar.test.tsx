import { render } from '@testing-library/react';
import { Avatar, PlayersProvider } from './Avatar';

const players = [
  { id: 'a', name: 'adam', archived: false, order: 0, avatar: 'data:image/webp;base64,AA==' },
  { id: 'e', name: ' Emil', archived: false, order: 1 },
];

const inCtx = (ui: React.ReactNode, me: string | null = null) => render(<PlayersProvider players={players} me={me}>{ui}</PlayersProvider>).container;

describe('Avatar', () => {
  it('s fotkou ukáže obrázek, bez ní první písmeno, neznámý hráč otazník', () => {
    expect(inCtx(<Avatar id="a" />).querySelector('img')?.getAttribute('src')).toBe('data:image/webp;base64,AA==');
    const e = inCtx(<Avatar id="e" />).querySelector('.av')!;
    expect(e.getAttribute('data-ini')).toBe('E');
    expect(e.textContent).toBe('');
    expect(e.querySelector('img')).toBeNull();
    expect(inCtx(<Avatar id="x" />).querySelector('.av')?.getAttribute('data-ini')).toBe('?');
  });

  it('přihlášený hráč má zlatý okraj, pod čarou je vybledlý; čtečka kroužek přeskočí', () => {
    const el = inCtx(<Avatar id="a" size="l" dim />, 'a').querySelector('.av')!;
    expect(el.className).toBe('av av-l me dim');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('bez provideru (testy komponent) nic nekreslí', () => {
    expect(render(<Avatar id="a" />).container.innerHTML).toBe('');
  });
});
