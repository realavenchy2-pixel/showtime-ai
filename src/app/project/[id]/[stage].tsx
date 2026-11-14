import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Header } from '@/components/Screen';
import { BrollStage } from '@/components/stage/BrollStage';
import { CutStage } from '@/components/stage/CutStage';
import { EditStage } from '@/components/stage/EditStage';
import { ExportStage } from '@/components/stage/ExportStage';
import { LooksStage } from '@/components/stage/LooksStage';
import { ShootStage } from '@/components/stage/ShootStage';
import { SongStage } from '@/components/stage/SongStage';
import { SwitchStage } from '@/components/stage/SwitchStage';
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
    case 'shoot':
      return <ShootStage project={project} />;
    case 'cut':
      return <CutStage project={project} />;
    case 'looks':
      return <LooksStage project={project} />;
    case 'switch':
      return <SwitchStage project={project} />;
    case 'broll':
      return <BrollStage project={project} />;
    case 'edit':
      return <EditStage project={project} />;
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
