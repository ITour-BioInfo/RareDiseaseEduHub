import type { CatalogRecord, CatalogTranslation } from './schema';

export function localizeRecord(record: CatalogRecord, translation: CatalogTranslation | undefined) {
  const localized = Boolean(translation?.title);
  const translated = localized && translation?.locale !== record.content.original_language;
  return {
    ...record,
    display_title: translation?.title || record.content.title_original,
    display_summary: translation?.summary || record.content.summary_original,
    display_description: translation?.description || record.content.description_original,
    display_provider: translation?.provider_display_name || record.provider.name,
    display_language: localized ? translation!.locale : record.content.original_language,
    has_translation: translated,
    translation_status: translation?.translation.status || 'missing',
  };
}
