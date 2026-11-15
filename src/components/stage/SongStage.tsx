import { useState } from 'react';

import { updateSong } from '@/engine/actions';
import { stageStatus } from '@/engine/stages';
import { useApp } from '@/engine/store';
import type { Project } from '@/engine/types';

import { Button } from '../Button';
import { SongForm, songChoiceReady, type SongChoice } from '../SongForm';
import { JobBar, StageScreen, WrappedNote } from './StageChrome';

/** Stage 1, reopened: change the track or where it posts. */
export function SongStage({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const [choice, setChoice] = useState<SongChoice>({ song: project.song, formats: project.formats });
  const status = stageStatus(project, 'song');
  const changed = choice.song !== project.song || choice.formats.join() !== project.formats.join();

  return (
    <StageScreen
      project={project}
      stage="song"
      footer={
        project.job ? (
          <JobBar project={project} />
        ) : status === 'done' && !changed ? (
          <WrappedNote text="This is the song the video is cut to. Change anything above and the plan follows." />
        ) : (
          <Button
            label="Use this song"
            disabled={!songChoiceReady(choice)}
            onPress={() => {
              if (songChoiceReady(choice)) apply(project.id, (p) => updateSong(p, { song: choice.song, formats: choice.formats }));
            }}
          />
        )
      }>
      <SongForm value={choice} onChange={setChoice} />
    </StageScreen>
  );
}
