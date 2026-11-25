// js/wall.js
// Verschuiven en verbinden op de muur (lens Keten in Samenhang). Zie
// docs/canvas-voorstel.md, stap 3.
//
// - Verschuiven met SortableJS (vendor/Sortable.min.js): doelen binnen en
//   tussen thema's, meetbare resultaten binnen hun doel, projecten en losse
//   acties tussen resultaatgroepen (ook naar een ander doel), acties tussen
//   projecten. Een project zonder acties naar de kolom Actie slepen maakt er
//   een actie van; een actie naar de kolom Project een losse actie (idee 65).
//   Meetbare resultaten ook naar een ander doel; een doel naar de kolom
//   Meetbaar resultaat maakt er een resultaat van (zijn eigen resultaten
//   verhuizen mee), en een resultaat naar de kolom Doel een doel (idee 71). Het briefje klikt vast op een plek in de structuur; vrij
//   neerleggen bestaat bewust niet.
// - Verbinden door te slepen vanaf het ⊕-knopje van een project of actie naar
//   een meetbaar resultaat. Binnen het eigen doel wordt dat de gewone
//   koppeling, daarbuiten een "draagt bij aan"-relatie.
// - Met het toetsenbord: Alt+↑ en Alt+↓ verschuiven het briefje met de focus
//   binnen zijn lijst. Koppelen en verplaatsen naar een andere plek blijven
//   ook kunnen via het detailscherm.
//
// Elke verplaatsing is één mutatie via de datalaag (ObeyaData.move*), dus één
// keer ongedaan maken draait haar terug. Na de mutatie tekent de app alles
// opnieuw; bij afbreken (of een geweigerde bevestiging) ook, zodat de muur
// nooit een stand laat zien die niet in de data staat.

