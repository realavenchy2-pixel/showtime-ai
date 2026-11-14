import { router } from 'expo-router';

import { approvePlan, buildEdit, finishShooting, generateBroll, lockEdit, makePlates, skipStage, startSwitch } from '@/engine/actions';
import type { NextAction } from '@/engine/director';
import { currentStage } from '@/engine/stages';
import { useApp } from '@/engine/store';
import { haptic } from '@/lib/haptics';

/** Turns a director action into navigation or an engine command. */
export function useRunAction(projectId: string) {
  const apply = useApp((s) => s.apply);
  return (action: NextAction) => {
    if (action.open === 'record') {
      router.push(`/project/${projectId}/record`);
      return;
    }
    if (action.open) {
      router.push(`/project/${projectId}/${action.open}`);
      return;
    }
    haptic.confirm();
    switch (action.run) {
      case 'finishShooting':
        return apply(projectId, finishShooting);
      case 'approvePlan':
        return apply(projectId, approvePlan);
      case 'makePlates':
        return apply(projectId, makePlates);
      case 'startSwitch':
        return apply(projectId, (p) => startSwitch(p));
      case 'generateBroll':
        return apply(projectId, (p) => generateBroll(p));
      case 'buildEdit':
        return apply(projectId, (p) => buildEdit(p));
      case 'lockEdit':
        return apply(projectId, lockEdit);
      case 'skip':
        return apply(projectId, (p) => {
          const stage = currentStage(p);
          return stage ? skipStage(p, stage.id) : p;
        });
      default:
        return undefined;
    }
  };
}
