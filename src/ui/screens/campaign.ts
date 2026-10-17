import type { App } from '../app';
import { el, fmtNum, setChildren } from '../dom';
import { RELAYS, SYSTEMS, getSystem, type SystemId } from '@/campaign/galaxy';
import { advanceTick, autoResolve, buildEngagement, campaignReaperAssessment, decideSummit, fleetPoints, fleetShipCount, fleetsAt, orderMove, reaperFleetValue, resolvePhase, setPosture, withdrawFromEngagement } from '@/campaign/engine';
import type { CampaignFleet, CampaignState } from '@/campaign/state';
import { effectiveGround, getProject, RESEARCH_PROJECTS, researchOutput, setResearch, SUMMIT_OPTIONS } from '@/campaign/depth';
import { FACTIONS } from '@/data/factions';
import { getShipClass } from '@/data/ships';
import { storage } from '@/core/storage';

/**
 * Galactic campaign screen: interactive galaxy map (canvas), system and
 * fleet panels, turn controls, event log and Reaper assessment. Engagements
 * involving the player's fleets can be fought in 3D or auto-resolved.
 */

const ALLEGIANCE_COLOUR: Record<string, string> = { allied: '#4fa3ff', reaper: '#ff3b2f', cerberus: '#ff9a3c', neutral: '#8aa3c0' };