const ObeyaWall = (function () {
  'use strict';

  let instances = [];

  function destroy() {
    instances.forEach((i) => { try { i.destroy(); } catch (err) { /* al weg */ } });
    instances = [];
  }

  // Het id van het eerstvolgende zusje dat aan selector voldoet: daar komt
  // het verplaatste briefje vóór te staan.
  function nextId(el, selector) {
    let n = el.nextElementSibling;
    while (n && !n.matches(selector)) n = n.nextElementSibling;
    return n ? (n.dataset.id || n.dataset.node || null) : null;
  }

  const unchanged = (evt) => evt.from === evt.to && evt.oldIndex === evt.newIndex;

  // De eigenlijke verplaatsingen, gedeeld door slepen en toetsenbord.
  function moveRow(api, row, list, beforeId, fromList) {
    const id = row.dataset.id;
    const toObj = list.dataset.objectiveId;
    const fromObj = (fromList || list).dataset.objectiveId;
    const toMr = list.dataset.mrId;
    const fromMr = (fromList || list).dataset.mrId;
    if (row.dataset.kind === 'project') {
      if (toObj !== fromObj && !api.confirm('Dit project naar een ander doel verplaatsen?\n\nHet hangt daarna aan het meetbare resultaat waar je het neerzet; koppelingen met resultaten van het oude doel vervallen. Ongedaan maken kan.')) {
        api.rerender();
        return;
      }
      api.mutate((ds) => ObeyaData.moveProject(ds, id, {
        objectiveId: toObj !== fromObj ? toObj : undefined,
        fromMrId: fromMr && fromMr !== 'elders' ? fromMr : null,
        toMrId: toMr && toMr !== 'elders' ? toMr : null,
        beforeId,
      }), 'project verschoven');
    } else {
      const opts = { projectId: null, objectiveId: toObj, beforeId };
      if (fromList) opts.toMrId = toMr && toMr !== 'elders' ? toMr : null;
      api.mutate((ds) => ObeyaData.moveAction(ds, id, opts), 'actie verschoven');
    }
  }

  function attachSortable(rootEl, stage, api) {
    if (typeof Sortable === 'undefined') return;
    const viewport = rootEl.querySelector('.canvas-viewport');
    const klaar = () => stage.classList.remove('is-dnd-active');
    const base = {
      animation: 150,
      // Altijd de eigen sleepweergave in plaats van de HTML5-variant van de
      // browser: werkt gelijk met muis en aanraking, en met het gezoomde
      // canvas.
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 4,
      filter: 'button, a, input, select, textarea',
      preventOnFilter: false,
      ghostClass: 'is-drag-ghost',
      chosenClass: 'is-drag-chosen',
      dragClass: 'is-dragging',
      scroll: viewport || true,
      scrollSensitivity: 70,
      scrollSpeed: 14,
      bubbleScroll: true,
      onStart: () => stage.classList.add('is-dnd-active'),
    };

    // Doelen. Een meetbaar resultaat mag hier ook heen: dan wordt het een
    // doel in dat thema (idee 71).
    stage.querySelectorAll('[data-sort="objectives"]').forEach((list) => {
      instances.push(Sortable.create(list, {
        ...base,
        group: { name: 'objectives', pull: true, put: (to, from) => ['objectives', 'mrs'].includes(from.options.group.name) },
        draggable: '.kt-doel',
        handle: '.kt-cell--doel',
        onStart: () => { base.onStart(); stage.classList.add('is-dragging-objective'); },
        onEnd: (evt) => {
          klaar();
          stage.classList.remove('is-dragging-objective');
          if (unchanged(evt)) return;
          if (evt.to.dataset.sort === 'mrs') {
            api.convert('objective', evt.item.dataset.id, { objectiveId: evt.to.dataset.objectiveId, beforeId: nextId(evt.item, '.kt-mrgroup[data-id]') });
            return;
          }
          api.mutate((ds) => ObeyaData.moveObjective(ds, evt.item.dataset.id, {
            themeId: evt.to.dataset.themeId, beforeId: nextId(evt.item, '.kt-doel'),
          }), 'doel verschoven');
        },
      }));
    });

    // Meetbare resultaten: binnen het eigen doel verschuiven, naar een ander
    // doel verplaatsen (het werk dat alleen eraan hangt gaat mee), of naar de
    // kolom Doel om er een doel van te maken (idee 71). Een doel mag hier ook
    // heen: dan wordt het een resultaat, en zijn eigen resultaten verhuizen
    // mee naar hetzelfde doel.
    const magResultaatWorden = (el) => el.matches('.kt-mrgroup') || el.matches('.kt-doel');
    stage.querySelectorAll('[data-sort="mrs"]').forEach((list) => {
      instances.push(Sortable.create(list, {
        ...base,
        group: { name: 'mrs', pull: true, put: (to, from, dragEl) => ['mrs', 'objectives'].includes(from.options.group.name) && magResultaatWorden(dragEl) },
        draggable: '.kt-mrgroup[data-id]',
        handle: '.kt-cell--mr',
        onStart: () => { base.onStart(); stage.classList.add('is-dragging-result'); },
        onEnd: (evt) => {
          klaar();
          stage.classList.remove('is-dragging-result');
          if (unchanged(evt)) return;
          const id = evt.item.dataset.id;
          if (evt.to.dataset.sort === 'objectives') {
            api.convert('measurableResult', id, { themeId: evt.to.dataset.themeId, beforeId: nextId(evt.item, '.kt-doel') });
            return;
          }
          const beforeId = nextId(evt.item, '.kt-mrgroup[data-id]');
          if (evt.to.dataset.objectiveId !== evt.from.dataset.objectiveId) {
            api.moveResult(id, evt.to.dataset.objectiveId, beforeId);
            return;
          }
          api.mutate((ds) => ObeyaData.moveMeasurableResult(ds, id, { beforeId }), 'meetbaar resultaat verschoven');
        },
      }));
    });

    // Projecten en losse acties (kolom Project). Een actie uit de kolom
    // Actie mag hier ook heen: dan wordt het een losse actie (idee 65).
    stage.querySelectorAll('[data-sort="work"]').forEach((list) => {
      instances.push(Sortable.create(list, {
        ...base,
        group: { name: 'work', pull: true, put: (to, from) => to.el.dataset.mrId !== 'elders' && ['work', 'actions'].includes(from.options.group.name) },
        draggable: '.kt-row[data-id]',
        handle: '.kt-cell--project',
        onStart: (evt) => { base.onStart(); stage.classList.toggle('is-dragging-project', evt.item.dataset.kind === 'project' && !evt.item.querySelector('[data-sort="actions"] > .cv-card')); },
        onEnd: (evt) => {
          klaar();
          stage.classList.remove('is-dragging-project');
          if (unchanged(evt)) return;
          if (evt.to.dataset.sort === 'actions') {
            // Naar de actiekolom van een project: een losse actie gaat
            // daaronder hangen, een project wordt daar een actie.
            const beforeId = nextId(evt.item, '.cv-card');
            if (evt.item.dataset.kind === 'project') api.convert('project', evt.item.dataset.id, { projectId: evt.to.dataset.projectId, beforeId });
            else api.mutate((ds) => ObeyaData.moveAction(ds, evt.item.dataset.id, { projectId: evt.to.dataset.projectId, beforeId }), 'actie verschoven');
            return;
          }
          moveRow(api, evt.item, evt.to, nextId(evt.item, '.kt-row[data-id]'), evt.from);
        },
      }));
    });

    // Acties onder een project (kolom Actie). Een project zonder acties, of
    // een losse actie, mag hier ook heen (idee 65).
    const magOnderProject = (el) => el.matches('.cv-card') || (el.dataset.kind === 'action')
      || (el.dataset.kind === 'project' && !el.querySelector('[data-sort="actions"] > .cv-card'));
    stage.querySelectorAll('[data-sort="actions"]').forEach((list) => {
      instances.push(Sortable.create(list, {
        ...base,
        group: { name: 'actions', pull: true, put: (to, from, dragEl) => ['actions', 'work'].includes(from.options.group.name) && magOnderProject(dragEl) },
        draggable: '.cv-card',
        onEnd: (evt) => {
          klaar();
          if (unchanged(evt)) return;
          if (evt.to.dataset.sort === 'work') {
            // Uit een project naar de kolom Project: een losse actie, bij het
            // resultaat waar hij neerkomt.
            const mr = evt.to.dataset.mrId;
            api.mutate((ds) => ObeyaData.moveAction(ds, evt.item.dataset.node, {
              projectId: null, objectiveId: evt.to.dataset.objectiveId,
              toMrId: mr && mr !== 'elders' ? mr : null,
              beforeId: nextId(evt.item, '.kt-row[data-id]'),
            }), 'actie losgemaakt van het project');
            return;
          }
          api.mutate((ds) => ObeyaData.moveAction(ds, evt.item.dataset.node, {
            projectId: evt.to.dataset.projectId, beforeId: nextId(evt.item, '.cv-card'),
          }), 'actie verschoven');
        },
      }));
    });
  }

  // Verbinden: een stippellijn volgt de wijzer vanaf het ⊕-knopje; een
  // meetbaar resultaat eronder licht op; loslaten koppelt. Escape breekt af.
  function attachConnect(stage, api) {
    stage.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('.cv-connect');
      if (!btn || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const fromId = btn.dataset.connectFrom;
      const svg = stage.querySelector('.canvas-links');
      const zoom = parseFloat(stage.dataset.zoom) || 1;
      const lokaal = (cx, cy) => {
        const r = stage.getBoundingClientRect();
        return { x: (cx - r.left) / zoom, y: (cy - r.top) / zoom };
      };
      const b = btn.getBoundingClientRect();
      const start = lokaal(b.left + b.width / 2, b.top + b.height / 2);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', 'cv-link cv-link--draft');
      svg.appendChild(path);
      stage.classList.add('is-connecting');
      let doel = null;

      const markeer = (el) => {
        if (doel === el) return;
        if (doel) doel.classList.remove('is-drop-target');
        doel = el;
        if (doel) doel.classList.add('is-drop-target');
      };
      const beweeg = (ev) => {
        const p = lokaal(ev.clientX, ev.clientY);
        path.setAttribute('d', `M${start.x},${start.y} L${p.x},${p.y}`);
        const onder = document.elementFromPoint(ev.clientX, ev.clientY);
        markeer(onder ? onder.closest('.cv-mrcard') : null);
      };
      const stop = (ok) => {
        document.removeEventListener('pointermove', beweeg);
        document.removeEventListener('pointerup', los);
        document.removeEventListener('keydown', toets, true);
        path.remove();
        stage.classList.remove('is-connecting');
        const mr = ok && doel ? doel.dataset.node : null;
        markeer(null);
        if (mr) api.connect(fromId, mr);
      };
      const los = () => stop(true);
      const toets = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); stop(false); } };
      document.addEventListener('pointermove', beweeg);
      document.addEventListener('pointerup', los);
      document.addEventListener('keydown', toets, true);
    });
  }

  // --- het Bord (idee 60) ----------------------------------------------------
  // Doelen binnen en tussen thema's, en de volgorde van de thema's. Klikken
  // opent nog steeds het detailscherm: slepen begint pas na een paar pixels.
  function attachBoard(rootEl, api) {
    destroy();
    if (typeof Sortable === 'undefined') return;
    const board = rootEl.querySelector('.board[data-sort="board-themes"]');
    if (!board) return;
    const base = {
      animation: 150,
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 4,
      filter: 'button, a, input, select, textarea',
      preventOnFilter: false,
      ghostClass: 'is-drag-ghost',
      chosenClass: 'is-drag-chosen',
      dragClass: 'is-dragging',
      scroll: true,
      scrollSensitivity: 70,
      scrollSpeed: 14,
      bubbleScroll: true,
    };
    instances.push(Sortable.create(board, {
      ...base,
      group: 'board-themes',
      draggable: '.theme-col[data-theme-id]',
      handle: '.theme-col__head',
      onEnd: (evt) => {
        if (unchanged(evt)) return;
        api.mutate((ds) => ObeyaData.moveTheme(ds, evt.item.dataset.themeId, { beforeId: nextThemeId(evt.item) }), 'thema verschoven');
      },
    }));
    board.querySelectorAll('[data-sort="board-objectives"]').forEach((list) => {
      instances.push(Sortable.create(list, {
        ...base,
        group: 'board-objectives',
        draggable: '.objective-card',
        onEnd: (evt) => {
          if (unchanged(evt)) return;
          api.mutate((ds) => ObeyaData.moveObjective(ds, evt.item.dataset.id, {
            themeId: evt.to.dataset.themeId, beforeId: nextId(evt.item, '.objective-card'),
          }), 'doel verschoven');
        },
      }));
    });
  }

  function nextThemeId(el) {
    let n = el.nextElementSibling;
    while (n && !n.matches('.theme-col[data-theme-id]')) n = n.nextElementSibling;
    return n ? n.dataset.themeId : null;
  }

  // Met het toetsenbord op het Bord: Alt+↑/↓ een doel binnen zijn thema,
  // Alt+←/→ een doel naar het thema ernaast (bovenaan), of op de kop van een
  // thema het thema zelf. Geeft true als er iets verschoof.
  function boardKeyMove(el, key, api) {
    if (!el || !el.closest('.board[data-sort="board-themes"]')) return false;
    const kolommen = Array.from(el.closest('.board').querySelectorAll('.theme-col[data-theme-id]'));
    const card = el.closest('.objective-card');
    if (card) {
      const lijst = card.parentElement;
      if (key === 'ArrowUp' || key === 'ArrowDown') {
        const kaarten = Array.from(lijst.querySelectorAll('.objective-card'));
        const i = kaarten.indexOf(card);
        if ((key === 'ArrowUp' && i <= 0) || (key === 'ArrowDown' && i >= kaarten.length - 1)) return false;
        const voor = key === 'ArrowUp' ? kaarten[i - 1] : kaarten[i + 2];
        api.mutate((ds) => ObeyaData.moveObjective(ds, card.dataset.id, { beforeId: voor ? voor.dataset.id : null }), 'doel verschoven');
        api.focus(`.objective-card[data-id="${card.dataset.id}"]`);
        return true;
      }
      const j = kolommen.indexOf(card.closest('.theme-col')) + (key === 'ArrowLeft' ? -1 : 1);
      if (j < 0 || j >= kolommen.length) return false;
      const doelKolom = kolommen[j];
      const eerste = doelKolom.querySelector('.objective-card');
      api.mutate((ds) => ObeyaData.moveObjective(ds, card.dataset.id, { themeId: doelKolom.dataset.themeId, beforeId: eerste ? eerste.dataset.id : null }), 'doel verschoven');
      api.focus(`.objective-card[data-id="${card.dataset.id}"]`);
      return true;
    }
    const kop = el.closest('.theme-col__head');
    if (!kop || (key !== 'ArrowLeft' && key !== 'ArrowRight')) return false;
    const kolom = kop.closest('.theme-col');
    const i = kolommen.indexOf(kolom);
    if ((key === 'ArrowLeft' && i <= 0) || (key === 'ArrowRight' && i >= kolommen.length - 1)) return false;
    const voor = key === 'ArrowLeft' ? kolommen[i - 1] : kolommen[i + 2];
    api.mutate((ds) => ObeyaData.moveTheme(ds, kolom.dataset.themeId, { beforeId: voor ? voor.dataset.themeId : null }), 'thema verschoven');
    api.focus(`.theme-col[data-theme-id="${kolom.dataset.themeId}"] .theme-col__head`);
    return true;
  }

  function attach(rootEl, api) {
    destroy();
    const stage = rootEl.querySelector('.canvas--chain .canvas-stage');
    if (!stage) return;
    attachConnect(stage, api);
    attachSortable(rootEl, stage, api);
  }

  // Alt+↑ / Alt+↓: het briefje met de focus één plek op- of neerschuiven
  // binnen zijn eigen lijst. Geeft true als er iets te verschuiven viel.
  const ITEM_SELECTOR = '.kt-row[data-id], .kt-mrgroup[data-id], .kt-doel[data-id], [data-sort="actions"] > .cv-card';
  function keyMove(el, dir, api) {
    const item = el && el.closest(ITEM_SELECTOR);
    if (!item || !item.closest('.canvas--chain')) return false;
    const soort = item.matches('.kt-row') ? '.kt-row[data-id]'
      : item.matches('.kt-mrgroup') ? '.kt-mrgroup[data-id]'
        : item.matches('.kt-doel') ? '.kt-doel[data-id]' : '.cv-card';
    const list = item.parentElement;
    const zusjes = Array.from(list.children).filter((c) => c.matches(soort));
    const i = zusjes.indexOf(item);
    if ((dir < 0 && i <= 0) || (dir > 0 && i >= zusjes.length - 1)) return false;
    const idVan = (n) => (n ? (n.dataset.id || n.dataset.node) : null);
    const beforeId = dir < 0 ? idVan(zusjes[i - 1]) : idVan(zusjes[i + 2]);
    if (soort === '.kt-row[data-id]') moveRow(api, item, list, beforeId, null);
    else if (soort === '.kt-mrgroup[data-id]') api.mutate((ds) => ObeyaData.moveMeasurableResult(ds, item.dataset.id, { beforeId }), 'meetbaar resultaat verschoven');
    else if (soort === '.kt-doel[data-id]') api.mutate((ds) => ObeyaData.moveObjective(ds, item.dataset.id, { beforeId }), 'doel verschoven');
    else api.mutate((ds) => ObeyaData.moveAction(ds, item.dataset.node, { projectId: list.dataset.projectId, beforeId }), 'actie verschoven');
    return true;
  }

  return { attach, attachBoard, destroy, keyMove, boardKeyMove };
})();
