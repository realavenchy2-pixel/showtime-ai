import { Check, Clapperboard } from '@/components/icons';
import { StyleSheet, View } from 'react-native';

import { videoRange } from '@/engine/actions';
import { estimateBudget } from '@/engine/agent';
import { formatTime, lookSummary } from '@/engine/director';
import { fxPack } from '@/engine/fx';
import type { AttachmentKind, Message, Project } from '@/engine/types';
import { coverFor } from '@/lib/preview';
import { color, radius, space } from '@/theme/tokens';

import { Frame } from '../Frame';
import { T } from '../T';

export function DirectorLine({ message, project, showAvatar }: { message: Message; project: Project; showAvatar: boolean }) {
  return (
    <View style={styles.director}>
      <View style={styles.avatarSlot}>
        {showAvatar ? (
          <View style={styles.avatar} accessibilityLabel="Director">
            <Clapperboard size={15} color={color.chalk} strokeWidth={2} />
          </View>
        ) : null}
      </View>
      <View style={styles.directorBody}>
        {showAvatar ? (
          <T v="micro" c="ash">
            Director
          </T>
        ) : null}
        <T v="body">{message.text}</T>
        {message.attachment ? <Attachment kind={message.attachment} project={project} /> : null}
      </View>
    </View>
  );
}

export function UserBubble({ message }: { message: Message }) {
  return (
    <View style={styles.userRow}>
      <View style={styles.bubble}>
        <T v="body">{message.text}</T>
      </View>
    </View>
  );
}

export function SystemLine({ message }: { message: Message }) {
  return (
    <View style={styles.system}>
      <T v="caption" c="ash" style={styles.center}>
        {message.text}
      </T>
    </View>
  );
}

function Attachment({ kind, project }: { kind: AttachmentKind; project: Project }) {
  switch (kind) {
    case 'takePlan':
      return <TakePlan project={project} />;
    case 'cutSummary':
      return <CutSummary project={project} />;
    case 'plan':
      return <PlanCard project={project} />;
    case 'shotsSummary':
      return <ShotsSummary project={project} />;
    case 'wrap': {
      const cover = coverFor(project);
      return <Frame kind={cover.kind} thumb={cover.thumb} label="Final, exported" relit style={styles.wrapFrame} />;
    }
    default:
      return null;
  }
}

/** Shots that cut well together. Checked off as takes come in. */
function TakePlan({ project }: { project: Project }) {
  return (
    <View style={styles.card}>
      <T v="micro" c="ash">
        Shots that cut well together
      </T>
      {project.takePlan.map((t, i) => {
        const done = project.takes.length > i;
        return (
          <View key={`${t.angle}-${i}`} style={styles.planRow}>
            <T v="label" c={done ? 'ash' : 'chalk'} style={styles.planNum}>
              {i + 1}
            </T>
            <View style={styles.flex}>
              <T v="callout" c={done ? 'smoke' : 'chalk'}>
                {t.angle}
              </T>
              <T v="caption" c="ash">
                {scopeLine(project, t.scope)}
              </T>
            </View>
            {done ? <Check size={18} color={color.chalk} /> : null}
          </View>
        );
      })}
    </View>
  );
}

function scopeLine(p: Project, scope: string): string {
  const snippet = p.length === 'snippet' || (!!p.range && !!p.song && p.range.end < p.song.durationSec - 0.05);
  if (scope === 'Full song') return snippet ? 'Whole snippet' : p.length ? 'Whole video' : 'Full song';
  // Scenes have no hook: an extra angle goes wherever the artist wants one.
  return p.song?.sections.some((s) => s.scene) ? 'Any stretch you want' : scope;
}

function CutSummary({ project }: { project: Project }) {
  const song = project.song;
  if (!song) return null;
  const range = videoRange(project);
  const sections = song.sections.filter((s) => s.end > range.start + 0.01 && s.start < range.end - 0.01);
  const hooks = sections.some((s) => s.kind === 'hook');
  const shots = project.cut.segments.filter((g) => g.takeId).length;
  return (
    <View style={styles.card}>
      <View style={styles.strip}>
        {sections.map((s) => {
          const n = project.cut.segments.filter((g) => g.sectionId === s.id).length;
          return (
            <View key={s.id} style={[styles.stripPart, { flex: s.end - s.start }]}>
              <View style={[styles.stripBar, s.kind === 'hook' && styles.stripHook]}>
                {Array.from({ length: Math.max(0, n - 1) }, (_, i) => (
                  <View key={i} style={[styles.cutMark, { left: `${((i + 1) / n) * 100}%` }]} />
                ))}
              </View>
              {(s.end - s.start) / Math.max(1, range.end - range.start) > 0.08 ? (
                <T v="micro" c="ash" numberOfLines={1}>
                  {s.label}
                </T>
              ) : null}
            </View>
          );
        })}
      </View>
      <T v="caption" c="smoke">
        {`${shots} shots across ${formatTime(range.end - range.start)}.${hooks ? ' Hooks are the brighter bars.' : ''}`}
      </T>
    </View>
  );
}

