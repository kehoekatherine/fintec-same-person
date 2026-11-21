export const THEME_STORAGE_KEY = "screening-desk-theme";

export type ThemeChoice = "light" | "dark" | "system";

export function isThemeChoice(value: string | null): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

export const themeBootScript = `(function(){try{var key=${JSON.stringify(THEME_STORAGE_KEY)};var stored=localStorage.getItem(key);var choice=stored==="light"||stored==="dark"||stored==="system"?stored:"system";var systemDark=window.matchMedia("(prefers-color-scheme: dark)").matches;var dark=choice==="dark"||(choice==="system"&&systemDark);var root=document.documentElement;root.classList.toggle("dark",dark);root.style.colorScheme=dark?"dark":"light";root.dataset.theme=choice;}catch(e){}})();`;

export function applyTheme(choice: ThemeChoice) {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = choice === "dark" || (choice === "system" && systemDark);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  root.dataset.theme = choice;
}
