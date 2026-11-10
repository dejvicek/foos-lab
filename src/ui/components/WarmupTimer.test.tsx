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

describe('Rozcvička – ukončená a probuzená obrazovka', () => {
  afterEach(() => vi.restoreAllMocks());

  it('ukončená Rozcvička: timer stojí a nevibruje', () => {
    const spy = vi.spyOn(vib, 'vibrate').mockImplementation(() => {});
    const { rerender } = render(<WarmupTimer startedAt={t0} endedAt={t0 + 240_000} now={t0 + 241_000} compact={false} />);
    expect(screen.getByText('Rozcvička ukončena.')).toBeInTheDocument();
    rerender(<WarmupTimer startedAt={t0} endedAt={t0 + 240_000} now={t0 + 265_000} compact={false} />);
    expect(spy).not.toHaveBeenCalled();
    rerender(<WarmupTimer startedAt={t0} endedAt={t0 + 240_000} now={t0 + 265_000} compact />);
    expect(screen.getByText('Rozcvička – ukončeno')).toBeInTheDocument();
  });

  it('běžící Rozcvička na telefonu drží obrazovku zapnutou, po konci ji pustí', async () => {
    const release = vi.fn(() => Promise.resolve());
    const request = vi.fn(() => Promise.resolve({ release }));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    const { rerender } = render(<WarmupTimer startedAt={t0} now={t0 + 30_000} compact={false} />);
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    rerender(<WarmupTimer startedAt={t0} now={t0 + 520_000} compact={false} />);
    await vi.waitFor(() => expect(release).toHaveBeenCalled());
    // notebook (kompaktní) obrazovku nedrží
    request.mockClear();
    render(<WarmupTimer startedAt={t0} now={t0 + 30_000} compact />);
    await new Promise((r) => setTimeout(r, 0));
    expect(request).not.toHaveBeenCalled();
    delete (navigator as { wakeLock?: unknown }).wakeLock;
  });
});
