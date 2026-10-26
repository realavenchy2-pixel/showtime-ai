import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Header } from '@/components/Screen';
import { ExportStage, FinalStage, ResizeStage } from '@/components/stage/ShipStages';
import { RoughCutStage, SongStage } from '@/components/stage/ShootStages';
import { GenjutsuStage, LocationStage, SwitchStage } from '@/components/stage/SetStages';
import { BrollStage, VfxStage } from '@/components/stage/StyleStages';
import { useProject } from '@/engine/store';
import type { StageId } from '@/engine/types';
import { color } from '@/theme/tokens';

export default function StageRoute() {
  const { id, stage } = useLocalSearchParams<{ id: string; stage: StageId }>();
  const project = useProject(id);
  if (!project) {
    return (
      <View style={{ flex: 1, backgroundColor: color.stage }}>
        <Header title="Video not found" fallback="/" />
      </View>
    );
  }
  switch (stage) {
    case 'song':
      return <SongStage project={project} />;
    case 'roughcut':
      return <RoughCutStage project={project} />;
    case 'location':
      return <LocationStage project={project} />;
    case 'switch':
      return <SwitchStage project={project} />;
    case 'genjutsu':
      return <GenjutsuStage project={project} />;
    case 'broll':
      return <BrollStage project={project} />;
    case 'vfx':
      return <VfxStage project={project} />;
    case 'final':
      return <FinalStage project={project} />;
    case 'resize':
      return <ResizeStage project={project} />;
    case 'export':
      return <ExportStage project={project} />;
    default:
      return (
        <View style={{ flex: 1, backgroundColor: color.stage }}>
          <Header title="Stage not found" fallback={`/project/${project.id}`} />
        </View>
      );
  }
}
