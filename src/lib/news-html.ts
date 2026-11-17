// Shared markup for a full news article (photo, date, headline, whole text),
// used on the Home page and the News page.
import type { NewsPost } from './content';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

export const formatNewsDate = (d: string, weekday = false) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {
    ...(weekday ? { weekday: 'long' as const } : {}),
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

export function newsArticleHtml(post: NewsPost, headingTag: 'h2' | 'h3' = 'h3'): string {
  const img = post.image
    ? `<img class="img-full news-article-img" src="${esc(post.image)}" alt="${esc(post.imageAlt || '')}" loading="lazy">`
    : '';
  return `<article class="news-article" id="${esc(post.slug)}">
  ${img}
  <div class="news-article-body">
    <p class="news-date">${esc(formatNewsDate(post.date, post.dateWithWeekday))}</p>
    <${headingTag} class="h3">${esc(post.title)}</${headingTag}>
    <div class="prose">${post.body}</div>
  </div>
</article>`;
}
