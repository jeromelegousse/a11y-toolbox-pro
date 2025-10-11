import { describe, expect, it } from 'vitest';
import { applyInertToSiblings } from '../src/utils/inert.js';

function createFakeElement({ inertProp = false } = {}) {
  const element = {
    children: [],
    parentElement: null,
    ownerDocument: null,
    _attrs: new Map(),
    hasAttribute(name) {
      return this._attrs.has(name);
    },
    getAttribute(name) {
      return this._attrs.has(name) ? this._attrs.get(name) : null;
    },
    setAttribute(name, value = '') {
      this._attrs.set(name, String(value));
    },
    removeAttribute(name) {
      this._attrs.delete(name);
    },
    appendChild(child) {
      this.children.push(child);
      child.parentElement = this;
      child.ownerDocument = this.ownerDocument;
    },
    contains(node) {
      if (node === this) return true;
      return this.children.some((child) => (typeof child.contains === 'function' ? child.contains(node) : child === node));
    }
  };

  if (inertProp) {
    let value = false;
    Object.defineProperty(element, 'inert', {
      get() {
        return value;
      },
      set(next) {
        value = Boolean(next);
      },
      configurable: true,
      enumerable: true
    });
  }

  element[Symbol.iterator] = function iterator() {
    return this.children[Symbol.iterator]();
  };

  return element;
}

function createFakeDocument() {
  const body = createFakeElement();
  const doc = { body };
  body.ownerDocument = doc;
  return doc;
}

describe('applyInertToSiblings', () => {
  it('applique inert et aria-hidden aux éléments frères et restaure ensuite', () => {
    const documentMock = createFakeDocument();
    const header = createFakeElement();
    const root = createFakeElement();
    const footer = createFakeElement();

    documentMock.body.appendChild(header);
    documentMock.body.appendChild(root);
    documentMock.body.appendChild(footer);

    const release = applyInertToSiblings(root, { ownerDocument: documentMock });

    expect(header.hasAttribute('aria-hidden')).toBe(true);
    expect(header.getAttribute('aria-hidden')).toBe('true');
    expect(header.hasAttribute('inert')).toBe(true);
    expect(footer.hasAttribute('aria-hidden')).toBe(true);

    release();

    expect(header.hasAttribute('aria-hidden')).toBe(false);
    expect(header.hasAttribute('inert')).toBe(false);
    expect(footer.hasAttribute('aria-hidden')).toBe(false);
  });

  it('préserve les attributs existants', () => {
    const documentMock = createFakeDocument();
    const aside = createFakeElement();
    aside.setAttribute('aria-hidden', 'false');
    const root = createFakeElement();

    documentMock.body.appendChild(aside);
    documentMock.body.appendChild(root);

    const release = applyInertToSiblings(root, { ownerDocument: documentMock });
    expect(aside.getAttribute('aria-hidden')).toBe('true');

    release();

    expect(aside.getAttribute('aria-hidden')).toBe('false');
  });

  it('gère les implémentations natives de inert', () => {
    const documentMock = createFakeDocument();
    const before = createFakeElement({ inertProp: true });
    const root = createFakeElement();

    documentMock.body.appendChild(before);
    documentMock.body.appendChild(root);

    before.inert = false;
    const release = applyInertToSiblings(root, { ownerDocument: documentMock });

    expect(before.inert).toBe(true);

    release();

    expect(before.inert).toBe(false);
  });
});
