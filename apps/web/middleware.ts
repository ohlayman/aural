import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/config';

const intl = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  const localeCookie = request.cookies.get('NEXT_LOCALE')?.value;

  if (request.nextUrl.pathname === '/' && localeCookie === 'en') {
    return NextResponse.redirect(new URL('/en', request.url));
  }

  return intl(request);
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
