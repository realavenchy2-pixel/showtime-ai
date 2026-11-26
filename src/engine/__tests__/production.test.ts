import { describe, expect, it } from "vitest";

import {
  addTake,
  buildCut,
  createProject,
  finishShooting,
  pickPart,
  settle,
} from "../actions";
import { lockPlan } from "../brief";
import { CAMERA_LOOKS, cssFilter, cubeLut, gradeColor } from "../cameraLooks";
import {
  addMyIdea,
  allLocationsLocked,
  applyMustHaves,
  composeBrief,
  mustHavePlace,
  sceneName,
  lockLocation,
  pickLocationOption,
  propsFor,
  reviseLocation,
  setLocationCount,
  setMustHaves,
  setSongAbout,
  smartSnippetStart,
  allScenesLocked,
  autoStills,
  bestTake,
  libraryView,
  locationRef,
  lockScene,
  pickIdea,
  remakeLocation,
  scenesOf,
  setInspiration,
  setPath,
  takesFor,
} from "../production";
import { DEMO_TRACKS, songFromDemo } from "../samples";
import type { Project } from "../types";

function fresh(path: Project["path"] = "ai", approveEachStep = false): Project {
  return settle(
    createProject({
      song: songFromDemo(DEMO_TRACKS[0]),
      formats: ["9:16"],
      path,
      approveEachStep,
    }),
  );
}

function locked(): Project {
  return lockPlan(fresh(), {
    brief: "A rooftop at night, then a white room with one light.",
    length: "snippet",
  });
}

/** Records `count` takes of a scene, covering all of it. */
function shoot(
  p: Project,
  scene: number,
  count: number,
  flagFirst = false,
): Project {
  let next = p;
  for (let i = 0; i < count; i++) {
    const s = scenesOf(next)[scene];
    next = addTake(next, {
      source: "sample",
      fromSec: s.section.start,
      durationSec: s.section.end - s.section.start,
      scene,
      sync: "audio",
      flag: flagFirst && i === 0 ? "Out of frame" : undefined,
    });
  }
  return next;
}

describe("path", () => {
  it("lets AI direct on its own, or stops at each step when asked", () => {
    expect(fresh("ai").autonomy).toBe("auto");
    expect(fresh("ai", true).autonomy).toBe("ask");
    expect(fresh("vision").autonomy).toBe("ask");
    expect(setPath(fresh("ai"), "vision").path).toBe("vision");
  });
});

describe("shoot plan ideas", () => {
  it("pitches ideas from the song when the project starts", () => {
    const p = fresh();
    const fromSong = (p.planIdeas ?? []).filter((i) => i.source === "song");
    expect(fromSong.length).toBe(3);
    expect(fromSong.every((i) => i.pitch.length > 20)).toBe(true);
  });

  it("takes the artist idea and a video link, and picking one sets the brief", () => {
    let p = addMyIdea(fresh(), "Me in a warehouse with smoke");
    p = setInspiration(p, "https://youtube.com/watch?v=abc");
    const mine = p.planIdeas!.find((i) => i.source === "mine")!;
    const inspo = p.planIdeas!.find((i) => i.source === "inspiration")!;
    expect(pickIdea(p, mine.id).brief).toBe("Me in a warehouse with smoke");
    expect(pickIdea(p, inspo.id).brief).toContain(
      "https://youtube.com/watch?v=abc",
    );
  });
});

