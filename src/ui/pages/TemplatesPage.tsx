import { clubTrainings } from '../../domain/practice';
import { useState } from 'react';
import { TemplatesEditor } from '../components/TemplatesEditor';
import type { AppStore } from '../useAppState';

/** Šablony tréninku (jen admin): jedna tabulka na šablonu; nový trénink začne první šablonou. */
export function TemplatesPage({ store, admin }: { store: AppStore; admin: boolean }) {
  // Po „Zahodit změny“ a po uložení se editor načte znovu z katalogu.
  const [version, setVersion] = useState(0);
  const [saved, setSaved] = useState(false);
  if (!admin)
    return (
      <section className="templates-page">
        <h1>Šablony</h1>
        <p>Šablony tréninku spravuje admin.</p>
      </section>
    );
  return (
    <section className="templates-page">
      <h1>Šablony</h1>
      <p className="lead">Z čeho se skládá nový trénink. Nový trénink začne první šablonou, v průvodci jde v kroku Disciplíny vybrat jinou.</p>
      <TemplatesEditor
        key={version}
        catalog={store.data.catalog ?? {}}
        trainings={clubTrainings(store.data.trainings)}
        newId={store.newId}
        onChange={() => setSaved(false)}
        onSave={(c) => {
          store.saveCatalog(c);
          setSaved(true);
        }}
        onCancel={() => {
          setVersion((v) => v + 1);
          setSaved(false);
        }}
        saved={saved}
      />
    </section>
  );
}
