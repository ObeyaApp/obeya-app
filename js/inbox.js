// js/inbox.js
// De inbox voor nieuw werk (20 oktober 2026): ingevingen en verzoeken die snel
// worden vastgelegd als issue met het label "inbox" in het data-repo (ook via
// de GitHub-app op een telefoon), en in het overleg een plek krijgen: landen
// op het bord, samenvoegen met wat er al staat, parkeren tot een datum of
// afwijzen. Advies Obeya-coach en teamcoördinator: een wachtkamer die in elk
// overleg wordt leeggemaakt, geen tweede backlog; daarom hooguit zeven items
// en per item hoe lang het al wacht. Dit bestand is puur (in Node te testen);
// het lezen en schrijven van issues zit in js/git-backend.js, de stappen in
// js/state.js.

const ObeyaInbox = (function () {
  'use strict';

  const LABEL = 'inbox';
  const LIMIT = 7;
  const PARK_RE = /^Geparkeerd tot: (\d{4}-\d{2}-\d{2})(?:.*)$/m;

  function days(fromIso, today) {
    const a = Date.parse(String(fromIso).slice(0, 10));
    const b = Date.parse(String(today).slice(0, 10));
    return Number.isNaN(a) || Number.isNaN(b) ? 0 : Math.max(0, Math.round((b - a) / 86400000));
  }

  // Wat er na "Waarom of voor wie:" staat, of anders de hele tekst zonder de
  // regels die de app zelf toevoegt.
  function whyFrom(body) {
    const tekst = String(body || '');
    const m = /Waarom of voor wie:\s*(.+)/i.exec(tekst);
    if (m) return m[1].trim();
    return tekst.split('\n').filter((r) => !PARK_RE.test(r) && !/^_?Vastgelegd via het Obeya-bord/.test(r)).join(' ').trim();
  }

  function fromIssues(issues, today) {
    const vandaag = today || new Date().toISOString().slice(0, 10);
    return (issues || [])
      .filter((i) => i && !i.pull_request)
      .map((i) => {
        const park = PARK_RE.exec(i.body || '');
        const parkedUntil = park ? park[1] : null;
        return {
          number: i.number,
          title: String(i.title || '').trim(),
          why: whyFrom(i.body),
          body: i.body || '',
          author: i.user && i.user.login ? i.user.login : '',
          createdAt: String(i.created_at || '').slice(0, 10),
          ageDays: days(i.created_at, vandaag),
          url: i.html_url || '',
          parkedUntil,
          visible: !parkedUntil || parkedUntil <= vandaag,
        };
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  function summary(items) {
    const zichtbaar = (items || []).filter((i) => i.visible);
    return {
      count: zichtbaar.length,
      parked: (items || []).length - zichtbaar.length,
      oldestDays: zichtbaar.reduce((m, i) => Math.max(m, i.ageDays), 0),
      overLimit: zichtbaar.length > LIMIT,
    };
  }

  function newIssue(fields) {
    const f = fields || {};
    const title = String(f.what || '').trim().slice(0, 200);
    if (!title) return null;
    const why = String(f.why || '').trim();
    const body = [
      why ? `Waarom of voor wie: ${why}` : '',
      `_Vastgelegd via het Obeya-bord${f.login ? ` door @${f.login}` : ''}._`,
    ].filter(Boolean).join('\n\n');
    return { title, body, labels: [LABEL] };
  }

  // Parkeren: de datum als vaste regel bovenaan de tekst, zodat de app (en
  // wie het issue op GitHub opent) ziet wanneer het terugkomt.
  function parkBody(body, date, reason) {
    const zonder = String(body || '').split('\n').filter((r) => !PARK_RE.test(r)).join('\n').replace(/^\n+/, '');
    return `Geparkeerd tot: ${date}${reason ? ` — ${String(reason).trim()}` : ''}\n\n${zonder}`.trim();
  }

  const SOORT = { objective: 'doel', measurableResult: 'deelproduct', project: 'project', action: 'actie' };

  function decisionComment(d) {
    if (d.kind === 'land') return `Geland op het bord als ${SOORT[d.type] || d.type} "${d.name}" onder "${d.where}", eigenaar ${d.owner}.`;
    if (d.kind === 'merge') return `Samengevoegd met "${d.name}" op het bord (als notitie).`;
    if (d.kind === 'park') return `Geparkeerd tot ${d.date}${d.reason ? `: ${d.reason}` : ''}. Komt dan terug in de inbox.`;
    if (d.kind === 'reject') return `Afgewezen: ${d.reason}`;
    return '';
  }

  return { LABEL, LIMIT, fromIssues, summary, newIssue, parkBody, decisionComment, SOORT };
})();