describe("locking the plan", () => {
  it("makes an empty location and a set guide for every scene", () => {
    const p = locked();
    const scenes = scenesOf(p);
    expect(scenes.length).toBeGreaterThan(0);
    expect(p.guides?.length).toBe(scenes.length);
    for (const scene of scenes) {
      const ref = locationRef(scene.look);
      expect(ref?.location).toBe(true);
      // Made before the shoot: the artist is not in it.
      expect(ref?.prompt).toMatch(/nobody in the frame/i);
      // It is the scene's first reference for the switch.
      expect(scene.look?.refs[0]?.id).toBe(ref?.id);
    }
    // Two background options per scene by default, all saved to the library.
    expect((p.library ?? []).filter((i) => i.kind === "location").length).toBe(
      scenes.length * 2,
    );
    expect(scenes.every((sc) => sc.look?.options?.length === 2)).toBe(true);
  });

  it("keeps the old location in the library when one is remade", () => {
    const p = locked();
    const before = locationRef(scenesOf(p)[0].look)!.id;
    const next = remakeLocation(p, 0);
    expect(locationRef(scenesOf(next)[0].look)!.id).not.toBe(before);
    expect((next.library ?? []).length).toBe((p.library ?? []).length + 2);
  });

  it("guides go low and wide on hooks", () => {
    const p = locked();
    for (const scene of scenesOf(p)) {
      const g = p.guides![scene.index];
      expect(g.steps.length).toBeGreaterThanOrEqual(3);
      if (scene.section.kind === "hook") {
        expect(g.framing).toBe("wide");
        expect(g.camera.height).toBeLessThan(1);
      }
    }
  });

  it("guides cover a propped phone and someone filming, in meters and feet", () => {
    const g = locked().guides![0];
    const all = g.steps.join(" ");
    expect(all).toMatch(/Propped up/);
    expect(all).toMatch(/Someone filming/);
    expect(all).toMatch(/\d\.\d m \(\d+\.\d ft\)/);
  });
});

describe("shooting scene by scene", () => {
  it("records takes per scene, locks scenes, and the AI editor picks the best take", () => {
    let p = locked();
    const scenes = scenesOf(p);
    p = shoot(p, 0, 3, true);
    expect(takesFor(p, 0).length).toBe(3);
    // The flagged take loses to the clean ones; the latest clean take wins a tie.
    const best = bestTake(p, 0)!;
    expect(best.flag).toBeUndefined();
    expect(best.id).toBe(takesFor(p, 0)[2].id);
    for (let i = 1; i < scenes.length; i++) p = shoot(p, i, 2);
    expect(allScenesLocked(p)).toBe(false);
    for (const s of scenesOf(p)) p = lockScene(p, s.index);
    expect(allScenesLocked(p)).toBe(true);
  });

  it("matches a screenshot of each best take to its planned location, and the cut uses the best take", () => {
    let p = locked();
    for (const s of scenesOf(p)) p = lockScene(shoot(p, s.index, 2), s.index);
    const stills = autoStills(p);
    expect(stills.length).toBe(scenesOf(p).length);
    for (const st of stills) {
      expect(st.location?.location).toBe(true);
      expect(st.takeId).toBe(bestTake(p, st.scene)!.id);
    }
    const cut = buildCut(settle(finishShooting(p)));
    const bestIds = new Set(scenesOf(p).map((s) => bestTake(p, s.index)!.id));
    expect(
      cut.filter((c) => c.takeId).every((c) => bestIds.has(c.takeId)),
    ).toBe(true);
    expect(libraryView(p).some((i) => i.kind === "still")).toBe(true);
  });
});

