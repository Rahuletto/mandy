export function autoSizeTextarea(el: HTMLTextAreaElement | null) {
  if (el) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }
}
