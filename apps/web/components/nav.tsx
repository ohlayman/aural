'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';

const links = [
  { href: '/', key: 'home' },
  { href: '/tts', key: 'tts' },
  { href: '/stt', key: 'stt' },
  { href: '/library', key: 'library' },
  { href: '/settings', key: 'settings' },
] as const;

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--violet)]';

export function Nav() {
  const t = useTranslations('nav');
  const tLanguage = useTranslations('language');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const nextLocale = locale === 'zh' ? 'en' : 'zh';

  function switchLocale() {
    document.cookie = `NEXT_LOCALE=${nextLocale};path=/;max-age=31536000;samesite=lax`;
    setMenuOpen(false);
    router.replace(pathname, { locale: nextLocale });
  }

  // Esc closes the compact menu.
  useEffect(() => {
    if (!menuOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  // Navigating (including a locale switch) closes the menu.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname, locale]);

  return (
    <header className="border-b border-black/10 dark:border-white/15">
      <nav className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-4 px-6 py-4">
        <Link
          href="/"
          onClick={() => setMenuOpen(false)}
          className={`text-lg font-semibold tracking-tight ${focusRing}`}
        >
          声屿 Aural
        </Link>

        <ul className="hidden flex-1 flex-wrap items-center gap-4 text-sm min-[880px]:flex">
          {links.map((link) => (
            <li key={link.key}>
              <Link href={link.href} className={`hover:underline ${focusRing}`}>
                {t(link.key)}
              </Link>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={switchLocale}
          className="hidden rounded-full border border-black/15 px-3 py-1 text-sm hover:bg-black/[.04] min-[880px]:inline-flex dark:border-white/20 dark:hover:bg-white/[.08]"
        >
          {tLanguage(nextLocale)}
        </button>

        <button
          type="button"
          aria-label={t('menu')}
          aria-expanded={menuOpen}
          aria-controls="nav-menu"
          onClick={() => setMenuOpen((open) => !open)}
          className={`ml-auto grid h-11 w-11 place-items-center rounded-[var(--radius-sm)] border border-black/15 text-[var(--text-primary)] transition hover:bg-black/[.04] min-[880px]:hidden dark:border-white/20 dark:hover:bg-white/[.08] ${focusRing}`}
        >
          {menuOpen ? (
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 4l10 10M14 4 4 14" />
            </svg>
          ) : (
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M3 5h12M3 9h12M3 13h12" />
            </svg>
          )}
        </button>

        {menuOpen ? (
          <div id="nav-menu" className="basis-full min-[880px]:hidden">
            <ul className="flex flex-col gap-1 pb-1">
              {links.map((link) => (
                <li key={link.key}>
                  <Link
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex min-h-11 items-center rounded-[var(--radius-sm)] px-2 text-sm hover:bg-black/[.04] dark:hover:bg-white/[.08] ${focusRing}`}
                  >
                    {t(link.key)}
                  </Link>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={switchLocale}
              className={`flex min-h-11 w-full items-center rounded-[var(--radius-sm)] px-2 text-sm hover:bg-black/[.04] dark:hover:bg-white/[.08] ${focusRing}`}
            >
              {tLanguage(nextLocale)}
            </button>
          </div>
        ) : null}
      </nav>
    </header>
  );
}