export function renderCampaign(app: App, state: CampaignState): HTMLElement {
  let selectedSystem: SystemId | undefined = 'sol';
  let selectedFleetId: string | undefined;
  let busy = false;

  const canvas = el('canvas', { class: 'galaxy-map', width: 1200, height: 760 });
  const ctx = canvas.getContext('2d')!;
  const sysPanel = el('div');
  const fleetPanel = el('div');
  const statusBar = el('div', { class: 'row' });
  const eventLog = el('div', { class: 'comms scroll', style: { maxHeight: '160px' } });
  const intelBox = el('div', { class: 'intel' });
  const researchPanel = el('div');
  const modalHost = el('div');
  const pos = (id: SystemId) => {
    const s = getSystem(id);
    return { x: (s.x / 100) * canvas.width, y: (s.y / 100) * canvas.height };
  };

  const save = () => void storage.set('campaign', state);

  const draw = () => {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#06090f';
    ctx.fillRect(0, 0, w, h);
    // Grid.
    ctx.strokeStyle = 'rgba(79,163,255,0.07)';
    for (let x = 0; x < w; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // Reaper front: glow around occupied systems.
    for (const s of SYSTEMS) {
      const st = state.systems[s.id];
      if (st.reaperPresence > 0) {
        const p = pos(s.id);
        const g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 70);
        g.addColorStop(0, `rgba(255,59,47,${0.35 * st.reaperPresence})`);
        g.addColorStop(1, 'rgba(255,59,47,0)');
        ctx.fillStyle = g;
        ctx.fillRect(p.x - 70, p.y - 70, 140, 140);
      }
    }
    // Relays.
    ctx.lineWidth = 1.5;
    for (const [a, b] of RELAYS) {
      const pa = pos(a);
      const pb = pos(b);
      const contested = state.systems[a].controller === 'reaper' || state.systems[b].controller === 'reaper';
      ctx.strokeStyle = contested ? 'rgba(255,90,70,0.45)' : 'rgba(79,163,255,0.35)';
      ctx.setLineDash(contested ? [6, 6] : []);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Fleet movement arrows.
    for (const f of state.fleets) {
      if (!f.destination) continue;
      const pa = pos(f.location);
      const pb = pos(f.destination);
      ctx.strokeStyle = ALLEGIANCE_COLOUR[f.allegiance];
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pa.x + (pb.x - pa.x) * 0.5, pa.y + (pb.y - pa.y) * 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Systems.
    ctx.font = '11px Consolas, "Roboto Mono", monospace';
    for (const s of SYSTEMS) {
      const st = state.systems[s.id];
      const p = pos(s.id);
      const colour = ALLEGIANCE_COLOUR[st.controller];
      const r = s.homeworldOf ? 9 : 6;
      ctx.fillStyle = colour;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (s.homeworldOf) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (selectedSystem === s.id) {
        ctx.strokeStyle = '#ff8a1f';
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x - r - 9, p.y - r - 9, (r + 9) * 2, (r + 9) * 2);
      }
      ctx.fillStyle = '#dbe7f5';
      ctx.textAlign = 'center';
      ctx.fillText(s.world.toUpperCase(), p.x, p.y + r + 14);
      ctx.fillStyle = '#8aa3c0';
      ctx.fillText(s.name, p.x, p.y + r + 26);
      // Fleet markers.
      const here = fleetsAt(state, s.id);
      const allied = here.filter((f) => f.allegiance === 'allied');
      const reapers = here.filter((f) => f.allegiance === 'reaper');
      const cerb = here.filter((f) => f.allegiance === 'cerberus');
      let ox = -14;
      const marker = (list: CampaignFleet[], colour: string, shape: 'diamond' | 'tri') => {
        if (list.length === 0) return;
        const n = list.reduce((a, f) => a + fleetShipCount(f.counts), 0);
        ctx.fillStyle = colour;
        ctx.beginPath();
        const mx = p.x + ox;
        const my = p.y - r - 12;
        if (shape === 'diamond') {
          ctx.moveTo(mx, my - 6);
          ctx.lineTo(mx + 6, my);
          ctx.lineTo(mx, my + 6);
          ctx.lineTo(mx - 6, my);
        } else {
          ctx.moveTo(mx, my - 6);
          ctx.lineTo(mx + 6, my + 6);
          ctx.lineTo(mx - 6, my + 6);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.fillText(String(n), mx + 9, my + 4);
        ox += 36;
      };
      marker(allied, ALLEGIANCE_COLOUR.allied, 'diamond');
      marker(reapers, ALLEGIANCE_COLOUR.reaper, 'tri');
      marker(cerb, ALLEGIANCE_COLOUR.cerberus, 'tri');
      // Selected fleet route highlight.
      if (selectedFleetId) {
        const f = state.fleets.find((x) => x.id === selectedFleetId);
        if (f && f.location === s.id) {
          ctx.strokeStyle = '#ff8a1f';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 16, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
    // Legend.
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8aa3c0';
    ctx.fillText('◆ allied fleet   ▲ Reaper fleet   ring = homeworld   red haze = harvest', 12, h - 12);
  };

  const renderStatus = () => {
    const reaperVal = reaperFleetValue(state);
    const alliedVal = state.fleets.filter((f) => f.allegiance === 'allied').reduce((a, f) => a + fleetPoints(f.counts), 0);
    setChildren(
      statusBar,
      el('div', { class: 'panel', style: { minWidth: '180px' } }, [el('div', { class: 'panel-title' }, 'WAR CLOCK'), el('div', { class: 'hud-clock' }, [`WEEK ${state.tick}`, el('small', {}, `${state.startDate} · ${state.rules.name}`)])]),
      el('div', { class: 'panel' }, [el('div', { class: 'panel-title' }, 'WAR ASSETS'), el('div', { class: 'mono', style: { fontSize: '18px', color: 'var(--cyan)' } }, fmtNum(state.warAssets)), el('small', {}, `allied fleet value ${fmtNum(alliedVal)}`)]),
      el('div', { class: 'panel red' }, [el('div', { class: 'panel-title' }, 'REAPER STRENGTH'), el('div', { class: 'mono', style: { fontSize: '18px', color: 'var(--red)' } }, fmtNum(reaperVal)), el('small', {}, `${state.fleets.filter((f) => f.allegiance === 'reaper').length} fleets · ${state.reaper.reinforcementPool} reinforcement groups`)]),
      el('div', { class: 'panel orange' }, [
        el('div', { class: 'panel-title' }, 'CRUCIBLE'),
        state.crucible.available
          ? el('div', {}, [el('div', { class: 'bar hull', style: { height: '6px', marginBottom: '4px' } }, [el('i', { style: { width: `${state.crucible.progress * 100}%` } })]), el('small', {}, state.crucible.complete ? 'COMPLETE — reach the Citadel' : `${(state.crucible.progress * 100).toFixed(0)}% built`)])
          : el('small', {}, 'Not available in this timeline. Victory must be conventional.'),
      ]),
      el('div', { class: 'panel' }, [
        el('div', { class: 'panel-title' }, 'REFUGEES'),
        el('div', { class: 'bar', style: { height: '6px', marginBottom: '4px' } }, [el('i', { style: { width: `${state.refugees * 100}%`, background: state.refugees > 0.7 ? 'var(--red)' : 'var(--orange)' } })]),
        el('small', {}, state.refugees > 0.7 ? 'Crisis: Citadel overwhelmed' : state.refugees > 0.5 ? 'Pressure on Council cooperation' : `${Math.round(state.refugees * 100)}% of capacity`),
      ]),
      el('div', { class: 'spacer' }),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn primary', 'data-action': 'end-turn', disabled: !!state.outcome || !!state.pending || !!state.summit, onclick: () => runTicks(1) }, 'End week →'),
        el('button', { class: 'btn', disabled: !!state.outcome || !!state.pending || !!state.summit, onclick: () => runTicks(4) }, '+4 weeks'),
        el('button', { class: 'btn', onclick: () => {
          save();
          app.toast('CAMPAIGN SAVED');
        } }, 'Save'),
        el('button', { class: 'btn', 'data-action': 'save-slot-screen', onclick: () => {
          save();
          app.show('saves', { saveCurrent: 'campaign' });
        } }, 'Save slot…'),
        el('button', { class: 'btn', onclick: () => app.show('menu') }, 'Menu'),
      ]),
    );
  };

  const renderSystem = () => {
    if (!selectedSystem) return setChildren(sysPanel, el('p', { class: 'dim' }, 'Select a system on the map.'));
    const s = getSystem(selectedSystem);
    const st = state.systems[s.id];
    const here = fleetsAt(state, s.id);
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const stat = (k: string, v: string) => el('div', { class: 'stat' }, [el('b', {}, k), el('span', { class: 'mono' }, v)]);
    const selFleet = selectedFleetId ? state.fleets.find((f) => f.id === selectedFleetId) : undefined;
    setChildren(
      sysPanel,
      el('div', { style: { fontSize: '16px', color: ALLEGIANCE_COLOUR[st.controller] } }, `${s.world}`),
      el('div', { class: 'dim', style: { fontSize: '11px', marginBottom: '8px' } }, `${s.name} · ${s.region}${s.homeworldOf ? ` · ${FACTIONS[s.homeworldOf].shortName} homeworld` : ''}`),
      stat('Controller', st.controller.toUpperCase()),
      stat('Population', `${pct(st.population)} (index ${s.population})`),
      stat('Industry', `${pct(st.industry)} (index ${s.industry})`),
      stat('Orbital defence', `${pct(st.defence)} (index ${s.defence})`),
      stat('Reaper activity', st.reaperPresence > 0 ? `${pct(st.reaperPresence)} harvest` : 'none'),
      stat('Ground forces', `${pct(effectiveGround(state, s.id))}${effectiveGround(state, s.id) > st.ground + 0.01 ? ' (krogan reinforced)' : ''}`),
      stat('Indoctrination', pct(st.indoctrination)),
      st.lastBattle ? stat('Last battle', `wk ${st.lastBattle.tick}: ${st.lastBattle.summary}`) : null,
      el('div', { class: 'dim', style: { fontSize: '11px', margin: '6px 0' } }, s.note),
      el('div', { class: 'panel-title', style: { marginTop: '8px' } }, 'FLEETS PRESENT'),
      here.length === 0 ? el('div', { class: 'dim', style: { fontSize: '12px' } }, 'None.') : null,
      ...here.map((f) => el('div', { class: `ship-row ${selectedFleetId === f.id ? 'selected' : ''}`, 'data-fleet': f.id, onclick: () => {
        selectedFleetId = f.id;
        renderAll();
      } }, [el('div', { class: 'name', style: { color: ALLEGIANCE_COLOUR[f.allegiance] } }, `${f.name} (${fleetShipCount(f.counts)})`), el('div', { class: 'mono dim', style: { fontSize: '10px', textAlign: 'right' } }, `${fmtNum(fleetPoints(f.counts))} pts`)])),
      selFleet && selFleet.playerControlled && selFleet.location !== s.id
        ? el('button', { class: 'btn primary small', style: { marginTop: '8px' }, 'data-action': 'move-here', onclick: () => {
            const r = orderMove(state, selFleet.id, s.id);
            if (!r.ok) app.toast((r.reason ?? 'ORDER REFUSED').toUpperCase());
            else app.playUi('ui_confirm');
            renderAll();
          } }, `Move ${selFleet.name} here`)
        : null,
    );
  };

  const renderFleet = () => {
    const f = selectedFleetId ? state.fleets.find((x) => x.id === selectedFleetId) : undefined;
    if (!f) {
      setChildren(fleetPanel, el('div', { class: 'scroll', style: { maxHeight: '220px' } }, state.fleets.filter((x) => x.allegiance === 'allied').map((x) => el('div', { class: 'ship-row', 'data-fleet': x.id, onclick: () => {
        selectedFleetId = x.id;
        selectedSystem = x.location;
        renderAll();
      } }, [el('div', { class: 'name' }, `${x.name}`), el('div', { class: 'mono dim', style: { fontSize: '10px', textAlign: 'right' } }, `${getSystem(x.location).world}${x.destination ? ' →' : ''}`)]))));
      return;
    }
    setChildren(
      fleetPanel,
      el('div', { style: { color: ALLEGIANCE_COLOUR[f.allegiance], fontSize: '14px' } }, f.name),
      el('div', { class: 'dim', style: { fontSize: '11px', marginBottom: '6px' } }, `${FACTIONS[f.faction].name} · at ${getSystem(f.location).name}${f.destination ? ` → ${getSystem(f.destination).name}` : ''} · readiness ${Math.round(f.readiness * 100)}%`),
      el('table', {}, [el('tbody', {}, Object.entries(f.counts).filter(([, n]) => n > 0).map(([c, n]) => el('tr', {}, [el('td', {}, getShipClass(c).name), el('td', { class: 'num' }, String(n))])))]),
      f.playerControlled
        ? el('div', { class: 'row', style: { marginTop: '8px' } }, [
            el('label', { class: 'field' }, ['Posture', el('select', { onchange: (e: Event) => {
              setPosture(state, f.id, (e.target as HTMLSelectElement).value as CampaignFleet['posture']);
              save();
            } }, (['defend', 'reinforce', 'offensive'] as const).map((p) => el('option', { value: p, selected: f.posture === p }, p)))]),
            el('small', { class: 'dim' }, 'Click a destination system, then "Move here". Reinforce: returns home when the homeworld is threatened.'),
          ])
        : el('small', { class: 'dim' }, 'Not under your command.'),
      el('button', { class: 'btn small', style: { marginTop: '8px' }, onclick: () => {
        selectedFleetId = undefined;
        renderAll();
      } }, 'All fleets'),
    );
  };

  const renderResearch = () => {
    const r = state.research;
    const active = r.active ? getProject(r.active) : undefined;
    const remaining = RESEARCH_PROJECTS.filter((p) => !r.completed.includes(p.id));
    setChildren(
      researchPanel,
      el('label', { class: 'field' }, [
        'Active project',
        el('select', { 'data-field': 'research', disabled: remaining.length === 0, onchange: (e: Event) => {
          const v = (e.target as HTMLSelectElement).value;
          const res = setResearch(state, v || undefined);
          if (!res.ok) app.toast((res.reason ?? 'REFUSED').toUpperCase());
          save();
          renderResearch();
        } }, remaining.map((p) => el('option', { value: p.id, selected: r.active === p.id }, `${p.name} (${p.cost} pts)`))),
      ]),
      active
        ? el('div', {}, [
            el('div', { class: 'bar hull', style: { height: '6px', marginBottom: '4px' } }, [el('i', { style: { width: `${Math.min(100, (r.progress / active.cost) * 100)}%` } })]),
            el('small', {}, `${Math.round(r.progress)}/${active.cost} · ${researchOutput(state).toFixed(1)} pts/week · ${Math.max(1, Math.ceil((active.cost - r.progress) / Math.max(0.01, researchOutput(state))))} weeks`),
            el('div', { class: 'dim', style: { fontSize: '11px', marginTop: '4px' } }, active.description),
          ])
        : el('small', { class: 'dim' }, remaining.length === 0 ? 'All projects complete.' : 'No active project: the next one starts automatically.'),
      r.completed.length > 0 ? el('div', { class: 'dim', style: { fontSize: '11px', marginTop: '6px' } }, `Completed: ${r.completed.map((id) => getProject(id)?.name ?? id).join(', ')}`) : null,
    );
  };

  const renderEvents = () => {
    setChildren(eventLog, ...state.events.slice(-12).reverse().map((e) => el('div', { class: `line ${e.kind === 'harvest' || e.kind === 'defeat' ? 'reaper' : ''}` }, [el('span', { class: 'who' }, `[WK ${e.tick}] `), e.text])));
    const a = campaignReaperAssessment(state);
    setChildren(intelBox, el('div', { class: 'headline' }, [a.headline, el('span', { class: 'level' }, `THREAT: ${a.threat}`)]), ...a.lines.map((l) => el('div', {}, l)));
  };

  const renderModal = () => {
    modalHost.replaceChildren();
    if (state.outcome) {
      modalHost.append(
        el('div', { class: 'screen transparent', style: { background: 'rgba(6,9,15,0.75)', alignItems: 'center', justifyContent: 'center' } }, [
          el('div', { class: 'panel', style: { width: '560px', textAlign: 'center' } }, [
            el('div', { class: `result-banner ${state.outcome.kind}` }, state.outcome.kind.toUpperCase()),
            el('p', {}, state.outcome.reason),
            el('p', { class: 'dim' }, `Week ${state.outcome.tick} · ${state.rules.name}${state.rules.category !== 'canon' ? ' (alternate universe)' : ''}`),
            el('div', { class: 'row', style: { justifyContent: 'center' } }, [
              el('button', { class: 'btn primary', onclick: () => app.show('menu') }, 'Main menu'),
              state.outcome.kind === 'victory' && state.rules.id === 'cerberus_ascendant' ? el('button', { class: 'btn', onclick: () => app.startPostWar(state.rules, state.seed) }, 'Continue: post-war 2186–2206 →') : null,
              el('button', { class: 'btn', onclick: () => modalHost.replaceChildren() }, 'Inspect the map'),
            ]),
          ]),
        ]),
      );
      return;
    }
    if (state.summit) {
      const s = state.summit;
      modalHost.append(
        el('div', { class: 'screen transparent', style: { background: 'rgba(6,9,15,0.7)', alignItems: 'center', justifyContent: 'center' } }, [
          el('div', { class: 'panel orange', style: { width: '640px' } }, [
            el('div', { class: 'panel-title' }, 'COUNCIL WAR SUMMIT'),
            el('h2', {}, `Summit ${s.number} · week ${s.tick}`),
            el('p', { class: 'dim', style: { fontSize: '12px' } }, `The Council governments meet on the Citadel. Refugee pressure ${Math.round(state.refugees * 100)}% · Crucible ${state.crucible.available ? `${Math.round(state.crucible.progress * 100)}%` : 'n/a'} · cooperation ${['turian', 'asari', 'salarian'].map((f) => `${FACTIONS[f as 'turian'].shortName} ${Math.round(state.factions[f as 'turian'].cooperation * 100)}%`).join(', ')}.`),
            ...SUMMIT_OPTIONS.map((o) =>
              el('div', { class: 'entry-block' }, [
                el('div', { class: 'row', style: { justifyContent: 'space-between' } }, [el('b', {}, o.label), el('button', { class: 'btn small primary', 'data-action': 'summit-choice', 'data-choice': o.id, onclick: () => {
                  decideSummit(state, o.id);
                  app.playUi('ui_confirm');
                  save();
                  renderAll();
                } }, 'Choose')]),
                el('div', { class: 'dim', style: { fontSize: '12px' } }, o.description),
              ]),
            ),
          ]),
        ]),
      );
      return;
    }
    const p = state.pending;
    if (!p) return;
    const sys = getSystem(p.system);
    const allied = p.alliedFleetIds.map((id) => state.fleets.find((f) => f.id === id)!).filter(Boolean);
    const reapers = p.reaperFleetIds.map((id) => state.fleets.find((f) => f.id === id)!).filter(Boolean);
    modalHost.append(
      el('div', { class: 'screen transparent', style: { background: 'rgba(6,9,15,0.7)', alignItems: 'center', justifyContent: 'center' } }, [
        el('div', { class: 'panel red', style: { width: '600px' } }, [
          el('div', { class: 'panel-title' }, 'ENGAGEMENT'),
          el('h2', {}, `${sys.world} under attack`),
          el('p', {}, `Allied: ${allied.map((f) => `${f.name} (${fleetShipCount(f.counts)})`).join(', ')}`),
          el('p', {}, `Hostile: ${reapers.map((f) => `${f.name} (${fleetShipCount(f.counts)})`).join(', ')}`),
          el('p', { class: 'dim', style: { fontSize: '12px' } }, 'Fight the battle yourself in the 3D simulator, let the simulation resolve it instantly, or withdraw your fleets (allied AI fleets stay and fight).'),
          el('div', { class: 'row' }, [
            el('button', { class: 'btn primary', 'data-action': 'fight-3d', onclick: () => {
              save();
              app.startBattle(buildEngagement(state, p), { campaign: { state, pending: p } });
            } }, 'Command the battle (3D)'),
            el('button', { class: 'btn', 'data-action': 'auto-resolve', onclick: () => {
              autoResolve(state, p);
              finishTick();
            } }, 'Auto-resolve'),
            el('button', { class: 'btn danger', 'data-action': 'withdraw', onclick: () => {
              withdrawFromEngagement(state, p);
              finishTick();
            } }, 'Withdraw my fleets'),
          ]),
        ]),
      ]),
    );
  };

  const renderAll = () => {
    draw();
    renderStatus();
    renderSystem();
    renderFleet();
    renderResearch();
    renderEvents();
    renderModal();
  };

  /** Continue the tick after a pending engagement was handled. */
  const finishTick = () => {
    const r = resolvePhase(state, { interactive: true });
    if (!r.pending) save();
    renderAll();
  };

  const runTicks = (n: number) => {
    if (busy) return;
    busy = true;
    const step = (remaining: number) => {
      if (remaining <= 0 || state.outcome) {
        busy = false;
        save();
        renderAll();
        return;
      }
      const r = advanceTick(state, { interactive: true });
      renderAll();
      if (r.pending) {
        busy = false;
        return;
      }
      setTimeout(() => step(remaining - 1), 30);
    };
    step(n);
  };

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    let best: SystemId | undefined;
    let bestD = 30;
    for (const s of SYSTEMS) {
      const p = pos(s.id);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = s.id;
      }
    }
    if (best) {
      selectedSystem = best;
      app.playUi('ui_click');
      renderAll();
    }
  });

  renderAll();
  // If a battle was just fought, the pending engagement has been applied; continue the tick.
  if (!state.pending && state.tick > 0 && (app.campaignResume ?? false)) {
    app.campaignResume = false;
    finishTick();
  }

  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-header' }, [el('h1', {}, 'GALACTIC CAMPAIGN'), el('span', { class: 'sub' }, state.name.toUpperCase())]),
    el('div', { class: 'screen-body', style: { padding: '12px 16px' } }, [
      statusBar,
      el('div', { class: 'campaign-layout' }, [
        el('div', { class: 'panel', style: { padding: '8px' } }, [canvas]),
        el('div', { class: 'col' }, [
          el('div', { class: 'panel' }, [el('div', { class: 'panel-title' }, 'SYSTEM'), el('div', { class: 'target-panel' }, [sysPanel])]),
          el('div', { class: 'panel orange' }, [el('div', { class: 'panel-title' }, 'FLEET COMMAND'), fleetPanel]),
          el('div', { class: 'panel' }, [el('div', { class: 'panel-title' }, 'RESEARCH'), researchPanel]),
          el('div', { class: 'panel red' }, [el('div', { class: 'panel-title' }, 'REAPER STRATEGIC ASSESSMENT'), intelBox]),
          el('div', { class: 'panel' }, [el('div', { class: 'panel-title' }, 'WAR LOG'), eventLog]),
        ]),
      ]),
    ]),
    modalHost,
  ]);
}

