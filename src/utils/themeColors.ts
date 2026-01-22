export const getThemeColors = () => {
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  if (isDark) {
    return {
      background: "#171313",
      inset: "#1d1919",
      card: "#231f1f",
      inputbox: "#2d2929",
      accent: "#ff6141",
      text: "#f2f2f2",
      muted: "#6e6a6a",
      subtle: "#4a4646",
      selection: "rgba(255, 97, 65, 0.20)",
      cursor: "#ff6141",
      string: "#ffab91",
      keyword: "#ff6141",
      number: "#ffcc80",
      boolean: "#ff8a65",
      null: "#bcaaa4",
      property: "#ffccbc",
      variable: "#f2f2f2",
      function: "#ff7043",
      operator: "#ff6141",
      comment: "#6d6363",
      tag: "#ff6141",
      attribute: "#ffab91",
      attributeValue: "#ffcc80",
      bracket: "#a1887f",
      punctuation: "#8d7b74",
      escape: "#ff8a65",
      regexp: "#ffcc80",
      link: "#ff7043",
      error: "#ef5350",
      lintError: "#ef5350",
      lintWarning: "#ffb74d",
      lintInfo: "#4fc3f7",
    };
  }

  // Light mode colors - orange accent-based for contrast
  return {
    background: "#f5f5f5",
    inset: "#ececec",
    card: "#ffffff",
    inputbox: "#e0e0e0",
    accent: "#ff6141",
    text: "#1f1f1f",
    muted: "#5a5a5a",
    subtle: "#999999",
    selection: "rgba(255, 97, 65, 0.12)",
    cursor: "#ff6141",
    string: "#e86828",
    keyword: "#ff6141",
    number: "#f57c00",
    boolean: "#ff7043",
    null: "#bf5723",
    property: "#e86828",
    variable: "#1f1f1f",
    function: "#f57c00",
    operator: "#ff6141",
    comment: "#666666",
    tag: "#ff6141",
    attribute: "#e86828",
    attributeValue: "#f57c00",
    bracket: "#444444",
    punctuation: "#444444",
    escape: "#ff7043",
    regexp: "#f57c00",
    link: "#f57c00",
    error: "#e65100",
    lintError: "#e65100",
    lintWarning: "#f57c00",
    lintInfo: "#0052cc",
  };
};

export const subscribeToThemeChanges = (callback: () => void) => {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
};
