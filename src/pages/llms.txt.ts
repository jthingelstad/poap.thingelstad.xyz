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
      '- [About](https://poap.thingelstad.xyz/about/): the protocol, the data, the wallets, what is lost',
    ].join('\n') + '\n',
    { headers: { 'content-type': 'text/plain; charset=utf-8' } },
  );
