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
  for (const n of names) await user.click(screen.getByRole('checkbox', { name: n }));
  await next(user); // Přítomní → Kdy, kde a disciplíny
  if (setup) await setup();
  while (screen.queryByRole('button', { name: /^Další:/ })) await next(user);
  await user.click(screen.getByRole('button', { name: 'Zahájit trénink' }));
}

/** Otevře nastavení existujícího tréninku na daném kroku. */
export async function openSettings(user: UserEvent, step: string) {
  await user.click(await screen.findByRole('button', { name: 'Upravit nastavení' }));
  await user.click(stepButton(step));
}

/** Panel „Týmy pro simulaci“ v tréninku (před zahájením simulace). */
export const openTeams = (user: UserEvent) => user.click(screen.getByText('Týmy pro simulaci', { selector: 'strong' }));

export const saveSettings = (user: UserEvent) => user.click(screen.getByRole('button', { name: 'Uložit změny' }));

/** Pohled v kroku Disciplíny: Plán disciplín, Kolo po kole, Kdo s kým (10. 11. 2026). */
export const discView = (user: UserEvent, name: 'Plán disciplín' | 'Kolo po kole' | 'Kdo s kým') =>
  user.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) }));
