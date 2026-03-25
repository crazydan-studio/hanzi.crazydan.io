export function getParamFromLocation(name) {
  const urlParams = new URLSearchParams(window.location.search);
  const value = urlParams.get(name) || '';

  return decodeURIComponent(value);
}
