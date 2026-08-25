import { calculateStatus, type StatusCode } from '../lib/catalog/status';
import type { CatalogRecord } from '../lib/catalog/schema';

interface ClientMessages {
  loading: string;
  available: string;
  failed: string;
  noResults: string;
  results: string;
  clear: string;
  statusLabels: Record<StatusCode, string>;
}

const root = document.querySelector<HTMLElement>('[data-catalogue]');

if (root) {
  const statusRegion = root.querySelector<HTMLElement>('[data-catalogue-status]');
  const form = root.querySelector<HTMLFormElement>('[data-catalogue-filters]');
  const grid = root.querySelector<HTMLElement>('[data-catalogue-grid]');
  const empty = root.querySelector<HTMLElement>('[data-no-results]');
  const activeFilters = root.querySelector<HTMLElement>('[data-active-filters]');
  const cards = [...root.querySelectorAll<HTMLElement>('[data-record-card]')];
  const messages = JSON.parse(root.dataset.messages || '{}') as ClientMessages;

  const announce = (text: string) => {
    if (statusRegion) statusRegion.textContent = text;
  };
  announce(messages.loading);

  try {
    if (!form || !grid || !empty || !activeFilters)
      throw new Error('Catalogue controls are incomplete.');
    const schedulesElement = document.querySelector<HTMLScriptElement>('#catalogue-schedules');
    const schedules = JSON.parse(schedulesElement?.textContent || '{}') as Record<
      string,
      CatalogRecord
    >;
    const params = new URLSearchParams(window.location.search);

    for (const [name, value] of params) {
      const control = form.elements.namedItem(name);
      if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement)
        control.value = value;
    }

    for (const card of cards) {
      const schedule = schedules[card.dataset.id || ''];
      if (!schedule) continue;
      const current = calculateStatus(schedule);
      card.dataset.status = current.primary;
      card.dataset.nextAction = current.next_action_at || '';
      const badge = card.querySelector<HTMLElement>('[data-status-label]');
      if (badge) {
        badge.dataset.statusLabel = current.primary;
        badge.className = `status-badge status-${current.primary}`;
        badge.textContent = messages.statusLabels[current.primary];
      }
    }

    const value = (name: string) => {
      const control = form.elements.namedItem(name);
      return control instanceof HTMLInputElement || control instanceof HTMLSelectElement
        ? control.value
        : '';
    };
    const includes = (cardValue: string | undefined, selected: string) =>
      !selected || (cardValue || '').split('|').includes(selected);
    const matches = (card: HTMLElement) => {
      const q = value('q').trim().toLocaleLowerCase();
      return (
        (!q || (card.dataset.search || '').includes(q)) &&
        (!value('type') || card.dataset.type === value('type')) &&
        (!value('status') || card.dataset.status === value('status')) &&
        (!value('provider') || card.dataset.provider === value('provider')) &&
        includes(card.dataset.delivery, value('delivery')) &&
        includes(card.dataset.language, value('language')) &&
        (!value('cost') || card.dataset.cost === value('cost')) &&
        (!value('certificate') || card.dataset.certificate === value('certificate'))
      );
    };

    const syncUrl = () => {
      const next = new URLSearchParams();
      for (const element of [...form.elements]) {
        if (
          (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) &&
          element.name &&
          element.value &&
          !(element.name === 'sort' && element.value === 'recommended')
        )
          next.set(element.name, element.value);
      }
      const query = next.toString();
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
      );
    };

    const renderChips = () => {
      activeFilters.replaceChildren();
      for (const element of [...form.elements]) {
        if (
          !(element instanceof HTMLInputElement || element instanceof HTMLSelectElement) ||
          !element.name ||
          !element.value ||
          element.name === 'sort'
        )
          continue;
        const label =
          element instanceof HTMLSelectElement
            ? element.selectedOptions[0]?.textContent
            : element.value;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'filter-chip';
        button.textContent = `${label} ×`;
        button.addEventListener('click', () => {
          element.value = '';
          apply();
          element.focus();
        });
        activeFilters.append(button);
      }
    };

    const apply = () => {
      const visible = cards.filter(matches);
      for (const card of cards) card.hidden = !visible.includes(card);
      const sort = value('sort');
      visible.sort((a, b) =>
        sort === 'title'
          ? (a.dataset.search || '').localeCompare(b.dataset.search || '')
          : sort === 'provider'
            ? (a.dataset.provider || '').localeCompare(b.dataset.provider || '')
            : sort === 'next'
              ? (a.dataset.nextAction || '9999').localeCompare(b.dataset.nextAction || '9999')
              : 0,
      );
      visible.forEach((card) => grid.append(card));
      empty.hidden = visible.length !== 0;
      announce(
        messages.results
          .replace('{shown}', String(visible.length))
          .replace('{total}', String(cards.length)),
      );
      renderChips();
      syncUrl();
    };

    form.addEventListener('input', apply);
    form.addEventListener('change', apply);
    form.addEventListener('reset', () => window.setTimeout(apply));
    apply();
  } catch (error) {
    console.error(error);
    announce(messages.failed);
  }
}
