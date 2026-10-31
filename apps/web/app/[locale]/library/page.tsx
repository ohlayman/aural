import { getTranslations } from 'next-intl/server';

export default async function LibraryPage() {
  const t = await getTranslations('library');

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">{t('placeholder')}</p>
    </section>
  );
}