function lengthLine(p: Project): string {
  const range = videoRange(p);
  // Until the first take, the video has a length but no start point yet.
  if (p.length && p.takes.length === 0) {
    return p.length === 'snippet' ? `Snippet, ${formatTime(range.end - range.start)} from wherever you start` : 'Full video, from wherever you start to the end';
  }
  if (p.range && p.song && range.end < p.song.durationSec - 0.05) return `${formatTime(range.end - range.start)} snippet, ${formatTime(range.start)} to ${formatTime(range.end)}`;
  return range.start > 0.05 ? `Full video, ${formatTime(range.start)} to the end` : `Full song, ${formatTime(range.end)}`;
}

/** The director's pitch: where it happens, the cutaways, the effects, and what it takes to render. */
function PlanCard({ project }: { project: Project }) {
  const budget = estimateBudget(project);
  const cutaways = project.broll.ideas.filter((i) => i.keep);
  const pack = fxPack(project.fx.pack, project.fx);
  const shots = project.cut.segments.filter((s) => s.takeId).length;
  const rows: { label: string; value: string }[] = [
    { label: 'Length', value: lengthLine(project) },
    { label: 'Looks', value: lookSummary(project) || 'Pick a look for every scene' },
    {
      label: 'B-roll',
      value: cutaways.length ? `${cutaways.length} ${cutaways.length === 1 ? 'cutaway' : 'cutaways'}: ${cutaways.map((i) => i.shot.split(',')[0].toLowerCase()).join('; ')}` : 'None',
    },
    { label: 'Effects', value: pack ? `${pack.title} pack at ${project.fx.intensity}` : 'Picked in the edit' },
    ...(shots
      ? [{ label: 'Switch', value: `${shots} shots, ${budget.switchFrames.toLocaleString('en-US')} frames at ${project.switchSettings.resolution}p` }]
      : [{ label: 'Shoot', value: 'Next. Record with the song playing, or upload clips' }]),
  ];
  return (
    <View style={styles.card}>
      {rows.map((row) => (
        <View key={row.label} style={styles.planLine}>
          <T v="micro" c="ash" style={styles.planLabel}>
            {row.label}
          </T>
          <T v="callout" c="chalk" style={styles.flex}>
            {row.value}
          </T>
        </View>
      ))}
    </View>
  );
}

function ShotsSummary({ project }: { project: Project }) {
  const flagged = project.shots.filter((s) => s.flag || s.status === 'failed');
  return (
    <View style={styles.card}>
      <View style={styles.grid}>
        {project.shots.map((s) => (
          <View
            key={s.id}
            accessibilityLabel={`Shot ${s.n}${s.flag ? ', needs a look' : ''}`}
            style={[styles.cell, s.flag || s.status === 'failed' ? styles.cellFlag : s.status === 'approved' ? styles.cellApproved : styles.cellReady]}
          />
        ))}
      </View>
      {flagged.map((s) => (
        <T key={s.id} v="caption" c="smoke">
          {`Shot ${s.n}: ${s.flag ?? s.error ?? "didn't render"}`}
        </T>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  director: {
    flexDirection: 'row',
    gap: space.m,
    paddingVertical: space.xs,
  },
  avatarSlot: {
    width: 30,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.flat,
    borderWidth: 1,
    borderColor: color.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directorBody: {
    flex: 1,
    gap: space.s,
  },
  userRow: {
    alignItems: 'flex-end',
    paddingVertical: space.xs,
  },
  bubble: {
    maxWidth: '82%',
    backgroundColor: color.flat,
    borderRadius: radius.l,
    borderBottomRightRadius: space.s,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
  },
  system: {
    paddingVertical: space.s,
    alignItems: 'center',
  },
  center: {
    textAlign: 'center',
  },
  card: {
    backgroundColor: color.curtain,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: color.hairline,
    padding: space.l,
    gap: space.m,
  },
  wrapFrame: {
    marginTop: space.xs,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
  },
  planNum: {
    width: 22,
  },
  planLine: {
    flexDirection: 'row',
    gap: space.m,
    alignItems: 'baseline',
  },
  planLabel: {
    width: 56,
  },
  flex: {
    flex: 1,
  },
  strip: {
    flexDirection: 'row',
    gap: 3,
  },
  stripPart: {
    gap: space.xs,
  },
  stripBar: {
    height: 18,
    borderRadius: 4,
    backgroundColor: color.rig,
    overflow: 'hidden',
  },
  stripHook: {
    backgroundColor: color.smoke,
  },
  cutMark: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: color.stage,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  cell: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  cellReady: {
    backgroundColor: color.smoke,
  },
  cellApproved: {
    backgroundColor: color.chalk,
  },
  cellFlag: {
    borderWidth: 2,
    borderColor: color.accent,
  },
});
