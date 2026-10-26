import { router } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/Button';
import { Header, Screen } from '@/components/Screen';
import { SongForm, songChoiceReady, type SongChoice } from '@/components/SongForm';
import { T } from '@/components/T';
import { useApp } from '@/engine/store';

export default function NewVideoScreen() {
  const createProject = useApp((s) => s.createProject);
  const [choice, setChoice] = useState<SongChoice>({ formats: ['16:9', '9:16'] });
  const ready = songChoiceReady(choice);

  return (
    <Screen
      header={<Header title="New video" kicker="Stage 01" close />}
      footer={
        <>
          <Button
            label="Map my track"
            disabled={!ready}
            onPress={() => {
              if (!songChoiceReady(choice)) return;
              const id = createProject(choice);
              router.replace(`/project/${id}`);
            }}
          />
          {!ready ? (
            <T v="caption" c="ash" style={{ textAlign: 'center' }}>
              Pick a song, a vibe and at least one format.
            </T>
          ) : null}
        </>
      }>
      <SongForm value={choice} onChange={setChoice} />
    </Screen>
  );
}
