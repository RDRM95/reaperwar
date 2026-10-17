import { describe, expect, it } from 'vitest';
import { Storage } from '@/core/storage';
import { SaveSlots, describeSave } from '@/core/saves';
import { advanceTick, createCampaign } from '@/campaign/engine';
import { createPostWar } from '@/campaign/postwar';
import { getPreset } from '@/timelines/presets';

describe('save slots', () => {
  it('saves, lists, renames, loads and deletes named slots', async () => {
    const store = new Storage();
    const slots = new SaveSlots(store);
    const st = createCampaign({ seed: 3, rules: getPreset('canon_me3'), worldState: {} });
    advanceTick(st, { interactive: false });
    const a = await slots.save('campaign', st, 'Week one');
    const pw = createPostWar(getPreset('cerberus_ascendant'), 4);
    const b = await slots.save('postwar', pw, '');
    const list = await slots.list();
    expect(list.map((m) => m.id).sort()).toEqual([a.id, b.id].sort());
    expect(list.find((m) => m.id === a.id)?.turn).toBe(1);
    expect(list.find((m) => m.id === b.id)?.name).toBe('Post-war save');
    await slots.rename(a.id, 'Renamed');
    expect((await slots.list()).find((m) => m.id === a.id)?.name).toBe('Renamed');
    const loaded = await slots.load<typeof st>(a.id);
    expect(loaded?.tick).toBe(1);
    expect(loaded?.fleets.length).toBe(st.fleets.length);
    // Loaded data is a copy: mutating it does not alter the slot.
    loaded!.tick = 99;
    expect((await slots.load<typeof st>(a.id))?.tick).toBe(1);
    await slots.remove(a.id);
    expect((await slots.list()).some((m) => m.id === a.id)).toBe(false);
    expect(await slots.load(a.id)).toBeUndefined();
  });

  it('overwrites a slot by id and describes saves', async () => {
    const store = new Storage();
    const slots = new SaveSlots(store);
    const st = createCampaign({ seed: 5, rules: getPreset('prime_apex'), worldState: {} });
    const m = await slots.save('campaign', st, 'A');
    advanceTick(st, { interactive: false });
    await slots.save('campaign', st, 'A2', m.id);
    const list = await slots.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('A2');
    expect(list[0].turn).toBe(1);
    expect(describeSave('campaign', st).rulesName).toBe('Prime/Apex — Successful Refuse');
  });

  it('round-trips slots through export and import', async () => {
    const a = new Storage();
    const slotsA = new SaveSlots(a);
    const st = createCampaign({ seed: 6, rules: getPreset('canon_me3'), worldState: {} });
    const m = await slotsA.save('campaign', st, 'Exported');
    const data = await a.exportAll();
    expect(data.saveSlots).toHaveLength(1);
    const b = new Storage();
    await b.importAll(JSON.parse(JSON.stringify(data)));
    const slotsB = new SaveSlots(b);
    expect((await slotsB.list())[0].id).toBe(m.id);
    expect((await slotsB.load<typeof st>(m.id))?.seed).toBe(6);
  });
});
