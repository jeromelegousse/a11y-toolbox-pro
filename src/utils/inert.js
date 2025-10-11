function asArray(iterable) {
  return Array.isArray(iterable) ? iterable : Array.from(iterable ?? []);
}

function getOwnerDocument(container, explicit) {
  if (explicit) return explicit;
  if (container && container.ownerDocument) return container.ownerDocument;
  return typeof document !== 'undefined' ? document : null;
}

export function applyInertToSiblings(container, options = {}) {
  const ownerDocument = getOwnerDocument(container, options.ownerDocument);
  if (!container || !ownerDocument?.body) {
    return () => {};
  }

  const body = ownerDocument.body;
  const preserved = new Set([container]);
  asArray(options.exclusions).forEach((node) => {
    if (node) preserved.add(node);
  });

  const handled = [];
  const children = asArray(body.children);

  children.forEach((child) => {
    if (!child) return;
    if (preserved.has(child)) return;
    if (typeof child.contains === 'function') {
      for (const keep of preserved) {
        if (keep && (child === keep || child.contains(keep))) {
          return;
        }
      }
    }

    const record = {
      element: child,
      hadAriaHidden: typeof child.hasAttribute === 'function' ? child.hasAttribute('aria-hidden') : false,
      ariaHidden: typeof child.getAttribute === 'function' ? child.getAttribute('aria-hidden') : null,
      hadInertAttribute: typeof child.hasAttribute === 'function' ? child.hasAttribute('inert') : false,
      hadInertProperty: 'inert' in child,
      inertValue: 'inert' in child ? child.inert : undefined
    };

    if (record.hadInertProperty) {
      child.inert = true;
    } else if (typeof child.setAttribute === 'function') {
      child.setAttribute('inert', '');
    }

    if (typeof child.setAttribute === 'function') {
      child.setAttribute('aria-hidden', 'true');
    }

    handled.push(record);
  });

  return () => {
    handled.forEach((record) => {
      const { element } = record;
      if (!element) return;

      if (record.hadInertProperty) {
        element.inert = record.inertValue;
      } else if (typeof element.setAttribute === 'function' || typeof element.removeAttribute === 'function') {
        if (record.hadInertAttribute) {
          if (typeof element.setAttribute === 'function') {
            element.setAttribute('inert', '');
          }
        } else if (typeof element.removeAttribute === 'function') {
          element.removeAttribute('inert');
        }
      }

      if (typeof element.setAttribute === 'function' || typeof element.removeAttribute === 'function') {
        if (record.hadAriaHidden) {
          if (typeof element.setAttribute === 'function') {
            element.setAttribute('aria-hidden', record.ariaHidden ?? 'true');
          }
        } else if (typeof element.removeAttribute === 'function') {
          element.removeAttribute('aria-hidden');
        }
      }
    });
  };
}
