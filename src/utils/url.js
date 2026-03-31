export function getParamFromLocation(name) {
  const urlParams = new URLSearchParams(window.location.search);

  return urlParams.get(name) || '';
}

export function setParamInLocation(name, value) {
  const url = new URL(window.location.href);
  url.searchParams.set(name, value);

  window.history.replaceState(null, '', url.href);
}
