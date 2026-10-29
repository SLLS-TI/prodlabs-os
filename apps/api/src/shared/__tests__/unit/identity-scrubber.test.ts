import { describe, it, expect } from 'bun:test';
import {
  buildIdentityScrubber,
  maskOrphanActor,
  type GuardIdentity,
  type MaskableActor,
} from '@repo/db';

// Unit test: buildIdentityScrubber, the pure rewrite of agency identities to the face
// that runs on everything a client receives.

const face: GuardIdentity = {
  userId: 'face-user-id-0001',
  name: 'Silvio Sampaio',
  username: 'silvio',
  email: 'silvio@agency.com',
  image: '/avatars/face-avatar/raw',
};
const rafael: GuardIdentity = {
  userId: 'rafael-user-id-0002',
  name: 'Rafael Maffazioli',
  username: 'rafaelmaffazioli',
  email: 'rafael@agency.com',
  image: '/avatars/rafael-avatar/raw',
};
const dionatha: GuardIdentity = {
  userId: 'dionatha-user-id-03',
  name: 'Dionatha Goulart',
  username: 'dionatha',
  email: 'dio@agency.com',
  image: null,
};
const victor: GuardIdentity = {
  userId: 'victor-user-id-0004',
  name: 'Victor Rafael Lima',
  username: 'victor',
  email: 'victor@client.com',
  image: '/avatars/victor-avatar/raw',
};

const scrub = buildIdentityScrubber([{ face, hidden: [rafael, dionatha], keep: [victor] }]);

describe('buildIdentityScrubber', () => {
  it('rewrites a full name to the face full name and a name word to the face first name', () => {
    expect(scrub('Rafael Maffazioli will review')).toBe('Silvio Sampaio will review');
    expect(buildIdentityScrubber([{ face, hidden: [rafael], keep: [] }])('Rafael said')).toBe(
      'Silvio said',
    );
    expect(scrub('Ask Dionatha and Goulart')).toBe('Ask Silvio and Silvio');
  });

  it('rewrites the 4-letter nickname as a whole word only', () => {
    expect(scrub('Rafa fixed it')).toBe('Silvio fixed it');
    expect(scrub('Rafaela and rafting')).toBe('Rafaela and rafting');
  });

  it('rewrites @handles and bare handles to the face username', () => {
    expect(scrub('cc @rafaelmaffazioli')).toBe('cc @silvio');
    expect(scrub('https://github.com/rafaelmaffazioli/app')).toBe('https://github.com/silvio/app');
  });

  it('rewrites emails, user ids and avatar URLs', () => {
    expect(scrub('mail rafael@agency.com now')).toBe('mail silvio@agency.com now');
    expect(scrub({ assigneeUserId: rafael.userId, image: rafael.image })).toEqual({
      assigneeUserId: face.userId,
      image: face.image,
    });
    expect(scrub({ [rafael.userId!]: 1 })).toEqual({ [face.userId!]: 1 });
  });

  it('walks nested arrays and objects and leaves non-strings alone', () => {
    const date = new Date(0);
    expect(scrub({ items: [{ body: 'Thanks Dionatha', n: 3, at: date, ok: true }] })).toEqual({
      items: [{ body: 'Thanks Silvio', n: 3, at: date, ok: true }],
    });
  });

  it('is case- and accent-insensitive', () => {
    expect(scrub('MAFFAZIOLI and maffazióli and Dionathã')).toBe('Silvio and Silvio and Silvio');
  });

  it("never rewrites a client's or the face's own words", () => {
    // "Rafael" is also a word of the client's name, so it stays; the full agency name
    // and the agency-only surname still go.
    expect(scrub('Victor Rafael Lima here')).toBe('Victor Rafael Lima here');
    expect(scrub('Silvio Sampaio and @silvio')).toBe('Silvio Sampaio and @silvio');
    expect(scrub({ userId: victor.userId, image: victor.image })).toEqual({
      userId: victor.userId,
      image: victor.image,
    });
    expect(scrub('Rafael Maffazioli')).toBe('Silvio Sampaio');
  });

  it('rewrites a common word only as part of a full name', () => {
    const owner = buildIdentityScrubber([
      { face, hidden: [{ ...dionatha, name: 'Owner Person' }], keep: [] },
    ]);
    expect(owner({ role: 'owner', text: 'Owner said hi' })).toEqual({
      role: 'owner',
      text: 'Owner said hi',
    });
    expect(owner('Owner Person said hi')).toBe('Silvio Sampaio said hi');
  });

  it('leaves data URLs untouched', () => {
    const data = 'data:image/png;base64,Rafa/Rafael';
    expect(scrub(data)).toBe(data);
  });
});

