// Text-to-speech via the Web Speech API (works offline in Edge/Chrome).

export const speech = {
  get available() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  },

  speak(text, isLetter = false) {
    if (!this.available || !text) return;
    try {
      window.speechSynthesis.cancel(); // don't pile up utterances
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = isLetter ? 1.15 : 0.95;
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  },
};
