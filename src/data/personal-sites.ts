/**
 * Metadata for the personal sites.
 *
 * Each site is built and deployed independently from its own repository as a
 * Cloudflare Worker with static assets under an internal `/sites/...` route.
 * The parent owns the public `/member/...` and `/char/...` deep links, boots the
 * desktop there, and loads the site's internal route inside IE.
 */
export interface PersonalSite {
  kind: 'member' | 'char';
  slug: string;
  /** GitHub repository name, also used to recognize legacy GitHub Pages URLs. */
  repo: string;
  handle: string;
  displayName: string;
  title: string;
  description: string;
  /** Public desktop launcher path, e.g. /member/pants. */
  launcherPath: string;
  /** Internal path served by the site's own Worker, e.g. /sites/member/pants/. */
  contentPath: string;
  /** Period-correct address shown in the fake browser. */
  address: string;
  favorite: boolean;
}

const ORIGIN = 'http://www.pants.place';

function site(
  kind: 'member' | 'char',
  slug: string,
  details: Omit<PersonalSite, 'kind' | 'slug' | 'launcherPath' | 'contentPath' | 'address'>,
): PersonalSite {
  return {
    kind,
    slug,
    ...details,
    launcherPath: `/${kind}/${slug}`,
    contentPath: `/sites/${kind}/${slug}/`,
    address: `${ORIGIN}/${kind}/${slug}/`,
  };
}

export const personalSites: PersonalSite[] = [
  site('member', 'kylie', {
    repo: 'site-member-kylie',
    handle: 'kylie',
    displayName: 'Kylie',
    title: "Kylie's Cyber Sanctuary",
    description:
      "Kylie's 1999 shrine to Final Fantasy VII, Gundam Wing and the rave scene. Plus Chogi the cat.",
    favorite: true,
  }),
  site('member', 'pants', {
    repo: 'site-member-pants',
    handle: 'pants',
    displayName: 'pants_the_person',
    title: 'pants_the_person // GeoCities',
    description:
      'The homepage of pants_the_person: a 486, DOS games, MIDI files and too many animated GIFs.',
    favorite: true,
  }),
  site('member', 'pip', {
    repo: 'site-member-pip',
    handle: 'pip',
    displayName: 'pip',
    title: "pip's kewl page!!!",
    description:
      "pip's first homepage: Pokemon cards, anime, a Pentium II and a guestbook that needs signatures.",
    favorite: false,
  }),
  site('member', 'shades', {
    repo: 'site-member-shades',
    handle: 'ultimateshades',
    displayName: 'UltimateShades',
    title: 'UltimateShades Arcade',
    description:
      "UltimateShades' 1999 gaming shrine: LucasArts adventure games, reviews, hints and high scores.",
    favorite: true,
  }),
  site('char', 'chogi', {
    repo: 'site-char-chogi',
    handle: 'chogi',
    displayName: 'CHOGI BAJI',
    title: 'CHOGI BAJI — THE TACKLE-BOX DON',
    description:
      "The homepage of Chogi Baji, the Tackle-Box Don of Ul'dah: fishing reports, syndicate dispatches, and a small man's very large grudges.",
    favorite: false,
  }),
  site('char', 'jiroji', {
    repo: 'site-char-jiroji',
    handle: 'jiroji',
    displayName: 'JIROJI.EXE',
    title: 'JIROJI.EXE',
    description:
      'JIROJI.EXE: a virtual mascot living in a 1998 computer. Patch notes, save files and modem songs.',
    favorite: false,
  }),
];
