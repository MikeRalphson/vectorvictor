export function Fragment(a) {
  if (typeof a === 'function') {
    const x = a();
    if (x) html += x;
  }
  else {
    for (let b of arguments) {
      if (b) html += JSON.stringify(b);
    }
    return a;
  }
}

export function jsx(a) {
  if (typeof a === 'function') {
    const x = a();
    if (x) html += x;
  }
  else {
    for (let b of arguments) {
      if (b) html += JSON.stringify(b);
    }
  }
}

export function jsxs() {
  if (typeof a === 'function') {
    const x = a();
    if (x) html += x;
  }
  else {
    for (let b of arguments) {
      if (b) html += JSON.stringify(b);
    }
  }
}