describe('scrubbing file names and search text', () => {
  it('reads a filename value and a search query as prose', () => {
    expect(scrub({ filename: 'dionatha-notes.pdf' })).toEqual({ filename: 'Silvio-notes.pdf' });
    expect(scrub({ role: 'goulart-notes' })).toEqual({ role: 'silvio-notes' });
    expect(scrub({ filename: 'goulart-notes' })).toEqual({ filename: 'Silvio-notes' });
    expect(scrub.prose('dionatha')).toBe('Silvio');
    expect(scrub.prose('rafa')).toBe('Silvio');
  });
});

describe('a username that is also a name word', () => {
  it('is rewritten as a handle inside an identifier and as a name in prose', () => {
    expect(scrub({ username: 'dionatha' })).toEqual({ username: 'silvio' });
    expect(scrub('Ask Dionatha')).toBe('Ask Silvio');
  });
});

describe('token shapes', () => {
  const only = buildIdentityScrubber([{ face, hidden: [rafael, dionatha], keep: [] }]);

  it('treats underscores, digits, plus signs and percent escapes as separators', () => {
    expect(only('rafael_maffazioli')).toBe('silvio');
    expect(only('by Rafael_M')).toBe('by Silvio_M');
    expect(only('Rafael2 said')).toBe('Silvio2 said');
    expect(only('Rafael%20Maffazioli')).toBe('Silvio%20Sampaio');
    expect(only('Rafael+Maffazioli')).toBe('Silvio+Sampaio');
    expect(only('/u/%2Frafaelmaffazioli')).toBe('/u/%2Fsilvio');
    expect(only('rafael%40agency.com')).toBe('silvio@agency.com');
  });

  it('rewrites a name word that is the whole value or part of an identifier', () => {
    expect(only({ v: 'rafa', w: 'maffazioli', x: 'rafael-tasks' })).toEqual({
      v: 'silvio',
      w: 'silvio',
      x: 'silvio-tasks',
    });
    expect(only({ v: 'dionatha.goulart' })).toEqual({ v: 'silvio' });
  });

  it('rewrites a capitalised 3-letter prefix and diminutives of a first name', () => {
    expect(only('Dio fixed it and Rafinha too')).toBe('Silvio fixed it and Silvio too');
    expect(only('the dio dial')).toBe('the dio dial');
  });

  it('leaves ids, uuids and hashes alone', () => {
    const hidden = buildIdentityScrubber([
      { face, hidden: [{ ...rafael, name: 'Ada Fade', username: 'adafade' }], keep: [] },
    ]);
    const values = ['3fade1b2-aaaa-4bbb-8ccc-1234567890ab', 'x9AdaKx3Fade7aZq', 'run 9fade0'];
    for (const value of values) expect(hidden(value)).toBe(value);
  });
});

