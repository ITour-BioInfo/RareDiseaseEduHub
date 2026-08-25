export function eventsFromJsonLd(values: unknown[]) {
  const flattened = values.flatMap(
    (value: any) => value?.['@graph'] || (Array.isArray(value) ? value : [value]),
  );
  return flattened
    .filter((value: any) => ['Event', 'Course', 'CourseInstance'].includes(value?.['@type']))
    .map((value: any) => ({
      type: value['@type'],
      name: value.name || null,
      start: value.startDate || value.startDateTime || null,
      end: value.endDate || value.endDateTime || null,
      url: value.url || null,
    }));
}
