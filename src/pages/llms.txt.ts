import type { APIRoute } from 'astro';
import { counts, meta } from '../lib/data';

export const GET: APIRoute = () =>
  new Response(
    [
      '# Proof of a Person',
      '',
      "> POAP: Proof of a Person. Jamie Thingelstad's POAP time capsule, 2021 to 2026.",
      '',
      `Proof of Attendance Protocol wound down in 2026. This site keeps one person's record: ${counts.tokens} tokens collected, ${counts.drops} drops issued, ${counts.mints} tokens minted from them by ${counts.people} people.`,
      '',
      `Data: https://github.com/jthingelstad/poap-archive (captured ${meta.captured}).`,
      'Site: https://github.com/jthingelstad/poap.thingelstad.xyz',
      '',
      '## Pages',
      '',
      '- [Timeline](https://poap.thingelstad.xyz/timeline/): each year as tokens collected, drops issued, and writing, side by side',
      '- [Collected](https://poap.thingelstad.xyz/collected/): every token, by year; places, rarity, wallets',
      '- [Issued](https://poap.thingelstad.xyz/issued/): every drop, by series',
      '- [Network](https://poap.thingelstad.xyz/network/): drops and the people who collected them',
      '- [Writing](https://poap.thingelstad.xyz/writing/): every post about POAP; [What Jamie told POAP](https://poap.thingelstad.xyz/writing/advice/)',
      '- [POAP](https://poap.thingelstad.xyz/poap/): the company, 2019 to 2026, with sources',
      '- [About](https://poap.thingelstad.xyz/about/): the protocol, the data, the wallets',
      '',
      'Each drop is at /drops/<id>/, each token at /tokens/<id>/, each collector at /people/<address>/, each series at /series/<slug>/.',
    ].join('\n') + '\n',
    { headers: { 'content-type': 'text/plain; charset=utf-8' } },
  );
