import '@testing-library/jest-dom/vitest';
import { applyCatalog } from './domain/catalog';

// Katalog (šablony, disciplíny) je globální stav domény – po každém testu výchozí.
afterEach(() => applyCatalog({}));
