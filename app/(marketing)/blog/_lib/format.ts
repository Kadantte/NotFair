import { BLOG_DEFAULT_PAGE } from "./constants";

const DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

export const formatDate = (date: string) => {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return DATE_FORMATTER.format(parsed);
};

export const getPageParam = (value: string | string[] | undefined) => {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsedValue = Number.parseInt(rawValue || "", 10);

  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : BLOG_DEFAULT_PAGE;
};
