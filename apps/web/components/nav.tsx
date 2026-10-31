'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';

const links = [
  { href: '/', key: 'home' },
  { href: '/tts', key: 'tts' },
  { href: '/stt', key: 'stt' },
  { href: '/library', key: 'library' },
  { href: '/settings', key: 'settings' },
] as const;

export function Nav() {
  const t = useTranslations('nav');
  const tLanguage = useTranslations('language');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const nextLocale = locale === 'zh' ? 'en' : 'zh';

  function switchLocale() {
    document.cookie = `NEXT_LOCALE=${nextLocale};path=/;max-age=31536000;samesite=lax`;
    router.replace(pathname, { locale: nextLocale });
  }

  return (
    <header className="border-b border-black/10 dark:border-white/15">
      <nav className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-4 px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          声屿 Aural
        </Link>
        <ul className="flex flex-1 flex-wrap items-center gap-4 text-sm">
          {links.map((link) => (
            <li key={link.key}>
              <Link href={link.href} className="hover:underline">
                {t(link.key)}
              </Link>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={switchLocale}
          className="rounded-full border border-black/15 px-3 py-1 text-sm hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/[.08]"
        >
          {tLanguage(nextLocale)}
        </button>
      </nav>
    </header>
  );
}
