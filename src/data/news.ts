// News articles built into the site code. They are listed together with any posts
// written in Admin > News (newest first) on the News page and the Home page.
import type { NewsPost } from '../lib/content';

const built = (p: Pick<NewsPost, 'slug' | 'title' | 'date' | 'summary' | 'image' | 'imageAlt' | 'body'>): NewsPost => ({
  ...p,
  id: `built-${p.slug}`,
  published: true,
  createdAt: `${p.date}T12:00:00.000Z`,
  updatedAt: `${p.date}T12:00:00.000Z`,
  updatedBy: 'site code',
});

export const builtInNews: NewsPost[] = [
  built({
    slug: 'there-will-be-lights',
    title: 'There will be lights!',
    date: '2026-11-14',
    summary: 'Will the sports fields be lighted? The answer is yes.',
    image: '/images/site/lights-on-field.jpg',
    imageAlt: 'Light pole beside a turf sports field, with evergreen trees behind.',
    body:
      '<p>There are many questions about NKU, the YMCA-centered sports, recreation and well-being campus planned in North Kitsap. They are answered under FAQ tab(s) on this website. One question frequently asked is “will the sports fields be lighted?” The answer is yes. Early sundowns in fall, winter, and spring months require lighted fields to get the fullest measure of usage possible. Lighting will be installed in such a way as to not be intrusive upon surrounding public and private properties.</p>',
  }),
];
