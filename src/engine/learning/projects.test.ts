import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projectStatus } from './projects.ts';
import { validateCurriculum } from './curriculum.ts';
import { historyEarlyCivilizations } from '../../content/curricula/historyEarlyCivilizations.ts';

describe('Practical projects', () => {
  const skills = (...stages: number[]) => stages.map((stage, i) => ({ name: `Skill ${i + 1}`, stage }));

  it('an AI course’s project is written once every lesson is built and every skill is Proficient', () => {
    assert.deepEqual(projectStatus({ hasProject: false, allBuilt: true, competencies: skills(4, 5) }), { kind: 'ready' });
    assert.deepEqual(projectStatus({ hasProject: false, allBuilt: true, competencies: skills(4, 3) }), { kind: 'waiting', needs: ['Skill 2'] });
    assert.deepEqual(projectStatus({ hasProject: false, allBuilt: false, competencies: skills(4, 4) }), { kind: 'not_built' });
    assert.deepEqual(projectStatus({ hasProject: true, allBuilt: true, competencies: skills(4) }), { kind: 'written' });
  });

  it('the curriculum validator accepts only one written task proving Advanced as a project', () => {
    const withProject = (patch: Record<string, unknown>) => {
      const c = structuredClone(historyEarlyCivilizations) as any;
      const topic = c.disciplines[0].topics[0];
      const project = topic.objectives.at(-1).activities[0];
      Object.assign(project, patch);
      return validateCurriculum(c);
    };
    assert.equal(withProject({}).ok, true);
    const bad = withProject({ targetStage: 4 });
    assert.equal(bad.ok, false);
    assert.ok(!bad.ok && bad.issues.some((i) => /is a project/.test(i)));
  });
});
