import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { memoryRepository } from './storage/memoryRepository';
import { createSupabase, supabaseRepository } from './storage/supabaseRepository';
import { memoryAuth, supabaseAuth, type AuthService } from './storage/auth';
import type { Repository } from './storage/repository';
import { localOutbox, type Outbox } from './storage/outbox';
import { fetchLatestVersion } from './storage/appVersion';
import './ui/styles.css';

function createBackend(): { repo: Repository; auth: AuthService; outboxFor?: (playerId: string) => Outbox } | null {
  const env = import.meta.env;
  // Data v paměti se po obnovení stránky ztratí – neodeslané zápisy se k nim neukládají.
  if (env.VITE_USE_MEMORY === '1') return { repo: memoryRepository(), auth: memoryAuth() };
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) return null;
  const client = createSupabase(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  return { repo: supabaseRepository(client), auth: supabaseAuth(client), outboxFor: localOutbox };
}

const backend = createBackend();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {backend ? (
      <App repo={backend.repo} auth={backend.auth} outboxFor={backend.outboxFor} latestVersion={import.meta.env.PROD ? fetchLatestVersion : undefined} />
    ) : (
      <main className="page">
        <p>Chybí nastavení Supabase. Doplň .env.local podle .env.example.</p>
      </main>
    )}
  </StrictMode>,
);
