export function getUnicode(char) {
  return 'U+' + char.codePointAt(0).toString(16).toUpperCase();
}
