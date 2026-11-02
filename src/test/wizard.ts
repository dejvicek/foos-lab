import { screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** Krok průvodce podle názvu (tlačítko v liště kroků). */
export const stepButton = (title: string) =>
  screen.getAllByRole('button').find((b) => b.closest('.wizard-steps') && b.textContent?.replace(/^[✓\d]+/, '').startsWith(title))!;

/** Klik na „Další“ v průvodci. */
export const next = (user: UserEvent) => user.click(screen.getByRole('button', { name: /^Další:/ }));

/** Nový trénink průvodcem: zaškrtne hráče, projde kroky a zahájí ho. */
export async function createTraining(user: UserEvent, names: string[], setup?: () => Promise<void>) {
  await user.click(await screen.findByRole('button', { name: /Nový trénink/ }));
  if (setup) await setup();
  await next(user); // Kdy a kde → Přítomní
  for (const n of names) await user.click(screen.getByRole('checkbox', { name: n }));
  while (screen.queryByRole('button', { name: /^Další:/ })) await next(user);
  await user.click(screen.getByRole('button', { name: 'Zahájit trénink' }));
}

/** Otevře nastavení existujícího tréninku na daném kroku. */
export async function openSettings(user: UserEvent, step: string) {
  await user.click(await screen.findByRole('button', { name: 'Upravit nastavení' }));
  await user.click(stepButton(step));
}

export const saveSettings = (user: UserEvent) => user.click(screen.getByRole('button', { name: 'Uložit změny' }));
