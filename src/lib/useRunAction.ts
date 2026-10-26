import { router } from 'expo-router';

import { finishRecording, renderFinal, skipStage, startSwitch } from '@/engine/actions';
import type { NextAction } from '@/engine/director';
import { currentStage } from '@/engine/stages';
import { useApp } from '@/engine/store';

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
    switch (action.run) {
      case 'startSwitch':
        apply(projectId, startSwitch);
        break;
      case 'renderFinal':
        apply(projectId, renderFinal);
        break;
      case 'finishRecording':
        apply(projectId, finishRecording);
        break;
      case 'skip':
        apply(projectId, (p) => {
          const stage = currentStage(p);
          return stage ? skipStage(p, stage.id) : p;
        });
        break;
      default:
        break;
    }
  };
}
