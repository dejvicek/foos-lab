import { render, screen } from '@testing-library/react';
import { WarmupTimer } from './WarmupTimer';
import * as vib from '../vibrate';

const t0 = 1_000_000;

describe('Rozcvička – timer', () => {
  afterEach(() => vi.restoreAllMocks());

  it('telefon: příprava a fáze z času zahájení', () => {
    const { rerender } = render(<WarmupTimer startedAt={t0} now={t0 + 2_000} compact={false} />);
    expect(screen.getByText(/Připrav se: Kroužení kolem míčku – pravá ruka, po směru/)).toBeInTheDocument();
    expect(screen.getByText('0:03')).toBeInTheDocument();
    rerender(<WarmupTimer startedAt={t0} now={t0 + 6_000} compact={false} />);
    expect(screen.getByText('fáze 1 / 7')).toBeInTheDocument();
    expect(screen.getByText('0:59')).toBeInTheDocument();
    expect(screen.getByText(/na dvojce/)).toBeInTheDocument();
    expect(screen.getByText(/Další: Kroužení kolem míčku – pravá ruka, proti směru/)).toBeInTheDocument();
  });

  it('vibruje jen při přechodu, ne při prvním vykreslení', () => {
    const spy = vi.spyOn(vib, 'vibrate').mockImplementation(() => {});
    const { rerender } = render(<WarmupTimer startedAt={t0} now={t0 + 30_000} compact={false} />);
    expect(spy).not.toHaveBeenCalled();
    rerender(<WarmupTimer startedAt={t0} now={t0 + 66_000} compact={false} />); // příprava 2. fáze
    expect(spy).not.toHaveBeenCalled();
    rerender(<WarmupTimer startedAt={t0} now={t0 + 71_000} compact={false} />); // začátek 2. fáze
    expect(spy).toHaveBeenCalledWith(200);
    rerender(<WarmupTimer startedAt={t0} now={t0 + 520_000} compact={false} />);
    expect(spy).toHaveBeenLastCalledWith([200, 100, 200]);
    expect(screen.getByText('Hotovo – Rozcvička skončila.')).toBeInTheDocument();
  });

  it('notebook: kompaktní řádek, bez vibrace', () => {
    const spy = vi.spyOn(vib, 'vibrate').mockImplementation(() => {});
    const { rerender } = render(<WarmupTimer startedAt={t0} now={t0 + 64_000} compact />);
    rerender(<WarmupTimer startedAt={t0} now={t0 + 75_000} compact />);
    expect(screen.getByText('Rozcvička – fáze 2 / 7, zbývá 0:55')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('nezahájená: seznam fází (telefon) / délka (notebook)', () => {
    const { rerender } = render(<WarmupTimer startedAt={undefined} now={t0} compact={false} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(7);
    rerender(<WarmupTimer startedAt={undefined} now={t0} compact />);
    expect(screen.getByText('Rozcvička – 7 fází, 8:35')).toBeInTheDocument();
  });
});
