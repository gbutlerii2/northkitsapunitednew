// Starter news articles. The first time news is read they are copied into
// Admin > News (see seedBuiltInNews in src/lib/content.ts); from then on they are
// edited there, and changes here no longer show for an article already copied.
import type { NewsPost } from '../lib/content';

type BuiltFields = 'slug' | 'title' | 'date' | 'summary' | 'body';
type BuiltOptional = 'image' | 'imageAlt' | 'imagePending' | 'dateWithWeekday';
const built = (id: string, p: Pick<NewsPost, BuiltFields> & Partial<Pick<NewsPost, BuiltOptional>>): NewsPost => ({
  ...p,
  id,
  published: true,
  createdAt: `${p.date}T12:00:00.000Z`,
  updatedAt: `${p.date}T12:00:00.000Z`,
  updatedBy: 'site code',
});

export const builtInNews: NewsPost[] = [
  built('gala-2026-10-14', {
    slug: 'kingston-north-kitsap-rotary-club-stages-historic-gala',
    title: 'Kingston North Kitsap Rotary Club Stages Historic Gala',
    date: '2026-10-14',
    dateWithWeekday: true,
    summary: 'A history-making fundraising gala at Port Gamble on Sunday, Oct 11.',
    image: '/images/site/gala-check-presentation.webp',
    imageAlt: 'Presentation of the Port Gamble S’Klallam Tribe’s $1,000,000 pledge to NKU at the October 11, 2026 gala.',
    body:
      '<p>Kingston North Kitsap Rotarians and the YMCA of Pierce and Kitsap Counties staged a magical, history-making fundraising gala at Port Gamble on Sunday, Oct 11. The event was in support of North Kitsap United (NKU) — the YMCA-centered sports, recreation, and wellness project in North Kitsap. Highlighting the evening was the presentation of a $1-million dollar pledge by the Port Gamble S\'Klallam Tribe in support of the much-needed playfields and YMCA.</p>',
  }),
  built('lights-2026-11-14', {
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