/** Campaign setup: timeline, world state, seed. */
export function renderCampaignSetup(app: App): HTMLElement {
  let timelineId = app.prefs.lastTimelineId;
  let seed = Math.floor(Math.random() * 100000);
  const ws: Record<string, string> = { ascension: 'present', rannoch: 'war', crucible: 'use', genophage: 'cured', rachni: 'saved' };
  const body = el('div', { class: 'screen-body' });
  const render = () => {
    const rules = app.getTimeline(timelineId);
    setChildren(
      body,
      el('div', { class: 'grid2' }, [
        el('div', { class: 'panel orange' }, [
          el('div', { class: 'panel-title' }, 'TIMELINE'),
          el('label', { class: 'field' }, ['Rule set', el('select', { onchange: (e: Event) => {
            timelineId = (e.target as HTMLSelectElement).value;
            render();
          } }, app.allTimelines().map((t) => el('option', { value: t.id, selected: t.id === timelineId }, `${t.name}${t.category === 'canon' ? '' : ` [${t.category.toUpperCase()}]`}`)))]),
          el('p', { class: 'dim' }, rules.description),
          el('div', { class: 'kv' }, [
            el('span', {}, 'Crucible'), el('span', { class: 'v' }, rules.strategic.crucibleAvailable && rules.strategic.catalystOperational ? 'available' : 'unavailable'),
            el('span', {}, 'Conventional victory'), el('span', { class: 'v' }, rules.strategic.conventionalVictoryPossible ? 'possible' : 'Crucible only'),
            el('span', {}, 'Cerberus'), el('span', { class: 'v' }, rules.strategic.cerberusStance),
            el('span', {}, 'Reaper reinforcements'), el('span', { class: 'v' }, `×${rules.strategic.reaperReinforcements}`),
          ]),
          el('label', { class: 'field' }, ['Seed', el('input', { type: 'number', value: seed, onchange: (e: Event) => (seed = Number((e.target as HTMLInputElement).value) || 0) })]),
        ]),
        el('div', { class: 'panel' }, [
          el('div', { class: 'panel-title' }, 'WORLD STATE (PLAYER-DEPENDENT ME3 OUTCOMES)'),
          el('label', { class: 'field' }, ['Destiny Ascension and the Council (2183)', el('select', { onchange: (e: Event) => (ws.ascension = (e.target as HTMLSelectElement).value) }, [el('option', { value: 'present', selected: ws.ascension === 'present' }, 'Saved: the old Council survives (Council races +5 % cooperation)'), el('option', { value: 'absent', selected: ws.ascension === 'absent' }, 'Lost: a human-led Council (Alliance production +10 %, others −5 % cooperation)')])]),
          el('label', { class: 'field' }, ['Rachni queen (2183)', el('select', { onchange: (e: Event) => (ws.rachni = (e.target as HTMLSelectElement).value) }, [el('option', { value: 'saved', selected: ws.rachni === 'saved' }, 'Spared: rachni workers aid the Crucible (+8 %)'), el('option', { value: 'killed', selected: ws.rachni === 'killed' }, 'Killed: no rachni workers')])]),
          el('label', { class: 'field' }, ['Geth–quarian conflict', el('select', { onchange: (e: Event) => (ws.rannoch = (e.target as HTMLSelectElement).value) }, [el('option', { value: 'war', selected: ws.rannoch === 'war' }, 'At war: neither fleet joins the alliance'), el('option', { value: 'peace', selected: ws.rannoch === 'peace' }, 'Peace: both fleets join the war')])]),
          el('label', { class: 'field' }, ['Genophage cure', el('select', { onchange: (e: Event) => (ws.genophage = (e.target as HTMLSelectElement).value) }, [el('option', { value: 'cured', selected: ws.genophage === 'cured' }, 'Cure deployed: the Union keeps its fleets at home'), el('option', { value: 'sabotaged', selected: ws.genophage === 'sabotaged' }, 'Cure sabotaged: the Salarian First Fleet joins the war')])]),
          rules.strategic.crucibleAvailable && rules.strategic.catalystOperational
            ? el('label', { class: 'field' }, ['The Crucible', el('select', { 'data-field': 'crucible', onchange: (e: Event) => (ws.crucible = (e.target as HTMLSelectElement).value) }, [el('option', { value: 'use', selected: ws.crucible === 'use' }, 'Build and use it: the war ends when it docks with the Citadel'), el('option', { value: 'refuse', selected: ws.crucible === 'refuse' }, 'Refuse it: victory only by destroying every Reaper (AU “Successful Refuse”)')]), el('small', {}, rules.strategic.conventionalVictoryPossible ? 'This timeline flags conventional victory as possible.' : 'This timeline does not consider conventional victory possible; refusing is a long shot.')])
            : el('p', { class: 'dim', style: { fontSize: '12px' } }, 'No Crucible in this timeline: the war can only be won conventionally.'),
          el('p', { class: 'dim', style: { fontSize: '12px' } }, 'The campaign begins as the Reapers enter from batarian space. One turn is one week. Engagements involving your fleets can be fought in the 3D simulator or auto-resolved. Progress autosaves every turn.'),
          el('p', { class: 'dim', style: { fontSize: '12px' } }, 'The strategic layer models movement, harvest, the ground war, production, research projects, refugee pressure, political events, Crucible construction, indoctrination pressure and fleet morale. Diplomacy is represented by cooperation and events rather than negotiation (see ROADMAP).'),
        ]),
      ]),
    );
  };
  render();
  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-header' }, [el('h1', {}, 'NEW GALACTIC CAMPAIGN'), el('span', { class: 'sub' }, 'REAPER WAR, 2186')]),
    body,
    el('div', { class: 'screen-footer' }, [
      el('button', { class: 'btn', onclick: () => app.show('menu') }, '← Main menu'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn', 'data-action': 'start-postwar', onclick: () => {
        app.selectTimeline('cerberus_ascendant');
        app.startPostWar(app.getTimeline('cerberus_ascendant'), seed);
      } }, 'Cerberus Ascendant: post-war 2186–2206 →'),
      el('button', { class: 'btn primary', 'data-action': 'start-campaign', onclick: () => {
        app.selectTimeline(timelineId);
        app.startCampaign({ seed, rules: app.getTimeline(timelineId), worldState: ws });
      } }, 'Begin the war →'),
    ]),
  ]);
}
