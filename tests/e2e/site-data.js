// Reads the site configuration and content so tests cover every language automatically.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const config = JSON.parse(readFileSync(join(root, "site.config.json"), "utf8"));
export const languages = config.languages;
export const content = Object.fromEntries(
  languages.map((code) => [code, JSON.parse(readFileSync(join(root, "content", `${code}.json`), "utf8"))])
);

export function pathFor(lang, pageId, caseIndex) {
  const data = content[lang];
  let slug = "";
  if (pageId === "case") slug = `${data.slugs.use_cases}/${data.cases[caseIndex].slug}`;
  else if (pageId !== "home") slug = data.slugs[pageId];
  const parts = [lang === config.default_language ? "" : lang, slug].filter(Boolean);
  return parts.length ? `/${parts.join("/")}/` : "/";
}

// A representative page of every template, per language.
export const samplePages = ["home", "services", "service_automation", "products", "use_cases", "company", "contact", "payment", "blog", "developers", "privacy"];
