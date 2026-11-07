import { describe, expect, it } from 'vitest';
import { lodLevel, lodLevelSquared } from '@/rendering/lod';
import { nearestDetailedShipIds } from '@/rendering/nearestDetailed';

describe('large fleet optimisation equivalence', () => {
  it('keeps the original LOD thresholds across camera distances, roles and quality scales', () => {
    for (const role of ['fighter','frigate','cruiser','reaper_capital'] as const)
      for (const size of [0.1,0.5,1,10,100])
        for (const scale of [0,0.5,1,1.5,2.5])
          for (const d of [0,10,29.9,30,30.1,89.9,90,90.1,500,5000,100000]) {
            expect(lodLevelSquared(d*d,size,role,true,scale)).toBe(lodLevel(d,size,role,true,scale));
            expect(lodLevelSquared(d*d,size,role,false,scale)).toBe('full');
          }
  });
  it('selects the same closest K with tie order and fighter filtering', () => {
    const ships = Array.from({length: 2100},(_,i)=>({
      id: 'ship-'+i,
      alive: i%31!==0,
      escaped: i%107===0,
      role: i%3===0 ? 'fighter' as const : 'cruiser' as const,
      pos: {x:(i*37)%103,y:(i*13)%71,z:i%11}
    }));
    const camera={x:17,y:-22,z:4}, scale=2.5;
    for (const skip of [false,true]) for(const count of [1,5,24,240]) {
      const expected=ships.filter(s=>s.alive&&!s.escaped&&(!skip||s.role!=='fighter'))
        .map(s=>({id:s.id,d2:(s.pos.x*scale-camera.x)**2+(s.pos.y*scale-camera.y)**2+(s.pos.z*scale-camera.z)**2}))
        .sort((a,b)=>a.d2-b.d2).slice(0,count).map(s=>s.id);
      expect([...nearestDetailedShipIds(ships,camera,scale,count,skip)]).toEqual(expected);
    }
  });
});
