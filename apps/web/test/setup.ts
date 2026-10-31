import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// `globals` is off, so Testing Library cannot auto-register cleanup.
afterEach(cleanup);

// jsdom lacks the layout APIs Radix primitives rely on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub;

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  }),
});

Element.prototype.scrollIntoView = function scrollIntoView() {};
Element.prototype.hasPointerCapture = function hasPointerCapture() {
  return false;
};
Element.prototype.setPointerCapture = function setPointerCapture() {};
Element.prototype.releasePointerCapture = function releasePointerCapture() {};
