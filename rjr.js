// from preact-jsx-runtime
// License: MIT
//
import { createElement } from 'react';
export { Fragment } from 'react';

/**
 * @param {ComponentType} type     Component type.
 * @param {Props}         config   Component props.
 * @param {string=}       maybeKey Key, or undefined.
 */
export function jsx(type, config, maybeKey) {
  let props;

  let propName;

  if (maybeKey === undefined) {
    props = config;
  } else {
    props = {
      key: '' + maybeKey,
    };

    for (propName in config) {
      if (Object.prototype.hasOwnProperty.call(config, propName)) {
        props[propName] = config[propName];
      }
    }
  }

  return createElement(type, props);
}

export { jsx as jsxs };
