import { serialCounters } from '../seed.js';
import { PERTH } from './perth.js';

describe('PERTH seed profile', () => {
  it('has its admin and 3 courses, and nothing else (D61)', () => {
    expect(PERTH.admin).toEqual({ username: 'admin', name: 'Administrator' });
    expect(PERTH.courses.map((c) => c.code)).toEqual(['FA-101', 'MINE-110', 'CUS-210']);
    expect(PERTH.participants).toEqual([]);
    expect(PERTH.enrollments).toEqual([]);
    expect(PERTH.certificates).toEqual([]);
  });

  it('needs no serial counter', () => {
    expect(serialCounters(PERTH)).toEqual([]);
  });
});