describe('words that are not names', () => {
  const carolina: GuardIdentity = {
    userId: 'carolina-user-id-05',
    name: 'Carolina Campos',
    username: 'design',
    email: 'carol@agency.com',
    image: null,
  };
  const agent: GuardIdentity = {
    userId: 'agent-user-id-00006',
    name: 'Code Reviewer',
    username: 'reviewer',
    email: 'agent@bots.local',
    image: null,
    isAgent: true,
  };
  const words = buildIdentityScrubber([{ face, hidden: [carolina, agent], keep: [] }]);

  it('keeps common words, nicknames that are words and agent name words in prose', () => {
    const text = 'O preço é caro. Fix the code, mark it done. Preencher os campos';
    expect(words(text)).toBe(text);
    expect(words('the code reviewer said')).toBe('the code reviewer said');
    expect(words('Code Reviewer said')).toBe('Silvio Sampaio said');
    expect(words('Carolina Campos said')).toBe('Silvio Sampaio said');
  });

  it('rewrites a common-word username only where it is a handle', () => {
    expect(
      words({ status: 'design', label: 'Design', slug: 'design-system', username: 'design' }),
    ).toEqual({ status: 'design', label: 'Design', slug: 'design-system', username: 'silvio' });
    expect(words('cc @design, see https://github.com/design')).toBe(
      'cc @silvio, see https://github.com/silvio',
    );
    expect(words('mail contato@design.com.br')).toBe('mail contato@design.com.br');
  });

  it("never rewrites the project's and team's names", () => {
    const named = buildIdentityScrubber([
      {
        face,
        hidden: [{ ...rafael, username: 'prodlabs' }],
        keep: [],
        vocabulary: ['prodlabs', 'Rafael Studio'],
      },
    ]);
    expect(named({ teamSlug: 'prodlabs', team: 'Rafael Studio', by: 'Rafael' })).toEqual({
      teamSlug: 'prodlabs',
      team: 'Rafael Studio',
      by: 'Silvio',
    });
  });
});

describe('several client projects', () => {
  it('rewrites a person hidden in one project even where another project keeps them', () => {
    const scrubTwo = buildIdentityScrubber([
      { face, hidden: [rafael], keep: [victor] },
      { face: rafael, hidden: [], keep: [victor] },
    ]);
    expect(scrubTwo(`Rafael Maffazioli @rafaelmaffazioli ${rafael.userId}`)).toBe(
      `Silvio Sampaio @silvio ${face.userId}`,
    );
    expect(scrubTwo({ image: rafael.image })).toEqual({ image: face.image });
  });
});

describe('collapsing people to the face', () => {
  it('keeps one entry per user id in keyed maps and people lists', () => {
    expect(scrub({ [rafael.userId!]: 1, [face.userId!]: 2 })).toEqual({ [face.userId!]: 2 });
    expect(scrub({ [rafael.userId!]: 1, [dionatha.userId!]: 2 })).toEqual({
      [face.userId!]: 1,
    });
    expect(
      scrub([
        { userId: rafael.userId, name: 'Rafael Maffazioli' },
        { userId: face.userId, name: 'Silvio Sampaio' },
        { userId: dionatha.userId, name: 'Dionatha Goulart' },
        { userId: victor.userId, name: 'Victor Rafael Lima' },
      ]),
    ).toEqual([
      { userId: face.userId, name: 'Silvio Sampaio' },
      { userId: victor.userId, name: 'Victor Rafael Lima' },
    ]);
  });

  it('returns the same object when nothing changes', () => {
    const value = { items: [{ title: 'Plain text', n: 1 }] };
    expect(scrub(value)).toBe(value);
  });
});

describe('maskOrphanActor', () => {
  const orphan = (actorName: string): MaskableActor => ({ actorUserId: null, actorName });
  const faceIdentity = {
    userId: 'face-user-id-0001',
    name: 'Silvio Sampaio',
    image: null,
    username: 'silvio',
  };

  it('shows a name with no user behind it as the face', () => {
    expect(maskOrphanActor(orphan('Rafael Maffazioli'), faceIdentity)).toEqual({
      actorUserId: 'face-user-id-0001',
      actorName: 'Silvio Sampaio',
    });
    expect(maskOrphanActor(orphan('Rafael'), null)).toEqual({
      actorUserId: null,
      actorName: null,
    });
  });

  it('keeps a system writer, a system write with no name, and a real actor', () => {
    const rows = [
      { actorUserId: null, actorName: 'GitHub' },
      { actorUserId: null, actorName: 'Auto-archive' },
      { actorUserId: null, actorName: null },
      { actorUserId: 'victor-user-id-0004', actorName: 'Victor Rafael Lima' },
    ];
    for (const row of rows) expect(maskOrphanActor(row, faceIdentity)).toBe(row);
  });
});
