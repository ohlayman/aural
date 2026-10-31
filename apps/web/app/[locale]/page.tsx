import { getTranslations } from 'next-intl/server';

export default async function HomePage() {
  const t = await getTranslations('home');

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">{t('subtitle')}</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('hint')}</p>
      </div>
      <div className="flex flex-col gap-2 rounded-xl border border-black/10 p-6 dark:border-white/15">
        <p className="font-medium">{t('typeLink')}</p>
        <input
          type="text"
          disabled
          placeholder={t('inputPlaceholder')}
          className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/15"
        />
      </div>
    </section>
  );
}