describe("camera looks", () => {
  it("are modeled on real cinema cameras, with no fisheye", () => {
    expect(CAMERA_LOOKS.map((l) => l.id)).toEqual(
      expect.arrayContaining(["alexa", "venice", "fx3", "red"]),
    );
    expect(CAMERA_LOOKS.some((l) => /fisheye/i.test(l.name + l.feel))).toBe(
      false,
    );
  });

  it('writes valid .cube LUTs and keeps neutral gray close to gray on "No look"', () => {
    const lut = cubeLut("alexa", 5);
    const rows = lut
      .trim()
      .split("\n")
      .filter((l) => /^[\d.]+ [\d.]+ [\d.]+$/.test(l));
    expect(rows.length).toBe(125);
    const [r, g, b] = gradeColor("natural", [0.5, 0.5, 0.5]);
    expect(
      Math.abs(r - 0.5) + Math.abs(g - 0.5) + Math.abs(b - 0.5),
    ).toBeLessThan(0.01);
    expect(cssFilter("venice")).toMatch(/contrast\(/);
  });
});

describe("backgrounds before the shoot", () => {
  it("picks, revises with a note, adjusts 1 to 4 options and locks each scene", () => {
    let p = locked();
    const second = scenesOf(p)[0].look!.options![1];
    p = pickLocationOption(p, 0, second.id);
    expect(locationRef(scenesOf(p)[0].look)!.id).toBe(second.id);
    p = reviseLocation(p, 0, "make it rain");
    expect(locationRef(scenesOf(p)[0].look)!.prompt).toContain("make it rain");
    p = setLocationCount(p, 4);
    expect(scenesOf(p).every((sc) => sc.look!.options!.length === 4)).toBe(
      true,
    );
    p = setLocationCount(p, 1);
    expect(scenesOf(p).every((sc) => sc.look!.options!.length === 1)).toBe(
      true,
    );
    for (const sc of scenesOf(p)) p = lockLocation(p, sc.index);
    expect(allLocationsLocked(p)).toBe(true);
    // Locked scenes don't change.
    const before = locationRef(scenesOf(p)[0].look)!.id;
    expect(
      locationRef(scenesOf(reviseLocation(p, 0, "snow"))[0].look)!.id,
    ).toBe(before);
  });
});

describe("the artist brief", () => {
  it("puts what the song is about and the must-haves in the brief, and every must-have gets a scene", () => {
    let p = setSongAbout(fresh(), "Coming up from nothing", "Never fold");
    p = setMustHaves(p, "at least one scene on the moon");
    expect(composeBrief(p)).toContain("Coming up from nothing");
    expect(composeBrief(p)).toContain("on the moon");
    p = lockPlan(p, { brief: composeBrief(p), length: "snippet" });
    expect(scenesOf(p).some((sc) => /moon/i.test(sc.look?.prompt ?? ""))).toBe(
      true,
    );
    expect(applyMustHaves(p)).toBeDefined();
  });

  it("takes places from the vision only, so the song description never becomes a location", () => {
    let p = setSongAbout(
      fresh(),
      "Coming up from nothing, the haters watching",
      "Never fold",
    );
    p = setMustHaves(p, "At least one scene on the moon");
    const locked = lockPlan(p, {
      brief: composeBrief(p),
      places: "",
      length: "snippet",
    });
    const names = scenesOf(locked).map((sc) => sceneName(sc));
    expect(names.some((n) => /coming up|song is about/i.test(n))).toBe(false);
    expect(names.some((n) => /on the moon/i.test(n))).toBe(true);
    expect(locked.brief).toContain("Never fold");
  });

  it("reads a must-have as a place", () => {
    expect(mustHavePlace("At least one scene on the moon")).toBe("on the moon");
    expect(
      mustHavePlace("I know at least one scene I wanna be in the moon"),
    ).toBe("in the moon");
    expect(mustHavePlace("A rooftop at night")).toBe("A rooftop at night");
  });

  it("picks a part of the song up front, so the first take does not move it", () => {
    const base = fresh();
    const p = pickPart(base, "snippet", { start: 20, end: 50 });
    expect(p.partPicked).toBe(true);
    expect(p.range?.start).toBeCloseTo(20, 0);
    const shot = addTake(lockPlan(p, { brief: "", length: "snippet" }), {
      source: "sample",
      fromSec: 35,
      durationSec: 5,
      sync: "audio",
    });
    expect(shot.range?.start).toBeCloseTo(20, 0);
  });

  it("finds the loudest stretch for a smart snippet", () => {
    const song = {
      ...songFromDemo(DEMO_TRACKS[0]),
      durationSec: 100,
      peaks: Array.from({ length: 100 }, (_, i) =>
        i >= 60 && i < 75 ? 1 : 0.1,
      ),
    };
    expect(smartSnippetStart(song, 15)).toBeCloseTo(60, 0);
  });
});

describe("props for the pose", () => {
  it("stands in a broom for a mic stand and a door frame for a helicopter", () => {
    expect(propsFor("Hanging off a helicopter over the city")[0].kind).toBe(
      "bar",
    );
    expect(propsFor("Old-school mic stand on a dark stage")[0].kind).toBe(
      "stand",
    );
    expect(propsFor("Passenger seat of a Lambo")[0].kind).toBe("seat");
    expect(propsFor("An empty white room")).toEqual([]);
  });
});
